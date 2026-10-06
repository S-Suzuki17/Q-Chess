begin;
set local lock_timeout='3s';
set local statement_timeout='15s';

-- Dormant protocol v1. No runtime/provider/price switch is opened here. Legacy
-- ranked RPCs and receipt domains are deliberately retained without rewriting.
alter table public.ranked_match_admissions
    add column admission_protocol text not null default 'legacy_ranked',
    add column queue_mode text not null default 'ranked',
    add constraint shared_admission_protocol check(admission_protocol in ('legacy_ranked','shared_v1')),
    add constraint shared_admission_mode check(queue_mode in ('ranked','random'));

-- Provider business-key replay fence survives erasure without an account ID.
-- Only the trusted server verifier may write evidence; browser adViewed,
-- elapsed time, reward callbacks and H5 completion flags are never evidence.
create table public.verified_rewarded_ad_grants (
    grant_id uuid primary key,
    user_id text references public.profiles(id) on delete set null,
    purpose text not null check(purpose in ('online_ranked_match','crown_first_attempt')),
    target_key text not null check(length(target_key) between 1 and 128 and target_key !~ '[[:cntrl:]]'),
    provider text not null check(provider ~ '^[a-z][a-z0-9_]{1,63}$'),
    transaction_id text not null check(length(transaction_id) between 8 and 256 and transaction_id !~ '[[:cntrl:]]'),
    evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
    verified_at timestamptz not null default clock_timestamp(),
    expires_at timestamptz, -- Reserved; no earned-credit expiry policy is activated.
    consumed_by uuid,
    unique(provider,transaction_id),
    check(isfinite(verified_at) and expires_at is null)
);
create table public.shared_match_consents (
    token uuid primary key,
    user_id text not null references public.profiles(id) on delete cascade,
    match_id uuid not null,
    source text not null check(source in ('ticket','verified_ad')),
    grant_id uuid references public.verified_rewarded_ad_grants(grant_id),
    issued_at timestamptz not null default clock_timestamp(),
    expires_at timestamptz not null,
    consumed_at timestamptz,
    unique(match_id,user_id),
    check((source='ticket' and grant_id is null) or (source='verified_ad' and grant_id is not null)),
    check(isfinite(issued_at) and isfinite(expires_at) and expires_at>issued_at)
);
create table public.shared_match_allocations (
    match_id uuid not null references public.ranked_match_admissions(match_id),
    user_id text not null references public.profiles(id) on delete cascade,
    source text not null check(source in ('daily_quota','free_ticket','legacy_paid_ticket','subscription_unlimited','verified_ad')),
    utc_day date not null,
    subscription_id text,
    expires_at timestamptz,
    refund_origin uuid,
    consent_token uuid references public.shared_match_consents(token) on delete set null,
    grant_id uuid references public.verified_rewarded_ad_grants(grant_id),
    primary key(match_id,user_id),
    check((source='legacy_paid_ticket' and subscription_id is not null and expires_at is not null)
        or source<>'legacy_paid_ticket'),
    check((source='verified_ad')=(grant_id is not null))
);
create index shared_match_usage on public.shared_match_allocations(user_id,utc_day);
alter table public.verified_rewarded_ad_grants enable row level security;
alter table public.shared_match_consents enable row level security;
alter table public.shared_match_allocations enable row level security;
revoke all on public.verified_rewarded_ad_grants,public.shared_match_consents,public.shared_match_allocations from public,anon,authenticated,service_role;
grant select,insert,update on public.verified_rewarded_ad_grants,public.shared_match_consents to service_role;
grant select,insert on public.shared_match_allocations to service_role;

create function public.get_shared_match_entitlement(p_user_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_count bigint; v_sku text; v_end timestamptz; v_legacy boolean;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    select count(*),min(c.sku),min(m.period_end) into v_count,v_sku,v_end
        from public.stripe_memberships m
        join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
        join public.stripe_customer_links l on l.customer_id=m.customer_id
        join public.stripe_commerce_checkout_intents ci on ci.checkout_id=m.checkout_id
        join public.stripe_commerce_catalog c on c.sku=ci.sku
        where m.user_id=p_user_id and i.user_id=p_user_id and ci.user_id=p_user_id and l.user_id=p_user_id
            and m.status='active' and m.period_end>clock_timestamp() and isfinite(m.period_end)
            and m.refund_blocked_until is null and m.current_price_id=i.price_id and ci.price_id=i.price_id
            and i.livemode and ci.livemode and c.sku in ('standard_monthly','plus_monthly')
            and c.mode='subscription' and c.unlimited_ranked and c.ad_free;
    if v_count>1 then raise exception 'Ambiguous shared membership' using errcode='23505'; end if;
    if v_count=1 then return jsonb_build_object('plan',case v_sku when 'standard_monthly' then 'standard' else 'plus' end,
        'unlimitedOnlineRanked',true,'noAds',true,'periodEnd',v_end); end if;
    select exists(select 1 from public.stripe_memberships m
        join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
        join public.stripe_customer_links l on l.customer_id=m.customer_id
        where m.user_id=p_user_id and i.user_id=p_user_id and l.user_id=p_user_id and i.livemode
            and m.status='active' and m.period_end>clock_timestamp() and m.refund_blocked_until is null
            and m.current_price_id=i.price_id and i.price_id='price_1ULM9fQWzwYDIuXWgs5Uj3yt') into v_legacy;
    -- Legacy 2.99 grants remain their original contract; no implicit migration.
    return jsonb_build_object('plan',case when v_legacy then 'legacy299' else 'free' end,
        'unlimitedOnlineRanked',false,'noAds',false,'periodEnd',null);
end $$;

create function public.record_verified_rewarded_ad(p_grant_id uuid,p_user_id text,p_purpose text,p_target_key text,
    p_provider text,p_transaction_id text,p_evidence_sha256 text,p_expires_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_existing public.verified_rewarded_ad_grants;
begin
    if current_user<>'service_role' then raise exception 'Trusted verifier required' using errcode='42501'; end if;
    if p_grant_id is null or p_user_id is null or p_expires_at is not null then
        raise exception 'Invalid verified reward' using errcode='22023'; end if;
    perform 1 from public.profiles where id=p_user_id for update;
    if not found or exists(select 1 from public.account_restrictions where user_id=p_user_id and blocked)
        or exists(select 1 from public.account_deletion_jobs where user_id=p_user_id and phase<>'completed') then
        raise exception 'Reward account unavailable' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended('qg-verified-ad:'||p_provider||':'||p_transaction_id,0));
    select * into v_existing from public.verified_rewarded_ad_grants where provider=p_provider and transaction_id=p_transaction_id;
    if found then
        if (v_existing.grant_id,v_existing.user_id,v_existing.purpose,v_existing.target_key,v_existing.evidence_sha256)
            is distinct from (p_grant_id,p_user_id,p_purpose,p_target_key,p_evidence_sha256) then
            raise exception 'Provider reward collision' using errcode='23505'; end if;
        return jsonb_build_object('grantId',v_existing.grant_id,'duplicate',true);
    end if;
    -- Existing exact receipt replays above are no-charge reads. New monetized
    -- grants require the canonical current terms; nothing is recorded on denial,
    -- so independently verified completion can be retried after explicit consent.
    if not public.has_current_ticket_terms(p_user_id) then
        raise exception 'CURRENT_TICKET_TERMS_REQUIRED' using errcode='42501'; end if;
    if (public.get_shared_match_entitlement(p_user_id)->>'noAds')::boolean then
        raise exception 'Ad-free account' using errcode='42501'; end if;
    insert into public.verified_rewarded_ad_grants(grant_id,user_id,purpose,target_key,provider,transaction_id,evidence_sha256,expires_at)
        values(p_grant_id,p_user_id,p_purpose,p_target_key,p_provider,p_transaction_id,p_evidence_sha256,p_expires_at);
    return jsonb_build_object('grantId',p_grant_id,'duplicate',false);
end $$;

-- Called after an explicit authenticated UI choice for this exact match. Never
-- issue ticket consent on queue entry, balance fetch, refresh or reconnect.
create function public.issue_shared_match_consent(p_token uuid,p_user_id text,p_match_id uuid,p_source text,p_grant_id uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_existing public.shared_match_consents;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    if p_token is null or p_user_id is null or p_match_id is null or p_source is null or p_source not in ('ticket','verified_ad')
        or (p_source='ticket' and p_grant_id is not null) or (p_source='verified_ad' and p_grant_id is null) then
        raise exception 'Invalid explicit choice' using errcode='22023'; end if;
    perform 1 from public.profiles where id=p_user_id for update;
    if not found or not public.has_current_ticket_terms(p_user_id)
        or exists(select 1 from public.account_restrictions where user_id=p_user_id and blocked)
        or exists(select 1 from public.account_deletion_jobs where user_id=p_user_id and phase<>'completed') then
        raise exception 'Consent account unavailable' using errcode='42501'; end if;
    if exists(select 1 from public.ranked_match_admissions where match_id=p_match_id) then
        raise exception 'Match already admitted or finalized' using errcode='55000'; end if;
    if p_source='verified_ad' and not exists(select 1 from public.verified_rewarded_ad_grants
        where grant_id=p_grant_id and user_id=p_user_id and purpose='online_ranked_match' and (target_key=p_match_id::text or exists(select 1 from public.ranked_match_admissions
                where match_id::text=target_key and state='voided')) and consumed_by is null) then
        raise exception 'Verified match reward required' using errcode='42501'; end if;
    select * into v_existing from public.shared_match_consents where match_id=p_match_id and user_id=p_user_id for update;
    if found then
        if v_existing.source<>p_source or v_existing.grant_id is distinct from p_grant_id
            or v_existing.expires_at<=clock_timestamp() or v_existing.consumed_at is not null then
            raise exception 'Choice already bound' using errcode='23505'; end if;
        return v_existing.token;
    end if;
    insert into public.shared_match_consents(token,user_id,match_id,source,grant_id,expires_at)
        values(p_token,p_user_id,p_match_id,p_source,p_grant_id,clock_timestamp()+interval '10 minutes');
    return p_token;
end $$;

create function public.admit_shared_match(p_match_id uuid,p_host_id text,p_joiner_id text,p_time_control integer,
    p_owner_id uuid,p_mode text,p_consents jsonb default '{}',p_cpu_id text default null,p_cpu_rating integer default null,p_cpu_level integer default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_hash bytea; v_existing public.ranked_match_admissions; v_users text[]; v_user text;
    v_wallet public.ticket_wallets; v_source text; v_refund public.ranked_ticket_refunds; v_consent public.shared_match_consents;
    v_subscription text; v_period_end timestamptz; v_count bigint; v_usage bigint; v_entitlement jsonb;
    v_now timestamptz; v_day date; v_reason text; v_choices text[]:='{}'; v_entries jsonb:='[]'; v_entry jsonb; v_lease timestamptz;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    -- Advisory/profile locks serialize callers, but only READ COMMITTED takes
    -- a fresh snapshot after waiting. Never over-admit from a stale quota/busy
    -- snapshot if a future pool changes its transaction isolation.
    if current_setting('transaction_isolation')<>'read committed' then
        raise exception 'Shared admission requires READ COMMITTED' using errcode='40001'; end if;
    if p_match_id is null or p_owner_id is null or p_host_id is null or p_joiner_id is null or p_host_id=p_joiner_id
        or p_time_control is null or p_time_control not in (10,180,600) or p_mode is null or p_mode not in ('random','ranked')
        or p_consents is null or jsonb_typeof(p_consents)<>'object' or octet_length(p_consents::text)>2048 then
        raise exception 'Invalid shared match metadata' using errcode='22023'; end if;
    if p_cpu_id is null then
        if p_cpu_rating is not null or p_cpu_level is not null then raise exception 'Unexpected CPU metadata' using errcode='22023'; end if;
        v_users:=array[p_host_id,p_joiner_id];
    else
        if p_cpu_id<>'ai:'||p_match_id::text or (p_cpu_id=p_host_id)=(p_cpu_id=p_joiner_id) or p_mode<>'ranked'
            or p_cpu_rating is null or p_cpu_rating not between 0 and 10000 or p_cpu_level is null or p_cpu_level not between 1 and 100 then
            raise exception 'Invalid CPU metadata' using errcode='22023'; end if;
        v_users:=case when p_cpu_id=p_host_id then array[p_joiner_id] else array[p_host_id] end;
    end if;
    select array_agg(x order by x collate "C") into v_users from unnest(v_users) x;
    foreach v_user in array v_users loop
        if v_user='' or v_user<>btrim(v_user) or octet_length(v_user)>256 or v_user~'[[:cntrl:]]'
            or v_user~*'^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)' then
            raise exception 'Invalid registered human' using errcode='22023'; end if;
    end loop;
    if exists(select 1 from jsonb_object_keys(p_consents) k where not(k=any(v_users))) then
        raise exception 'Unexpected consent account' using errcode='22023'; end if;
    v_hash:=sha256(convert_to(jsonb_build_object('host',p_host_id,'joiner',p_joiner_id,'time',p_time_control,
        'cpu',p_cpu_id,'rating',p_cpu_rating,'level',p_cpu_level)::text,'UTF8'));
    perform pg_advisory_xact_lock(hashtextextended('qg-ranked-admission:'||p_match_id::text,0));
    select * into v_existing from public.ranked_match_admissions where match_id=p_match_id for update;
    if found then
        if v_existing.metadata_hash is not null and (v_existing.metadata_hash<>v_hash or v_existing.owner_id<>p_owner_id
            or v_existing.admission_protocol<>'shared_v1' or v_existing.queue_mode<>p_mode) then
            raise exception 'Match UUID metadata mismatch' using errcode='22023'; end if;
        return jsonb_build_object('state',v_existing.state,'success',v_existing.state in ('active','settled'),'duplicate',true,'reason',v_existing.reason);
    end if;
    if exists(select 1 from public.ranked_match_settlements where match_id=p_match_id)
        or exists(select 1 from public.game_records where id=p_match_id) then raise exception 'Match already finished' using errcode='22023'; end if;
    select expires_at into v_lease from public.ranked_server_leases where owner_id=p_owner_id for share;
    if not found or v_lease<=clock_timestamp() then raise exception 'Owner expired' using errcode='55000'; end if;
    foreach v_user in array v_users loop
        perform 1 from public.profiles where id=v_user for update;
        if not found or not public.has_current_ticket_terms(v_user)
            or exists(select 1 from public.account_deletion_jobs where user_id=v_user and phase<>'completed')
            or exists(select 1 from public.account_restrictions where user_id=v_user and blocked) then
            raise exception 'Match account unavailable' using errcode='42501'; end if;
        if exists(select 1 from public.ranked_match_admissions where state='active' and human_ids @> array[v_user]) then v_reason:='ACCOUNT_BUSY'; end if;
    end loop;
    foreach v_user in array v_users loop
        insert into public.ticket_wallets(user_id) values(v_user) on conflict do nothing;
        perform 1 from public.ticket_wallets where user_id=v_user for update;
    end loop;
    v_now:=clock_timestamp(); v_day:=(v_now at time zone 'UTC')::date;
    if v_reason is null then
        foreach v_user in array v_users loop
            v_source:=null; v_refund:=null; v_consent:=null; v_subscription:=null; v_period_end:=null;
            v_entitlement:=public.get_shared_match_entitlement(v_user);
            select count(*) into v_usage from (
                select a.match_id from public.shared_match_allocations a join public.ranked_match_admissions m using(match_id)
                    where a.user_id=v_user and a.utc_day=v_day and m.state in ('active','settled')
                union all select event_id from public.ticket_spend_receipts where user_id=v_user and event_kind='ranked_match_start'
                    and spent_at>=v_day::timestamp at time zone 'UTC' and spent_at<(v_day+1)::timestamp at time zone 'UTC'
            ) usage;
            if (v_entitlement->>'unlimitedOnlineRanked')::boolean then v_source:='subscription_unlimited';
            elsif v_usage<3 then v_source:='daily_quota';
            else
                if p_consents->>v_user is null then v_choices:=array_append(v_choices,v_user); continue; end if;
                if (p_consents->>v_user)!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
                    raise exception 'Invalid consent token' using errcode='22023'; end if;
                select * into v_consent from public.shared_match_consents where token=(p_consents->>v_user)::uuid for update;
                if not found or v_consent.user_id<>v_user or v_consent.match_id<>p_match_id or v_consent.consumed_at is not null
                    or v_consent.expires_at<=v_now then raise exception 'Explicit match consent required' using errcode='42501'; end if;
                if v_consent.source='verified_ad' then
                    perform 1 from public.verified_rewarded_ad_grants where grant_id=v_consent.grant_id and user_id=v_user
                        and purpose='online_ranked_match' and (target_key=p_match_id::text or exists(select 1 from public.ranked_match_admissions
                            where match_id::text=target_key and state='voided')) and consumed_by is null for update;
                    if not found then raise exception 'Verified match reward unavailable' using errcode='42501'; end if;
                    v_source:='verified_ad';
                else
                    select * into v_wallet from public.ticket_wallets where user_id=v_user;
                    select count(*),min(m.subscription_id),min(m.period_end) into v_count,v_subscription,v_period_end
                        from public.stripe_memberships m join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
                        join public.stripe_customer_links l on l.customer_id=m.customer_id
                        where m.user_id=v_user and i.user_id=v_user and l.user_id=v_user and m.status='active'
                            and m.period_end>v_now and m.refund_blocked_until is null and m.current_price_id=i.price_id
                            and i.livemode and i.price_id='price_1ULM9fQWzwYDIuXWgs5Uj3yt';
                    if v_count>1 then raise exception 'Ambiguous legacy membership' using errcode='23505'; end if;
                    select * into v_refund from public.ranked_ticket_refunds where user_id=v_user and spent_by is null
                        and (pool='free' or (pool='paid' and subscription_id=v_subscription and expires_at>v_now))
                        order by case pool when 'free' then 0 else 1 end,created_at,source_match_id limit 1 for update;
                    v_source:=case when v_refund.pool='free' or (v_refund.source_match_id is null and v_wallet.ranked_tickets>0) then 'free_ticket'
                        when v_refund.pool='paid' or (v_subscription is not null and v_wallet.member_ticket_subscription_id=v_subscription
                            and v_wallet.member_ranked_tickets>0) then 'legacy_paid_ticket' end;
                    if v_source is null then v_reason:='INSUFFICIENT_FUNDS'; exit; end if;
                end if;
            end if;
            v_entries:=v_entries||jsonb_build_array(jsonb_build_object('userId',v_user,'source',v_source,'consent',v_consent.token,
                'grant',v_consent.grant_id,'refund',v_refund.source_match_id,
                'subscription',case when v_source='legacy_paid_ticket' then coalesce(v_refund.subscription_id,v_subscription) end,
                'expiry',case when v_source='legacy_paid_ticket' then coalesce(v_refund.expires_at,v_period_end) end));
        end loop;
    end if;
    -- Choice is prestart. No receipt, quota or debit exists for either human.
    if v_reason is null and cardinality(v_choices)>0 then
        return jsonb_build_object('state','choice_required','humanIds',v_choices,'matchId',p_match_id,'success',false); end if;
    if v_lease<=clock_timestamp() then raise exception 'Owner expired' using errcode='55000'; end if;
    insert into public.ranked_match_admissions(match_id,metadata_hash,host_id,joiner_id,human_ids,time_control,cpu_id,cpu_rating,cpu_level,
        owner_id,state,reason,admitted_at,finalized_at,admission_protocol,queue_mode)
        values(p_match_id,v_hash,p_host_id,p_joiner_id,v_users,p_time_control,p_cpu_id,p_cpu_rating,p_cpu_level,p_owner_id,
            case when v_reason is null then 'active' else 'rejected' end,v_reason,v_now,
            case when v_reason is not null then clock_timestamp() end,'shared_v1',p_mode);
    if v_reason is not null then return jsonb_build_object('state','rejected','reason',v_reason,'success',false); end if;
    for v_entry in select value from jsonb_array_elements(v_entries) loop
        v_user:=v_entry->>'userId'; v_source:=v_entry->>'source';
        if v_entry->>'consent' is not null then update public.shared_match_consents set consumed_at=v_now where token=(v_entry->>'consent')::uuid; end if;
        if v_entry->>'refund' is not null then
            update public.ranked_ticket_refunds set spent_by=p_match_id where source_match_id=(v_entry->>'refund')::uuid and user_id=v_user and spent_by is null;
            if not found then raise exception 'Refund changed' using errcode='55000'; end if;
        elsif v_source='free_ticket' then update public.ticket_wallets set ranked_tickets=ranked_tickets-1 where user_id=v_user and ranked_tickets>0;
        elsif v_source='legacy_paid_ticket' then update public.ticket_wallets set member_ranked_tickets=member_ranked_tickets-1 where user_id=v_user and member_ranked_tickets>0;
        elsif v_source='verified_ad' then
            update public.verified_rewarded_ad_grants set consumed_by=p_match_id where grant_id=(v_entry->>'grant')::uuid and consumed_by is null;
            if not found then raise exception 'Reward changed' using errcode='55000'; end if;
        end if;
        insert into public.shared_match_allocations(match_id,user_id,source,utc_day,subscription_id,expires_at,refund_origin,consent_token,grant_id)
            values(p_match_id,v_user,v_source,v_day,v_entry->>'subscription',(v_entry->>'expiry')::timestamptz,
                (v_entry->>'refund')::uuid,(v_entry->>'consent')::uuid,(v_entry->>'grant')::uuid);
    end loop;
    return jsonb_build_object('state','active','success',true,'duplicate',false,'entries',v_entries);
end $$;

-- Extend the existing authoritative void transaction without changing the old
-- RPC, refunds or their conditions. State-based usage excludes voided starts.
create function public.restore_shared_match_allocation() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_alloc public.shared_match_allocations;
begin
    if new.admission_protocol<>'shared_v1' or new.state<>'voided' or old.state<>'active' then return new; end if;
    for v_alloc in select * from public.shared_match_allocations where match_id=new.match_id loop
        if v_alloc.refund_origin is not null then
            update public.ranked_ticket_refunds set spent_by=null where source_match_id=v_alloc.refund_origin
                and user_id=v_alloc.user_id and spent_by=new.match_id;
            if not found then raise exception 'Refund ownership mismatch' using errcode='55000'; end if;
        elsif v_alloc.source in ('free_ticket','legacy_paid_ticket') then
            insert into public.ranked_ticket_refunds(source_match_id,user_id,pool,subscription_id,expires_at)
                values(new.match_id,v_alloc.user_id,case v_alloc.source when 'free_ticket' then 'free' else 'paid' end,
                    v_alloc.subscription_id,v_alloc.expires_at);
        elsif v_alloc.source='verified_ad' then
            update public.verified_rewarded_ad_grants set consumed_by=null where grant_id=v_alloc.grant_id and consumed_by=new.match_id;
            if not found then raise exception 'Reward ownership mismatch' using errcode='55000'; end if;
        end if;
    end loop;
    return new;
end $$;
create trigger restore_shared_match_allocation after update of state on public.ranked_match_admissions
    for each row execute function public.restore_shared_match_allocation();

create function public.finish_shared_online_match(p_match_id uuid,p_owner_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_match public.ranked_match_admissions; v_lease timestamptz;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended('qg-ranked-admission:'||p_match_id::text,0));
    select * into v_match from public.ranked_match_admissions where match_id=p_match_id for update;
    if not found or v_match.owner_id is distinct from p_owner_id or v_match.admission_protocol<>'shared_v1'
        or v_match.queue_mode<>'random' then raise exception 'Invalid online admission' using errcode='42501'; end if;
    if v_match.state='settled' then return jsonb_build_object('state','settled','duplicate',true); end if;
    if v_match.state<>'active' then raise exception 'Online admission finalized' using errcode='55000'; end if;
    select expires_at into v_lease from public.ranked_server_leases where owner_id=p_owner_id for share;
    if not found or v_lease<=clock_timestamp() then raise exception 'Owner expired' using errcode='55000'; end if;
    update public.ranked_match_admissions set state='settled',finalized_at=clock_timestamp() where match_id=p_match_id;
    return jsonb_build_object('state','settled','duplicate',false);
end $$;
create function public.get_shared_match_ad_choice(p_user_id text,p_match_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_grant uuid;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    if (public.get_shared_match_entitlement(p_user_id)->>'noAds')::boolean then return null; end if;
    select grant_id into v_grant from public.verified_rewarded_ad_grants
        where user_id=p_user_id and purpose='online_ranked_match' and consumed_by is null
            and (target_key=p_match_id::text or exists(select 1 from public.ranked_match_admissions
                where match_id::text=target_key and state='voided'))
        order by verified_at,grant_id limit 1;
    return v_grant;
end $$;
create function public.shared_match_admission_protocol_version() returns integer
language plpgsql security invoker set search_path='' as $$
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    return 1;
end $$;

revoke all on function public.get_shared_match_entitlement(text),public.record_verified_rewarded_ad(uuid,text,text,text,text,text,text,timestamptz),
    public.issue_shared_match_consent(uuid,text,uuid,text,uuid),public.admit_shared_match(uuid,text,text,integer,uuid,text,jsonb,text,integer,integer),
    public.restore_shared_match_allocation(),public.finish_shared_online_match(uuid,uuid),public.get_shared_match_ad_choice(text,uuid),public.shared_match_admission_protocol_version()
    from public,anon,authenticated,service_role;
grant execute on function public.get_shared_match_entitlement(text),public.record_verified_rewarded_ad(uuid,text,text,text,text,text,text,timestamptz),
    public.issue_shared_match_consent(uuid,text,uuid,text,uuid),public.admit_shared_match(uuid,text,text,integer,uuid,text,jsonb,text,integer,integer),
    public.restore_shared_match_allocation(),public.finish_shared_online_match(uuid,uuid),public.get_shared_match_ad_choice(text,uuid),public.shared_match_admission_protocol_version() to service_role;
notify pgrst,'reload schema';
commit;
