// Native PostgreSQL race and forced process termination tests. No remote URL
// or credentials are accepted. Binaries/dependencies live under scratch only.
// npm install --prefix scratch/ranked-postgres --save-exact --ignore-scripts @embedded-postgres/windows-x64@18.4.0-beta.17 pg@8.16.3
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawn,spawnSync } from 'node:child_process';
import { mkdtemp,realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { once } from 'node:events';
import { setupRankedFixture,admissionSql,settlementSql } from './ranked-admission-fixture.mjs';
const root=await realpath(fileURLToPath(new URL('../../',import.meta.url)));
const scratch=path.join(root,'scratch','ranked-postgres');
assert.ok(scratch.startsWith(root+path.sep));
const require=createRequire(path.join(scratch,'package.json'));
const {Client}=require('pg');
const {initdb,pg_ctl}=await import(new URL('../../scratch/ranked-postgres/node_modules/@embedded-postgres/windows-x64/dist/index.js',import.meta.url));
const cluster=await mkdtemp(path.join(scratch,'cluster-'));
const listen=net.createServer();listen.listen(0,'127.0.0.1');await once(listen,'listening');
const port=listen.address().port;await new Promise(resolve=>listen.close(resolve));
const env={...process.env,PATH:path.dirname(pg_ctl)+';'+path.join(path.dirname(path.dirname(pg_ctl)),'lib')+';'+process.env.PATH};
function command(exe,args) {
    // Windows' daemon inherits pipe handles. Ignored stdio lets pg_ctl return
    // after -w, while PostgreSQL itself writes the per-cluster server.log.
    const result=spawnSync(exe,args,{windowsHide:true,stdio:'ignore',env,timeout:30000});
    if(result.error||result.status!==0)throw new Error((result.error?.message??'')+(result.stdout??'')+(result.stderr??''));
}
let running=false,admin;
const clients=[];
async function connect(service=true) {
    const c=new Client({host:'127.0.0.1',port,database:'postgres',user:'fixtureadmin'});
    await c.connect();if(service)await c.query('set role service_role');clients.push(c);return c;
}
async function human(id,quota=3) {
    await admin.query('insert into public.profiles(id,name) values($1,$1)',[id]);
    await admin.query("insert into public.account_terms_consents values($1,'2026-09-25.1')",[id]);
    await admin.query('insert into public.ticket_wallets(user_id,ranked_tickets) values($1,1)',[id]);
    for(let i=0;i<quota;i++)await admin.query("insert into public.ticket_spend_receipts(event_kind,event_id,user_id,pool) values('ranked_match_start',$1,$2,'quota')",[randomUUID(),id]);
}
function cpuMatch(human,owner) {const id=randomUUID();return {id,human,cpu:'ai:'+id,owner};}
const admit=(c,m)=>c.query(admissionSql,[m.id,m.human,m.cpu,600,m.owner,m.cpu,1200,4]).then(x=>x.rows[0].result);
const settle=(c,m)=>c.query(settlementSql,[m.id,m.human,m.cpu,'WHITE',600,m.cpu,1200,4,'[]',m.owner]).then(x=>x.rows[0].result);
const voidMatch=(c,m)=>c.query('select public.void_ranked_admission($1,$2) as result',[m.id,m.owner]).then(x=>x.rows[0].result);
let passed=0;
const pass=name=>{passed++;console.log('PASS '+name);};
try {
    command(initdb,['-D',cluster,'--username=fixtureadmin','--auth=trust','--encoding=UTF8','--locale=C']);
    running=true;
    command(pg_ctl,['-D',cluster,'-l',path.join(cluster,'server.log'),'-o','-h 127.0.0.1 -p '+port,'-w','start']);
    admin=await connect(false);
    await setupRankedFixture({exec:sql=>admin.query(sql)});
    const a=await connect(),b=await connect(),owner=randomUUID();
    await a.query('select public.renew_ranked_server_lease($1)',[owner]);
    await human('RaceQuota',2);
    const x=cpuMatch('RaceQuota',owner),y=cpuMatch('RaceQuota',owner);
    const quotaRace=await Promise.all([admit(a,x),admit(b,y)]);
    assert.equal(quotaRace.filter(x=>x.state==='active').length,1);
    assert.equal(quotaRace.filter(x=>x.reason==='ACCOUNT_BUSY').length,1);
    assert.equal(Number((await admin.query("select count(*) c from public.ticket_spend_receipts where user_id='RaceQuota' and pool='quota'")).rows[0].c),3);
    const winner=quotaRace[0].state==='active'?x:y;await voidMatch(a,winner);
    pass('parallel distinct UUIDs cannot both claim the third free start');

    await human('ReverseA',0);await human('ReverseB',0);
    const ids=[randomUUID(),randomUUID()];
    const reversed=await Promise.all([
        a.query(admissionSql,[ids[0],'ReverseA','ReverseB',600,owner,null,null,null]),
        b.query(admissionSql,[ids[1],'ReverseB','ReverseA',600,owner,null,null,null]),
    ]);
    assert.equal(reversed.filter(x=>x.rows[0].result.state==='active').length,1);
    const pvpId=reversed[0].rows[0].result.state==='active'?ids[0]:ids[1];
    assert.equal(Number((await admin.query('select count(distinct spent_at) c from public.ticket_spend_receipts where event_id=$1',[pvpId])).rows[0].c),1);
    for(const id of ids)await a.query('select public.void_ranked_admission($1,$2)',[id,owner]);
    pass('reversed PvP profile/wallet lock order is deadlock-free and atomic');

    await human('SameUUID');
    const duplicate=cpuMatch('SameUUID',owner);
    const responses=await Promise.all([admit(a,duplicate),admit(b,duplicate)]);
    assert.equal(responses.filter(x=>x.duplicate===true).length,1);
    assert.equal((await admin.query("select ranked_tickets from public.ticket_wallets where user_id='SameUUID'")).rows[0].ranked_tickets,0);
    await voidMatch(a,duplicate);await voidMatch(b,duplicate);
    assert.equal(Number((await admin.query("select count(*) c from public.ranked_ticket_refunds where user_id='SameUUID'")).rows[0].c),1);
    pass('parallel duplicate admission debits once; parallel/repeated void refunds once');

    for(let i=0;i<8;i++) {
        const id='SettleVoid'+i;await human(id);const m=cpuMatch(id,owner);await admit(a,m);
        const results=await Promise.allSettled(i%2?[voidMatch(b,m),settle(a,m)]:[settle(a,m),voidMatch(b,m)]);
        const final=(await admin.query('select state from public.ranked_match_admissions where match_id=$1',[m.id])).rows[0].state;
        const receipt=Number((await admin.query('select count(*) c from public.ranked_match_settlements where match_id=$1',[m.id])).rows[0].c);
        const refund=Number((await admin.query('select count(*) c from public.ranked_ticket_refunds where source_match_id=$1',[m.id])).rows[0].c);
        assert.equal(receipt+refund,1);
        assert.equal(receipt,final==='settled'?1:0);
        assert.ok(results.some(x=>x.status==='fulfilled'));
    }
    pass('8 real settle/void races: exactly one terminal result or refund');

    await human('DeletionRace',0);
    const dm=cpuMatch('DeletionRace',owner);
    const deletion=await Promise.allSettled([
        admit(a,dm),b.query("insert into public.account_deletion_jobs values('DeletionRace','pending')"),
    ]);
    assert.equal(deletion.filter(x=>x.status==='fulfilled').length,1);
    const dstate=await admin.query('select state from public.ranked_match_admissions where match_id=$1',[dm.id]);
    if(dstate.rowCount)await voidMatch(a,dm);
    pass('deletion intent and admission race share the profile lock; only one succeeds');

    const phases=['before_admission','after_commit','before_match_start','after_match_start','human_action','cpu_move','during_settlement','after_settlement_commit'];
    for(const phase of phases) {
        const user='Crash'+phase.replaceAll('_','');await human(user);
        const epoch=randomUUID(),id=randomUUID();
        let blocker;
        if(phase==='during_settlement') {blocker=await connect(false);await blocker.query('begin');}
        const child=spawn(process.execPath,[fileURLToPath(new URL('./ranked-crash-child.mjs',import.meta.url)),String(port),epoch,id,user,phase],
            {windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env});
        let logs='';child.stderr.on('data',data=>{logs+=data;});
        await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>{child.kill();reject(new Error('child timeout '+phase+' '+logs));},10000);
            child.on('message',async message=>{
                if(message.clientEvent==='match_start')return;
                if(message.phase==='admitted'&&blocker) {
                    await blocker.query('select id from public.profiles where id=$1 for update',[user]);
                    child.send({continue:true});return;
                }
                clearTimeout(timer);assert.equal(message.phase,phase);resolve();
            });
            child.once('exit',code=>{clearTimeout(timer);reject(new Error('child exited '+code+' '+logs));});
        });
        const exited=once(child,'exit');child.kill();await exited;
        if(blocker)await blocker.query('rollback');
        await admin.query("update public.ranked_server_leases set expires_at=now()-interval '1 second' where owner_id=$1",[epoch]);
        await a.query('select public.recover_expired_ranked_admissions()');
        await b.query('select public.recover_expired_ranked_admissions()');
        const status=(await admin.query('select state from public.ranked_match_admissions where match_id=$1',[id])).rows[0]?.state;
        const refund=Number((await admin.query('select count(*) c from public.ranked_ticket_refunds where source_match_id=$1',[id])).rows[0].c);
        const balance=(await admin.query('select ranked_tickets from public.ticket_wallets where user_id=$1',[user])).rows[0].ranked_tickets;
        if(phase==='before_admission') {assert.equal(status,undefined);assert.equal(balance,1);assert.equal(refund,0);}
        else if(phase==='after_settlement_commit'||(phase==='during_settlement'&&status==='settled')) {assert.equal(status,'settled');assert.equal(balance,0);assert.equal(refund,0);}
        else {assert.equal(status,'voided');assert.equal(balance,0);assert.equal(refund,1);}
        pass('forced process termination at '+phase+' preserves exactly one allocation/refund/result');
    }
    console.log('ALL OK: '+passed+' native PostgreSQL race/crash scenarios');
} finally {
    await Promise.allSettled(clients.map(c=>c.end()));
    if(running)command(pg_ctl,['-D',cluster,'-w','stop','-m','immediate']);
}
