-- DORMANT: no application selection, scheduler, rollout flag or socket cutover.
-- Public-source reconstruction; new verification is required for these bytes.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Backfill and provisioning become visible together. The timeout aborts this
-- whole migration if the write-conflicting lock cannot safely be acquired.
lock table public.profiles in share row exclusive mode;
create schema if not exists qg_private;
revoke all on schema qg_private from public, anon, authenticated;
grant usage on schema qg_private to service_role;

create table qg_private.legacy_session_accounts (
    user_id text primary key references public.profiles(id) on delete cascade,
    incarnation uuid not null default gen_random_uuid(),
    generation bigint not null default 0 check (generation >= 0),
    unique (user_id, incarnation)
);
create table qg_private.legacy_sessions (
    token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
    user_id text not null,
    incarnation uuid not null,
    generation bigint not null check (generation >= 0),
    persistent boolean not null,
    issued_at timestamptz not null check (isfinite(issued_at)),
    expires_at timestamptz not null check (isfinite(expires_at)),
    revoked_at timestamptz check (isfinite(revoked_at)),
    revocation_reason text check (revocation_reason in ('local', 'global', 'password_changed', 'deletion')),
    foreign key (user_id, incarnation) references qg_private.legacy_session_accounts(user_id, incarnation) on delete cascade,
    -- Hour intervals preserve an absolute duration across calendar/DST changes.
    check (expires_at = issued_at + case when persistent then interval '720 hours' else interval '1 hour' end),
    check ((revoked_at is null) = (revocation_reason is null))
);
create index legacy_sessions_active_expiry on qg_private.legacy_sessions(expires_at, token_hash) where revoked_at is null;
create index legacy_sessions_account on qg_private.legacy_sessions(user_id) where revoked_at is null;
create index legacy_sessions_retention on qg_private.legacy_sessions((coalesce(revoked_at, expires_at)), token_hash);
alter table qg_private.legacy_session_accounts enable row level security;
alter table qg_private.legacy_session_accounts force row level security;
alter table qg_private.legacy_sessions enable row level security;
alter table qg_private.legacy_sessions force row level security;
revoke all on qg_private.legacy_session_accounts, qg_private.legacy_sessions from public, anon, authenticated, service_role;
grant select on qg_private.legacy_session_accounts to service_role;
grant update(generation) on qg_private.legacy_session_accounts to service_role;
grant select, insert, delete on qg_private.legacy_sessions to service_role;
grant update(revoked_at, revocation_reason) on qg_private.legacy_sessions to service_role;

-- Sole new DEFINER exception: an argument-free private trigger. Existing Auth
-- profile signup must not gain private state privileges merely to provision an
-- account. Only NEW.id is used; defaults choose incarnation and generation.
create function qg_private.provision_legacy_session_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    insert into qg_private.legacy_session_accounts(user_id) values(new.id);
    return new;
end $$;
alter function qg_private.provision_legacy_session_account() owner to postgres;
revoke all on function qg_private.provision_legacy_session_account() from public, anon, authenticated, service_role;
create trigger provision_legacy_session_account after insert on public.profiles
for each row execute function qg_private.provision_legacy_session_account();
insert into qg_private.legacy_session_accounts(user_id) select id from public.profiles;

-- Writers lock profile -> epoch -> session rows. Pre-lock epoch reads NEVER
-- take a row lock. No user/session identifier survives profile erasure.
create function qg_private.invalidate_legacy_session_account(p_user_id text, p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_generation bigint; v_count integer;
begin
    if current_user not in ('service_role', 'postgres') then raise exception 'Trusted service required' using errcode = '42501'; end if;
    if p_reason is null or p_reason not in ('global', 'password_changed', 'deletion') then
        raise exception 'Invalid session revocation' using errcode = '22023';
    end if;
    perform 1 from public.profiles where id = p_user_id for update;
    if not found then return 0; end if;
    select generation into v_generation from qg_private.legacy_session_accounts where user_id = p_user_id for update;
    if not found then raise exception 'Session state unavailable' using errcode = '55000'; end if;
    if v_generation = 9223372036854775807 then
        raise exception 'Session generation exhausted' using errcode = '22003';
    end if;
    update qg_private.legacy_session_accounts set generation = v_generation + 1 where user_id = p_user_id;
    update qg_private.legacy_sessions set revoked_at = clock_timestamp(), revocation_reason = p_reason
        where user_id = p_user_id and revoked_at is null;
    get diagnostics v_count = row_count;
    return v_count;
end $$;
revoke all on function qg_private.invalidate_legacy_session_account(text, text) from public, anon, authenticated;
grant execute on function qg_private.invalidate_legacy_session_account(text, text) to service_role;

create function qg_private.invalidate_legacy_session_password() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
    perform qg_private.invalidate_legacy_session_account(new.id, 'password_changed');
    return new;
end $$;
revoke all on function qg_private.invalidate_legacy_session_password() from public, anon, authenticated, service_role;
create trigger invalidate_legacy_session_password after update of password_hash on public.profiles
for each row when (old.password_hash is distinct from new.password_hash)
execute function qg_private.invalidate_legacy_session_password();

create function qg_private.invalidate_legacy_session_deletion() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
    if tg_table_name = 'profiles' then
        perform qg_private.invalidate_legacy_session_account(old.id, 'deletion');
        return old;
    end if;
    -- BEFORE INSERT also runs for INSERT ON CONFLICT ticket rotation. Never
    -- add a job UPDATE trigger that locks profile after an existing job row.
    if new.phase <> 'completed' then
        perform qg_private.invalidate_legacy_session_account(new.user_id, 'deletion');
    end if;
    return new;
end $$;
revoke all on function qg_private.invalidate_legacy_session_deletion() from public, anon, authenticated, service_role;
create trigger invalidate_legacy_session_deletion_intent before insert on public.account_deletion_jobs
for each row execute function qg_private.invalidate_legacy_session_deletion();
create trigger invalidate_legacy_session_profile_erasure before delete on public.profiles
for each row execute function qg_private.invalidate_legacy_session_deletion();

-- Copied only from public 20260924140124 source. ONLY the locking prelude
-- changes: unlocked job read -> profile lock -> locked ticket/target recheck.
-- Native tests compare the remainder byte-for-byte with that public source.
create or replace function public.erase_account_data(p_ticket_hash text)
returns void language plpgsql security invoker set search_path='' as $$
declare job public.account_deletion_jobs; target text; optional_table text;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    select * into job from public.account_deletion_jobs where ticket_hash=p_ticket_hash;
    if not found then raise exception 'Deletion unavailable' using errcode='22023'; end if;
    if job.phase<>'pending' then return; end if;
    target=job.user_id;
    perform 1 from public.profiles where id=target for update;
    select * into job from public.account_deletion_jobs where ticket_hash=p_ticket_hash for update;
    if not found then raise exception 'Deletion unavailable' using errcode='22023'; end if;
    if job.phase<>'pending' then return; end if;
    if job.user_id is distinct from target then
        raise exception 'Deletion changed while waiting' using errcode='40001';
    end if;
    if exists(select 1 from public.account_deletion_objects(p_ticket_hash)) then
        raise exception 'Stored images must be erased first' using errcode='55000';
    end if;
    -- Keep only the other account's anonymous result for lifetime win/loss stats.
    -- Never infer ownership from a display name: names can be duplicated or changed.
    delete from public.game_records g where (g.white_id=target or g.black_id=target)
        and not exists(select 1 from public.profiles p where p.id<>target
            and p.id=case when g.white_id=target then g.black_id else g.white_id end);
    update public.game_records set
        white_player=case when white_id=target then 'Deleted player' else white_player end,
        black_player=case when black_id=target then 'Deleted player' else black_player end,
        white_id=case when white_id=target then null else white_id end,
        black_id=case when black_id=target then null else black_id end,
        moves='[]'::jsonb,replay_expired=true
        where white_id=target or black_id=target;
    -- Preserve idempotency keys, but erase the departing player's receipt and the
    -- original fingerprint. Any late changed retry fails instead of restoring data.
    update public.ranked_match_settlements set
        result=case when result->'white'->>'userId'=target then result-'white' else result end
        - case when result->'black'->>'userId'=target then 'black' else '__no_such_receipt__' end,
        request_hash=sha256(convert_to(gen_random_uuid()::text,'UTF8'))
        where result->'white'->>'userId'=target or result->'black'->>'userId'=target;
    delete from public.friends where user_id=target or friend_id=target;
    delete from public.active_matches where white_id=target or black_id=target;
    foreach optional_table in array array['ad_allowances','ad_reward_intents','ad_consumptions','founders_entitlements'] loop
        if to_regclass('public.'||optional_table) is not null then
            execute format('delete from public.%I where user_id=$1',optional_table) using target;
        end if;
    end loop;
    delete from public.profiles where id=target;
    update public.account_deletion_jobs set phase='data_deleted' where ticket_hash=p_ticket_hash;
end $$;

create function public.legacy_session_protocol_version() returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
    if current_user <> 'service_role' then raise exception 'Trusted service required' using errcode = '42501'; end if;
    return jsonb_build_object('version', 1, 'activationReady', false);
end $$;

create function public.issue_legacy_session(p_user_id text, p_password text, p_token_hash text, p_persistent boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_before qg_private.legacy_session_accounts;
    v_after qg_private.legacy_session_accounts;
    v_now timestamptz; v_expiry timestamptz; v_inserted text;
begin
    if current_user <> 'service_role' then raise exception 'Trusted service required' using errcode = '42501'; end if;
    -- Advisory locks serialize admission, but a repeatable snapshot would still
    -- count stale rows after waiting and could exceed the global capacity.
    if current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'Session operation requires read committed' using errcode = '25000';
    end if;
    if p_user_id is null or octet_length(p_user_id) not between 1 and 256
        or p_password is null or octet_length(p_password) not between 1 and 1024
        or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_persistent is null then
        return jsonb_build_object('ok', false, 'error', 'INVALID_REQUEST');
    end if;
    select * into v_before from qg_private.legacy_session_accounts where user_id = p_user_id;
    if not found then return jsonb_build_object('ok', false, 'error', 'INVALID_CREDENTIALS'); end if;
    -- The actual public function locks profiles, checks deletion intent, applies
    -- the shared 10-attempt/min budget and verifies native extensions.crypt.
    -- Password proof and session insert MUST remain in this transaction.
    if not public.login_user(p_user_id, p_password) then
        return jsonb_build_object('ok', false, 'error', 'INVALID_CREDENTIALS');
    end if;
    select * into v_after from qg_private.legacy_session_accounts where user_id = p_user_id for update;
    if not found or v_after.incarnation <> v_before.incarnation or v_after.generation <> v_before.generation then
        return jsonb_build_object('ok', false, 'error', 'STALE_AUTHENTICATION');
    end if;
    perform pg_advisory_xact_lock(71032719, 1);
    v_now = clock_timestamp();
    if exists(select 1 from qg_private.legacy_sessions where token_hash = p_token_hash) then
        return jsonb_build_object('ok', false, 'error', 'TOKEN_CONFLICT');
    end if;
    if (select count(*) from qg_private.legacy_sessions where revoked_at is null and expires_at > v_now) >= 10000 then
        return jsonb_build_object('ok', false, 'error', 'CAPACITY');
    end if;
    v_expiry = v_now + case when p_persistent then interval '720 hours' else interval '1 hour' end;
    insert into qg_private.legacy_sessions(token_hash, user_id, incarnation, generation, persistent, issued_at, expires_at)
        values(p_token_hash, p_user_id, v_after.incarnation, v_after.generation, p_persistent, v_now, v_expiry)
        on conflict(token_hash) do nothing returning token_hash into v_inserted;
    if v_inserted is null then return jsonb_build_object('ok', false, 'error', 'TOKEN_CONFLICT'); end if;
    return jsonb_build_object('ok', true, 'userId', p_user_id, 'incarnation', v_after.incarnation,
        'generation', v_after.generation::text, 'persistent', p_persistent, 'issuedAt', v_now, 'expiresAt', v_expiry);
end $$;

create function public.verify_legacy_session(p_token_hash text, p_expected_user_id text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_session record;
begin
    if current_user <> 'service_role' then raise exception 'Trusted service required' using errcode = '42501'; end if;
    -- A caller's old repeatable snapshot must never authenticate revoked rows.
    if current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'Session operation requires read committed' using errcode = '25000';
    end if;
    if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
        or (p_expected_user_id is not null and octet_length(p_expected_user_id) not between 1 and 256) then
        return jsonb_build_object('status', 'invalid');
    end if;
    -- One statement snapshot reads the session, epoch and deletion intent.
    -- Restrictions deliberately do not deny recovery/deletion identity.
    select s.*, a.generation as current_generation,
        exists(select 1 from public.account_deletion_jobs j where j.user_id = s.user_id and j.phase <> 'completed') as deleting
        into v_session from qg_private.legacy_sessions s
        join qg_private.legacy_session_accounts a on a.user_id = s.user_id and a.incarnation = s.incarnation
        where s.token_hash = p_token_hash;
    if not found or (p_expected_user_id is not null and v_session.user_id <> p_expected_user_id) then
        return jsonb_build_object('status', 'invalid');
    end if;
    if v_session.revoked_at is not null or v_session.generation <> v_session.current_generation or v_session.deleting then
        return jsonb_build_object('status', 'revoked');
    end if;
    return jsonb_build_object('status', case when v_session.expires_at <= clock_timestamp() then 'expired' else 'valid' end,
        'userId', v_session.user_id, 'incarnation', v_session.incarnation, 'generation', v_session.generation::text,
        'persistent', v_session.persistent, 'issuedAt', v_session.issued_at, 'expiresAt', v_session.expires_at);
end $$;

create function public.revoke_legacy_session(p_token_hash text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
    if current_user <> 'service_role' then raise exception 'Trusted service required' using errcode = '42501'; end if;
    if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('revoked', 0); end if;
    -- Local revoke affects exactly one token, not the account generation.
    update qg_private.legacy_sessions set revoked_at = clock_timestamp(), revocation_reason = 'local'
        where token_hash = p_token_hash and revoked_at is null;
    get diagnostics v_count = row_count;
    return jsonb_build_object('revoked', v_count);
end $$;

create function public.revoke_user_legacy_sessions(p_user_id text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
    if current_user <> 'service_role' then raise exception 'Trusted service required' using errcode = '42501'; end if;
    if p_user_id is null or octet_length(p_user_id) not between 1 and 256 then
        raise exception 'Invalid session revocation' using errcode = '22023';
    end if;
    return jsonb_build_object('revoked', qg_private.invalidate_legacy_session_account(p_user_id, 'global'));
end $$;

create function public.cleanup_legacy_sessions(p_limit integer default 100) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_count integer; v_cutoff timestamptz = clock_timestamp() - interval '24 hours';
begin
    if current_user <> 'service_role' then raise exception 'Trusted service required' using errcode = '42501'; end if;
    if p_limit is null or p_limit not between 1 and 1000 then
        raise exception 'Invalid session cleanup limit' using errcode = '22023';
    end if;
    -- Brief expired/revoked evidence retention is not a socket grace policy.
    -- No cleanup schedule or provider setting is installed here.
    with victims as (
        select token_hash from qg_private.legacy_sessions
        where coalesce(revoked_at, expires_at) < v_cutoff
        order by coalesce(revoked_at, expires_at), token_hash
        limit p_limit for update skip locked
    ) delete from qg_private.legacy_sessions s using victims v where s.token_hash = v.token_hash;
    get diagnostics v_count = row_count;
    return jsonb_build_object('deleted', v_count);
end $$;

revoke all on function public.legacy_session_protocol_version(), public.issue_legacy_session(text,text,text,boolean),
    public.verify_legacy_session(text,text), public.revoke_legacy_session(text), public.revoke_user_legacy_sessions(text),
    public.cleanup_legacy_sessions(integer) from public, anon, authenticated;
grant execute on function public.legacy_session_protocol_version(), public.issue_legacy_session(text,text,text,boolean),
    public.verify_legacy_session(text,text), public.revoke_legacy_session(text), public.revoke_user_legacy_sessions(text),
    public.cleanup_legacy_sessions(integer) to service_role;
commit;
