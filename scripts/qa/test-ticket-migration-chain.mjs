// T0: disposable PostgreSQL smoke test, never a Supabase connection.
// Setup: npm install --prefix scratch/ticket-sql --save-exact @electric-sql/pglite@0.5.8 --ignore-scripts
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(new URL('../../scratch/ticket-sql/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const db = await PGlite.create();
const migrations = [
    '20260930083253_ticket_wallet_daily_login.sql',
    '20260930095339_stripe_membership_entitlements.sql',
    '20260930123309_stripe_billing_portal_customer_lookup.sql',
    '20260930123542_stripe_membership_reversal.sql',
    '20260930123817_stripe_live_membership_allowlist.sql',
    '20260930133414_atomic_ticket_spending.sql',
    '20260930141357_stripe_scheduled_cancellation_projection.sql',
    '20260930144240_stripe_test_member_ticket_binding.sql',
    '20261001000000_cpu_hint_receipts.sql',
    '20261001000001_ranked_match_admissions.sql',
    '20261001000002_ranked_match_void.sql',
];

try {
    await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create table public.profiles(id text primary key);
        create table public.account_deletion_jobs(user_id text, phase text);
        create table public.account_restrictions(user_id text, blocked boolean);
        create table public.account_terms_consents(user_id text, version text);
        grant usage on schema public to anon, authenticated, service_role;
        grant all on all tables in schema public to service_role;
        insert into public.profiles values ('Alice');
        insert into public.account_terms_consents values ('Alice','2026-09-25.1');
    `);
    for (const name of migrations) {
        try {
            await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
        } catch (error) {
            throw new Error(`${name}: ${error.message}`);
        }
    }
    const tables = ['ticket_wallets', 'stripe_checkout_intents', 'stripe_customer_links',
        'stripe_memberships', 'stripe_webhook_receipts', 'stripe_reversal_receipts',
        'ticket_spend_receipts', 'cpu_hint_receipts', 'ranked_match_admissions'];
    const rows = (await db.query(`select relname, relrowsecurity from pg_class
        where relnamespace='public'::regnamespace and relname=any($1::text[])`, [tables])).rows;
    assert.equal(rows.length, tables.length);
    assert.ok(rows.every(row => row.relrowsecurity));
    await db.exec('set role service_role');
    const claim = async () => (await db.query("select public.claim_daily_login_reward('Alice') as result")).rows[0].result;
    const first = await claim(), duplicate = await claim();
    assert.equal(first.claimed, true);
    assert.deepEqual(first.credited, { ranked: 1, hint: 2 });
    assert.equal(duplicate.claimed, false);
    assert.deepEqual(duplicate.credited, { ranked: 0, hint: 0 });
    assert.deepEqual(duplicate.tickets, first.tickets);
    await db.exec('reset role');
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(() => db.query("select public.claim_daily_login_reward('Alice')"));
        await assert.rejects(() => db.query('select * from public.ticket_wallets'));
        await db.exec('reset role');
    }
    console.log('PASS: 11 dormant migrations in dependency order, wallet claim idempotency, RLS and client denial. Release readiness remains OFF.');
} finally {
    await db.close();
}
