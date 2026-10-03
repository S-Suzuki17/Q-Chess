// Full migration chain and transaction faults in disposable PostgreSQL/WASM.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { setupRankedFixture, admissionSql, settlementSql } from './ranked-admission-fixture.mjs';
const require = createRequire(new URL('../../scratch/ticket-sql/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const db = await PGlite.create();
let passed = 0;
const row = async (sql, args=[]) => (await db.query(sql,args)).rows[0];
async function service(sql,args=[]) {
    await db.exec('set role service_role');
    try { return await row(sql,args); } finally { await db.exec('reset role'); }
}
const owner = randomUUID();
function match(human='Alice',side='host') {
    const id=randomUUID(),cpu='ai:'+id;
    return {id,host:side==='host'?human:cpu,joiner:side==='host'?cpu:human,time:600,cpu,rating:1200,level:4,owner};
}
const admit = async m => (await service(admissionSql,[m.id,m.host,m.joiner,m.time,m.owner,m.cpu,m.rating,m.level])).result;
const settle = async m => (await service(settlementSql,[m.id,m.host,m.joiner,'WHITE',m.time,m.cpu,m.rating,m.level,'[]',m.owner])).result;
const cancel = async (m,epoch=m.owner) => (await service('select public.void_ranked_admission($1::uuid,$2::uuid) as result',[m.id,epoch])).result;
const state = async id => (await row('select state from public.ranked_match_admissions where match_id=$1',[id])).state;
const wallet = async id => row('select * from public.ticket_wallets where user_id=$1',[id]);
const quota = async id => Number((await row("select count(*) as c from public.ticket_spend_receipts where user_id=$1 and pool='quota'",[id])).c);
const refunds = async id => Number((await row('select count(*) as c from public.ranked_ticket_refunds where user_id=$1 and spent_by is null',[id])).c);
async function test(name,run) { await run(); passed++; console.log('PASS '+name); }
async function exhaust(id) {
    await db.query("insert into public.ticket_spend_receipts(event_kind,event_id,user_id,pool) select 'ranked_match_start',gen_random_uuid(),$1,'quota' from generate_series(1,3)",[id]);
}
try {
    await setupRankedFixture(db);
    await service('select public.renew_ranked_server_lease($1::uuid)',[owner]);
    await test('12 migrations, invoker functions, RLS and client RPC/table denial',async()=>{
        for(const role of ['anon','authenticated']) {
            await db.exec('set role '+role);
            try {
                await assert.rejects(()=>db.query('select public.renew_ranked_server_lease($1)',[owner]),e=>e.code==='42501');
                await assert.rejects(()=>db.query('select * from public.ranked_match_admissions'),e=>e.code==='42501');
                await assert.rejects(()=>db.query('select public.void_ranked_admission($1)',[randomUUID()]),e=>e.code==='42501');
            }finally{await db.exec('reset role');}
        }
        const {c}=await row("select count(*) as c from pg_proc where pronamespace='public'::regnamespace and proname in ('admit_ranked_match','void_ranked_admission','settle_ranked_match','renew_ranked_server_lease') and prosecdef");
        assert.equal(Number(c),0);
        assert.equal((await service('select public.ranked_admission_protocol_version() as v')).v,2);
    });
    await test('three starts per UTC day then one free ticket; CPU on both sides',async()=>{
        await db.exec("set time zone 'Asia/Tokyo'");
        for(let i=0;i<4;i++) {
            const m=match('Bob',i%2?'joiner':'host');
            const a=await admit(m);
            assert.equal(a.entries[0].pool,i<3?'quota':'free');
            assert.equal(a.entries.length,1);
            await settle(m);
        }
        assert.equal((await wallet('Bob')).ranked_tickets,3);
        assert.equal(await quota('Bob'),3);
    });
    await test('lost admission acknowledgement retries allocation once; changed immutable fields reject',async()=>{
        const m=match(),first=await admit(m),duplicate=await admit(m);
        assert.equal(first.success,true);assert.equal(duplicate.duplicate,true);
        assert.equal(await quota('Alice'),1);
        for(const changed of [{time:180},{rating:1300},{level:5},{host:m.joiner,joiner:m.host},{host:'Carol'},{owner:randomUUID()}])
            await assert.rejects(()=>admit({...m,...changed}),e=>e.code==='22023');
        await cancel(m); assert.equal(await quota('Alice'),0);
        assert.equal((await admit(m)).state,'voided');
        await assert.rejects(()=>settle(m),e=>e.code==='55000');
    });
    await test('missing-match void fences a delayed RPC; UUID can never re-admit',async()=>{
        const m=match();assert.equal((await cancel(m)).state,'voided');
        assert.equal((await admit(m)).state,'voided');assert.equal(await quota('Alice'),0);
    });
    await test('PvP is all-or-neither when one account is out of tickets',async()=>{
        await db.exec("update public.ticket_wallets set ranked_tickets=0 where user_id='Carol'");
        await exhaust('Carol');
        const m={...match(),cpu:null,rating:null,level:null,joiner:'Carol'};
        const before=await wallet('Alice'),q=await quota('Alice');
        assert.equal((await admit(m)).reason,'INSUFFICIENT_FUNDS');
        assert.deepEqual(await wallet('Alice'),before);assert.equal(await quota('Alice'),q);
        assert.equal((await row('select count(*) c from public.ranked_match_allocations where match_id=$1',[m.id])).c,0);
        await db.exec("update public.ticket_wallets set ranked_tickets=5 where user_id='Carol'");
        assert.equal((await admit(m)).state,'rejected');
    });
    await test('ineligible PvP rolls back both players and keeps a match unclaimed',async()=>{
        await db.exec("insert into public.account_restrictions values('Dan',true)");
        const m={...match(),cpu:null,rating:null,level:null,joiner:'Dan'};
        await assert.rejects(()=>admit(m),e=>e.code==='42501');
        assert.equal((await row('select count(*) c from public.ranked_match_admissions where match_id=$1',[m.id])).c,0);
        assert.equal(await quota('Alice'),0);
        await db.exec("delete from public.account_restrictions where user_id='Dan'");
    });
    await test('free quota void removes the original UTC day, leaving current day intact',async()=>{
        const m=match();await admit(m);
        await db.query("update public.ticket_spend_receipts set spent_at=clock_timestamp()-interval '2 days' where event_id=$1",[m.id]);
        await db.query("update public.ranked_match_allocations set utc_day=(clock_timestamp() at time zone 'UTC')::date-2 where match_id=$1",[m.id]);
        const next=match();await settleAfterAdmitFailsBusy(next);
        await cancel(m);
        assert.equal(await quota('Alice'),0);
        assert.equal((await admit(next)).reason,'ACCOUNT_BUSY'); // rejected UUID stays rejected.
        const fresh=match();assert.equal((await admit(fresh)).entries[0].pool,'quota');await settle(fresh);
    });
    await test('wallet filled to 20 after debit still gets one uncapped refund; repeated void cannot double it',async()=>{
        await exhaust('Alice');
        const m=match();await admit(m);
        const afterDebit=(await wallet('Alice')).ranked_tickets;
        await db.exec("update public.ticket_wallets set ranked_tickets=20 where user_id='Alice'");
        await cancel(m);await cancel(m);
        assert.equal(await refunds('Alice'),1);assert.equal((await wallet('Alice')).ranked_tickets,20);
        assert.deepEqual((await service("select public.get_ranked_refund_balance('Alice') as result")).result,{freeRankedRefunds:1,paidRankedRefunds:0});
        assert.ok(afterDebit>=0);
        const reuse=match();await admit(reuse);
        assert.equal((await wallet('Alice')).ranked_tickets,20);assert.equal(await refunds('Alice'),0);
        await cancel(reuse);await cancel(reuse);
        assert.equal(await refunds('Alice'),1);assert.equal((await wallet('Alice')).ranked_tickets,20);
        const used=match();await admit(used);await settle(used);assert.equal(await refunds('Alice'),0);
    });
    await test('settled result acknowledgement loss never refunds or re-rates',async()=>{
        const m=match('Bob'),before=await wallet('Bob');await admit(m);
        const result=await settle(m),rated=await row("select rating from public.profiles where id='Bob'");
        assert.deepEqual(await settle(m),result);
        assert.deepEqual(await row("select rating from public.profiles where id='Bob'"),rated);
        const v=await cancel(m);assert.equal(v.state,'settled');assert.deepEqual(v.result,result);
        assert.equal(await refunds('Bob'),0);
        assert.equal((await wallet('Bob')).ranked_tickets,before.ranked_tickets-1);
    });
    await test('legacy free ranked settlement remains supported and cannot bypass an admission',async()=>{
        const m=match();await admit(m);
        await assert.rejects(()=>service(settlementSql,[m.id,m.host,m.joiner,'WHITE',m.time,m.cpu,m.rating,m.level,'[]',null]),e=>e.code==='22023');
        await cancel(m);
        const legacy=match('Dan');
        const args=[legacy.id,legacy.host,legacy.joiner,'WHITE',600,legacy.cpu,1200,4,'[]'];
        const oldSql=settlementSql.replace(',$10::uuid','');
        assert.ok((await service(oldSql,args)).result.white);
        await assert.rejects(()=>admit(legacy),e=>e.code==='22023');
    });
    await test('deletion is durably blocked while active; finalized UUID survives identity erasure',async()=>{
        const m=match('Dan');await admit(m);
        await assert.rejects(()=>db.query("insert into public.account_deletion_jobs values('Dan','pending')"),e=>e.code==='55006');
        await assert.rejects(()=>db.query("delete from public.profiles where id='Dan'"),e=>e.code==='55006');
        await cancel(m);
        await db.exec("delete from public.profiles where id='Dan'");
        assert.equal(await state(m.id),'voided');
        assert.equal((await row('select human_ids from public.ranked_match_admissions where match_id=$1',[m.id])).human_ids.length,0);
        assert.equal((await row("select count(*) c from public.ranked_ticket_refunds where user_id='Dan'")).c,0);
        await assert.rejects(()=>admit(m),e=>e.code==='22023');
    });
    await test('paid credits preserve subscription and period, pause suspends, termination/reversal/expiry prevents spend',async()=>{
        const price='price_1ULM9fQWzwYDIuXWgs5Uj3yt';
        await db.query("insert into public.stripe_checkout_intents(checkout_id,user_id,price_id,livemode,expires_at) values('cs_live_Paid','Paid',$1,true,now()+interval '1 hour')",[price]);
        await db.exec("insert into public.stripe_customer_links values('cus_Paid','Paid')");
        await db.query("insert into public.stripe_memberships(subscription_id,checkout_id,customer_id,user_id,current_price_id,status,period_end,event_created,observed_at) values('sub_Paid','cs_live_Paid','cus_Paid','Paid',$1,'active',now()+interval '1 day',1,now())",[price]);
        await db.exec("update public.ticket_wallets set ranked_tickets=0,member_ranked_tickets=1,member_ticket_subscription_id='sub_Paid' where user_id='Paid'");
        await exhaust('Paid');
        const m=match('Paid');assert.equal((await admit(m)).entries[0].pool,'paid');await cancel(m);
        assert.equal(await refunds('Paid'),1);
        for(const status of ['paused','canceled','refunded']) {
            await db.query('update public.stripe_memberships set status=$1 where user_id=$2',[status,'Paid']);
            assert.equal((await admit(match('Paid'))).reason,'INSUFFICIENT_FUNDS');
        }
        await db.exec("update public.stripe_memberships set status='active' where user_id='Paid'");
        await db.exec("update public.ranked_ticket_refunds set expires_at=now()-interval '1 second' where user_id='Paid'");
        assert.equal((await admit(match('Paid'))).reason,'INSUFFICIENT_FUNDS');
        await db.exec("update public.ranked_ticket_refunds set expires_at=now()+interval '1 hour' where user_id='Paid'");
        await db.exec("update public.stripe_memberships set refund_blocked_until=now()+interval '1 day' where user_id='Paid'");
        assert.equal((await admit(match('Paid'))).reason,'INSUFFICIENT_FUNDS');
        await db.exec("update public.stripe_memberships set refund_blocked_until=null where user_id='Paid'");
        const reuse=match('Paid');assert.equal((await admit(reuse)).entries[0].pool,'paid');await settle(reuse);
        assert.equal((await wallet('Paid')).member_ranked_tickets,0);
    });
    await test('a live owner cannot be recovered; expired owners are fenced forever and refunds idempotent',async()=>{
        const m=match('Bob');await admit(m);
        assert.equal((await cancel(m,null)).state,'active');
        assert.equal((await service('select public.get_ranked_admission($1,$2) as result',[m.id,'Alice'])).result,null);
        await db.query("update public.ranked_server_leases set expires_at=now()-interval '1 second' where owner_id=$1",[owner]);
        assert.equal((await service('select public.renew_ranked_server_lease($1) as ok',[owner])).ok,false);
        await assert.rejects(()=>settle(m),e=>e.code==='55000');
        const recovery=(await service('select public.recover_expired_ranked_admissions() as result')).result;
        assert.equal(recovery.length,1);assert.equal(await state(m.id),'voided');
        const count=await refunds('Bob');
        await service('select public.recover_expired_ranked_admissions()');
        await cancel(m);assert.equal(await refunds('Bob'),count);
        const recovered=(await service('select public.get_ranked_admission($1,$2) as result',[m.id,'Bob'])).result;
        assert.equal(recovered.state,'voided');
    });
    console.log('ALL OK: '+passed+' ranked SQL scenarios');
} finally { await db.close(); }
async function settleAfterAdmitFailsBusy(m) { assert.equal((await admit(m)).reason,'ACCOUNT_BUSY'); }
