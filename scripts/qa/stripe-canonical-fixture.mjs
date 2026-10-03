import { readFile } from 'node:fs/promises';
export const stripeMigrations = [
    '20260918072145_ranked_server_settlement.sql',
    '20260930083253_ticket_wallet_daily_login.sql','20260930095339_stripe_membership_entitlements.sql',
    '20260930123309_stripe_billing_portal_customer_lookup.sql','20260930123542_stripe_membership_reversal.sql',
    '20260930123817_stripe_live_membership_allowlist.sql','20260930133414_atomic_ticket_spending.sql',
    '20260930141357_stripe_scheduled_cancellation_projection.sql','20260930144240_stripe_test_member_ticket_binding.sql',
    '20261001000000_cpu_hint_receipts.sql','20261001000001_ranked_match_admissions.sql',
    '20261001000002_ranked_match_void.sql','20261003023533_stripe_canonical_reconciliation.sql',
    '20261003041000_member_ticket_cap_60.sql',
];
export async function setupStripeFixture(db, migrations = stripeMigrations) {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
        create table public.profiles(id text primary key,name text,password_hash text,
            rating integer default 1000,rating_10s integer default 1000,rating_3m integer default 1000,rating_10m integer default 1000);
        create table public.game_records(id uuid primary key,created_at timestamptz default now(),
            white_player text,black_player text,winner text,mode text,cpu_level integer,moves jsonb,total_moves integer,
            white_id text,black_id text,time_control text);
        create table public.account_deletion_jobs(user_id text,phase text);
        create table public.account_restrictions(user_id text,blocked boolean);
        create table public.account_terms_consents(user_id text,version text);
        grant usage on schema public to anon,authenticated,service_role;
        grant all on all tables in schema public to service_role;`);
    for (const name of migrations) await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
}
export const snapshotSql = `select public.apply_stripe_canonical_membership_snapshot(
    $1,$2,'invoice.paid',$3,clock_timestamp(),$4,$5,'cus_'||$6,$6,'price_ABCDEFGH',
    $7,$8,false,$9,false,$10) as result`;
