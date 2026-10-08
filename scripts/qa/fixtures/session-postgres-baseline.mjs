import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// Public SQL only: no hosted capture, private dump, credentials, real account
// rows, or substituted password/crypt function. Minimal relations are explicit.
export const historicalSessionMigrations = [
    '20260918072145_ranked_server_settlement.sql',
    '20260924140124_self_service_account_deletion.sql',
    '20260924140234_verified_account_recovery.sql',
    '20260924145512_account_deletion_service_privileges.sql',
    '20260924150213_legacy_password_attempt_budget.sql',
    '20260924160910_account_security_controls.sql',
];
export const durableSessionMigration = '20261006142305_dormant_durable_legacy_sessions.sql';
// Kept explicit and checked against the existing PUBLIC commerce fixture.
// Do not import that native fixture here: it delegates to this combined helper.
export const commerceHistoricalDependencies = [
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
export const commercePendingMigrations = [
    '20261004040000_monetization_update.sql',
    '20261004050000_hint_tickets_store.sql',
    '20261006000000_pricing_v2.sql',
    '20261006155010_atomic_commerce_fulfillment.sql',
    '20261006171022_dormant_hint_origin_consumption.sql',
    '20261006192347_durable_commerce_checkout_consent.sql',
    '20261007105937_dormant_commerce_source_ledger.sql',
    '20261007124401_commerce_terms_release_20261007.sql',
    '20261007141624_dormant_commerce_checkout_retirement.sql',
];
export const runtimeSessionMigration = '20261006154443_dormant_legacy_session_runtime.sql';
export const sharedAdmissionMigration = '20261006171148_shared_match_admission.sql';
export const crownAdmissionMigration = '20261006172232_dormant_crown_first_attempt.sql';
export const combinedPendingMigrations = [...commercePendingMigrations, durableSessionMigration, runtimeSessionMigration, sharedAdmissionMigration, crownAdmissionMigration].sort();
// PR19's original thirteen-file upgrade remains a historical regression target.
// The current hint-policy proof must also apply these explicit forward files.
export const hintPolicyMigrations = ['20261008054904_match_hint_tickets_and_free_practice.sql'];
export const reviewedMigrationInventory = [...combinedPendingMigrations, ...hintPolicyMigrations].sort();
export const combinedHistoricalMigrations = [...historicalSessionMigrations,
    ...commerceHistoricalDependencies.filter(name => !historicalSessionMigrations.includes(name))];
export const sessionBaselineEvidence = Object.freeze({
    postgresMajor: 17, publicSourceOnly: true, nativePgcrypto: true, hostedProductionEquivalent: false,
    historical: combinedHistoricalMigrations, pending: combinedPendingMigrations,
    migration: durableSessionMigration, combinedCommerceAndAuth: true,
    releaseBaseline: 'PR19 / 93acd813', forwardMigrationsApplied: false,
    limitations: [
        'Minimal public account/Auth/Storage scaffolding is not complete hosted schema or ACL equivalence.',
        'auth.uid reads a synthetic request claim; Auth issuance, JWT validation, OTP and Storage HTTP APIs are not tested.',
        'Synthetic fixtures use real bcrypt cost 4; raw secure registration/reset retain actual costs 10/12.',
        'An explicit dependency upgrade is not an all-files fresh installation or a PostgREST test.',
    ],
});
export async function applySessionFile(client, name) {
    await client.query(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
}
export async function assertReviewedMigrationInventory() {
    const names = (await readdir(new URL('../../../supabase/migrations/', import.meta.url)))
        .filter(name => name.endsWith('.sql') && name >= combinedPendingMigrations[0]).sort();
    assert.deepEqual(names, reviewedMigrationInventory, 'Every new migration needs explicit current-release upgrade coverage');
}
export async function applySessionPending(client) {
    await assertReviewedMigrationInventory();
    for (const name of combinedPendingMigrations) await applySessionFile(client, name);
}
export async function applyHintPolicyRelease(client) {
    await applySessionPending(client);
    for (const name of hintPolicyMigrations) await applySessionFile(client, name);
}
export async function setupSessionBaseline(client, expectedDatabase = 'legacy_session_upgrade') {
    // Only these disposable fixtures are allowed. Never accept a remote client,
    // arbitrary database name, URL, credentials or pre-existing schema.
    assert.ok(['legacy_session_upgrade', 'commerce_upgrade'].includes(expectedDatabase));
    assert.equal(client.connectionParameters.host, '127.0.0.1');
    const identity = (await client.query(`select current_database() as database,current_user as owner,
        current_setting('server_version_num')::integer as version`)).rows[0];
    assert.equal(identity.database, expectedDatabase); assert.equal(identity.owner, 'postgres');
    assert.equal(Math.floor(identity.version / 10000), sessionBaselineEvidence.postgresMajor);
    assert.equal((await client.query(`select count(*)::integer as count from pg_class
        where relnamespace='public'::regnamespace and relkind in ('r','p')`)).rows[0].count, 0,
    'Refusing a database containing pre-existing public tables');
    const publicFixture = await readFile(new URL('../../../server/src/services/fixtures/commerceDatabaseFixture.ts', import.meta.url), 'utf8');
    const list = name => [...publicFixture.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\];`))[1]
        .matchAll(/'([^']+\.sql)'/g)].map(m => m[1]);
    assert.deepEqual(commerceHistoricalDependencies, list('historicalCommerceMigrations'));
    assert.deepEqual(commercePendingMigrations, list('releaseCommerceMigrations'));
    assert.deepEqual(commerceHistoricalDependencies.filter(name => historicalSessionMigrations.includes(name)),
        ['20260918072145_ranked_server_settlement.sql']);
    await client.query(`
        do $$ begin
            if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
            if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
            if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
        end $$;
        create schema extensions; create extension pgcrypto with schema extensions;
        create schema auth; create schema storage;
        -- Synthetic relation/claim scaffolding, NOT provider validation.
        create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,
            deleted_at timestamptz,is_anonymous boolean default false);
        create table auth.identities(id uuid primary key default gen_random_uuid(),user_id uuid,provider text);
        create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
        create function auth.uid() returns uuid language sql stable set search_path='' as
            $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        create table storage.objects(bucket_id text,name text,owner_id text,owner uuid);
        create table public.profiles(id text primary key,name text,email text,password_hash text,
            rating integer default 1000,rating_10s integer default 1000,
            rating_3m integer default 1000,rating_10m integer default 1000);
        create table public.game_records(id uuid primary key,created_at timestamptz default now(),
            white_player text,black_player text,winner text,mode text,cpu_level integer,moves jsonb,
            total_moves integer,white_id text,black_id text,time_control text,replay_expired boolean default false);
        create table public.friends(user_id text,friend_id text);
        create table public.active_matches(white_id text,black_id text);
        create table public.system_status(id text primary key);
        grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;
        grant all on all tables in schema public to service_role;
        grant select on storage.objects to service_role;
        grant insert, select on public.profiles to authenticated;
        alter table public.profiles enable row level security;
        create policy synthetic_profile_insert on public.profiles for insert to authenticated
            with check (id = auth.uid()::text);
        create policy synthetic_profile_select on public.profiles for select to authenticated
            using (id = auth.uid()::text);
    `);
    for (const name of combinedHistoricalMigrations) await applySessionFile(client, name);
    return identity.version;
}
