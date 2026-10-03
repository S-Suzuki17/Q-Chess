// Isolated PostgreSQL-compatible fixture only. Never touches hosted accounts.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { setupStripeFixture } from './stripe-canonical-fixture.mjs';
const require = createRequire(new URL('../../scratch/ticket-sql/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
for (const live of [false, true]) {
    const db = await PGlite.create();
    const scalar = async (sql, args=[]) => (await db.query(sql,args)).rows[0].result;
    try {
        await setupStripeFixture(db);
        await db.exec("insert into public.profiles(id) values('CapOwner'); insert into public.account_terms_consents values('CapOwner','2026-09-25.1'); set role service_role");
        const checkout = live ? 'cs_live_CAP00001' : 'cs_test_CAP00001';
        const price = live ? 'price_1ULM9fQWzwYDIuXWgs5Uj3yt' : 'price_CAP00001';
        if (live) await db.query("select public.register_stripe_live_checkout_intent('CapOwner',$1,$2,clock_timestamp()+interval '1 hour')",[checkout,price]);
        else await db.query("select public.register_stripe_checkout_intent('CapOwner',$1,$2,false,clock_timestamp()+interval '1 hour')",[checkout,price]);
        const lease = await scalar("select public.acquire_stripe_reconciliation('sub_CAP00001',$1) as result",[live]);
        await scalar(`select public.apply_stripe_canonical_membership_snapshot(
            'evt_CAP00001',$1,'invoice.paid',100,clock_timestamp(),'sub_CAP00001',$2,
            'cus_CAP00001','CapOwner',$3,'active',clock_timestamp()+interval '30 days',$4,true,false,$5) as result`,
            ['a'.repeat(64),checkout,price,live,lease.token]);
        await db.query("select public.release_stripe_reconciliation('sub_CAP00001',$1,$2)",[live,lease.token]);
        const claim = () => scalar(`select public.${live?'claim_stripe_live_member_daily_grant_with_schedule':'claim_stripe_member_daily_grant_with_schedule'}('CapOwner') as result`);
        assert.deepEqual((await claim()).credited,{ranked:3,hint:3});
        const prefix = live ? 'member_' : 'test_member_';
        const last = live ? 'last_live_member_grant_utc_day' : 'last_member_grant_utc_day';
        for (const [held,expected] of [[20,3],[58,2],[59,1],[60,0]]) {
            await db.exec(`update public.ticket_wallets set ranked_tickets=20,hint_tickets=20,
                ${prefix}ranked_tickets=${held},${prefix}hint_tickets=${held},
                ${last}=(clock_timestamp() at time zone 'UTC')::date-1 where user_id='CapOwner'`);
            const granted = await claim();
            assert.deepEqual(granted.credited,{ranked:expected,hint:expected});
            assert.deepEqual(granted.tickets,{ranked:held+expected,hint:held+expected});
            assert.deepEqual(granted.freeTickets,{ranked:20,hint:20});
            assert.equal((await claim()).claimed,false);
            assert.deepEqual((await claim()).credited,{ranked:0,hint:0});
        }
        for (const column of [prefix+'ranked_tickets',prefix+'hint_tickets']) {
            await assert.rejects(()=>db.exec(`update public.ticket_wallets set ${column}=61 where user_id='CapOwner'`),/check constraint/);
            await assert.rejects(()=>db.exec(`update public.ticket_wallets set ${column}=-1 where user_id='CapOwner'`),/check constraint/);
        }
        await assert.rejects(()=>db.exec("update public.ticket_wallets set ranked_tickets=21 where user_id='CapOwner'"),/check constraint/);
        for (const role of ['anon','authenticated']) {
            await db.exec('reset role; set role '+role);
            await assert.rejects(claim,/permission denied|Trusted service/);
        }
        console.log('PASS '+(live?'live-mode SQL':'sandbox SQL')+': 60-cap, partial/full grants, same-day replay, free cap 20, invalid values and untrusted-role denial');
    } finally { await db.close(); }
}
