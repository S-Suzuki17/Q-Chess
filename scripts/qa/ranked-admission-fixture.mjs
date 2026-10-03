// Disposable fixture only. Neither credentials nor a remote URL are accepted.
import { readFile } from 'node:fs/promises';
export const rankedMigrations = [
    '20260918072145_ranked_server_settlement.sql',
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
export async function setupRankedFixture(db) {
    await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create table public.profiles(id text primary key,name text,password_hash text,
            rating integer default 1000,rating_10s integer default 1000,rating_3m integer default 1000,rating_10m integer default 1000);
        create table public.game_records(id uuid primary key,created_at timestamptz default now(),
            white_player text,black_player text,winner text,mode text,cpu_level integer,moves jsonb,total_moves integer,
            white_id text,black_id text,time_control text);
        create table public.account_deletion_jobs(user_id text primary key,phase text);
        create table public.account_restrictions(user_id text,blocked boolean);
        create table public.account_terms_consents(user_id text,version text);
        grant usage on schema public to anon,authenticated,service_role;
        grant all on all tables in schema public to service_role;
    `);
    for (const name of rankedMigrations) {
        try { await db.exec(await readFile(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8')); }
        catch (error) { throw new Error(name + ': ' + error.message); }
    }
    await db.exec(`
        insert into public.profiles(id,name) select x,x from unnest(array['Alice','Bob','Carol','Dan','Paid','Paused']) x;
        insert into public.account_terms_consents select id,'2026-09-25.1' from public.profiles;
        insert into public.ticket_wallets(user_id,ranked_tickets) select id,4 from public.profiles;
    `);
}
export const admissionSql = 'select public.admit_ranked_match($1::uuid,$2,$3,$4,$5::uuid,$6,$7,$8) as result';
export const settlementSql = 'select public.settle_ranked_match($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::uuid) as result';
