// Disposable in-memory PostgreSQL test; never connects to Supabase.
// Setup: npm install --prefix scratch/ticket-sql --save-exact @electric-sql/pglite@0.5.8 --ignore-scripts
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../../scratch/ticket-sql/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const db = await PGlite.create();
const price = 'price_1ULM9fQWzwYDIuXWgs5Uj3yt';
const match = '11111111-2222-4333-8444-555555555555';
const hint = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const spend = async (kind, eventId, ids) => (await db.query(
    'select public.spend_game_tickets($1,$2::uuid,$3::text[]) as result',
    [kind, eventId, ids],
)).rows[0].result;
const wallet = async userId => (await db.query(
    'select * from public.ticket_wallets where user_id=$1', [userId],
)).rows[0];

try {
    await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create table public.profiles(id text primary key);
        create table public.account_deletion_jobs(user_id text, phase text);
        create table public.account_restrictions(user_id text, blocked boolean);
        create table public.account_terms_consents(user_id text, version text);
        create table public.ticket_wallets(
            user_id text primary key references public.profiles(id),
            ranked_tickets integer not null default 0 check(ranked_tickets between 0 and 20),
            hint_tickets integer not null default 0 check(hint_tickets between 0 and 20),
            member_ranked_tickets integer not null default 0 check(member_ranked_tickets between 0 and 20),
            member_hint_tickets integer not null default 0 check(member_hint_tickets between 0 and 20),
            member_ticket_subscription_id text,
            test_member_ranked_tickets integer not null default 0,
            test_member_hint_tickets integer not null default 0);
        create table public.stripe_checkout_intents(
            checkout_id text primary key, user_id text, price_id text, livemode boolean);
        create table public.stripe_customer_links(customer_id text primary key, user_id text);
        create table public.stripe_memberships(
            subscription_id text primary key, checkout_id text, customer_id text,
            user_id text, status text, period_end timestamptz,
            refund_blocked_until timestamptz, current_price_id text);
        grant usage on schema public to anon, authenticated, service_role;
        grant all on all tables in schema public to service_role;
        insert into public.profiles values ('Alice'), ('Bob'), ('Carol');
        insert into public.account_terms_consents values
            ('Alice','2026-09-25.1'), ('Bob','2026-09-25.1'), ('Carol','2026-09-25.1');
        insert into public.ticket_wallets(user_id, ranked_tickets, hint_tickets,
            member_ranked_tickets, member_hint_tickets, member_ticket_subscription_id,
            test_member_ranked_tickets, test_member_hint_tickets)
            values ('Alice',2,1,3,2,'sub_ABC',4,4), ('Bob',1,0,0,0,null,5,5);
        insert into public.stripe_checkout_intents values
            ('cs_live_ABC','Alice','${price}',true);
        insert into public.stripe_customer_links values ('cus_ABC','Alice');
        insert into public.stripe_memberships values
            ('sub_ABC','cs_live_ABC','cus_ABC','Alice','active',now()+interval '30 days',null,'${price}');
    `);
    await db.exec(await readFile(new URL('../../supabase/migrations/20260930133414_atomic_ticket_spending.sql',
        import.meta.url), 'utf8'));

    await db.exec('set role anon');
    await assert.rejects(spend('ranked_match_start', match, ['Alice']), /permission denied/i);
    await assert.rejects(db.query('select * from public.ticket_spend_receipts'), /permission denied/i);
    await db.exec('reset role');
    await db.exec('set role service_role');
    await db.exec("set time zone 'Asia/Tokyo'");

    const first = await spend('ranked_match_start', match, ['Bob', 'Alice']);
    assert.deepEqual(first.entries, [
        { userId: 'Alice', pool: 'quota' }, { userId: 'Bob', pool: 'quota' },
    ]);
    assert.equal(first.applied, true);
    assert.equal((await db.query(`select count(distinct spent_at)::integer as timestamps
        from public.ticket_spend_receipts where event_id = '${match}'`)).rows[0].timestamps, 1);
    assert.equal((await wallet('Alice')).ranked_tickets, 2);
    assert.equal((await wallet('Bob')).ranked_tickets, 1);
    assert.equal((await spend('ranked_match_start', match, ['Alice', 'Bob'])).duplicate, true);
    assert.equal((await wallet('Alice')).ranked_tickets, 2);
    await assert.rejects(spend('ranked_match_start', match, ['Alice']), /participant mismatch/i);

    // A new account needs no ticket balance to use its free daily starts.
    const emptyWalletStart = await spend('ranked_match_start',
        '11111111-2222-4333-8444-555555555568', ['Carol']);
    assert.deepEqual(emptyWalletStart.entries, [{ userId: 'Carol', pool: 'quota' }]);
    assert.equal((await wallet('Carol')).ranked_tickets, 0);

    // Single-human CPU starts and PvP starts use the same per-account quota.
    for (const [eventId, userId] of [
        ['11111111-2222-4333-8444-555555555557', 'Alice'],
        ['11111111-2222-4333-8444-555555555558', 'Alice'],
        ['11111111-2222-4333-8444-555555555559', 'Bob'],
        ['11111111-2222-4333-8444-555555555560', 'Bob'],
    ]) {
        const freeStart = await spend('ranked_match_start', eventId, [userId]);
        assert.deepEqual(freeStart.entries, [{ userId, pool: 'quota' }]);
    }
    assert.equal((await wallet('Alice')).ranked_tickets, 2);
    assert.equal((await wallet('Bob')).ranked_tickets, 1);

    const fourth = await spend('ranked_match_start', '11111111-2222-4333-8444-555555555561',
        ['Bob', 'Alice']);
    assert.deepEqual(fourth.entries, [
        { userId: 'Alice', pool: 'free' }, { userId: 'Bob', pool: 'free' },
    ]);
    assert.equal((await wallet('Alice')).ranked_tickets, 1);
    assert.equal((await wallet('Bob')).ranked_tickets, 0);

    // Bob cannot pay for another start; Alice must not lose her ticket either.
    const partial = await spend('ranked_match_start', '11111111-2222-4333-8444-555555555556',
        ['Alice', 'Bob']);
    assert.equal(partial.insufficient, true);
    assert.equal((await wallet('Alice')).ranked_tickets, 1);
    assert.equal((await wallet('Bob')).ranked_tickets, 0);

    const fifth = await spend('ranked_match_start', '11111111-2222-4333-8444-555555555562', ['Alice']);
    assert.equal(fifth.entries[0].pool, 'free');
    const sixth = await spend('ranked_match_start', '11111111-2222-4333-8444-555555555563', ['Alice']);
    assert.equal(sixth.entries[0].pool, 'paid');
    assert.equal((await wallet('Alice')).member_ranked_tickets, 2);
    assert.equal((await spend('cpu_hint_delivered', hint, ['Alice'])).entries[0].pool, 'free');
    const paidHint = await spend('cpu_hint_delivered', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeef', ['Alice']);
    assert.equal(paidHint.entries[0].pool, 'paid');
    assert.equal((await wallet('Alice')).member_hint_tickets, 1);

    await db.exec("update public.ticket_wallets set hint_tickets=1 where user_id='Alice'");
    await db.exec("update public.stripe_memberships set status='past_due' where user_id='Alice'");
    assert.equal((await spend('ranked_match_start', '11111111-2222-4333-8444-555555555564',
        ['Alice'])).insufficient, true);
    assert.equal((await wallet('Alice')).member_ranked_tickets, 2);
    assert.equal((await spend('cpu_hint_delivered', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeed',
        ['Alice'])).entries[0].pool, 'free');
    assert.equal((await wallet('Alice')).member_hint_tickets, 1);

    await db.exec("update public.stripe_memberships set status='refunded' where user_id='Alice'");
    assert.equal((await spend('cpu_hint_delivered', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        ['Alice'])).duplicate, true);
    assert.equal((await spend('ranked_match_start', '11111111-2222-4333-8444-555555555565',
        ['Alice'])).insufficient, true);
    const expired = await wallet('Alice');
    assert.equal(expired.member_ranked_tickets, 0);
    assert.equal(expired.member_hint_tickets, 0);
    assert.equal(expired.member_ticket_subscription_id, null);
    assert.equal(expired.test_member_ranked_tickets, 4);
    assert.equal(expired.test_member_hint_tickets, 4);
    assert.equal((await wallet('Bob')).test_member_ranked_tickets, 5);

    // A later new subscription must not inherit an old paid wallet balance.
    await db.exec(`
        update public.ticket_wallets set member_ranked_tickets=3,
            member_ticket_subscription_id='sub_ABC' where user_id='Alice';
        insert into public.stripe_checkout_intents values
            ('cs_live_NEW','Alice','${price}',true);
        insert into public.stripe_memberships values
            ('sub_NEW','cs_live_NEW','cus_ABC','Alice','active',now()+interval '30 days',null,'${price}');
    `);
    assert.equal((await spend('ranked_match_start', '11111111-2222-4333-8444-555555555566',
        ['Alice'])).insufficient, true);
    assert.equal((await wallet('Alice')).member_ranked_tickets, 0);
    assert.equal((await wallet('Alice')).member_ticket_subscription_id, null);

    // A receipt just before 00:00 UTC belongs to the previous day's quota.
    await db.exec('reset role');
    await db.exec(`update public.ticket_spend_receipts
        set spent_at = (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') - interval '1 microsecond'
        where event_kind = 'ranked_match_start' and event_id = '${match}' and user_id = 'Alice'`);
    await db.exec('set role service_role');
    const newDaySlot = await spend('ranked_match_start',
        '11111111-2222-4333-8444-555555555567', ['Alice']);
    assert.equal(newDaySlot.entries[0].pool, 'quota');
    assert.equal((await wallet('Alice')).ranked_tickets, 0);
    assert.equal((await spend('ranked_match_start', match, ['Alice', 'Bob'])).duplicate, true);
    console.log('PASS: 3 free UTC starts, atomic PvP/CPU tickets, retry, paid gating/expiry, RLS.');
} finally {
    await db.close();
}
