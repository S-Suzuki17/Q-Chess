import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const migrationDirectory = new URL('../../../supabase/migrations/', import.meta.url);

// This list and the minimal pre-migration tables below are reproduced from the
// already-public server/src/services/fixtures/commerceDatabaseFixture.ts.
// No hosted-schema capture, private definition, ACL snapshot or fingerprint is
// imported. Every historical and release commerce statement executes as SQL.
export const historical = [
    '20260918072145_ranked_server_settlement.sql',
    '20260924174539_account_terms_consent.sql',
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
    '20261003023533_stripe_canonical_reconciliation.sql',
    '20261003041000_member_ticket_cap_60.sql',
    '20261003042315_approved_current_terms_consent.sql',
    '20261003075158_cpu_hint_restoration_member_cap_60.sql',
];
export const pending = [
    '20261004040000_monetization_update.sql',
    '20261004050000_hint_tickets_store.sql',
    '20261006000000_pricing_v2.sql',
];
export const baselineEvidence = Object.freeze({
    postgresMajor: 17,
    source: 'Public repository commerceDatabaseFixture.ts and raw supabase/migrations files only',
    historical, pending,
    hostedProductionEquivalent: false,
    limitations: [
        'Minimal pre-migration account tables omit unrelated application schema, triggers and grants.',
        'Role/RLS/EXECUTE checks prove public migration contracts, not complete hosted-role equivalence.',
        'Auth/Storage APIs, hosted extensions, cron schedules and PostgREST are not reproduced.',
        'An explicit dependency baseline is not an all-files fresh-install test.',
    ],
});

export async function setupBaseline(client) {
    // Prevent accidental divergence from the existing public PGlite baseline.
    const publicFixture = await readFile(new URL('../../../server/src/services/fixtures/commerceDatabaseFixture.ts', import.meta.url), 'utf8');
    const list = name => [...publicFixture.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\];`))[1].matchAll(/'([^']+\.sql)'/g)].map(m => m[1]);
    assert.deepEqual(historical, list('historicalCommerceMigrations'));
    assert.deepEqual(pending, list('releaseCommerceMigrations'));
    await client.query(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create table public.profiles(id text primary key,name text,password_hash text,
            rating integer default 1000,rating_10s integer default 1000,rating_3m integer default 1000,rating_10m integer default 1000);
        create table public.game_records(id uuid primary key,created_at timestamptz default now(),
            white_player text,black_player text,winner text,mode text,cpu_level integer,moves jsonb,total_moves integer,
            white_id text,black_id text,time_control text);
        create table public.account_deletion_jobs(user_id text primary key,phase text);
        create table public.account_restrictions(user_id text,blocked boolean);
        grant usage on schema public to anon,authenticated,service_role;
        grant all on all tables in schema public to service_role;
    `);
    await applyFiles(client, historical);
}

async function applyFiles(client, names) {
    for (const name of names) {
        const sql = await readFile(new URL(name, migrationDirectory), 'utf8');
        try { await client.query(sql); }
        catch (error) { throw new Error(`Raw migration ${name} failed: ${error.message}`, { cause: error }); }
    }
}

export async function applyPending(client) {
    const discovered = (await readdir(migrationDirectory)).filter(name => name.endsWith('.sql') && name >= pending[0]).sort();
    assert.deepEqual(discovered, pending, 'New pending migration detected: review and extend this complete chain explicitly');
    await applyFiles(client, pending);
}
