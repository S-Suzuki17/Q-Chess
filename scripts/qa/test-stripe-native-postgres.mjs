// Native PostgreSQL concurrency/crash test. Dependencies are reused read-only;
// the disposable cluster, logs and port belong to this checkout. No remote DB.
// Setup: scratch/stripe-postgres/node_modules -> installed pg@8.16.3 and
// @embedded-postgres/windows-x64@18.4.0-beta.17; package.json may be {}.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn,spawnSync } from 'node:child_process';
import { mkdtemp,realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { once } from 'node:events';
import { setupStripeFixture,snapshotSql } from './stripe-canonical-fixture.mjs';
const root=await realpath(fileURLToPath(new URL('../../',import.meta.url)));
const scratch=path.join(root,'scratch','stripe-postgres');assert.ok(scratch.startsWith(root+path.sep));
const require=createRequire(path.join(scratch,'package.json'));const {Client}=require('pg');
const {initdb,pg_ctl}=await import(new URL('../../scratch/stripe-postgres/node_modules/@embedded-postgres/windows-x64/dist/index.js',import.meta.url));
const cluster=await mkdtemp(path.join(scratch,'cluster-'));
const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const env={...process.env,PATH:path.dirname(pg_ctl)+';'+path.join(path.dirname(path.dirname(pg_ctl)),'lib')+';'+process.env.PATH};
function command(exe,args){const result=spawnSync(exe,args,{windowsHide:true,stdio:'ignore',env,timeout:30000});if(result.error||result.status!==0)throw new Error('POSTGRES_COMMAND_FAILED');}
let running=false,admin;const clients=[],children=[];
async function connect(service=true){const c=new Client({host:'127.0.0.1',port,database:'postgres',user:'fixtureadmin'});await c.connect();if(service)await c.query('set role service_role');clients.push(c);return c;}
const result=async(c,sql,args=[]) => (await c.query(sql,args)).rows[0].result;
async function account(user){await admin.query('insert into public.profiles(id) values($1)',[user]);await admin.query("insert into public.account_terms_consents values($1,'2026-09-25.1')",[user]);const c=await connect();const m={user,sub:'sub_'+user,checkout:'cs_test_'+user,end:new Date(Date.now()+30*86400000).toISOString()};await c.query("select public.register_stripe_checkout_intent($1,$2,'price_ABCDEFGH',false,clock_timestamp()+interval '1 hour')",[user,m.checkout]);return m;}
const acquire=(c,m)=>result(c,'select public.acquire_stripe_reconciliation($1,false) as result',[m.sub]);
const release=(c,m,token)=>c.query('select public.release_stripe_reconciliation($1,false,$2)',[m.sub,token]);
const expire=m=>admin.query("update public.stripe_reconciliation_leases set expires_at=clock_timestamp()-interval '1 second' where subscription_id=$1",[m.sub]);
const snapshot=(c,m,token,event,status='active',created=100,paid=true)=>result(c,snapshotSql,[event,'a'.repeat(64),created,m.sub,m.checkout,m.user,status,m.end,paid,token]);
const claim=(c,m)=>result(c,'select public.claim_stripe_member_daily_grant_with_schedule($1) as result',[m.user]);
async function reconcile(c,m,work){for(let i=0;i<100;i++){const lease=await acquire(c,m);if(lease.token){try{return await work(lease.token);}finally{await release(c,m,lease.token);}}await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('LEASE_RETRY_LIMIT');}
function worker(m,{event,status='active',created=100,phase='leased'}={}){
    const child=spawn(process.execPath,[fileURLToPath(new URL('./stripe-reconciliation-child.mjs',import.meta.url)),String(port),m.user,m.sub,m.checkout,event,status,String(created),m.end,phase],{windowsHide:true,env,stdio:['ignore','pipe','pipe','ipc']});
    children.push(child);child.stderr.on('data',chunk=>{child.fixtureError=(child.fixtureError??'')+chunk.toString();});return child;
}
function message(child,phase){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('CHILD_TIMEOUT '+phase+' '+(child.fixtureError??'')));},10000);const handler=m=>{if(m.phase!==phase)return;clearTimeout(timer);child.off('message',handler);resolve(m);};child.on('message',handler);child.once('exit',code=>{clearTimeout(timer);reject(new Error('CHILD_EARLY_EXIT '+code+' '+(child.fixtureError??'')));});});}
async function kill(child){if(child.exitCode!==null||child.signalCode!==null)return;const exited=once(child,'exit');child.kill();await exited;}
const passes=[];const pass=name=>{passes.push(name);console.log('PASS '+name);};
try {
    command(initdb,['-D',cluster,'--username=fixtureadmin','--auth=trust','--encoding=UTF8','--locale=C']);
    command(pg_ctl,['-D',cluster,'-l',path.join(cluster,'server.log'),'-o','-h 127.0.0.1 -p '+port,'-w','start']);running=true;
    admin=await connect(false);await setupStripeFixture({exec:sql=>admin.query(sql)});
    const a=await connect(),b=await connect();
    const contender=await account('Contender0001');
    const x=worker(contender,{event:'evt_PROCESS01'}),y=worker(contender,{event:'evt_PROCESS02'});
    const [lx,ly]=await Promise.all([message(x,'leased'),message(y,'leased')]);
    assert.equal([lx,ly].filter(l=>l.token).length,1);
    const winning=lx.token?x:y,token=lx.token??ly.token;const committed=message(winning,'committed');winning.send({continue:true});await committed;
    await release(a,contender,token);
    pass('two independent server processes acquire exactly one subscription lease');

    const fenced=await account('Fenced00001');
    const old=worker(fenced,{event:'evt_STALE001',created:9999});const oldLease=await message(old,'leased');assert.ok(oldLease.token);
    await expire(fenced);const newer=await acquire(b,fenced);assert.notEqual(newer.token,oldLease.token);
    await snapshot(b,fenced,newer.token,'evt_CANCEL01','canceled',1);await release(b,fenced,newer.token);
    const rejected=message(old,'rejected');old.send({continue:true});assert.equal((await rejected).code,'40001');
    assert.equal((await admin.query('select status from public.stripe_memberships where subscription_id=$1',[fenced.sub])).rows[0].status,'canceled');
    assert.equal(Number((await admin.query("select count(*) c from public.stripe_webhook_receipts where event_id='evt_STALE001'")).rows[0].c),0);
    pass('expired alive worker cannot overwrite a newer canceled projection, even with a larger event.created');

    const crashed=await account('CrashBefore1');const before=worker(crashed,{event:'evt_CRASH001'});const held=await message(before,'leased');assert.ok(held.token);await kill(before);
    assert.equal((await acquire(a,crashed)).token,null);await expire(crashed);
    await reconcile(b,crashed,t=>snapshot(b,crashed,t,'evt_CRASH001'));
    assert.equal((await claim(a,crashed)).credited.ranked,3);
    pass('process death before DB commit blocks until TTL, then a new worker recovers and grants once');

    const ackLost=await account('AckLost0001');const after=worker(ackLost,{event:'evt_ACKLOST1',phase:'committed'});await message(after,'leased');const acknowledged=message(after,'committed');after.send({continue:true});await acknowledged;await kill(after);await expire(ackLost);
    const replay=await reconcile(a,ackLost,t=>snapshot(a,ackLost,t,'evt_ACKLOST1'));assert.equal(replay.duplicate,true);
    const grants=await Promise.all([claim(a,ackLost),claim(b,ackLost)]);assert.equal(grants.filter(g=>g.claimed).length,1);assert.equal(grants.reduce((n,g)=>n+g.credited.ranked,0),3);
    pass('process death after commit / before HTTP acknowledgement deduplicates replay; two DB connections grant exactly 3+3 once');

    for(let i=0;i<12;i++){
        const m=await account('RefundRace'+String(i).padStart(2,'0'));
        await reconcile(a,m,t=>snapshot(a,m,t,'evt_INITRACE'+i,'active',300));await claim(a,m);
        const paid=()=>reconcile(a,m,t=>snapshot(a,m,t,'evt_OLDRACE'+i,'active',1,true));
        const refund=()=>reconcile(b,m,t=>result(b,`select public.apply_stripe_canonical_membership_reversal(
            $1,$2,'charge.refunded',$3,'in_CURRENT1','in_CURRENT1',$4,'cus_'||$5,$5,$6,false,$7) as result`,
            ['evt_REFUNDRACE'+i,'b'.repeat(64),m.sub,m.checkout,m.user,m.end,t]));
        await Promise.all(i%2?[paid(),refund()]:[refund(),paid()]);
        const state=await result(a,'select public.stripe_member_status_with_schedule($1) as result',[m.user]);
        assert.equal(state.active,false);assert.equal(state.tickets.ranked,0);assert.equal(state.tickets.hint,0);
        const raw=(await admin.query('select test_member_ranked_tickets,test_member_hint_tickets from public.ticket_wallets where user_id=$1',[m.user])).rows[0];assert.equal(raw.test_member_ranked_tickets,0);assert.equal(raw.test_member_hint_tickets,0);
    }
    pass('12 native simultaneous reverse-order invoice / refund races preserve the sticky hold and expire the paid pool');
    console.log(JSON.stringify({nativePostgreSQL:true,serverProcesses:true,independentConnections:true,checks:passes,completed:true}));
} finally {
    await Promise.allSettled(children.map(kill));
    await Promise.allSettled(clients.map(c=>c.end()));
    if(running)command(pg_ctl,['-D',cluster,'-w','stop','-m','immediate']);
}
