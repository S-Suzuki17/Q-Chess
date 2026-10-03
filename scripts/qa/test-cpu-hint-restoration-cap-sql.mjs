// Entirely isolated PostgreSQL-compatible fixture. No hosted users or payments.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { setupStripeFixture } from './stripe-canonical-fixture.mjs';
const require = createRequire(new URL('../../scratch/ticket-sql/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const db = await PGlite.create();
const sql = name => readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
const scalar = async (query,args=[]) => (await db.query(query,args)).rows[0].result;
const wallet = async () => (await db.query("select * from public.ticket_wallets where user_id='RestoreOwner'")).rows[0];
const restore = (id,user='RestoreOwner',reason='unrecoverable_delivery') => scalar(
    'select public.restore_cpu_hint_credit($1,$2,$3) as result',[id,user,reason]);
let revision=0;
try {
    await setupStripeFixture(db);
    await db.exec('drop table public.account_terms_consents;'+await sql('20260924174539_account_terms_consent.sql'));
    await db.exec(await sql('20261003042315_approved_current_terms_consent.sql'));
    await db.exec(await sql('20261003075158_cpu_hint_restoration_member_cap_60.sql'));
    await db.exec("insert into public.profiles(id) values('RestoreOwner'),('OtherOwner'); set role service_role");
    // General gameplay consent is separate from the new purchase/claim consent.
    await db.exec("insert into public.account_terms_consents(user_id,version) values('RestoreOwner','2026-09-25.1'),('OtherOwner','2026-09-25.1')");
    await db.exec("select public.accept_current_account_terms('RestoreOwner','2026-10-03.1'); select public.accept_current_account_terms('OtherOwner','2026-10-03.1')");
    const price='price_1ULM9fQWzwYDIuXWgs5Uj3yt';
    await db.query("select public.register_stripe_live_checkout_intent('RestoreOwner','cs_live_RESTORE01',$1,clock_timestamp()+interval '1 hour')",[price]);
    const lease=await scalar("select public.acquire_stripe_reconciliation('sub_RESTORE01',true) as result");
    await scalar(`select public.apply_stripe_canonical_membership_snapshot(
        'evt_RESTORE01',$1,'invoice.paid',100,clock_timestamp(),'sub_RESTORE01','cs_live_RESTORE01',
        'cus_RESTORE01','RestoreOwner',$2,'active',clock_timestamp()+interval '30 days',true,true,false,$3) as result`,
        ['a'.repeat(64),price,lease.token]);
    await db.query("select public.release_stripe_reconciliation('sub_RESTORE01',true,$1)",[lease.token]);
    await db.exec("select public.claim_stripe_live_member_daily_grant('RestoreOwner')");
    const session=randomUUID();
    await db.query(`insert into public.cpu_practice_sessions
        (session_id,user_id,rules_version,player_side,level,seconds,state,state_hash,white_ms,black_ms)
        values($1,'RestoreOwner','quantum-practice-v1','white',1,600,'{}',$2,600000,600000)`,[session,'b'.repeat(64)]);
    const receipt=async(pool='paid')=>{
        const id=randomUUID();
        await db.query(`insert into public.cpu_hint_receipts
            (request_id,user_id,session_id,revision,rules_version,session_hash,move,hint,pool,subscription_id)
            values($1,'RestoreOwner',$2,$3,'quantum-practice-v1',$4,'{}','{}',$5,$6)`,
            [id,session,revision++,'b'.repeat(64),pool,pool==='paid'?'sub_RESTORE01':null]);
        return id;
    };
    for(const held of [0,19,20,21,58,59,60]) {
        await db.query("update public.ticket_wallets set hint_tickets=20,member_hint_tickets=$1 where user_id='RestoreOwner'",[held]);
        const id=await receipt(), expected=held<60?1:0;
        assert.equal(await restore(id),expected);
        assert.equal((await wallet()).member_hint_tickets,held+expected);
        assert.equal((await wallet()).hint_tickets,20);
        assert.equal(await restore(id),0);
        assert.equal((await wallet()).member_hint_tickets,held+expected);
        assert.equal(await scalar('select count(*)::int as result from public.cpu_hint_restorations where receipt_id=$1',[id]),1);
    }
    for(const held of [19,20]) {
        await db.query("update public.ticket_wallets set hint_tickets=$1,member_hint_tickets=40 where user_id='RestoreOwner'",[held]);
        const id=await receipt('free');
        assert.equal(await restore(id),held<20?1:0);
        assert.equal((await wallet()).hint_tickets,20);
        assert.equal((await wallet()).member_hint_tickets,40);
    }
    for(const mutation of [
        "update public.stripe_memberships set period_end=clock_timestamp()-interval '1 second'",
        "update public.stripe_memberships set refund_blocked_until=clock_timestamp()+interval '1 day'",
        "update public.stripe_memberships set status='canceled'",
        "update public.stripe_memberships set current_price_id='price_OFFPRICE'",
        "update public.ticket_wallets set member_ticket_subscription_id='sub_REPLACEMENT' where user_id='RestoreOwner'",
    ]) {
        await db.query("update public.stripe_memberships set status='active',period_end=clock_timestamp()+interval '1 day',refund_blocked_until=null,current_price_id=$1",[price]);
        await db.exec("update public.ticket_wallets set member_hint_tickets=40,member_ticket_subscription_id='sub_RESTORE01' where user_id='RestoreOwner'");
        await db.exec(mutation);
        // Membership triggers may already expire the pool. Recovery must not revive it.
        const before=(await wallet()).member_hint_tickets;
        const id=await receipt();
        assert.equal(await restore(id),0);
        assert.equal((await wallet()).member_hint_tickets,before);
    }
    const id=await receipt();
    await assert.rejects(()=>restore(id,'OtherOwner'),/INVALID_REQUEST/);
    await assert.rejects(()=>restore(id,'RestoreOwner','not-approved'),/INVALID_REQUEST/);
    assert.equal(await scalar('select count(*)::int as result from public.cpu_hint_restorations where receipt_id=$1',[id]),0);
    for(const role of ['anon','authenticated']) {
        await db.exec('reset role; set role '+role);
        await assert.rejects(()=>restore(id),/permission denied/);
    }
    await db.exec('reset role');
    assert.equal(await scalar("select prosecdef as result from pg_proc where oid='public.restore_cpu_hint_credit(uuid,text,text)'::regprocedure"),false);
    console.log('PASS: raw production migration chain; paid recovery 0/19/20/21/58/59/60; free cap20; retry; expired/refunded/canceled/replaced/off-price denial; owner/reason/role fences.');
} catch(error) {
    console.error(error.message,error.where??''); process.exitCode=1;
} finally { await db.close(); }
