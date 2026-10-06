-- DORMANT runtime contract. No deployment flag can activate this source.
-- Existing cleanup retention remains unchanged. Missing expired token evidence
-- is ambiguous and must NEVER cause a mid-game forfeit. See runtime gate notes.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

create function public.legacy_session_runtime_version() returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
    if current_user <> 'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    return jsonb_build_object('version', 2, 'activationReady', false);
end $$;

create function public.inspect_legacy_session(p_token_hash text, p_expected_user_id text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_session record; v_now timestamptz;
begin
    if current_user <> 'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    if current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'Session operation requires read committed' using errcode='25000';
    end if;
    if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
        or (p_expected_user_id is not null and octet_length(p_expected_user_id) not between 1 and 256) then
        return jsonb_build_object('status','invalid');
    end if;
    select s.*, a.generation as current_generation,
        exists(select 1 from public.account_deletion_jobs j where j.user_id=s.user_id and j.phase<>'completed') as deleting
    into v_session from qg_private.legacy_sessions s
    join qg_private.legacy_session_accounts a on a.user_id=s.user_id and a.incarnation=s.incarnation
    where s.token_hash=p_token_hash;
    if not found or (p_expected_user_id is not null and v_session.user_id<>p_expected_user_id) then
        return jsonb_build_object('status','invalid');
    end if;
    if v_session.revoked_at is not null or v_session.generation<>v_session.current_generation or v_session.deleting then
        return jsonb_build_object('status','revoked');
    end if;
    v_now:=clock_timestamp();
    return jsonb_build_object('status',case when v_session.expires_at<=v_now then 'expired' else 'valid' end,
        'userId',v_session.user_id,'incarnation',v_session.incarnation,'generation',v_session.generation::text,
        'persistent',v_session.persistent,'issuedAt',v_session.issued_at,'expiresAt',v_session.expires_at,'serverNow',v_now);
end $$;

-- Inputs are server-owned fences captured from successful verification. Never
-- accept them from a browser. Only token hashes cross this boundary.
create function public.inspect_live_legacy_sessions(p_sessions jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_now timestamptz; v_results jsonb;
begin
    if current_user <> 'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    if current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'Session operation requires read committed' using errcode='25000';
    end if;
    if p_sessions is null or jsonb_typeof(p_sessions)<>'array' or octet_length(p_sessions::text)>150000 then
        raise exception 'Invalid live session batch' using errcode='22023';
    end if;
    if jsonb_array_length(p_sessions) not between 1 and 200 then
        raise exception 'Invalid live session batch' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_array_elements(p_sessions) e where jsonb_typeof(e)<>'object'
        or (select count(*) from jsonb_object_keys(e))<>4
        or jsonb_typeof(e->'tokenHash') is distinct from 'string' or e->>'tokenHash' !~ '^[a-f0-9]{64}$'
        or jsonb_typeof(e->'userId') is distinct from 'string' or octet_length(e->>'userId') not between 1 and 256
        or jsonb_typeof(e->'incarnation') is distinct from 'string'
        or e->>'incarnation' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
        or jsonb_typeof(e->'generation') is distinct from 'string' or e->>'generation' !~ '^(0|[1-9][0-9]{0,18})$') then
        raise exception 'Invalid live session fence' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_array_elements(p_sessions) e where (e->>'generation')::numeric>9223372036854775807) then
        raise exception 'Invalid live session generation' using errcode='22023';
    end if;
    v_now:=clock_timestamp();
    -- One READ COMMITTED statement snapshot distinguishes explicit revocation
    -- from expiry. Account erasure/recreation remains detectable after session
    -- cleanup through the in-memory incarnation captured on this live socket.
    select jsonb_agg(jsonb_build_object('status',case
        when a.user_id is null or a.incarnation<>(e->>'incarnation')::uuid
            or a.generation<>(e->>'generation')::bigint
            or exists(select 1 from public.account_deletion_jobs j where j.user_id=e->>'userId' and j.phase<>'completed') then 'revoked'
        when s.token_hash is null then 'evidence_lost'
        when s.user_id<>e->>'userId' or s.incarnation<>(e->>'incarnation')::uuid
            or s.generation<>(e->>'generation')::bigint then 'revoked'
        when s.revoked_at is not null then 'revoked'
        when s.expires_at<=v_now then 'expired'
        else 'valid' end) order by ordinal)
    into v_results from jsonb_array_elements(p_sessions) with ordinality as input(e,ordinal)
    left join qg_private.legacy_session_accounts a on a.user_id=e->>'userId'
    left join qg_private.legacy_sessions s on s.token_hash=e->>'tokenHash';
    return jsonb_build_object('serverNow',v_now,'sessions',v_results);
end $$;

revoke all on function public.legacy_session_runtime_version(),public.inspect_legacy_session(text,text),
    public.inspect_live_legacy_sessions(jsonb) from public,anon,authenticated;
grant execute on function public.legacy_session_runtime_version(),public.inspect_legacy_session(text,text),
    public.inspect_live_legacy_sessions(jsonb) to service_role;
commit;
