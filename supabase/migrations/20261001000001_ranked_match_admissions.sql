begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- T1, unpublished. Apply only after the ticket and ranked-settlement migrations.
-- Epochs cannot be revived after expiry. Clients have no access to this ledger.
create table public.ranked_server_leases (
    owner_id uuid primary key,
    expires_at timestamptz not null
);
create table public.ranked_match_admissions (
    match_id uuid primary key,
    metadata_hash bytea,
    host_id text,
    joiner_id text,
    human_ids text[] not null default '{}',
    time_control integer,
    cpu_id text,
    cpu_rating integer,
    cpu_level integer,
    owner_id uuid not null,
    state text not null check (state in ('active','settled','voided','rejected')),
    reason text,
    admitted_at timestamptz not null default clock_timestamp(),
    finalized_at timestamptz,
    check (metadata_hash is null or octet_length(metadata_hash)=32)
);
create index ranked_admissions_active_users on public.ranked_match_admissions using gin(human_ids) where state='active';
create index ranked_admissions_active_owner on public.ranked_match_admissions(owner_id) where state='active';

-- Refunds are uncapped credits, not wallet grants. A refund used by an aborted
-- match becomes available again; it never creates an additional refund.
create table public.ranked_ticket_refunds (
    source_match_id uuid not null references public.ranked_match_admissions(match_id),
    user_id text not null references public.profiles(id) on delete cascade,
    pool text not null check (pool in ('free','paid')),
    subscription_id text,
    expires_at timestamptz,
    spent_by uuid,
    created_at timestamptz not null default clock_timestamp(),
    primary key(source_match_id,user_id),
    check ((pool='free' and subscription_id is null and expires_at is null)
        or (pool='paid' and subscription_id is not null and expires_at is not null))
);
create index ranked_refunds_available on public.ranked_ticket_refunds(user_id,created_at) where spent_by is null;
create table public.ranked_match_allocations (
    match_id uuid not null references public.ranked_match_admissions(match_id),
    user_id text not null references public.profiles(id) on delete cascade,
    pool text not null check(pool in ('quota','free','paid')),
    utc_day date not null,
    subscription_id text,
    expires_at timestamptz,
    refund_origin uuid,
    primary key(match_id,user_id)
);
alter table public.ranked_server_leases enable row level security;
alter table public.ranked_match_admissions enable row level security;
alter table public.ranked_ticket_refunds enable row level security;
alter table public.ranked_match_allocations enable row level security;
revoke all on public.ranked_server_leases,public.ranked_match_admissions,
    public.ranked_ticket_refunds,public.ranked_match_allocations from public,anon,authenticated,service_role;
grant select,insert,update on public.ranked_server_leases,public.ranked_match_admissions,
    public.ranked_ticket_refunds to service_role;
grant select,insert on public.ranked_match_allocations to service_role;

create function public.renew_ranked_server_lease(p_owner_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_expiry timestamptz;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    if p_owner_id is null then raise exception 'Owner required' using errcode='22023'; end if;
    insert into public.ranked_server_leases values(p_owner_id,clock_timestamp()+interval '20 seconds')
        on conflict(owner_id) do nothing;
    select expires_at into v_expiry from public.ranked_server_leases where owner_id=p_owner_id for update;
    if v_expiry<=clock_timestamp() then return false; end if;
    update public.ranked_server_leases set expires_at=clock_timestamp()+interval '20 seconds' where owner_id=p_owner_id;
    return true;
end $$;

-- Exactly one sorted human set, including CPU on either side. The match UUID
-- binds every immutable field, including the CPU profile and owning epoch.
create function public.admit_ranked_match(
    p_match_id uuid,p_host_id text,p_joiner_id text,p_time_control integer,
    p_owner_id uuid,p_cpu_id text default null,p_cpu_rating integer default null,p_cpu_level integer default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
    v_hash bytea; v_existing public.ranked_match_admissions; v_users text[]; v_user text;
    v_wallet public.ticket_wallets; v_pool text; v_refund public.ranked_ticket_refunds;
    v_active_count integer; v_subscription text; v_period_end timestamptz;
    v_started timestamptz; v_day date; v_quota integer; v_reason text;
    v_entries jsonb:='[]'; v_entry jsonb; v_lease timestamptz;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    if p_match_id is null or p_owner_id is null or p_host_id is null or p_joiner_id is null
        or p_host_id=p_joiner_id or p_time_control is null or p_time_control not in (10,180,600) then
        raise exception 'Invalid ranked metadata' using errcode='22023';
    end if;
    if p_cpu_id is null then
        if p_cpu_rating is not null or p_cpu_level is not null then
            raise exception 'Unexpected CPU metadata' using errcode='22023'; end if;
        v_users:=array[p_host_id,p_joiner_id];
    else
        if p_cpu_id<>'ai:'||p_match_id::text or (p_cpu_id=p_host_id)=(p_cpu_id=p_joiner_id)
            or p_cpu_rating is null or p_cpu_rating not between 0 and 10000
            or p_cpu_level is null or p_cpu_level not between 1 and 100 then
            raise exception 'Invalid CPU metadata' using errcode='22023'; end if;
        v_users:=case when p_cpu_id=p_host_id then array[p_joiner_id] else array[p_host_id] end;
    end if;
    select array_agg(x order by x collate "C") into v_users from unnest(v_users) x;
    foreach v_user in array v_users loop
        if v_user='' or v_user<>btrim(v_user) or octet_length(v_user)>256 or v_user~'[[:cntrl:]]'
            or v_user~*'^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)' then
            raise exception 'Invalid ranked human' using errcode='22023'; end if;
    end loop;
    v_hash:=sha256(convert_to(jsonb_build_object('host',p_host_id,'joiner',p_joiner_id,
        'time',p_time_control,'cpu',p_cpu_id,'rating',p_cpu_rating,'level',p_cpu_level)::text,'UTF8'));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qg-ranked-admission:'||p_match_id::text,0));
    select * into v_existing from public.ranked_match_admissions where match_id=p_match_id for update;
    if found then
        if v_existing.metadata_hash is not null and (v_existing.metadata_hash<>v_hash or v_existing.owner_id<>p_owner_id) then
            raise exception 'Match UUID metadata mismatch' using errcode='22023'; end if;
        return jsonb_build_object('success',v_existing.state in ('active','settled'),'duplicate',true,
            'state',v_existing.state,'reason',v_existing.reason);
    end if;
    if exists(select 1 from public.ranked_match_settlements where match_id=p_match_id) then
        raise exception 'Match UUID already settled' using errcode='22023'; end if;
    select expires_at into v_lease from public.ranked_server_leases where owner_id=p_owner_id for share;
    if not found or v_lease<=clock_timestamp() then raise exception 'Ranked owner expired' using errcode='55000'; end if;

    -- Same profile -> wallet lock order as grant, hint, settlement and deletion.
    foreach v_user in array v_users loop
        perform 1 from public.profiles where id=v_user for update;
        if not found or exists(select 1 from public.account_deletion_jobs where user_id=v_user and phase<>'completed')
            or exists(select 1 from public.account_restrictions where user_id=v_user and blocked)
            or not exists(select 1 from public.account_terms_consents where user_id=v_user and version='2026-09-25.1') then
            raise exception 'Ticket account unavailable' using errcode='42501'; end if;
        if exists(select 1 from public.ranked_match_admissions where state='active' and human_ids @> array[v_user]) then
            v_reason:='ACCOUNT_BUSY'; end if;
    end loop;
    foreach v_user in array v_users loop
        insert into public.ticket_wallets(user_id) values(v_user) on conflict(user_id) do nothing;
        perform 1 from public.ticket_wallets where user_id=v_user for update;
    end loop;
    v_started:=clock_timestamp(); v_day:=(v_started at time zone 'UTC')::date;
    if v_reason is null then
        foreach v_user in array v_users loop
            select * into v_wallet from public.ticket_wallets where user_id=v_user;
            select count(*),min(m.subscription_id),min(m.period_end) into v_active_count,v_subscription,v_period_end
                from public.stripe_memberships m
                join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
                join public.stripe_customer_links l on l.customer_id=m.customer_id
                where m.user_id=v_user and i.user_id=v_user and l.user_id=v_user
                    and m.status='active' and m.period_end>v_started and m.refund_blocked_until is null
                    and m.current_price_id=i.price_id and i.livemode
                    and i.price_id='price_1ULM9fQWzwYDIuXWgs5Uj3yt';
            if v_active_count>1 then raise exception 'Ambiguous paid entitlement' using errcode='23505'; end if;
            select count(*) into v_quota from public.ticket_spend_receipts
                where user_id=v_user and event_kind='ranked_match_start' and pool='quota'
                    and spent_at>=v_day::timestamp at time zone 'UTC'
                    and spent_at<(v_day+1)::timestamp at time zone 'UTC';
            v_refund:=null;
            if v_quota>=3 then
                select * into v_refund from public.ranked_ticket_refunds
                    where user_id=v_user and spent_by is null and (pool='free'
                        or (pool='paid' and subscription_id=v_subscription and expires_at>v_started))
                    order by case pool when 'free' then 0 else 1 end,created_at,source_match_id limit 1 for update;
            end if;
            v_pool:=case when v_quota<3 then 'quota' when v_refund.source_match_id is not null then v_refund.pool
                when v_wallet.ranked_tickets>0 then 'free'
                when v_subscription is not null and v_wallet.member_ticket_subscription_id=v_subscription
                    and v_wallet.member_ranked_tickets>0 then 'paid' else null end;
            if v_pool is null then v_reason:='INSUFFICIENT_FUNDS'; exit; end if;
            v_entries:=v_entries||jsonb_build_array(jsonb_build_object('userId',v_user,'pool',v_pool,
                'subscription',case when v_pool='paid' then coalesce(v_refund.subscription_id,v_subscription) end,
                'expiry',case when v_pool='paid' then coalesce(v_refund.expires_at,v_period_end) end,
                'refund',v_refund.source_match_id));
        end loop;
    end if;
    if v_lease<=clock_timestamp() then raise exception 'Ranked owner expired' using errcode='55000'; end if;
    insert into public.ranked_match_admissions(match_id,metadata_hash,host_id,joiner_id,human_ids,time_control,
        cpu_id,cpu_rating,cpu_level,owner_id,state,reason,admitted_at,finalized_at)
        values(p_match_id,v_hash,p_host_id,p_joiner_id,v_users,p_time_control,p_cpu_id,p_cpu_rating,p_cpu_level,p_owner_id,
            case when v_reason is null then 'active' else 'rejected' end,v_reason,v_started,
            case when v_reason is not null then clock_timestamp() end);
    if v_reason is not null then return jsonb_build_object('success',false,'state','rejected','reason',v_reason,'duplicate',false); end if;
    for v_entry in select value from jsonb_array_elements(v_entries) loop
        v_user:=v_entry->>'userId'; v_pool:=v_entry->>'pool';
        if v_entry->>'refund' is not null then
            update public.ranked_ticket_refunds set spent_by=p_match_id
                where source_match_id=(v_entry->>'refund')::uuid and user_id=v_user and spent_by is null;
            if not found then raise exception 'Refund changed' using errcode='55000'; end if;
        elsif v_pool='free' then
            update public.ticket_wallets set ranked_tickets=ranked_tickets-1 where user_id=v_user;
        elsif v_pool='paid' then
            update public.ticket_wallets set member_ranked_tickets=member_ranked_tickets-1 where user_id=v_user;
        end if;
        insert into public.ticket_spend_receipts(event_kind,event_id,user_id,pool,spent_at)
            values('ranked_match_start',p_match_id,v_user,v_pool,v_started);
        insert into public.ranked_match_allocations(match_id,user_id,pool,utc_day,subscription_id,expires_at,refund_origin)
            values(p_match_id,v_user,v_pool,v_day,v_entry->>'subscription',(v_entry->>'expiry')::timestamptz,(v_entry->>'refund')::uuid);
    end loop;
    return jsonb_build_object('success',true,'state','active','duplicate',false,'entries',v_entries);
end $$;
revoke all on function public.renew_ranked_server_lease(uuid),public.admit_ranked_match(uuid,text,text,integer,uuid,text,integer,integer)
    from public,anon,authenticated,service_role;
grant execute on function public.renew_ranked_server_lease(uuid),public.admit_ranked_match(uuid,text,text,integer,uuid,text,integer,integer)
    to service_role;
commit;
