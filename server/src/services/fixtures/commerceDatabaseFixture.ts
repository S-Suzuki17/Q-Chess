import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

// The project predates migrations. These are the minimal pre-existing account
// tables/roles, not substitutes for any commerce migration under test. There
// is deliberately no public.users, hosted URL, credential, mock RPC or SQL rewrite.
// PGlite serializes statements; these tests do not prove cross-process lock contention.
export const historicalCommerceMigrations = [
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
export const releaseCommerceMigrations = [
    '20261004040000_monetization_update.sql',
    '20261004050000_hint_tickets_store.sql',
    '20261006000000_pricing_v2.sql',
    '20261006155010_atomic_commerce_fulfillment.sql',
    '20261006171022_dormant_hint_origin_consumption.sql',
];
export async function applyMigrations(db: PGlite, files: readonly string[]) {
    for (const file of files) {
        try { await db.exec(await readFile(resolve(process.cwd(), 'supabase/migrations', file), 'utf8')); }
        catch (error) { throw new Error(`${file}: ${String(error)}`, { cause: error }); }
    }
}
export async function historicalCommerceDatabase() {
    const db = await PGlite.create();
    await db.exec(`
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
    await applyMigrations(db, historicalCommerceMigrations);
    return db;
}
