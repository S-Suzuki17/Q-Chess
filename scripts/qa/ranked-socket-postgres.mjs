// Real local HTTP login -> Socket.IO -> supabase-js -> PostgREST -> PostgreSQL.
// Prerequisite: npm --prefix server run build. Reuse pg@8.16.3 and native PG
// 18.4.0-beta.17 under scratch/ranked-postgres. PostgREST v16.4 Windows exe:
// official zip SHA256 29a5b56e5a09b7168bb552ef14aa7ade40bf0a81dd0687cffa86610187b89d78.
// No remote DB, real users, environment files, billing keys or external Auth.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,readFile,realpath,statfs,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import net from 'node:net';
import {once} from 'node:events';
import {setupStripeFixture} from './stripe-canonical-fixture.mjs';

const root=await realpath(fileURLToPath(new URL('../../',import.meta.url)));
const scratch=path.join(root,'scratch','ranked-postgres'),cluster=path.join(scratch,'socket-cluster');
assert.ok(cluster.startsWith(root+path.sep));
const disk=await statfs(root);assert.ok(disk.bavail*disk.bsize>500*1024*1024,'Need >500 MiB free');
const require=createRequire(path.join(root,'package.json')),fixtureRequire=createRequire(path.join(scratch,'package.json'));
const {Client}=fixtureRequire('pg'),{io}=require('socket.io-client');
const {initdb,pg_ctl}=await import(new URL('../../scratch/ranked-postgres/node_modules/@embedded-postgres/windows-x64/dist/index.js',import.meta.url));
const postgrest=path.join(scratch,'postgrest','postgrest.exe');await access(postgrest);
const cleanEnv=Object.fromEntries(['SystemRoot','WINDIR','ComSpec','TEMP','TMP','PATH','PATHEXT'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
// libpq on Windows needs APPDATA; redirect its optional pgpass/SSL discovery to
// the fixture instead of letting it read any real user's connection material.
Object.assign(cleanEnv,{USERPROFILE:scratch,APPDATA:scratch,LOCALAPPDATA:scratch});
const pgEnv={...cleanEnv,PATH:path.dirname(pg_ctl)+';'+path.join(path.dirname(path.dirname(pg_ctl)),'lib')+';'+cleanEnv.PATH};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function port(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const dbPort=await port(),restPort=await port(),jwtSecret=randomBytes(32).toString('hex');
function jwt(role){
    const payload=[{alg:'HS256',typ:'JWT'},{role,exp:Math.floor(Date.now()/1000)+1800}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
    return payload+'.'+createHmac('sha256',jwtSecret).update(payload).digest('base64url');
}
const serviceJwt=jwt('service_role'),clients=[],children=[],sockets=[],checks=[],trace=[],heldAdmissions=new Set();
let running=false,db,relay,server,endpoint,relayUrl,childLogs='';
function command(exe,args){
    const result=spawnSync(exe,args,{windowsHide:true,stdio:'ignore',env:pgEnv,timeout:30000});
    if(result.error||result.status!==0)throw new Error('LOCAL_POSTGRES_COMMAND_FAILED '+path.basename(exe));
}
async function connection(database='qg_ranked_socket'){
    const c=new Client({host:'127.0.0.1',port:dbPort,database,user:'fixtureadmin'});
    await c.connect();clients.push(c);return c;
}
async function waitFor(check,label,timeout=10000){
    const end=Date.now()+timeout;
    do{const value=await check();if(value)return value;await delay(50);}while(Date.now()<end);
    throw new Error('Timed out: '+label);
}
function child(exe,args,env){
    const c=spawn(exe,args,{cwd:scratch,env,windowsHide:true,
        stdio:exe===process.execPath?['pipe','pipe','pipe','ipc']:['pipe','pipe','pipe']});children.push(c);
    for(const stream of [c.stdout,c.stderr])stream.on('data',b=>{childLogs=(childLogs+b.toString()).slice(-12000);});
    c.on('exit',code=>{childLogs+='\n'+path.basename(exe)+' exited '+code;});
    return c;
}
async function kill(c){if(!c||c.exitCode!==null||c.signalCode!==null)return;const exit=once(c,'exit');c.kill();await exit;}
async function startServer(){
    server=child(process.execPath,[fileURLToPath(new URL('./ranked-socket-child.cjs',import.meta.url))],
        {...cleanEnv,QG_LOCAL_FIXTURE:'1',SUPABASE_URL:relayUrl,SUPABASE_SERVICE_ROLE_KEY:serviceJwt});
    const ready=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('SERVER_START_TIMEOUT '+childLogs)),45000);
        server.once('message',m=>{clearTimeout(timer);resolve(m);});
        server.once('exit',code=>{clearTimeout(timer);reject(new Error('SERVER_START_FAILED '+code+' '+childLogs));});
    });
    assert.equal(ready.ready,true);endpoint='http://127.0.0.1:'+ready.port;
}
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
const scalar=async(sql,args=[]) => (await query(sql,args))[0];
async function rpc(name,parameters,token=serviceJwt){
    const r=await fetch(relayUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(parameters)});
    return {status:r.status,body:await r.json()};
}
async function account(id,{consent=true,tickets=4,quota=3}={}){
    await query("insert into profiles(id,name,password_hash) values($1,$1,extensions.crypt('fixture-password-7!',extensions.gen_salt('bf',4)))",[id]);
    if(consent)await query("insert into account_terms_consents values($1,'2026-09-25.1')",[id]);
    await query('insert into ticket_wallets(user_id,ranked_tickets) values($1,$2)',[id,tickets]);
    for(let i=0;i<quota;i++)await query("insert into ticket_spend_receipts(event_kind,event_id,user_id,pool) values('ranked_match_start',$1,$2,'quota')",[randomUUID(),id]);
}
const android20={'X-QG-Protocol':'1','X-QG-Platform':'android','X-QG-Build':'20'};
async function login(id,headers={},password='fixture-password-7!'){
    const r=await fetch(endpoint+'/auth/ranked-session',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({username:id,password})});
    const body=await r.json();assert.equal(r.status,200,'login '+id+' '+JSON.stringify(body));assert.equal(body.userId,id);return body.token;
}
async function connect(token,{client,transport='websocket'}={}){
    const socket=io(endpoint,{auth:{token,userId:'untrusted-override',...(client?{client}:{})},transports:[transport],reconnection:false,autoConnect:false});
    socket.events=[];socket.onAny((name,data)=>socket.events.push({name,data}));sockets.push(socket);
    const ready=new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
    socket.connect();await ready;return socket;
}
function event(socket,name,accept=()=>true,timeout=10000){
    return waitFor(()=>{const i=socket.events.findIndex(e=>e.name===name&&accept(e.data));return i<0?null:socket.events.splice(i,1)[0].data??true;},name,timeout);
}
async function pair(a,b,{legacy=false,hold=false}={}){
    a.events.length=0;b.events.length=0;
    a.emit('join_queue',{timeControl:600,userName:'Player A',mode:'ranked'});await event(a,'queue_joined');
    b.emit('join_queue',{timeControl:600,userName:'Player B',mode:'ranked'});
    const [found,other]=await Promise.all([event(a,'match_found'),event(b,'match_found')]);assert.equal(other.matchId,found.matchId);
    if(hold)heldAdmissions.add(found.matchId);
    const request={matchId:found.matchId,...(legacy?{}:{introVersion:1})};
    a.emit('connect_match',request);b.emit('connect_match',request);
    // Existing clients emit both matchmaking and board-mount requests.
    a.emit('connect_match',request);b.emit('request_sync',{matchId:found.matchId});
    if(hold)return found;
    const [state]=await Promise.all([event(a,'match_start'),event(b,'match_start')]);assert.equal(state.matchId,found.matchId);
    assert.equal((await scalar('select state from ranked_match_admissions where match_id=$1',[found.matchId])).state,'active');
    assert.equal(Number((await scalar('select count(*) n from ranked_match_allocations where match_id=$1',[found.matchId])).n),2);
    if(legacy){assert.equal(state.introPending,false);await delay(Math.max(0,state.startsAt-Date.now()+30));}
    else{
        a.emit('intro_ready',{matchId:found.matchId});b.emit('intro_ready',{matchId:found.matchId});
        const ready=await event(a,'sync_state',s=>s.matchId===found.matchId&&!s.introPending);await delay(Math.max(0,ready.startsAt-Date.now()+30));
    }
    return state;
}
async function resign(socket,state){
    socket.emit('player_action',{actionId:randomUUID(),version:state.version,action:{type:'RESIGN',payload:{}}});
    return event(socket,'rating_settled',r=>r.matchId===state.matchId);
}
async function refund(token){
    const r=await fetch(endpoint+'/tickets/ranked-refunds',{headers:{Authorization:'Bearer '+token}});
    assert.equal(r.status,200);return r.json();
}
try{
    await mkdir(cluster,{recursive:true});
    try{await access(path.join(cluster,'PG_VERSION'));}catch{command(initdb,['-D',cluster,'--username=fixtureadmin','--auth=trust','--encoding=UTF8','--locale=C']);}
    // Keep the open log OUTSIDE PGDATA: Windows crash recovery fsyncs data files
    // and cannot reopen a logger-held file inside the data directory.
    running=true;command(pg_ctl,['-D',cluster,'-l',path.join(scratch,'socket-postgres.log'),'-o','-h 127.0.0.1 -p '+dbPort,'-w','start']);
    const admin=await connection('postgres');
    // Only this fixed DB in this dedicated loopback fixture cluster is recreated.
    await admin.query('drop database if exists qg_ranked_socket');
    await admin.query('drop role if exists fixture_gateway; drop role if exists anon; drop role if exists authenticated; drop role if exists service_role');
    await admin.query('create database qg_ranked_socket');db=await connection();
    await setupStripeFixture({exec:sql=>db.query(sql)});
    await query([
        'create schema qg_private; create schema extensions; create extension pgcrypto with schema extensions;',
        'grant usage on schema qg_private,extensions to service_role;',
        'create role fixture_gateway login noinherit; grant anon,authenticated,service_role to fixture_gateway;',
        'alter table account_restrictions add primary key(user_id); alter table account_restrictions add updated_at timestamptz default now();',
        'create table system_status(id integer primary key,maintenance_mode boolean,announcement_en text,announcement_ja text,announcements jsonb,minimum_android_build integer,minimum_protocol integer,updated_at timestamptz default now());',
        "insert into system_status values(1,false,'','','{}',0,0,now());",
        'alter table system_status enable row level security; grant select on system_status to service_role;'
    ].join('\n'));
    for(const name of ['20260924150213_legacy_password_attempt_budget.sql','20260924170224_account_security_audit.sql'])
        await db.query(await readFile(path.join(root,'supabase/migrations',name),'utf8'));
    const rest=child(postgrest,['+RTS','-N2','-RTS'],{...pgEnv,PGRST_DB_URI:'postgres://fixture_gateway@127.0.0.1:'+dbPort+'/qg_ranked_socket?sslmode=disable&gssencmode=disable',
        PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:jwtSecret,PGRST_SERVER_HOST:'127.0.0.1',
        PGRST_SERVER_PORT:String(restPort),PGRST_LOG_LEVEL:'info',PGRST_DB_POOL:'8'});
    await waitFor(async()=>{
        if(rest.exitCode!==null)throw new Error('POSTGREST_START_FAILED '+rest.exitCode);
        try{return (await fetch('http://127.0.0.1:'+restPort+'/')).ok;}catch{return false;}
    },'PostgREST ready',15000);
    relay=http.createServer(async(req,res)=>{
        if(!req.url.startsWith('/rest/v1/')){res.writeHead(404);res.end();return;}
        try{
            const body=Buffer.concat(await Array.fromAsync(req));
            const upstream=await fetch('http://127.0.0.1:'+restPort+req.url.slice('/rest/v1'.length),{
                method:req.method,headers:Object.fromEntries(['authorization','content-type','accept','prefer'].filter(k=>req.headers[k]).map(k=>[k,req.headers[k]])),
                ...(body.length?{body}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
            const response=Buffer.from(await upstream.arrayBuffer()),name=req.url.split('/').at(-1);
            const matchId=['admit_ranked_match','settle_ranked_match'].includes(name)?JSON.parse(body).p_match_id:undefined;
            trace.push({name,matchId,status:upstream.status});
            if(name==='admit_ranked_match')while(heldAdmissions.has(matchId)&&!res.destroyed)await delay(50);
            if(res.destroyed)return;
            res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')??'application/json'});res.end(response);
        }catch{if(!res.destroyed){res.writeHead(502);res.end('{"message":"local fixture upstream unavailable"}');}}
    });
    relay.listen(0,'127.0.0.1');await once(relay,'listening');relayUrl='http://127.0.0.1:'+relay.address().port;
    await startServer();console.log('READY real local HTTP + Socket.IO + PostgREST 16.4 + PostgreSQL');

    await account('OldSettleA');await account('OldSettleB');
    for(const side of [null,'white','black']){
        const id=randomUUID(),cpuId=side?'ai:'+id:null;
        const params={p_match_id:id,p_white_id:side==='white'?cpuId:'OldSettleA',p_black_id:side==='black'?cpuId:'OldSettleB',
            p_winner:'WHITE',p_time_control:600,p_cpu_id:cpuId,p_cpu_rating:cpuId?1000:null,p_cpu_level:cpuId?4:null,p_history:[]};
        const first=await rpc('settle_ranked_match',params),duplicate=await rpc('settle_ranked_match',params);
        assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(duplicate.status,200);assert.deepEqual(duplicate.body,first.body);
        assert.equal(Number((await scalar('select count(*) n from ranked_match_settlements where match_id=$1',[id])).n),1);
    }
    pass('real PostgREST old nine-argument settle: free PvP, CPU both sides and idempotent retry');

    await account('HttpA');await account('HttpB');
    const wrong=await fetch(endpoint+'/auth/ranked-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'HttpA',password:'wrong'})});
    assert.equal(wrong.status,401);
    const tokenA=await login('HttpA'),tokenB=await login('HttpB',android20);
    const a=await connect(tokenA,{transport:'polling'}),b=await connect(tokenB,{client:{protocol:1,platform:'android',build:20}});
    assert.equal(Number((await scalar("select count(*) n from qg_private.security_events where event='login' and outcome='success'")).n),2);
    assert.equal((await fetch(endpoint+'/tickets/ranked-refunds')).status,401);
    assert.equal((await fetch(endpoint+'/tickets/ranked-refunds?userId=HttpB',{headers:{Authorization:'Bearer '+tokenA}})).status,400);
    assert.equal((await rpc('ranked_admission_protocol_version',{},jwt('authenticated'))).status,403);
    pass('real password HTTP identity, polling/WebSocket, refund ownership and client RPC denial');

    const legacy=await pair(a,b,{legacy:true});
    assert.equal(legacy.players.host,'HttpA');assert.equal(legacy.players.joiner,'HttpB');
    a.emit('player_action',{actionId:randomUUID(),version:0,action:{type:'MOVE',payload:{pieceId:legacy.board[8],toX:0,toY:2}}});
    const moved=await event(a,'sync_state',s=>s.matchId===legacy.matchId&&s.version===1);assert.equal(moved.moveCount,1);
    assert.equal((await resign(b,moved)).userId,'HttpB');
    assert.equal((await scalar('select state from ranked_match_admissions where match_id=$1',[legacy.matchId])).state,'settled');
    assert.equal(Number((await scalar('select count(*) n from ranked_ticket_refunds where source_match_id=$1',[legacy.matchId])).n),0);
    assert.equal((await scalar('select total_moves from game_records where id=$1',[legacy.matchId])).total_moves,1);
    pass('legacy-shaped PvP without introVersion: atomic debit, human move, actual Elo/history settlement');

    await account('NoConsent',{consent:false});await account('ConsentPeer');
    const c=await connect(await login('NoConsent')),d=await connect(await login('ConsentPeer'));
    const rejected=await pair(c,d,{hold:true});heldAdmissions.delete(rejected.matchId);
    assert.equal((await event(c,'match_cancelled',x=>x.matchId===rejected.matchId)).reason,'admission_unavailable');
    await event(d,'match_cancelled',x=>x.matchId===rejected.matchId);
    assert.equal(c.events.some(e=>e.name==='match_start'),false);
    assert.equal(Number((await scalar('select count(*) n from ranked_match_allocations where match_id=$1',[rejected.matchId])).n),0);
    assert.equal((await scalar("select ranked_tickets from ticket_wallets where user_id='ConsentPeer'")).ranked_tickets,4);
    assert.equal(trace.filter(t=>t.name==='admit_ranked_match'&&t.matchId===rejected.matchId).length,1);
    c.emit('join_queue',{timeControl:600,mode:'ranked'});await event(c,'queue_joined');c.emit('cancel_queue');c.disconnect();d.disconnect();
    pass('real SQL 42501 rejects both humans atomically, tombstones once and releases queue');

    const pending=await pair(a,b,{hold:true});
    await waitFor(async()=>!!await scalar("select match_id from ranked_match_admissions where match_id=$1 and state='active'",[pending.matchId]),'committed admission');
    assert.equal(a.events.some(e=>e.name==='match_start'),false);b.disconnect();
    await query("update ticket_wallets set ranked_tickets=20 where user_id in ('HttpA','HttpB')");
    await event(a,'match_cancelled',x=>x.matchId===pending.matchId,45000);heldAdmissions.delete(pending.matchId);
    assert.equal((await refund(tokenA)).freeRankedRefunds,1);
    assert.equal((await scalar("select ranked_tickets from ticket_wallets where user_id='HttpA'")).ranked_tickets,20);
    const restored=await connect(tokenB,{client:{protocol:1,platform:'android',build:20}});
    restored.emit('connect_match',{matchId:pending.matchId,introVersion:1});await event(restored,'match_cancelled',x=>x.matchId===pending.matchId);
    assert.equal((await refund(tokenB)).freeRankedRefunds,1);
    pass('lost admission acknowledgement + actual disconnect: no start, 30-second void, uncapped refund and reconnect');

    const reused=await pair(a,restored);
    assert.equal((await refund(tokenA)).freeRankedRefunds,0);
    assert.equal((await scalar("select ranked_tickets from ticket_wallets where user_id='HttpA'")).ranked_tickets,20);
    await resign(a,reused);
    assert.equal(Number((await scalar('select count(*) n from ranked_match_allocations where match_id=$1 and refund_origin=$2',[reused.matchId,pending.matchId])).n),2);
    pass('refund credits consumed once before wallet tickets');

    a.disconnect();restored.disconnect();await account('CpuHuman');
    const cpu=await connect(await login('CpuHuman'));
    const cpuQueuedAt=Date.now();
    cpu.emit('join_queue',{mode:'ranked',timeControl:600});const cpuQueued=await event(cpu,'queue_joined');
    assert.ok(cpuQueued.cpuFallbackAt>=cpuQueuedAt+10_000&&cpuQueued.cpuFallbackAt<=Date.now()+10_000);
    console.log('WAIT actual 10-second ranked CPU fallback');
    const cpuFound=await event(cpu,'match_found',()=>true,15000);assert.ok(cpuFound.cpu);
    const cpuWaitMs=Date.now()-cpuQueuedAt;assert.ok(cpuWaitMs>=10_000&&cpuWaitMs<15_000);
    console.log('CPU fallback observed after '+cpuWaitMs+' ms');
    cpu.emit('connect_match',{matchId:cpuFound.matchId,introVersion:1});const cpuStart=await event(cpu,'match_start');
    cpu.emit('intro_ready',{matchId:cpuFound.matchId});const cpuReady=await event(cpu,'sync_state',s=>!s.introPending);
    await delay(Math.max(0,cpuReady.startsAt-Date.now()+30));
    if(cpuFound.cpu.side==='joiner')cpu.emit('player_action',{actionId:randomUUID(),version:0,action:{type:'MOVE',payload:{pieceId:cpuStart.board[8],toX:0,toY:2}}});
    const expectedVersion=cpuFound.cpu.side==='host'?1:2;
    const cpuMoved=await event(cpu,'sync_state',s=>s.matchId===cpuFound.matchId&&s.version===expectedVersion);
    assert.equal(cpuMoved.moveCount,expectedVersion);await resign(cpu,cpuMoved);
    assert.equal(Number((await scalar('select count(*) n from ranked_match_allocations where match_id=$1',[cpuFound.matchId])).n),1);
    assert.equal((await scalar('select state from ranked_match_admissions where match_id=$1',[cpuFound.matchId])).state,'settled');
    cpu.disconnect();pass('actual 10-second CPU fallback, one-human admission, compiled worker move and settlement');

    await account('CrashA');await account('CrashB');
    const crashA=await connect(await login('CrashA')),crashB=await connect(await login('CrashB'));
    const crashed=await pair(crashA,crashB);await kill(server);crashA.disconnect();crashB.disconnect();await startServer();
    const recoveredToken=await login('CrashA'),recovered=await connect(recoveredToken);
    recovered.emit('connect_match',{matchId:crashed.matchId,introVersion:1});
    await event(recovered,'match_preparing',x=>x.matchId===crashed.matchId);
    await event(recovered,'match_cancelled',x=>x.matchId===crashed.matchId,30000);
    assert.equal((await refund(recoveredToken)).freeRankedRefunds,1);
    assert.equal((await scalar('select state from ranked_match_admissions where match_id=$1',[crashed.matchId])).state,'voided');
    recovered.emit('request_sync',{matchId:crashed.matchId});await event(recovered,'match_cancelled',x=>x.matchId===crashed.matchId);
    assert.equal((await refund(recoveredToken)).freeRankedRefunds,1);
    pass('actual server kill/restart and natural owner expiry refund the old UUID exactly once');

    const fake=await rpc('settle_ranked_match',{p_match_id:crashed.matchId,p_white_id:'CrashA',p_black_id:'CrashB',p_winner:'WHITE',p_time_control:600,p_cpu_id:null,p_cpu_rating:null,p_cpu_level:null,p_history:[]});
    assert.equal(fake.status,500);assert.equal(fake.body.code,'55000');
    pass('old nine-argument settle rejects a voided admission with SQLSTATE 55000');

    await query('update system_status set minimum_protocol=1,minimum_android_build=20');await delay(5500);
    for(const headers of [{},{...android20,'X-QG-Build':'19'}]){
        const r=await fetch(endpoint+'/auth/ranked-session',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({username:'OldSettleA',password:'fixture-password-7!'})});
        assert.equal(r.status,426);
    }
    await login('OldSettleA',android20);
    pass('configured build/protocol floor rejects Android 19 while Android 20 protocol 1 authenticates');
    console.log(JSON.stringify({complete:true,checks,realHttp:true,realSocketIo:true,realPostgrest:true,realPostgres:true,
        auth:'actual legacy password RPC',gateOverride:'child process only',android:'wire fixtures; no APK/device execution'}));
}catch(error){console.error('Fixture failed:',error.message);console.error(childLogs);throw error;}
finally{
    heldAdmissions.clear();for(const s of sockets)s.disconnect();
    await Promise.allSettled(children.map(kill));
    if(relay){relay.closeAllConnections();await new Promise(r=>relay.close(r));}
    await Promise.allSettled(clients.map(c=>c.end()));
    if(running)command(pg_ctl,['-D',cluster,'-w','stop','-m','fast']);
}
