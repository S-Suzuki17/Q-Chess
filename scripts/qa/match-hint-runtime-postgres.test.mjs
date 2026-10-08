// Disposable PG17 + local PostgREST + the actual compiled index/Worker.
// The native runner owns PG startup. No hosted URLs, provider calls or gate mocks.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID, createHmac, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdtemp, writeFile, readFile, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import http from 'node:http';
import net from 'node:net';
import { io } from 'socket.io-client';
import { connect, connection, scalar, account, bind, member, snapshot, paidPeriod, wallet, claim } from './commerce-postgres-support.mjs';
import { setupBaseline } from './fixtures/commerce-postgres-baseline.mjs';
import { applyHintPolicyRelease, combinedHistoricalMigrations, combinedPendingMigrations, hintPolicyMigrations } from './fixtures/session-postgres-baseline.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const reportPath = join(tmpdir(), 'match-hint-runtime-postgres-results.json');
const password = 'SYNTHETIC-hint-runtime-password-7!';
const flags = { CPU_HINT_TICKETS_ENABLED: 'true', SHARED_MATCH_ENTITLEMENT_ENABLED: 'true',
    SHARED_MATCH_ADMISSION_ENABLED: 'true', SHARED_MATCH_ADMISSION_RECOVERY_ENABLED: 'true' };

test('real hint policy entrypaths: index/auth/socket/Worker/PostgREST/native SQL', { timeout: 225000 }, async t => {
    const checks = [], trace = [], children = [], sockets = [], connections = [], heldHints = new Set();
    const fixtureDir = await mkdtemp(join(tmpdir(), 'qg-hint-runtime-'));
    let server, relay, endpoint, relayUrl, logs = '', completed = false, failure;
    const startedAt = Date.now();
    const cleanEnv = Object.fromEntries(['SystemRoot','WINDIR','ComSpec','TEMP','TMP','PATH','PATHEXT']
        .filter(k => process.env[k]).map(k => [k, process.env[k]]));
    Object.assign(cleanEnv, { USERPROFILE: fixtureDir, APPDATA: fixtureDir, LOCALAPPDATA: fixtureDir, NODE_ENV: 'test' });
    const secret = randomBytes(32).toString('hex');
    const unsigned = [{ alg: 'HS256', typ: 'JWT' }, { role: 'service_role', exp: Math.floor(Date.now()/1000)+1800 }]
        .map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
    const serviceJwt = unsigned + '.' + createHmac('sha256',secret).update(unsigned).digest('base64url');
    const open = async role => { const client = await connect(role); connections.push(client); return client; };
    const launch = (exe, args, env, ipc = false) => {
        const child = spawn(exe,args,{cwd:fixtureDir,env,windowsHide:true,stdio:['ignore','pipe','pipe',...(ipc?['ipc']:[])]});
        children.push(child); child.on('error',e => { logs=(logs+'\n'+e.message).slice(-16000); });
        for(const stream of [child.stdout,child.stderr]) stream.on('data',v => { logs=(logs+v.toString()).slice(-16000); });
        return child;
    };
    const stop = async child => {
        if(!child || child.exitCode!==null || child.signalCode!==null) return;
        const exit=once(child,'exit'); child.kill(); await Promise.race([exit,delay(5000).then(()=>{if(child.exitCode===null)child.kill('SIGKILL');})]);
    };
    const waitFor = async (fn,label,timeout=8000) => {
        const end=Date.now()+timeout;
        do { const value=await fn(); if(value)return value; await delay(25); } while(Date.now()<end);
        throw Error('Timed out: '+label+'\n'+logs);
    };
    const event = (socket,name,accept=()=>true,timeout=8000) => waitFor(()=>{
        const i=socket.events.findIndex(row=>row.name===name&&accept(row.data));
        return i<0?null:socket.events.splice(i,1)[0].data??true;
    },name,timeout).catch(error=>{throw Error(error.message+'\nSocket events: '+JSON.stringify(socket.events.map(r=>({name:r.name,code:r.data?.code,reason:r.data?.reason,matchId:r.data?.matchId}))));});
    const check = async (name,fn) => { await fn(); checks.push(name); console.log('PASS '+name); };
    const startServer = async env => {
        for(const socket of sockets)socket.disconnect(); await stop(server);
        server=launch(process.execPath,[fileURLToPath(new URL('./shared-match-runtime-child.cjs',import.meta.url))],
            {...cleanEnv,QG_SHARED_RUNTIME_FIXTURE:'1',SUPABASE_URL:relayUrl,SUPABASE_SERVICE_ROLE_KEY:serviceJwt,...env},true);
        const ready=await new Promise((yes,no)=>{
            const timer=setTimeout(()=>no(Error('Runtime startup timeout\n'+logs)),45000);
            server.once('message',m=>{clearTimeout(timer);yes(m);}); server.once('error',e=>{clearTimeout(timer);no(e);});
            server.once('exit',code=>{clearTimeout(timer);no(Error('Runtime exited '+code+'\n'+logs));});
        });
        assert.equal(ready.ready,true); endpoint='http://127.0.0.1:'+ready.port;
    };
    const request = async (path,token,body,signal=AbortSignal.timeout(30000)) => {
        const response=await fetch(endpoint+path,{...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),
            headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal});
        return {status:response.status,body:await response.json()};
    };
    const login = async user => {
        const r=await request('/auth/ranked-session','',{username:user,password});
        assert.equal(r.status,200,JSON.stringify(r.body)); assert.equal(r.body.userId,user); return r.body.token;
    };
    const socketFor = async user => {
        const token=await login(user),socket=io(endpoint,{auth:{token,userId:'UNTRUSTED-id'},transports:['websocket'],reconnection:false,autoConnect:false});
        socket.user=user; socket.token=token; socket.events=[]; socket.onAny((name,data)=>socket.events.push({name,data})); sockets.push(socket);
        await new Promise((yes,no)=>{socket.once('connect',yes);socket.once('connect_error',no);socket.connect();}); return socket;
    };
    let admin,service;
    const createAccount = async opts => {
        const user=await account(admin,opts);
        await admin.query("update public.profiles set password_hash=extensions.crypt($2,extensions.gen_salt('bf',4)) where id=$1",[user,password]); return user;
    };
    const paid = async () => {
        const user=await createAccount({quota:3,ranked:0}),membership=await member(service,user,'plus_monthly',true),projection=await snapshot(service,membership);
        await paidPeriod(service,membership,projection.event); await claim(service,user); return user;
    };
    const intro = async (state,players) => {
        for(const socket of players)socket.emit('intro_ready',{matchId:state.matchId});
        const opened=await event(players[0],'sync_state',s=>s.matchId===state.matchId&&!s.introPending); await delay(300); return opened;
    };
    const pair = async (a,b,mode) => {
        a.events.length=0;b.events.length=0;let matchId;
        if(mode==='private')matchId='room-'+randomUUID().slice(0,8);
        else {
            a.emit('join_queue',{timeControl:600,mode}); await event(a,'queue_joined');
            b.emit('join_queue',{timeControl:600,mode}); matchId=(await event(a,'match_found')).matchId; await event(b,'match_found');
        }
        for(const socket of [a,b])socket.emit('connect_match',{matchId,introVersion:1});
        const state=await event(a,'match_start');await event(b,'match_start'); return intro(state,[a,b]);
    };
    const finish = async (socket,state,admitted=true) => {
        socket.emit('player_action',{actionId:randomUUID(),version:state.version,action:{type:'RESIGN',payload:{}}});
        await event(socket,'sync_state',s=>s.matchId===state.matchId&&s.gameOver);
        if(admitted)await waitFor(async()=>await scalar(admin,'select state as result from public.ranked_match_admissions where match_id=$1',[state.matchId])==='settled','settled shared match');await delay(75);
    };
    const receiptCount = (user,contextId) => scalar(admin,'select count(*)::integer as result from public.match_hint_receipts where user_id=$1 and context_id=$2',[user,contextId]);
    const buy = (socket,state,requestId=randomUUID(),signal) => request('/match-hints/'+encodeURIComponent(state.matchId),socket.token,{requestId,revision:state.version},signal);
    try {
        const postgrest=process.env.QG_TEST_POSTGREST_BIN;
        assert.ok(postgrest&&isAbsolute(postgrest),'Explicit trusted QG_TEST_POSTGREST_BIN required');
        await access(postgrest);await access(join(root,'server/dist/index.js'));
        admin=await open();await setupBaseline(admin);await applyHintPolicyRelease(admin);
        assert.equal(combinedPendingMigrations.length,13);assert.equal(hintPolicyMigrations.length,1);
        assert.equal(await scalar(admin,'select version as result from public.current_terms_policy where singleton'),'2026-10-08.1');
        await admin.query(`alter table public.system_status
            add column if not exists maintenance_mode boolean not null default false,add column if not exists announcement_en text not null default '',
            add column if not exists announcement_ja text not null default '',add column if not exists announcements jsonb not null default '{}',
            add column if not exists minimum_android_build integer not null default 0,add column if not exists minimum_protocol integer not null default 0,
            add column if not exists updated_at timestamptz not null default now();insert into public.system_status(id) values('1');
            -- Current-terms acceptance calls the actual profile loader. This is
            -- a public display-field prerequisite absent from the minimal base.
            alter table public.profiles add column if not exists avatar_url text;
            alter table public.system_status enable row level security;grant select on public.system_status to service_role;
            create role qg_shared_runtime_gateway login noinherit;grant anon,authenticated,service_role to qg_shared_runtime_gateway;`);
        service=await open('service_role');await bind(admin);
        const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
        const restPort=listener.address().port;await new Promise(r=>listener.close(r));
        const rest=launch(postgrest,['+RTS','-N2','-RTS'],{...cleanEnv,
            PGRST_DB_URI:'postgres://qg_shared_runtime_gateway@127.0.0.1:'+connection.port+'/commerce_upgrade?sslmode=disable&gssencmode=disable',
            PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_SERVER_HOST:'127.0.0.1',
            PGRST_SERVER_PORT:String(restPort),PGRST_LOG_LEVEL:'warn',PGRST_DB_POOL:'8'});
        await waitFor(async()=>{
            if(rest.exitCode!==null)throw Error('PostgREST exited '+rest.exitCode+'\n'+logs);
            try{return(await fetch('http://127.0.0.1:'+restPort+'/match_hint_receipts?select=request_id&limit=1',
                {headers:{Authorization:'Bearer '+serviceJwt},signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}
        },'PostgREST readiness',15000);
        relay=http.createServer(async(req,res)=>{
            if(!req.url.startsWith('/rest/v1/')){res.writeHead(404);res.end();return;}
            try{
                const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
                const name=new URL(req.url,'http://127.0.0.1').pathname.split('/').at(-1);
                const params=body.length&&req.headers['content-type']?.includes('application/json')?JSON.parse(body):{};
                const upstream=await fetch('http://127.0.0.1:'+restPort+req.url.slice('/rest/v1'.length),{method:req.method,
                    headers:Object.fromEntries(['authorization','content-type','accept','prefer'].filter(k=>req.headers[k]).map(k=>[k,req.headers[k]])),
                    ...(body.length?{body}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
                const bytes=Buffer.from(await upstream.arrayBuffer());
                trace.push({name,status:upstream.status,contextId:params.p_context_id??null,requestId:params.p_request_id??null});
                while(name==='buy_match_hint'&&heldHints.has(params.p_request_id)&&!res.destroyed)await delay(25);
                if(!res.destroyed){res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')??'application/json'});res.end(bytes);}
            }catch{if(!res.destroyed){res.writeHead(502);res.end('{"message":"local fixture upstream unavailable"}');}}
        });
        relay.listen(0,'127.0.0.1');await once(relay,'listening');relayUrl='http://127.0.0.1:'+relay.address().port;
        await startServer(flags);
        const a=await socketFor(await paid()),b=await socketFor(await paid());
        await admin.query('update public.ticket_wallets set hint_tickets=5 where user_id=any($1::text[])',[[a.user,b.user]]);
        await check('Terms 8.1 is read and accepted through the actual authenticated HTTP route',async()=>{
            const user=await createAccount({oldTermsOnly:true}),token=await login(user);
            assert.equal((await request('/account/current-terms',token)).body.currentVersion,'2026-10-08.1');
            const accepted=await request('/account/current-terms',token,{version:'2026-10-08.1',accepted:true});
            assert.equal(accepted.status,200);assert.equal(accepted.body.consent.version,'2026-10-08.1');
        });
        let savedReceipt,savedRequest,savedUser;
        await check('private hint commits once; a lost HTTP result is recovered while clock and mutation fence remain authoritative',async()=>{
            const state=await pair(a,b,'private'),actor=state.players.host===a.user?a:b,other=actor===a?b:a;
            assert.match(state.hintContextId,/^[0-9a-f-]{36}$/);assert.notEqual(state.hintContextId,state.matchId);
            const before=await wallet(service,actor.user),requestId=randomUUID(),controller=new AbortController();heldHints.add(requestId);
            const result=buy(actor,state,requestId,controller.signal).then(value=>({value}),error=>({error}));
            // Use the relay to lose the server/store acknowledgement, not the DB commit.
            await waitFor(()=>trace.some(r=>r.name==='buy_match_hint'&&r.requestId===requestId&&r.status===200),'committed hint RPC',25000);
            actor.events=actor.events.filter(row=>row.name!=='sync_state');
            actor.emit('player_action',{actionId:randomUUID(),version:state.version,action:{type:'RESIGN',payload:{}}});
            assert.equal((await event(actor,'action_error')).code,'HINT_PURCHASE_PENDING');
            actor.emit('request_sync',{matchId:state.matchId});
            const live=await event(actor,'sync_state',s=>s.matchId===state.matchId&&!s.gameOver);
            assert.ok(live.clock.white<state.clock.white);
            controller.abort();assert.equal((await result).error?.name,'AbortError');
            const recovered=await request(`/match-hints/${state.hintContextId}/${state.version}/${requestId}`,actor.token);
            assert.equal(recovered.status,200);assert.equal(recovered.body.mode,'private');savedReceipt=recovered.body;savedRequest=requestId;savedUser=actor.user;
            heldHints.delete(requestId);
            assert.equal(await receiptCount(actor.user,state.hintContextId),1);
            assert.equal((await wallet(service,actor.user)).hint_tickets,before.hint_tickets-1);
            assert.equal(await scalar(admin,'select origin as result from public.match_hint_receipts where request_id=$1',[requestId]),'free');
            const alias=await buy(actor,state);assert.equal(alias.status,200);assert.deepEqual(alias.body,savedReceipt);
            const wrongTurn=await buy(other,state);assert.equal(wrongTurn.status,422);assert.equal(wrongTurn.body.code,'NOT_YOUR_TURN');
            const pieceId=Number(savedReceipt.move.pieceId.split('_')[1])-1,h=savedReceipt.hint;
            actor.emit('player_action',{actionId:randomUUID(),version:state.version,action:{type:'MOVE',payload:{pieceId,toX:h.toCol,toY:7-h.toRow,
                ...(h.intention?{intention:h.intention}:{}),...(h.promotionTarget?{promotedTo:({2:'N',4:'B',8:'R',16:'Q'})[h.promotionTarget]}:{})}}});
            const moved=await event(actor,'sync_state',s=>s.matchId===state.matchId&&s.version===state.version+1);
            assert.deepEqual((await request(`/match-hints/${state.hintContextId}/${state.version}/${requestId}`,actor.token)).body,savedReceipt);
            await finish(actor,moved,false);
        });
        await check('random online uses its original mode and one canonical receipt',async()=>{
            const state=await pair(a,b,'random'),actor=state.players.host===a.user?a:b;
            const result=await buy(actor,state);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.mode,'random');
            assert.equal(await receiptCount(actor.user,state.hintContextId),1);await finish(actor,state);
        });
        await check('ranked CPU fallback starts at ten seconds and uses earned live subscription hints',async()=>{
            await admin.query('update public.ticket_wallets set hint_tickets=0,member_hint_tickets=0 where user_id=$1',[a.user]);
            const before=await wallet(service,a.user);assert.ok(before.subscription_hint_tickets>0);
            a.events.length=0;const started=Date.now();a.emit('join_queue',{timeControl:600,mode:'ranked'});await event(a,'queue_joined');
            const found=await event(a,'match_found',()=>true,15000);assert.ok(Date.now()-started>=9900&&Date.now()-started<15000);
            a.emit('connect_match',{matchId:found.matchId,introVersion:1});let state=await event(a,'match_start');state=await intro(state,[a]);
            const side=state.players.host===a.user?0:1;
            if(state.turn!==side)state=await event(a,'sync_state',s=>s.matchId===state.matchId&&s.turn===side,8000);
            const result=await buy(a,state);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.mode,'ranked');
            assert.equal(await scalar(admin,'select origin as result from public.match_hint_receipts where request_id=$1',[result.body.receiptId]),'subscription');
            assert.equal((await wallet(service,a.user)).subscription_hint_tickets,before.subscription_hint_tickets-1);await finish(a,state);
        });
        await check('Crown server seed, actual human/CPU moves and immutable paid recovery are bound to the run owner',async()=>{
            const runId=randomUUID(),opened=await request('/crown-hints/runs',b.token,{runId,stageId:1,playerSide:'white'});
            assert.equal(opened.status,200);assert.equal(opened.body.rulesVersion,'quantum-crown-v1');
            const requestId=randomUUID(),paidHint=await request(`/crown-hints/runs/${runId}/hints`,b.token,{requestId,revision:0});
            assert.equal(paidHint.status,200,JSON.stringify(paidHint.body));assert.equal(paidHint.body.mode,'crown');
            assert.equal(paidHint.body.contextId,opened.body.hintContextId);
            const moved=await request(`/crown-hints/runs/${runId}/moves`,b.token,{operationId:randomUUID(),revision:0,actor:'human',move:paidHint.body.move});
            assert.equal(moved.status,200);assert.equal(moved.body.revision,1);
            const {getConcreteMoveChildren}=await import('../../server/dist/quantum-engine/ai/random.js');
            const move=getConcreteMoveChildren(moved.body.state,{playable:true})[0].move;
            const cpu=await request(`/crown-hints/runs/${runId}/moves`,b.token,{operationId:randomUUID(),revision:1,actor:'cpu',move});
            assert.equal(cpu.status,200);assert.equal(cpu.body.revision,2);
            assert.equal((await request(`/crown-hints/runs/${runId}/close`,b.token,{})).status,200);
            assert.deepEqual((await request(`/crown-hints/receipts/${opened.body.hintContextId}/0/${requestId}`,b.token)).body,paidHint.body);
            const forged=await request(`/crown-hints/receipts/${opened.body.hintContextId}/0/${requestId}`,a.token);
            assert.equal(forged.status,409);assert.equal(forged.body.code,'REQUEST_MISMATCH');
        });
        await check('practice new purchase and forged board requests dispatch zero hint debit RPCs',async()=>{
            const before=trace.filter(r=>r.name==='buy_match_hint'||r.name==='buy_cpu_hint'||r.name==='buy_cpu_hint_v2').length;
            const free=await request(`/cpu-practice/sessions/${randomUUID()}/hints`,b.token,{requestId:randomUUID(),revision:0});
            assert.equal(free.status,409);assert.equal(free.body.code,'PRACTICE_HINTS_FREE');
            const forged=await request('/crown-hints/runs',b.token,{runId:randomUUID(),stageId:1,playerSide:'white',board:[]});assert.equal(forged.status,400);
            assert.equal(trace.filter(r=>r.name==='buy_match_hint'||r.name==='buy_cpu_hint'||r.name==='buy_cpu_hint_v2').length,before);
        });
        await check('restart and gate-OFF preserve paid read-only recovery without reviving a game or buying again',async()=>{
            await startServer({});const token=await login(savedUser),before=trace.filter(r=>r.name==='buy_match_hint').length;
            const result=await request(`/match-hints/${savedReceipt.contextId}/${savedReceipt.revision}/${savedRequest}`,token);
            assert.equal(result.status,200);assert.deepEqual(result.body,savedReceipt);
            assert.equal((await request('/match-hints/no-room',token,{requestId:randomUUID(),revision:0})).status,503);
            assert.equal(trace.filter(r=>r.name==='buy_match_hint').length,before);
        });
        completed=true;
    }catch(error){failure=error instanceof Error?error.message:String(error);console.error(logs);throw error;}
    finally{
        heldHints.clear();for(const socket of sockets)socket.disconnect();await Promise.allSettled(children.map(stop));
        if(relay){relay.closeAllConnections();await new Promise(r=>relay.close(r));}await Promise.allSettled(connections.map(c=>c.end()));
        const files=['server/src/index.ts','server/src/game/GameEngine.ts','server/src/quantum-engine/ai/search.ts',
            ...['MatchHintTypes','MatchHintPosition','MatchHintService','MatchHintRegistry','MatchHintRoutes','CrownHintRegistry','CrownHintRoutes',
                'HintTicketStore','CpuPracticeSearch','CpuPracticeSearchWorker','CpuPracticeRoutes','CpuPracticeService','AccountCurrentTerms','SupabaseService'].map(n=>'server/src/services/'+n+'.ts'),
            'scripts/qa/match-hint-runtime-postgres.test.mjs','scripts/qa/shared-match-runtime-child.cjs',
            'scripts/qa/fixtures/session-postgres-baseline.mjs',...combinedHistoricalMigrations.map(n=>'supabase/migrations/'+n),
            ...[...combinedPendingMigrations,...hintPolicyMigrations].map(n=>'supabase/migrations/'+n)];
        const inputs=await Promise.all(files.flatMap(path=>path.startsWith('server/src/')?[path,path.replace('server/src/','server/dist/').replace(/\.ts$/,'.js')]:[path])
            .map(async path=>({path,sha256:createHash('sha256').update(await readFile(join(root,path))).digest('hex')})));
        await writeFile(reportPath,JSON.stringify({complete:completed,checks,elapsedMs:Date.now()-startedAt,...(failure?{failure}:{}),inputs,
            realEntrypoint:'server/dist/index.js',realHttpLogin:true,realSocketIo:true,actualCompiledWorker:true,realPostgrest:true,realPostgres:true,
            productGateOverrides:false,database:'fresh loopback commerce_upgrade',syntheticAccountsAndProviderEvidence:true,
            fixtureHistoricalMigrations:combinedHistoricalMigrations,rawHistoricalRelease13:combinedPendingMigrations,rawForwardPolicyMigrations:hintPolicyMigrations,
            rpcCounts:Object.fromEntries([...new Set(trace.map(r=>r.name))].map(n=>[n,trace.filter(r=>r.name===n).length])),
            limitations:['Public dependency fixture + raw13 + forward1 is not all46 hosted schemas/ACL/Auth/Storage replay.',
                'Billing provider traffic is forbidden; signature/device/browser behavior is outside this runtime proof.',
                'SQL account/debit/refund/delete contention and DB-time barrier proofs are in the separate native ledger suite.']},null,2)+'\n');
        const directory=resolve(fixtureDir);assert.equal(dirname(directory),resolve(tmpdir()));assert.ok(basename(directory).startsWith('qg-hint-runtime-'));
        assert.equal((await lstat(directory)).isSymbolicLink(),false);await rm(directory,{recursive:true,force:true});t.diagnostic('Report: '+reportPath);
    }
});
