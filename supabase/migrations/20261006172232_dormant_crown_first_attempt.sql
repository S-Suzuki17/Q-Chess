begin;
set local lock_timeout='3s';
set local statement_timeout='15s';

-- Preparation only. No stage-to-rank mapping or provider integration is enabled.
-- A first-attempt authorization is permanent for this account/rank incarnation;
-- losses, retries, reconnects and a later subscription expiry do not consume again.
create table public.crown_first_attempt_authorizations (
    user_id text not null references public.profiles(id) on delete cascade,
    rank_key text not null check(rank_key ~ '^[a-z0-9][a-z0-9:_-]{0,127}$'),
    authorization_id uuid not null unique,
    source text not null check(source in ('verified_ad','subscription','legacy_campaign')),
    grant_id uuid unique references public.verified_rewarded_ad_grants(grant_id),
    authorized_at timestamptz not null default clock_timestamp() check(isfinite(authorized_at)),
    primary key(user_id,rank_key),
    check((source='verified_ad')=(grant_id is not null))
);
alter table public.crown_first_attempt_authorizations enable row level security;
revoke all on public.crown_first_attempt_authorizations from public,anon,authenticated,service_role;
grant select,insert on public.crown_first_attempt_authorizations to service_role;

create function public.authorize_crown_first_attempt(p_authorization_id uuid,p_user_id text,p_rank_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_existing public.crown_first_attempt_authorizations; v_entitlement jsonb;
    v_source text; v_grant uuid;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    if current_setting('transaction_isolation')<>'read committed' then
        raise exception 'Read committed required' using errcode='25000'; end if;
    if p_authorization_id is null or p_user_id is null or p_user_id='' or p_user_id<>btrim(p_user_id)
        or octet_length(p_user_id)>256 or p_user_id~'[[:cntrl:]]'
        or p_user_id~*'^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)'
        or p_rank_key is null or p_rank_key !~ '^[a-z0-9][a-z0-9:_-]{0,127}$' then
        raise exception 'Invalid Crown request' using errcode='22023'; end if;
    -- Same account lock and ordering as verified reward recording/erasure.
    -- This also serializes simultaneous first attempts with different request IDs.
    perform 1 from public.profiles where id=p_user_id for update;
    if not found or exists(select 1 from public.account_restrictions where user_id=p_user_id and blocked)
        or exists(select 1 from public.account_deletion_jobs where user_id=p_user_id and phase<>'completed') then
        raise exception 'Crown account unavailable' using errcode='42501'; end if;
    select * into v_existing from public.crown_first_attempt_authorizations
        where user_id=p_user_id and rank_key=p_rank_key;
    if found then
        return jsonb_build_object('state','authorized','userId',p_user_id,'rankKey',p_rank_key,
            'authorizationId',v_existing.authorization_id,'source',v_existing.source,'reused',true);
    end if;
    -- New monetized authorization requires canonical current ticket consent.
    -- A no-charge retry above preserves an already-established right; its
    -- identity/restriction/deletion and existing general TermsGate still apply.
    if not public.has_current_ticket_terms(p_user_id) then
        raise exception 'Crown account unavailable' using errcode='42501'; end if;
    v_entitlement:=public.get_shared_match_entitlement(p_user_id);
    if v_entitlement->>'plan' in ('standard','plus') and (v_entitlement->>'noAds')::boolean then
        v_source:='subscription';
    elsif v_entitlement->>'plan'='legacy299' then
        -- Preserve Campaign's pre-existing active legacy membership exemption
        -- locally; this does NOT make legacy membership globally ad-free/unlimited.
        v_source:='legacy_campaign';
    else
        select grant_id into v_grant from public.verified_rewarded_ad_grants
            where user_id=p_user_id and purpose='crown_first_attempt' and target_key=p_rank_key
                and consumed_by is null
            order by verified_at,grant_id limit 1 for update;
        if not found then
            return jsonb_build_object('state','reward_required','userId',p_user_id,'rankKey',p_rank_key);
        end if;
        v_source:='verified_ad';
    end if;
    insert into public.crown_first_attempt_authorizations(user_id,rank_key,authorization_id,source,grant_id)
        values(p_user_id,p_rank_key,p_authorization_id,v_source,v_grant);
    if v_grant is not null then
        update public.verified_rewarded_ad_grants set consumed_by=p_authorization_id
            where grant_id=v_grant and consumed_by is null;
        if not found then raise exception 'Crown reward unavailable' using errcode='40001'; end if;
    end if;
    return jsonb_build_object('state','authorized','userId',p_user_id,'rankKey',p_rank_key,
        'authorizationId',p_authorization_id,'source',v_source,'reused',false);
end $$;
revoke all on function public.authorize_crown_first_attempt(uuid,text,text) from public,anon,authenticated;
grant execute on function public.authorize_crown_first_attempt(uuid,text,text) to service_role;
commit;
