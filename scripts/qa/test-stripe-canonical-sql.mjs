// Disposable PostgreSQL (PGlite), no connection to hosted Supabase or Stripe.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { setupStripeFixture, stripeMigrations } from './stripe-canonical-fixture.mjs';
const require = createRequire(new URL('../../scratch/ticket-sql/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const db = await PGlite.create();
const migrations = stripeMigrations;
const scalar = async (sql, args = []) => (await db.query(sql,args)).rows[0].result;
const lease = (id='sub_ABCDEFGH', live=false) => scalar('select public.acquire_stripe_reconciliation($1,$2) as result',[id,live]);
const release = (token,id='sub_ABCDEFGH',live=false) => db.query('select public.release_stripe_reconciliation($1,$2,$3)',[id,live,token]);
let counter=0;
const period = new Date(Date.now()+30*86400000).toISOString();
async function snapshot({token,id='sub_ABCDEFGH',checkout='cs_test_ABCDEFGH',event=`evt_CASE000${++counter}`,
    hash='a'.repeat(64),status='active',created=200,paid=false,end=period,cancel=false}={}) {
    return scalar(`select public.apply_stripe_canonical_membership_snapshot(
        $1,$2,'invoice.paid',$3,clock_timestamp(),$4,$5,'cus_ABCDEFGH','Alice','price_ABCDEFGH',
        $6,$7,false,$8,$9,$10) as result`,[event,hash,created,id,checkout,status,end,paid,cancel,token]);
}
async function apply(value={}) {
    const id=value.id??'sub_ABCDEFGH'; const current=await lease(id);
    try { return await snapshot({...value,token:current.token}); } finally { await release(current.token,id); }
}
const claim = () => scalar("select public.claim_stripe_member_daily_grant_with_schedule('Alice') as result");
const status = () => scalar("select public.stripe_member_status_with_schedule('Alice') as result");
const wallet = () => scalar("select to_jsonb(w) as result from public.ticket_wallets w where user_id='Alice'");
try {
    await setupStripeFixture(db);
    await db.exec(`insert into public.profiles(id) values('Alice'),('Bob');
        insert into public.account_terms_consents values('Alice','2026-09-25.1'),('Bob','2026-09-25.1');`);
    await db.exec('set role service_role');
    await scalar("select public.claim_daily_login_reward('Alice') as result");
    await db.query("select public.register_stripe_checkout_intent('Alice','cs_test_ABCDEFGH','price_ABCDEFGH',false,clock_timestamp()+interval '1 hour')");

    const first=await lease(), busy=await lease();
    assert.ok(first.token); assert.equal(busy.token,null);
    await snapshot({token:first.token,status:'unpaid',created:300}); await release(first.token);
    // A lower event timestamp sees a newer canonical paid state. It must recover.
    await apply({created:100,paid:true,event:'evt_BACKWARD1'});
    assert.equal((await status()).active,true);
    const credit=await claim(); assert.deepEqual(credit.credited,{ranked:3,hint:3});
    assert.equal((await claim()).claimed,false);
    const duplicate=await apply({created:100,paid:true,event:'evt_BACKWARD1'});
    assert.equal(duplicate.duplicate,true);
    await assert.rejects(()=>apply({created:100,event:'evt_BACKWARD1',hash:'b'.repeat(64)}),/Event collision/);

    // Expired process A cannot commit after process B acquired a fresh lease.
    const stale=await lease();
    await db.query("update public.stripe_reconciliation_leases set expires_at=clock_timestamp()-interval '1 second' where subscription_id='sub_ABCDEFGH'");
    const replacement=await lease(); assert.notEqual(replacement.token,stale.token);
    await assert.rejects(()=>snapshot({token:stale.token,status:'active',created:999,event:'evt_STALE0001'}),/Expired or superseded/);
    await snapshot({token:replacement.token,status:'unpaid',created:99});
    await release(stale.token); assert.equal((await lease()).token,null); // stale release cannot unlock B
    await release(replacement.token);
    assert.equal((await status()).active,false);
    await apply({created:98,paid:true}); assert.equal((await status()).active,true);

    const reverseLease=await lease();
    await scalar(`select public.apply_stripe_canonical_membership_reversal(
        'evt_REFUND001',$1,'charge.refunded','sub_ABCDEFGH','in_CURRENT1','in_CURRENT1',
        'cs_test_ABCDEFGH','cus_ABCDEFGH','Alice',$2,false,$3) as result`,['c'.repeat(64),period,reverseLease.token]);
    await release(reverseLease.token);
    assert.equal((await status()).active,false); assert.equal((await wallet()).test_member_ranked_tickets,0);
    assert.equal((await wallet()).ranked_tickets,1); assert.equal((await wallet()).hint_tickets,2);
    await apply({created:9999,paid:false}); assert.equal((await status()).active,false); // sticky refund
    await apply({created:1,paid:true,end:new Date(Date.now()+60*86400000).toISOString()});
    assert.equal((await status()).active,true); // only a verified next paid period clears the hold
    await apply({status:'canceled',created:5}); assert.equal((await status()).active,false);
    await assert.rejects(()=>apply({status:'active',created:10000,event:'evt_REVIVE001'}),/Terminal subscription conflict/);
    assert.equal(await scalar("select count(*)::int as result from public.stripe_webhook_receipts where event_id='evt_REVIVE001'"),0);

    await db.query("select public.register_stripe_checkout_intent('Alice','cs_test_NEW00001','price_ABCDEFGH',false,clock_timestamp()+interval '1 hour')");
    await apply({id:'sub_NEW00001',checkout:'cs_test_NEW00001',created:1,paid:true});
    assert.equal((await status()).tickets.ranked,0); // never carry the old pool
    await db.query("update public.ticket_wallets set last_member_grant_utc_day=(clock_timestamp() at time zone 'UTC')::date-1 where user_id='Alice'");
    assert.equal((await claim()).credited.ranked,3);
    await apply({status:'canceled',created:4}); assert.equal((await status()).tickets.ranked,3); // delayed old termination
    await apply({id:'sub_NEW00001',checkout:'cs_test_NEW00001',end:new Date(Date.now()-1000).toISOString(),created:2});
    await claim(); assert.equal((await wallet()).test_member_ranked_tickets,0); // elapsed period expires

    await db.query("insert into public.account_deletion_jobs values('Alice','pending')");
    await db.query('select public.retire_stripe_account_subscriptions($1,$2)', ['Alice',JSON.stringify([
        {subscriptionId:'sub_ABCDEFGH',checkoutId:'cs_test_ABCDEFGH',livemode:false},
        {subscriptionId:'sub_NEW00001',checkoutId:'cs_test_NEW00001',livemode:false},
    ])]);
    await db.exec("reset role; delete from public.profiles where id='Alice'; set role service_role");
    assert.deepEqual(await lease(),{retired:true,token:null});
    assert.equal(await scalar("select count(*)::int as result from public.stripe_memberships where user_id='Alice'"),0);

    // The first live intent permanently pins this database, even after erasure.
    await db.query("select public.register_stripe_live_checkout_intent('Bob','cs_live_PIN00001','price_1ULM9fQWzwYDIuXWgs5Uj3yt',clock_timestamp()+interval '1 hour')");
    await assert.rejects(()=>lease('sub_SANDBOX1'),/Live billing mode is pinned/);
    await db.exec("reset role; delete from public.profiles where id='Bob'; set role service_role");
    await assert.rejects(()=>scalar('select public.assert_stripe_billing_mode(false) as result'),/Live billing mode is pinned/);
    assert.equal(await scalar('select public.assert_stripe_billing_mode(true) as result'),true);
    await db.exec('reset role');
    for (const role of ['anon','authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(()=>lease('sub_ATTACK01',true));
        await assert.rejects(()=>db.query('select * from public.stripe_retired_subscriptions'));
        await assert.rejects(()=>db.query('select * from public.stripe_reconciliation_leases'));
        await db.exec('reset role');
    }
    console.log(`PASS: ${migrations.length} raw migrations; fenced canonical ordering/recovery, duplicate/hash collision, lease death/replacement, refund hold, terminal denial, separate 3+3 grants, expiration/rejoin, deletion tombstone, permanent live pin, RLS/client denial. PGlite serializes calls; cross-process PostgreSQL contention is checked separately.`);
} finally { await db.close(); }
