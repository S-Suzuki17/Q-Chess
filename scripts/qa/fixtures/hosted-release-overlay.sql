-- LOCALHOST SYNTHETIC FIXTURE ONLY. NOT A PRODUCTION MIGRATION.
-- Apply after setupSessionBaseline(), before synthetic rows/pending SQL.
-- Caller must first SET qg_fixture.allow_hosted_overlay='localhost_synthetic_only'.
-- Driver must assert its configured host is 127.0.0.1 and reject arbitrary URLs.
-- Docker-published loopback only: additionally SET qg_fixture.allow_container_transport='driver_loopback_verified'.
-- Container exception requires BOTH server/client IPs in RFC1918 ranges; it is not a production permission.
-- No customer rows, credentials, hosted Auth/private schema dump, cron or Vault.
-- Public-source function bodies + catalog metadata assertions only.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $guard$
begin
 if current_user<>'postgres'
  or current_database() not in ('commerce_upgrade','legacy_session_upgrade')
  or (
   (inet_server_addr() in ('127.0.0.1'::inet,'::1'::inet) and inet_client_addr() in ('127.0.0.1'::inet,'::1'::inet))
   or (current_setting('qg_fixture.allow_container_transport',true)='driver_loopback_verified'
    and (inet_server_addr()<<=inet '10.0.0.0/8' or inet_server_addr()<<=inet '172.16.0.0/12' or inet_server_addr()<<=inet '192.168.0.0/16')
    and (inet_client_addr()<<=inet '10.0.0.0/8' or inet_client_addr()<<=inet '172.16.0.0/12' or inet_client_addr()<<=inet '192.168.0.0/16'))
  ) is not true
  or current_setting('qg_fixture.allow_hosted_overlay',true) is distinct from 'localhost_synthetic_only'
  or current_setting('server_version_num')::integer/10000<>17 then
  raise exception 'LOCAL_SYNTHETIC_OVERLAY_GUARD' using errcode='42501';
 end if;
 if to_regclass('public.stripe_commerce_catalog') is not null or to_regclass('qg_fixture.expected_functions') is not null then
  raise exception 'Overlay requires a fresh pre-pending fixture' using errcode='55000';
 end if;
 if to_regclass('public.profiles') is null or to_regclass('public.ticket_wallets') is null
  or exists(select 1 from public.profiles) then
  raise exception 'Overlay requires empty synthetic public baseline' using errcode='55000';
 end if;
end $guard$;

-- Real hosted postgres: NOSUPERUSER, BYPASSRLS. Local bootstrap stays superuser
-- to create the disposable roles. Exercise application SQL using SET ROLE.
do $roles$
begin
 if not exists(select 1 from pg_roles where rolname='authenticator') then
  create role authenticator login noinherit nosuperuser nobypassrls;
 end if;
end $roles$;
alter role anon nologin inherit nosuperuser nobypassrls;
alter role authenticated nologin inherit nosuperuser nobypassrls;
alter role service_role nologin inherit nosuperuser bypassrls;
alter role authenticator login noinherit nosuperuser nobypassrls;
grant anon,authenticated,service_role to authenticator;
grant usage on schema public to public,postgres,anon,authenticated,service_role;
revoke create on schema public from public,anon,authenticated,service_role;
revoke all on schema qg_private from public,anon,authenticated,service_role;
grant usage on schema qg_private to service_role;
grant usage on schema extensions to postgres,anon,authenticated,service_role;
-- Only postgres-owned PUBLIC objects are created by the selected raw chain.
-- Hosted also has defaults for supabase_admin; that unused owner is not cloned.
alter default privileges for role postgres in schema public
 grant all privileges on tables to anon,authenticated,service_role;
alter default privileges for role postgres in schema public
 grant execute on functions to anon,authenticated,service_role;
alter default privileges for role postgres in schema public
 grant all privileges on sequences to anon,authenticated,service_role;

-- Minimal observed profile columns absent from the existing public fixture.
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists avatar_url text;
-- Body copied from PUBLIC 20260918085709_protect_profile_avatar_writes.sql.
create or replace function public.guard_profile_avatar_writes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if current_user in ('service_role','postgres') then return new; end if;
    if (tg_op = 'INSERT' and new.avatar_url is not null)
        or (tg_op = 'UPDATE' and new.avatar_url is distinct from old.avatar_url) then
        raise exception 'Avatar changes require the authenticated profile service' using errcode = '42501';
    end if;
    return new;
end;
$$;
alter function public.guard_profile_avatar_writes() owner to postgres;
drop trigger if exists guard_profile_avatar_writes on public.profiles;
create trigger guard_profile_avatar_writes before insert or update of avatar_url
 on public.profiles for each row execute function public.guard_profile_avatar_writes();

-- The only observed policy among these eight relations is this profile policy.
drop policy if exists synthetic_profile_insert on public.profiles;
drop policy if exists synthetic_profile_select on public.profiles;
drop policy if exists "Anyone can manage profiles" on public.profiles;
create policy "Anyone can manage profiles" on public.profiles for all to public using(true) with check(true);
alter table public.profiles enable row level security;
alter table public.profiles no force row level security;
revoke all on table public.profiles from public,anon,authenticated,service_role;
grant all privileges on table public.profiles to service_role;
grant insert,update,references,maintain on public.profiles to anon,authenticated;
grant select(id,name,rating,created_at,rating_10s,rating_3m,rating_10m,avatar_url)
 on public.profiles to anon,authenticated;
-- Column ACLs are additional to the service_role table grant.
grant select(id,name),select(rating,rating_10s,rating_3m,rating_10m,avatar_url),
 update(rating,rating_10s,rating_3m,rating_10m,avatar_url) on public.profiles to service_role;

revoke all on table public.ticket_wallets,public.stripe_checkout_intents,public.stripe_memberships,
 public.cpu_hint_receipts,public.cpu_hint_restorations,public.ranked_match_admissions,
 public.account_deletion_jobs from public,anon,authenticated,service_role;
grant select,insert,update on public.ticket_wallets,public.stripe_checkout_intents,
 public.stripe_memberships,public.ranked_match_admissions to service_role;
grant select,insert on public.cpu_hint_receipts,public.cpu_hint_restorations to service_role;
grant select,insert,update,delete on public.account_deletion_jobs to service_role;
alter table public.ticket_wallets enable row level security;
alter table public.stripe_checkout_intents enable row level security;
alter table public.stripe_memberships enable row level security;
alter table public.cpu_hint_receipts enable row level security;
alter table public.cpu_hint_restorations enable row level security;
alter table public.ranked_match_admissions enable row level security;
alter table public.account_deletion_jobs enable row level security;
alter table public.account_deletion_jobs force row level security;
revoke all on function public.account_session_active(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.account_session_active(uuid,uuid) to service_role;
revoke all on function public.apply_stripe_canonical_membership_snapshot(text,text,text,bigint,timestamp with time zone,text,text,text,text,text,text,timestamp with time zone,boolean,boolean,boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function public.apply_stripe_canonical_membership_snapshot(text,text,text,bigint,timestamp with time zone,text,text,text,text,text,text,timestamp with time zone,boolean,boolean,boolean,uuid) to service_role;
revoke all on function public.apply_stripe_membership_reversal(text,text,text,text,text,text,text,text,text,timestamp with time zone,boolean) from public,anon,authenticated,service_role;
grant execute on function public.apply_stripe_membership_reversal(text,text,text,text,text,text,text,text,text,timestamp with time zone,boolean) to service_role;
revoke all on function public.buy_cpu_hint(uuid,text,uuid,integer,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.buy_cpu_hint(uuid,text,uuid,integer,text,jsonb,jsonb) to service_role;
revoke all on function public.claim_daily_login_reward(text) from public,anon,authenticated,service_role;
grant execute on function public.claim_daily_login_reward(text) to service_role;
revoke all on function public.claim_stripe_live_member_daily_grant(text) from public,anon,authenticated,service_role;
grant execute on function public.claim_stripe_live_member_daily_grant(text) to service_role;
revoke all on function public.claim_stripe_member_daily_grant(text) from public,anon,authenticated,service_role;
grant execute on function public.claim_stripe_member_daily_grant(text) to service_role;
revoke all on function public.daily_login_reward_status(text) from public,anon,authenticated,service_role;
grant execute on function public.daily_login_reward_status(text) to service_role;
revoke all on function public.register_stripe_checkout_intent(text,text,text,boolean,timestamp with time zone) from public,anon,authenticated,service_role;
grant execute on function public.register_stripe_checkout_intent(text,text,text,boolean,timestamp with time zone) to service_role;
revoke all on function public.restore_cpu_hint_credit(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.restore_cpu_hint_credit(uuid,text,text) to service_role;
revoke all on function public.settle_ranked_match(uuid,text,text,text,integer,text,integer,integer,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.settle_ranked_match(uuid,text,text,text,integer,text,integer,integer,jsonb,uuid) to service_role;
revoke all on function public.apply_stripe_canonical_membership_reversal(text,text,text,text,text,text,text,text,text,timestamp with time zone,boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function public.apply_stripe_canonical_membership_reversal(text,text,text,text,text,text,text,text,text,timestamp with time zone,boolean,uuid) to service_role;
revoke all on function public.apply_stripe_live_membership_reversal(text,text,text,text,text,text,text,text,text,timestamp with time zone) from public,anon,authenticated,service_role;
grant execute on function public.apply_stripe_live_membership_reversal(text,text,text,text,text,text,text,text,text,timestamp with time zone) to service_role;
revoke all on function public.erase_account_data(text) from public,anon,authenticated,service_role;
grant execute on function public.erase_account_data(text) to service_role;
revoke all on function public.recover_expired_ranked_admissions(integer) from public,anon,authenticated,service_role;
grant execute on function public.recover_expired_ranked_admissions(integer) to service_role;
revoke all on function public.register_stripe_live_checkout_intent(text,text,text,timestamp with time zone) from public,anon,authenticated,service_role;
grant execute on function public.register_stripe_live_checkout_intent(text,text,text,timestamp with time zone) to service_role;
revoke all on function public.retire_stripe_account_subscriptions(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.retire_stripe_account_subscriptions(text,jsonb) to service_role;
revoke all on function public.spend_game_tickets(text,uuid,text[]) from public,anon,authenticated,service_role;
grant execute on function public.spend_game_tickets(text,uuid,text[]) to service_role;
revoke all on function public.stripe_live_checkout_preflight(text) from public,anon,authenticated,service_role;
grant execute on function public.stripe_live_checkout_preflight(text) to service_role;
revoke all on function public.stripe_live_member_status(text) from public,anon,authenticated,service_role;
grant execute on function public.stripe_live_member_status(text) to service_role;
revoke all on function public.stripe_member_status(text) from public,anon,authenticated,service_role;
grant execute on function public.stripe_member_status(text) to service_role;
revoke all on function public.void_ranked_admission(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.void_ranked_admission(uuid,uuid,text) to service_role;
revoke all on function public.expire_stripe_member_tickets_on_projection() from public,anon,authenticated,service_role;
grant execute on function public.expire_stripe_member_tickets_on_projection() to service_role;
revoke all on function public.guard_ranked_account_deletion() from public,anon,authenticated,service_role;
grant execute on function public.guard_ranked_account_deletion() to service_role;
revoke all on function public.pin_stripe_live_billing_mode() from public,anon,authenticated,service_role;
grant execute on function public.pin_stripe_live_billing_mode() to service_role;
revoke all on function qg_private.capture_recovery_deletion() from public,anon,authenticated,service_role;
-- Trigger-only ACL: postgres owner only.
revoke all on function qg_private.erase_password_attempt_budget() from public,anon,authenticated,service_role;
-- Trigger-only ACL: postgres owner only.
revoke all on function qg_private.guard_account_deletion_writes() from public,anon,authenticated,service_role;
-- Trigger-only ACL: postgres owner only.
revoke all on function public.guard_profile_avatar_writes() from public,anon,authenticated,service_role;
grant execute on function public.guard_profile_avatar_writes() to service_role;
revoke all on function public.guard_ranked_profile_ratings() from public,anon,authenticated,service_role;
grant execute on function public.guard_ranked_profile_ratings() to service_role;

create schema qg_fixture;
revoke all on schema qg_fixture from public,anon,authenticated,service_role,authenticator;
create table qg_fixture.expected_functions(signature text primary key,body_md5 text not null,
 security_definer boolean not null,search_path text not null,service_execute boolean not null,unchanged_after boolean not null);
insert into qg_fixture.expected_functions values
('public.account_session_active(uuid,uuid)','e2ea2c4ba5a7cc26646739d37f2fc564',false,'search_path=pg_catalog',true,true),
('public.apply_stripe_canonical_membership_snapshot(text,text,text,bigint,timestamp with time zone,text,text,text,text,text,text,timestamp with time zone,boolean,boolean,boolean,uuid)','b8899fce86542fe890f5f2864bef4f67',false,'search_path=""',true,false),
('public.apply_stripe_membership_reversal(text,text,text,text,text,text,text,text,text,timestamp with time zone,boolean)','aefbf4f38e12d292c372d6cce4baf1eb',false,'search_path=""',true,true),
('public.buy_cpu_hint(uuid,text,uuid,integer,text,jsonb,jsonb)','f92c5905ca0818a196c85e3f2503110d',false,'search_path=""',true,true),
('public.claim_daily_login_reward(text)','a78b880ae97881ee6a04134544121ca3',false,'search_path=""',true,false),
('public.claim_stripe_live_member_daily_grant(text)','ea3ee8abdf9581ddc081db51b7a5fae0',false,'search_path=""',true,false),
('public.claim_stripe_member_daily_grant(text)','bc9bb002c61afc56c3f90b67ac0b9ee5',false,'search_path=""',true,false),
('public.daily_login_reward_status(text)','b8fd38bf4054ca485a07607d657022ed',false,'search_path=""',true,false),
('public.register_stripe_checkout_intent(text,text,text,boolean,timestamp with time zone)','10085cdcf3f4dc33e23c2ba0acf80f87',false,'search_path=""',true,true),
('public.restore_cpu_hint_credit(uuid,text,text)','594abc8c85c556307dd39ad19aef5d23',false,'search_path=""',true,false),
('public.settle_ranked_match(uuid,text,text,text,integer,text,integer,integer,jsonb,uuid)','13b8635c6551e1629bfbb18be13794ac',false,'search_path=""',true,true),
('public.apply_stripe_canonical_membership_reversal(text,text,text,text,text,text,text,text,text,timestamp with time zone,boolean,uuid)','986593e2ffc9f7d8029f78621ba0196d',false,'search_path=""',true,true),
('public.apply_stripe_live_membership_reversal(text,text,text,text,text,text,text,text,text,timestamp with time zone)','2b78e679496dc1e291ddfc8f087d9e33',false,'search_path=""',true,true),
('public.erase_account_data(text)','23b30342754e42a42bbb50f4bf6c0e97',false,'search_path=""',true,false),
('public.recover_expired_ranked_admissions(integer)','1c53ae49e63e1ea4f8e26a63f89f9e8f',false,'search_path=""',true,true),
('public.register_stripe_live_checkout_intent(text,text,text,timestamp with time zone)','c14968c3b38bbc415a632b7bf26f7e16',false,'search_path=""',true,true),
('public.retire_stripe_account_subscriptions(text,jsonb)','1746342ed3d6a9c7528919edf3f97734',false,'search_path=""',true,true),
('public.spend_game_tickets(text,uuid,text[])','53c1f1448c708ae6abafffd332456542',false,'search_path=""',true,true),
('public.stripe_live_checkout_preflight(text)','613e5cc6f8c6436ad7200655bd6881fb',false,'search_path=""',true,true),
('public.stripe_live_member_status(text)','ce27009862d59784d8a44ae2bb9e32f7',false,'search_path=""',true,true),
('public.stripe_member_status(text)','d8db53e5b8accf0edfbee38cc4e69069',false,'search_path=""',true,false),
('public.void_ranked_admission(uuid,uuid,text)','e237aa4bdfed31b7d1d0d5d2ccd14f36',false,'search_path=""',true,true),
('public.expire_stripe_member_tickets_on_projection()','ad029d58c124b24f0afcfcc2d6f18d2d',false,'search_path=""',true,true),
('public.guard_ranked_account_deletion()','2ffe5d741cc56a6e833bdbc1226ecaa8',false,'search_path=""',true,true),
('public.pin_stripe_live_billing_mode()','853585c89663406c047d9e9a63fb6c2f',false,'search_path=""',true,true),
('qg_private.capture_recovery_deletion()','b3c85da0990ddf5d01a0e3afaaf69b50',false,'search_path=""',false,true),
('qg_private.erase_password_attempt_budget()','a58f2017cebcac06c318c4831b3e3594',true,'search_path=""',false,true),
('qg_private.guard_account_deletion_writes()','c6a0ae7ca5b614f1d66ef82997038ac9',true,'search_path=""',false,true),
('public.guard_profile_avatar_writes()','a4428ed1df1e88e4ee48d7e9d5810aca',false,'search_path=""',true,true),
('public.guard_ranked_profile_ratings()','f4f440fc2f80b18d46857436a05970c3',false,'search_path=""',true,true);
create table qg_fixture.expected_constraints(table_name text not null,name text not null,definition text not null,
 unchanged_after boolean not null,primary key(table_name,name));
insert into qg_fixture.expected_constraints values
('public.cpu_hint_receipts','cpu_hint_receipts_delivery_state_check','CHECK ((delivery_state = ''paid_retrievable''::text))',true),
('public.cpu_hint_receipts','cpu_hint_receipts_pkey','PRIMARY KEY (request_id)',true),
('public.cpu_hint_receipts','cpu_hint_receipts_pool_check','CHECK ((pool = ANY (ARRAY[''free''::text, ''paid''::text])))',true),
('public.cpu_hint_receipts','cpu_hint_receipts_session_id_fkey','FOREIGN KEY (session_id) REFERENCES cpu_practice_sessions(session_id) ON DELETE CASCADE',true),
('public.cpu_hint_receipts','cpu_hint_receipts_session_id_revision_key','UNIQUE (session_id, revision)',true),
('public.cpu_hint_receipts','cpu_hint_receipts_user_id_fkey','FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE',true),
('public.stripe_checkout_intents','stripe_checkout_intents_environment_check','CHECK ((((NOT livemode) AND (checkout_id ~ ''^cs_test_[A-Za-z0-9]+$''::text)) OR (livemode AND (checkout_id ~ ''^cs_live_[A-Za-z0-9]+$''::text) AND (price_id = ''price_1ULM9fQWzwYDIuXWgs5Uj3yt''::text))))',false),
('public.stripe_checkout_intents','stripe_checkout_intents_pkey','PRIMARY KEY (checkout_id)',true),
('public.stripe_checkout_intents','stripe_checkout_intents_price_id_check','CHECK ((price_id ~ ''^price_[A-Za-z0-9]+$''::text))',true),
('public.stripe_checkout_intents','stripe_checkout_intents_user_id_fkey','FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE',true),
('public.stripe_memberships','stripe_memberships_check','CHECK (((status <> ''active''::text) OR (period_end IS NOT NULL)))',true),
('public.stripe_memberships','stripe_memberships_checkout_id_fkey','FOREIGN KEY (checkout_id) REFERENCES stripe_checkout_intents(checkout_id) ON DELETE CASCADE',true),
('public.stripe_memberships','stripe_memberships_checkout_id_key','UNIQUE (checkout_id)',true),
('public.stripe_memberships','stripe_memberships_current_price_id_check','CHECK ((current_price_id ~ ''^price_[A-Za-z0-9]+$''::text))',true),
('public.stripe_memberships','stripe_memberships_customer_id_fkey','FOREIGN KEY (customer_id) REFERENCES stripe_customer_links(customer_id) ON DELETE CASCADE',true),
('public.stripe_memberships','stripe_memberships_event_created_check','CHECK ((event_created > 0))',true),
('public.stripe_memberships','stripe_memberships_pkey','PRIMARY KEY (subscription_id)',true),
('public.stripe_memberships','stripe_memberships_status_check','CHECK ((status = ANY (ARRAY[''incomplete''::text, ''incomplete_expired''::text, ''trialing''::text, ''active''::text, ''past_due''::text, ''canceled''::text, ''unpaid''::text, ''paused''::text, ''refunded''::text])))',true),
('public.stripe_memberships','stripe_memberships_subscription_id_check','CHECK ((subscription_id ~ ''^sub_[A-Za-z0-9]+$''::text))',true),
('public.stripe_memberships','stripe_memberships_user_id_fkey','FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE',true),
('public.ticket_wallets','live_paid_tickets_bound_check','CHECK ((((member_ranked_tickets = 0) AND (member_hint_tickets = 0)) OR (member_ticket_subscription_id IS NOT NULL)))',true),
('public.ticket_wallets','test_member_tickets_bound_check','CHECK ((((test_member_ranked_tickets = 0) AND (test_member_hint_tickets = 0)) OR (test_member_ticket_subscription_id IS NOT NULL)))',true),
('public.ticket_wallets','ticket_wallets_claim_state_check','CHECK ((((last_claim_utc_day IS NULL) AND (streak_days = 0)) OR ((last_claim_utc_day IS NOT NULL) AND ((streak_days >= 1) AND (streak_days <= 7)))))',true),
('public.ticket_wallets','ticket_wallets_hint_tickets_check','CHECK (((hint_tickets >= 0) AND (hint_tickets <= 20)))',false),
('public.ticket_wallets','ticket_wallets_member_hint_tickets_check','CHECK (((member_hint_tickets >= 0) AND (member_hint_tickets <= 60)))',false),
('public.ticket_wallets','ticket_wallets_member_ranked_tickets_check','CHECK (((member_ranked_tickets >= 0) AND (member_ranked_tickets <= 60)))',false),
('public.ticket_wallets','ticket_wallets_member_ticket_subscription_id_check','CHECK (((member_ticket_subscription_id IS NULL) OR (member_ticket_subscription_id ~ ''^sub_[A-Za-z0-9]+$''::text)))',true),
('public.ticket_wallets','ticket_wallets_pkey','PRIMARY KEY (user_id)',true),
('public.ticket_wallets','ticket_wallets_ranked_tickets_check','CHECK (((ranked_tickets >= 0) AND (ranked_tickets <= 20)))',false),
('public.ticket_wallets','ticket_wallets_streak_days_check','CHECK (((streak_days >= 0) AND (streak_days <= 7)))',true),
('public.ticket_wallets','ticket_wallets_test_member_hint_tickets_check','CHECK (((test_member_hint_tickets >= 0) AND (test_member_hint_tickets <= 60)))',false),
('public.ticket_wallets','ticket_wallets_test_member_ranked_tickets_check','CHECK (((test_member_ranked_tickets >= 0) AND (test_member_ranked_tickets <= 60)))',false),
('public.ticket_wallets','ticket_wallets_test_member_ticket_subscription_id_check','CHECK (((test_member_ticket_subscription_id IS NULL) OR (test_member_ticket_subscription_id ~ ''^sub_[A-Za-z0-9]+$''::text)))',true),
('public.ticket_wallets','ticket_wallets_user_id_fkey','FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE',true);
create table qg_fixture.expected_triggers(table_name text not null,name text not null,definition text not null,
 primary key(table_name,name));
insert into qg_fixture.expected_triggers values
('public.account_deletion_jobs','capture_recovery_deletion','CREATE TRIGGER capture_recovery_deletion BEFORE INSERT ON public.account_deletion_jobs FOR EACH ROW EXECUTE FUNCTION qg_private.capture_recovery_deletion()'),
('public.account_deletion_jobs','guard_ranked_deletion_job','CREATE TRIGGER guard_ranked_deletion_job BEFORE INSERT OR UPDATE ON public.account_deletion_jobs FOR EACH ROW EXECUTE FUNCTION guard_ranked_account_deletion()'),
('public.profiles','erase_password_attempt_budget','CREATE TRIGGER erase_password_attempt_budget AFTER DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION qg_private.erase_password_attempt_budget()'),
('public.profiles','guard_account_deletion','CREATE TRIGGER guard_account_deletion BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION qg_private.guard_account_deletion_writes()'),
('public.profiles','guard_profile_avatar_writes','CREATE TRIGGER guard_profile_avatar_writes BEFORE INSERT OR UPDATE OF avatar_url ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_avatar_writes()'),
('public.profiles','guard_ranked_profile_deletion','CREATE TRIGGER guard_ranked_profile_deletion BEFORE DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_ranked_account_deletion()'),
('public.profiles','guard_ranked_profile_ratings','CREATE TRIGGER guard_ranked_profile_ratings BEFORE INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_ranked_profile_ratings()'),
('public.stripe_checkout_intents','stripe_pin_live_mode','CREATE TRIGGER stripe_pin_live_mode AFTER INSERT ON public.stripe_checkout_intents FOR EACH ROW EXECUTE FUNCTION pin_stripe_live_billing_mode()'),
('public.stripe_memberships','stripe_member_ticket_expiry','CREATE TRIGGER stripe_member_ticket_expiry AFTER INSERT OR UPDATE OF status, refund_blocked_until, current_price_id ON public.stripe_memberships FOR EACH ROW EXECUTE FUNCTION expire_stripe_member_tickets_on_projection()');

-- Snapshot all pre-pending public/private objects; helper schema is excluded.
create table qg_fixture.original_tables as select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','qg_private') and c.relkind in ('r','p');
create table qg_fixture.original_functions as select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','qg_private');

create function qg_fixture.assert_stage(p_after boolean) returns jsonb
language plpgsql security invoker set search_path='' as $assert$
declare e record; p record; c record; actual text; field_name text; role_name text; privilege_name text; object_count integer;
begin
 if current_user<>'postgres' or current_database() not in ('commerce_upgrade','legacy_session_upgrade')
   or (
    (inet_server_addr() in ('127.0.0.1'::inet,'::1'::inet) and inet_client_addr() in ('127.0.0.1'::inet,'::1'::inet))
    or (current_setting('qg_fixture.allow_container_transport',true)='driver_loopback_verified'
     and (inet_server_addr()<<=inet '10.0.0.0/8' or inet_server_addr()<<=inet '172.16.0.0/12' or inet_server_addr()<<=inet '192.168.0.0/16')
     and (inet_client_addr()<<=inet '10.0.0.0/8' or inet_client_addr()<<=inet '172.16.0.0/12' or inet_client_addr()<<=inet '192.168.0.0/16'))
   ) is not true
  or current_setting('qg_fixture.allow_hosted_overlay',true) is distinct from 'localhost_synthetic_only' then
  raise exception 'LOCAL_SYNTHETIC_ASSERT_GUARD' using errcode='42501'; end if;
 for e in select * from qg_fixture.expected_functions loop
  select * into p from pg_proc where oid=to_regprocedure(e.signature);
  if not found then raise exception 'Missing expected RPC: %',e.signature; end if;
  actual:=md5(regexp_replace(regexp_replace(p.prosrc,E'--[^\\n\\r]*','','g'),'[[:space:]]+','','g'));
  if (not p_after or e.unchanged_after) and actual<>e.body_md5 then
   raise exception 'Public-source body mismatch: %',e.signature; end if;
   if pg_get_userbyid(p.proowner)<>'postgres' or p.prosecdef<>e.security_definer or not(e.search_path=any(coalesce(p.proconfig,array[]::text[]))) then
   raise exception 'Function authority/search_path mismatch: %',e.signature; end if;
  if has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE')
   or has_function_privilege('service_role',p.oid,'EXECUTE')<>e.service_execute then
   raise exception 'Observed function ACL mismatch: %',e.signature; end if;
 end loop;
 for e in select * from qg_fixture.expected_constraints where not p_after or unchanged_after loop
  select * into c from pg_constraint where conrelid=to_regclass(e.table_name) and conname=e.name;
  if not found or not c.convalidated then raise exception 'Missing/unvalidated constraint: %.%',e.table_name,e.name; end if;
  actual:=regexp_replace(replace(pg_get_constraintdef(c.oid),'public.',''),'[[:space:]]+','','g');
  if actual<>regexp_replace(replace(e.definition,'public.',''),'[[:space:]]+','','g') then
   raise exception 'Constraint mismatch: %.% (%)',e.table_name,e.name,pg_get_constraintdef(c.oid); end if;
 end loop;
 for e in select * from qg_fixture.expected_triggers loop
  select t.oid,t.tgenabled into c from pg_trigger t where t.tgrelid=to_regclass(e.table_name) and t.tgname=e.name;
  if not found or c.tgenabled<>'O' then raise exception 'Missing/disabled existing trigger: %.%',e.table_name,e.name; end if;
  actual:=regexp_replace(replace(pg_get_triggerdef(c.oid),'public.',''),'[[:space:]]+','','g');
  if actual<>regexp_replace(replace(e.definition,'public.',''),'[[:space:]]+','','g') then
   raise exception 'Existing trigger definition mismatch: %.%',e.table_name,e.name; end if;
 end loop;
 foreach field_name in array array['ranked_tickets','hint_tickets','member_ranked_tickets',
  'member_hint_tickets','test_member_ranked_tickets','test_member_hint_tickets'] loop
  select * into c from pg_attribute where attrelid='public.ticket_wallets'::regclass and attname=field_name;
   if not found or not c.attnotnull or c.atttypid<>(case when p_after then 'bigint'::regtype else 'smallint'::regtype end) then
   raise exception 'Wallet column type/nullability mismatch: %',field_name; end if;
   if p_after then
    select pg_get_constraintdef(oid) into actual from pg_constraint where conrelid='public.ticket_wallets'::regclass
     and conname='ticket_wallets_'||field_name||'_check' and convalidated;
    if not found or regexp_replace(actual,'[[:space:]]+','','g') <>
     'CHECK((('||field_name||'>=0)AND('||field_name||'<=''9007199254740991''::bigint)))' then
     raise exception 'Wallet arithmetic bound mismatch: % (%)',field_name,actual; end if;
   end if;
 end loop;
  if not exists(select 1 from pg_roles where rolname='service_role' and rolinherit and rolbypassrls and not rolsuper and not rolcanlogin)
  or exists(select 1 from pg_roles where rolname in ('anon','authenticated','authenticator') and (rolsuper or rolbypassrls))
  or not exists(select 1 from pg_roles where rolname='authenticator' and not rolinherit and rolcanlogin)
  or not exists(select 1 from pg_roles where rolname='postgres' and rolbypassrls) then
  raise exception 'Role/BYPASSRLS mismatch'; end if;
 if has_schema_privilege('anon','qg_private','USAGE') or has_schema_privilege('authenticated','qg_private','USAGE')
  or not has_schema_privilege('service_role','qg_private','USAGE') then raise exception 'Private schema ACL mismatch'; end if;
  foreach role_name in array array['anon','authenticated'] loop
   if not exists(select 1 from pg_roles where rolname=role_name and rolinherit and not rolcanlogin)
    or not pg_has_role('authenticator',role_name,'SET') then raise exception 'Role flags/membership mismatch: %',role_name; end if;
  if has_table_privilege(role_name,'public.profiles','SELECT')
    or has_table_privilege(role_name,'public.profiles','DELETE,TRUNCATE,TRIGGER')
    or has_column_privilege(role_name,'public.profiles','email','SELECT')
   or has_column_privilege(role_name,'public.profiles','password_hash','SELECT')
    then
   raise exception 'Profile table/column ACL mismatch for %',role_name; end if;
   foreach privilege_name in array array['INSERT','UPDATE','REFERENCES','MAINTAIN'] loop
    if not has_table_privilege(role_name,'public.profiles',privilege_name) then
     raise exception 'Profile privilege absent: % %',role_name,privilege_name; end if;
   end loop;
   foreach field_name in array array['id','name','rating','created_at','rating_10s','rating_3m','rating_10m','avatar_url'] loop
    if not has_column_privilege(role_name,'public.profiles',field_name,'SELECT') then
     raise exception 'Public profile column grant absent: % %',role_name,field_name; end if;
   end loop;
  for c in select oid from qg_fixture.original_tables where oid in
   ('public.ticket_wallets'::regclass,'public.stripe_checkout_intents'::regclass,'public.stripe_memberships'::regclass,
    'public.cpu_hint_receipts'::regclass,'public.cpu_hint_restorations'::regclass,
    'public.ranked_match_admissions'::regclass,'public.account_deletion_jobs'::regclass) loop
   if has_table_privilege(role_name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') then
    raise exception 'Protected baseline table exposed to %: %',role_name,c.oid::regclass; end if;
  end loop;
  if not pg_has_role('authenticator','service_role','SET') then raise exception 'Service membership absent'; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if not has_schema_privilege(role_name,'public','USAGE') or has_schema_privilege(role_name,'public','CREATE')
    or not has_schema_privilege(role_name,'extensions','USAGE') or has_schema_privilege(role_name,'qg_fixture','USAGE') then
    raise exception 'Schema boundary mismatch: %',role_name; end if;
   for e in select * from (values ('r','SELECT'),('r','INSERT'),('r','UPDATE'),('r','DELETE'),
    ('r','TRUNCATE'),('r','REFERENCES'),('r','TRIGGER'),('r','MAINTAIN'),('f','EXECUTE'),
    ('S','SELECT'),('S','UPDATE'),('S','USAGE')) as v(kind,privilege) loop
    if not exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
     where d.defaclrole='postgres'::regrole and d.defaclnamespace='public'::regnamespace
      and d.defaclobjtype::text=e.kind and a.grantee=role_name::regrole and a.privilege_type=e.privilege) then
     raise exception 'Hosted default grant absent: % % %',role_name,e.kind,e.privilege; end if;
   end loop;
  end loop;
  for e in select * from (values
   ('public.profiles','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN',false),
   ('public.ticket_wallets','SELECT,INSERT,UPDATE',false),('public.stripe_checkout_intents','SELECT,INSERT,UPDATE',false),
   ('public.stripe_memberships','SELECT,INSERT,UPDATE',false),('public.ranked_match_admissions','SELECT,INSERT,UPDATE',false),
   ('public.cpu_hint_receipts','SELECT,INSERT',false),('public.cpu_hint_restorations','SELECT,INSERT',false),
   ('public.account_deletion_jobs','SELECT,INSERT,UPDATE,DELETE',true)) as v(table_name,privileges,force_rls) loop
   select * into c from pg_class where oid=to_regclass(e.table_name);
   if not found or not c.relrowsecurity or c.relforcerowsecurity<>e.force_rls or pg_get_userbyid(c.relowner)<>'postgres' then
    raise exception 'Baseline RLS/owner mismatch: %',e.table_name; end if;
   foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
    if has_table_privilege('service_role',c.oid,privilege_name)<>(privilege_name=any(string_to_array(e.privileges,','))) then
     raise exception 'Service table ACL mismatch: % %',e.table_name,privilege_name; end if;
   end loop;
  end loop;
 end loop;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='profiles'
   and policyname='Anyone can manage profiles' and cmd='ALL' and roles=array['public']::name[]
   and qual='true' and with_check='true') or (select count(*) from pg_policies where schemaname='public' and tablename='profiles')<>1
   then raise exception 'Observed profile policy mismatch'; end if;
 if exists(select 1 from pg_policies where schemaname='public' and tablename in
   ('ticket_wallets','stripe_checkout_intents','stripe_memberships','cpu_hint_receipts',
    'cpu_hint_restorations','ranked_match_admissions','account_deletion_jobs')) then
  raise exception 'Unexpected policy on protected baseline tables'; end if;
  if not exists(select 1 from pg_extension ext join pg_namespace n on n.oid=ext.extnamespace
   where ext.extname='pgcrypto' and ext.extversion='1.3' and n.nspname='extensions') then
  raise exception 'Native pgcrypto dependency mismatch'; end if;
 if extensions.crypt('qg-synthetic-rehearsal',extensions.gen_salt('bf',4)) !~ '^[$]2[abxy][$]' then
  raise exception 'Native bcrypt probe failed'; end if;
 if p_after then
  for c in select t.oid,t.relrowsecurity,t.relowner,n.nspname,t.relname
   from pg_class t join pg_namespace n on n.oid=t.relnamespace where n.nspname in ('public','qg_private')
    and t.relkind in ('r','p') and not exists(select 1 from qg_fixture.original_tables b where b.oid=t.oid) loop
   if not c.relrowsecurity or pg_get_userbyid(c.relowner)<>'postgres' then
    raise exception 'New table RLS/owner mismatch: %.%',c.nspname,c.relname; end if;
   foreach role_name in array array['anon','authenticated'] loop
    if has_table_privilege(role_name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') then
     raise exception 'Wide default grants survived new table REVOKE: % %.%',role_name,c.nspname,c.relname; end if;
   end loop;
  end loop;
  for p in select f.*,n.nspname from pg_proc f join pg_namespace n on n.oid=f.pronamespace
   where n.nspname in ('public','qg_private')
    and not exists(select 1 from qg_fixture.original_functions b where b.oid=f.oid) loop
    if pg_get_userbyid(p.proowner)<>'postgres' or not (coalesce(p.proconfig,array[]::text[]) && array['search_path=""','search_path=pg_catalog']) then
     raise exception 'New function owner/search_path mismatch: %',p.oid::regprocedure; end if;
    if has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE')
    then raise exception 'Wide default EXECUTE survived REVOKE: %',p.oid::regprocedure; end if;
   if p.prosecdef and not(p.nspname='qg_private' and p.proname='provision_legacy_session_account'
      and pg_get_userbyid(p.proowner)='postgres' and p.pronargs=0) then
    raise exception 'Unexpected new DEFINER: %',p.oid::regprocedure; end if;
  end loop;
  if to_regclass('public.stripe_commerce_sources') is null or to_regprocedure('public.buy_cpu_hint_v2(uuid,text,uuid,integer,text,jsonb,jsonb)') is null
   or to_regprocedure('public.apply_stripe_commerce_source_risk(jsonb)') is null
   or not exists(select 1 from pg_class where oid='qg_private.legacy_sessions'::regclass and relforcerowsecurity)
   or not exists(select 1 from pg_class where oid='qg_private.legacy_session_accounts'::regclass and relforcerowsecurity) then
   raise exception 'Selected raw pending upgrade incomplete'; end if;
 end if;
  select count(*) into object_count from qg_fixture.expected_functions where not p_after or unchanged_after;
 return jsonb_build_object('stage',case when p_after then 'after' else 'before' end,
  'verifiedPublicSourceBodies',object_count,'loopbackSyntheticOnly',true,
  'fullHostedEquivalence',false,'postgresSuperuserInFixture',true,
  'applicationRoleTestsRequired',true);
end $assert$;
revoke all on function qg_fixture.assert_stage(boolean) from public,anon,authenticated,service_role,authenticator;
select qg_fixture.assert_stage(false);
commit;

-- AFTER Root applies the reviewed raw pending chain (same admin connection):
-- SELECT qg_fixture.assert_stage(true);
-- Also keep actual HTTP anon/authenticated denial and qg_private profile
-- non-exposure tests; SQL ACL assertions do not prove PGRST_DB_SCHEMAS.

