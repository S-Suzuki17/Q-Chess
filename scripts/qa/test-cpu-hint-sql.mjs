// Disposable in-memory PostgreSQL test; never connects to Supabase.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../../scratch/ticket-sql/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const db = await PGlite.create();

const hintId = '11111111-2222-4333-8444-555555555555';
const hintId2 = '22222222-2222-4333-8444-555555555555';

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
        insert into public.ticket_wallets(user_id, ranked_tickets, hint_tickets)
            values ('Alice', 3, 3), ('Bob', 0, 0), ('Carol', 1, 0);
    `);

    // Load necessary migrations in order
    const load = async (file) => db.exec(await readFile(new URL('../../supabase/migrations/' + file, import.meta.url), 'utf8'));

    await load('20260930133414_atomic_ticket_spending.sql');
    await load('20261001000000_cpu_hint_receipts.sql');

    const adminQuery = async (q, params) => {
        await db.query('set role service_role');
        const res = await db.query(q, params);
        await db.query('reset role');
        return res;
    };

    // TEST 1: Alice has hint tickets, can buy hint
    let res = (await adminQuery(`select public.buy_cpu_hint($1::uuid, 'Alice', 'hash1', 1, 1, 2, 2) as result`, [hintId])).rows[0].result;
    assert.equal(res.success, true);
    assert.equal(res.duplicate, false);

    // Verify wallet debit
    let wallet = (await db.query(`select * from public.ticket_wallets where user_id='Alice'`)).rows[0];
    assert.equal(wallet.hint_tickets, 2);

    // Duplicate purchase (idempotent)
    let resDup = (await adminQuery(`select public.buy_cpu_hint($1::uuid, 'Alice', 'hash1', 1, 1, 2, 2) as result`, [hintId])).rows[0].result;
    assert.equal(resDup.success, true);
    assert.equal(resDup.duplicate, true);
    assert.equal(resDup.hint.fromRow, 1);
    assert.equal(resDup.hint.fromCol, 1);
    assert.equal(resDup.hint.toRow, 2);
    assert.equal(resDup.hint.toCol, 2);

    // TEST 2: Bob has no hint tickets
    let bobRes = (await adminQuery(`select public.buy_cpu_hint($1::uuid, 'Bob', 'hash2', 0, 0, 1, 1) as result`, [hintId2])).rows[0].result;
    assert.equal(bobRes.success, false);
    assert.equal(bobRes.reason, 'INSUFFICIENT_FUNDS');

    console.log("ALL OK CPU HINTS");
} catch (e) {
    console.error(e);
    process.exit(1);
}
