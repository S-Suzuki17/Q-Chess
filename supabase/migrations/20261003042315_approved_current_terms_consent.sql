begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Owner-approved document; publication day is deliberately UNSET. Release owner
-- sets the same actual JST publication date here and in currentTerms.ts.
create table public.current_terms_policy (
    singleton boolean primary key default true check (singleton),
    version text not null check (version = '2026-10-03.1'),
    effective_date date
);
insert into public.current_terms_policy(singleton,version,effective_date) values(true,'2026-10-03.1',null);
alter table public.current_terms_policy enable row level security;
revoke all on public.current_terms_policy from public,anon,authenticated,service_role;
grant select on public.current_terms_policy to service_role;
comment on table public.current_terms_policy is 'Publication control, not a feature flag. No API role can activate it. Legacy terms stay immutable.';

create function public.current_account_terms_status(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_policy public.current_terms_policy;
    v_accepted timestamptz;
    v_effective boolean;
begin
    if current_user <> 'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    if p_user_id is null or length(p_user_id) not between 1 and 256 then raise exception 'Invalid account' using errcode='22023'; end if;
    select * into strict v_policy from public.current_terms_policy where singleton;
    v_effective := v_policy.effective_date is not null
        and v_policy.effective_date <= (clock_timestamp() at time zone 'Asia/Tokyo')::date;
    select accepted_at into v_accepted from public.account_terms_consents
        where user_id=p_user_id and version=v_policy.version
        and accepted_at >= (v_policy.effective_date::timestamp at time zone 'Asia/Tokyo');
    return jsonb_build_object('userId',p_user_id,'currentVersion',v_policy.version,
        'effectiveDate',to_char(v_policy.effective_date,'YYYY-MM-DD'),'effective',v_effective,
        'consent',case when v_accepted is null then null else
            jsonb_build_object('version',v_policy.version,'acceptedAt',v_accepted) end);
end $$;

create function public.has_current_ticket_terms(p_user_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_status jsonb;
begin
    v_status := public.current_account_terms_status(p_user_id);
    return (v_status->>'effective')::boolean and v_status->'consent' <> 'null'::jsonb;
end $$;

create function public.accept_current_account_terms(p_user_id text,p_version text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_status jsonb;
begin
    if current_user <> 'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    if p_user_id is null or length(p_user_id) not between 1 and 256 then raise exception 'Invalid account' using errcode='22023'; end if;
    perform 1 from public.profiles where id=p_user_id for update;
    if not found or exists(select 1 from public.account_deletion_jobs where user_id=p_user_id and phase<>'completed')
        or exists(select 1 from public.account_restrictions where user_id=p_user_id and blocked) then
        raise exception 'Account unavailable' using errcode='42501';
    end if;
    v_status := public.current_account_terms_status(p_user_id);
    if p_version is distinct from v_status->>'currentVersion' or not (v_status->>'effective')::boolean then
        raise exception 'Current terms not effective' using errcode='42501';
    end if;
    -- Server timestamp only. Retry never changes the original acceptance record.
    insert into public.account_terms_consents(user_id,version) values(p_user_id,p_version)
        on conflict(user_id,version) do nothing;
    return public.current_account_terms_status(p_user_id);
end $$;
revoke all on function public.current_account_terms_status(text),public.has_current_ticket_terms(text),
    public.accept_current_account_terms(text,text) from public,anon,authenticated,service_role;
grant execute on function public.current_account_terms_status(text),public.has_current_ticket_terms(text),
    public.accept_current_account_terms(text,text) to service_role;

-- Replace only the consent predicate in the latest claim/checkout bodies.
-- Existing locking, free20/paid60, idempotency, binding and refund behavior remain.

-- Previous definition: 20260930083253_ticket_wallet_daily_login.sql
create or replace function public.claim_daily_login_reward(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_wallet public.ticket_wallets;
    v_today date;
    v_streak integer;
    v_ranked_reward integer;
    v_hint_reward integer;
    v_ranked_credit integer := 0;
    v_hint_credit integer := 0;
    v_claimed boolean := false;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_user_id is null or length(p_user_id) not between 1 and 256
        or octet_length(convert_to(p_user_id, 'UTF8')) > 256 then
        raise exception 'Invalid reward account' using errcode = '22023';
    end if;

    perform 1 from public.profiles where id = p_user_id for update;
    if not found
        or exists (select 1 from public.account_deletion_jobs
            where user_id = p_user_id and phase <> 'completed')
        or exists (select 1 from public.account_restrictions
            where user_id = p_user_id and blocked)
        or not public.has_current_ticket_terms(p_user_id) then
        raise exception 'Reward account unavailable' using errcode = '42501';
    end if;

    v_today := (clock_timestamp() at time zone 'UTC')::date;
    insert into public.ticket_wallets (user_id) values (p_user_id)
        on conflict (user_id) do nothing;
    select * into v_wallet from public.ticket_wallets where user_id = p_user_id for update;
    if not found or v_wallet.last_claim_utc_day > v_today then
        raise exception 'Invalid reward state' using errcode = '22023';
    end if;

    if v_wallet.last_claim_utc_day is distinct from v_today then
        v_claimed := true;
        v_streak := case
            when v_wallet.last_claim_utc_day = v_today - 1
                then least(7, v_wallet.streak_days + 1)
            else 1
        end;
        -- Days 1-7: ranked [1,1,1,2,2,2,3], CPU hint [2,2,3,3,4,4,5].
        -- Day 7 repeats, while each unspent balance is capped at 20.
        v_ranked_reward := case when v_streak <= 3 then 1 when v_streak <= 6 then 2 else 3 end;
        v_hint_reward := case when v_streak <= 2 then 2 when v_streak <= 4 then 3
            when v_streak <= 6 then 4 else 5 end;
        v_ranked_credit := least(20 - v_wallet.ranked_tickets, v_ranked_reward);
        v_hint_credit := least(20 - v_wallet.hint_tickets, v_hint_reward);
        update public.ticket_wallets set
            last_claim_utc_day = v_today,
            streak_days = v_streak,
            ranked_tickets = ranked_tickets + v_ranked_credit,
            hint_tickets = hint_tickets + v_hint_credit
        where user_id = p_user_id returning * into v_wallet;
    end if;

    return jsonb_build_object(
        'userId', p_user_id,
        'enabled', true,
        'streakDays', v_wallet.streak_days,
        'tickets', jsonb_build_object(
            'ranked', v_wallet.ranked_tickets,
            'hint', v_wallet.hint_tickets),
        'lastClaimUtcDay', to_char(v_wallet.last_claim_utc_day, 'YYYY-MM-DD'),
        'credited', jsonb_build_object('ranked', v_ranked_credit, 'hint', v_hint_credit),
        'claimed', v_claimed
    );
end $$;

-- Previous definition: 20260930095339_stripe_membership_entitlements.sql
create or replace function public.stripe_checkout_preflight(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_reason text;
    v_pending public.stripe_checkout_intents;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_user_id is null or length(p_user_id) not between 1 and 256
        or octet_length(convert_to(p_user_id, 'UTF8')) > 256
        or p_user_id ~* '^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)' then
        raise exception 'Invalid Checkout account' using errcode = '22023';
    end if;
    perform 1 from public.profiles where id = p_user_id for update;
    if not found or exists (select 1 from public.account_deletion_jobs
        where user_id = p_user_id and phase <> 'completed')
        or exists (select 1 from public.account_restrictions
            where user_id = p_user_id and blocked)
        or not public.has_current_ticket_terms(p_user_id) then
        raise exception 'Checkout account unavailable' using errcode = '42501';
    end if;
    if exists (select 1 from public.stripe_memberships
        where user_id = p_user_id and status not in ('canceled', 'incomplete_expired')) then
        v_reason := 'subscription_unresolved';
    else
        select * into v_pending from public.stripe_checkout_intents i
        where i.user_id = p_user_id and i.closed_at is null
            and not exists (select 1 from public.stripe_memberships m
                where m.checkout_id = i.checkout_id)
        order by i.created_at limit 1;
        if found then v_reason := 'checkout_pending'; end if;
    end if;
    return jsonb_build_object('eligible', v_reason is null, 'reason', v_reason,
        'checkoutId', case when v_reason = 'checkout_pending' then v_pending.checkout_id else null end,
        'expiresAt', case when v_reason = 'checkout_pending' then v_pending.expires_at else null end);
end $$;

-- Previous definition: 20260930095339_stripe_membership_entitlements.sql
create or replace function public.register_stripe_checkout_intent(
    p_user_id text, p_checkout_id text, p_price_id text,
    p_livemode boolean, p_expires_at timestamptz
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_intent public.stripe_checkout_intents;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_user_id is null or length(p_user_id) not between 1 and 256
        or octet_length(convert_to(p_user_id, 'UTF8')) > 256
        or p_user_id ~* '^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)'
        or p_checkout_id is null or p_checkout_id !~ '^cs_test_[A-Za-z0-9]+$'
        or p_price_id is null or p_price_id !~ '^price_[A-Za-z0-9]+$'
        or p_livemode is distinct from false or p_expires_at is null
        or p_expires_at <= clock_timestamp()
        or p_expires_at > clock_timestamp() + interval '2 days' then
        raise exception 'Invalid Checkout registration' using errcode = '22023';
    end if;
    perform 1 from public.profiles where id = p_user_id for update;
    if not found or exists (select 1 from public.account_deletion_jobs
        where user_id = p_user_id and phase <> 'completed')
        or exists (select 1 from public.account_restrictions
            where user_id = p_user_id and blocked)
        or not public.has_current_ticket_terms(p_user_id) then
        raise exception 'Checkout account unavailable' using errcode = '42501';
    end if;
    select * into v_intent from public.stripe_checkout_intents
        where checkout_id = p_checkout_id for update;
    if found then
        if v_intent.user_id <> p_user_id or v_intent.price_id <> p_price_id
            or v_intent.livemode or v_intent.expires_at <> p_expires_at then
            raise exception 'Checkout registration collision' using errcode = '23505';
        end if;
        return;
    end if;
    if exists (select 1 from public.stripe_memberships
        where user_id = p_user_id and status not in ('canceled', 'incomplete_expired'))
        or exists (select 1 from public.stripe_checkout_intents i
            where i.user_id = p_user_id and i.closed_at is null
                and not exists (select 1 from public.stripe_memberships m
                    where m.checkout_id = i.checkout_id)) then
        raise exception 'Checkout already pending or subscription unresolved' using errcode = '42501';
    end if;
    insert into public.stripe_checkout_intents(checkout_id, user_id, price_id, livemode, expires_at)
        values(p_checkout_id, p_user_id, p_price_id, false, p_expires_at);
end $$;

-- Previous definition: 20260930123817_stripe_live_membership_allowlist.sql
create or replace function public.stripe_live_checkout_preflight(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_reason text;
    v_pending public.stripe_checkout_intents;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_user_id is null or length(p_user_id) not between 1 and 256
        or octet_length(convert_to(p_user_id, 'UTF8')) > 256
        or p_user_id ~* '^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)' then
        raise exception 'Invalid Checkout account' using errcode = '22023';
    end if;
    perform 1 from public.profiles where id = p_user_id for update;
    if not found or exists (select 1 from public.account_deletion_jobs
        where user_id = p_user_id and phase <> 'completed')
        or exists (select 1 from public.account_restrictions
            where user_id = p_user_id and blocked)
        or not public.has_current_ticket_terms(p_user_id) then
        raise exception 'Checkout account unavailable' using errcode = '42501';
    end if;
    if exists (select 1 from public.stripe_memberships m
        join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
        where m.user_id = p_user_id and i.livemode
            and m.status not in ('canceled', 'incomplete_expired')) then
        v_reason := 'subscription_unresolved';
    else
        select * into v_pending from public.stripe_checkout_intents i
        where i.user_id = p_user_id and i.livemode and i.closed_at is null
            and not exists (select 1 from public.stripe_memberships m
                where m.checkout_id = i.checkout_id)
        order by i.created_at limit 1;
        if found then v_reason := 'checkout_pending'; end if;
    end if;
    return jsonb_build_object('eligible', v_reason is null, 'reason', v_reason,
        'checkoutId', case when v_reason = 'checkout_pending' then v_pending.checkout_id else null end,
        'expiresAt', case when v_reason = 'checkout_pending' then v_pending.expires_at else null end);
end $$;

-- Previous definition: 20260930123817_stripe_live_membership_allowlist.sql
create or replace function public.register_stripe_live_checkout_intent(
    p_user_id text, p_checkout_id text, p_price_id text, p_expires_at timestamptz
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_intent public.stripe_checkout_intents;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_user_id is null or length(p_user_id) not between 1 and 256
        or octet_length(convert_to(p_user_id, 'UTF8')) > 256
        or p_user_id ~* '^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)'
        or p_checkout_id is null or p_checkout_id !~ '^cs_live_[A-Za-z0-9]+$'
        or p_price_id is distinct from 'price_1ULM9fQWzwYDIuXWgs5Uj3yt'
        or p_expires_at is null or p_expires_at <= clock_timestamp()
        or p_expires_at > clock_timestamp() + interval '2 days' then
        raise exception 'Invalid live Checkout registration' using errcode = '22023';
    end if;
    perform 1 from public.profiles where id = p_user_id for update;
    if not found or exists (select 1 from public.account_deletion_jobs
        where user_id = p_user_id and phase <> 'completed')
        or exists (select 1 from public.account_restrictions
            where user_id = p_user_id and blocked)
        or not public.has_current_ticket_terms(p_user_id) then
        raise exception 'Checkout account unavailable' using errcode = '42501';
    end if;
    select * into v_intent from public.stripe_checkout_intents
        where checkout_id = p_checkout_id for update;
    if found then
        if v_intent.user_id <> p_user_id or v_intent.price_id <> p_price_id
            or not v_intent.livemode or v_intent.expires_at <> p_expires_at then
            raise exception 'Checkout registration collision' using errcode = '23505';
        end if;
        return;
    end if;
    if exists (select 1 from public.stripe_memberships m
        join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
        where m.user_id = p_user_id and i.livemode
            and m.status not in ('canceled', 'incomplete_expired'))
        or exists (select 1 from public.stripe_checkout_intents i
            where i.user_id = p_user_id and i.livemode and i.closed_at is null
                and not exists (select 1 from public.stripe_memberships m
                    where m.checkout_id = i.checkout_id)) then
        raise exception 'Live Checkout already pending or subscription unresolved'
            using errcode = '42501';
    end if;
    insert into public.stripe_checkout_intents(
        checkout_id, user_id, price_id, livemode, expires_at
    ) values(p_checkout_id, p_user_id, p_price_id, true, p_expires_at);
end $$;

-- Previous definition: 20261003041000_member_ticket_cap_60.sql
create or replace function public.claim_stripe_member_daily_grant(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_wallet public.ticket_wallets;
    v_today date;
    v_period_end timestamptz;
    v_subscription_id text;
    v_count integer;
    v_ranked_credit integer := 0;
    v_hint_credit integer := 0;
    v_claimed boolean := false;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_user_id is null or length(p_user_id) not between 1 and 256 then
        raise exception 'Invalid membership account' using errcode = '22023';
    end if;
    perform 1 from public.profiles where id = p_user_id for update;
    if not found or exists (select 1 from public.account_deletion_jobs
        where user_id = p_user_id and phase <> 'completed')
        or exists (select 1 from public.account_restrictions
            where user_id = p_user_id and blocked)
        or not public.has_current_ticket_terms(p_user_id) then
        raise exception 'Membership account unavailable' using errcode = '42501';
    end if;
    select count(*), min(m.subscription_id), max(m.period_end)
    into v_count, v_subscription_id, v_period_end
    from public.stripe_memberships m
    join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
    where m.user_id = p_user_id and m.status = 'active'
        and m.period_end > clock_timestamp() and m.refund_blocked_until is null
        and m.current_price_id = i.price_id and not i.livemode;
    if v_count > 1 then
        raise exception 'Ambiguous test membership' using errcode = '23505';
    end if;
    v_today := (clock_timestamp() at time zone 'UTC')::date;
    insert into public.ticket_wallets(user_id) values(p_user_id)
        on conflict(user_id) do nothing;
    select * into v_wallet from public.ticket_wallets
        where user_id = p_user_id for update;
    if not found or v_wallet.last_member_grant_utc_day > v_today then
        raise exception 'Invalid membership wallet state' using errcode = '22023';
    end if;
    if v_period_end is null then
        -- Temporary payment problems suspend use; a terminal/refunded/off-
        -- price projection or elapsed paid period expires this test pool.
        if not exists (
            select 1 from public.stripe_memberships m
            join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
            where m.subscription_id = v_wallet.test_member_ticket_subscription_id
                and m.user_id = p_user_id and not i.livemode
                and m.current_price_id = i.price_id
                and m.status in ('incomplete', 'trialing', 'past_due', 'unpaid', 'paused')
                and m.period_end > clock_timestamp()
                and m.refund_blocked_until is null
        ) then
            update public.ticket_wallets set test_member_ranked_tickets = 0,
                test_member_hint_tickets = 0,
                test_member_ticket_subscription_id = null
            where user_id = p_user_id returning * into v_wallet;
        end if;
    elsif v_wallet.test_member_ticket_subscription_id is distinct from v_subscription_id then
        update public.ticket_wallets set test_member_ranked_tickets = 0,
            test_member_hint_tickets = 0,
            test_member_ticket_subscription_id = v_subscription_id
        where user_id = p_user_id returning * into v_wallet;
    end if;
    if v_period_end is not null and v_wallet.last_member_grant_utc_day is distinct from v_today then
        v_claimed := true;
        v_ranked_credit := least(60 - v_wallet.test_member_ranked_tickets, 3);
        v_hint_credit := least(60 - v_wallet.test_member_hint_tickets, 3);
        update public.ticket_wallets set
            last_member_grant_utc_day = v_today,
            test_member_ranked_tickets = test_member_ranked_tickets + v_ranked_credit,
            test_member_hint_tickets = test_member_hint_tickets + v_hint_credit
        where user_id = p_user_id returning * into v_wallet;
    end if;
    return jsonb_build_object(
        'userId', p_user_id, 'active', v_period_end is not null,
        'periodEnd', v_period_end,
        'lastGrantUtcDay', to_char(v_wallet.last_member_grant_utc_day, 'YYYY-MM-DD'),
        'tickets', jsonb_build_object(
            'ranked', case when v_period_end is not null
                and v_wallet.test_member_ticket_subscription_id = v_subscription_id
                then v_wallet.test_member_ranked_tickets else 0 end,
            'hint', case when v_period_end is not null
                and v_wallet.test_member_ticket_subscription_id = v_subscription_id
                then v_wallet.test_member_hint_tickets else 0 end),
        'freeTickets', jsonb_build_object(
            'ranked', v_wallet.ranked_tickets, 'hint', v_wallet.hint_tickets),
        'claimed', v_claimed,
        'credited', jsonb_build_object(
            'ranked', v_ranked_credit, 'hint', v_hint_credit)
    );
end $$;

-- Previous definition: 20261003041000_member_ticket_cap_60.sql
create or replace function public.claim_stripe_live_member_daily_grant(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_wallet public.ticket_wallets;
    v_today date;
    v_period_end timestamptz;
    v_subscription_id text;
    v_count integer;
    v_ranked_credit integer := 0;
    v_hint_credit integer := 0;
    v_claimed boolean := false;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_user_id is null or length(p_user_id) not between 1 and 256 then
        raise exception 'Invalid membership account' using errcode = '22023';
    end if;
    perform 1 from public.profiles where id = p_user_id for update;
    if not found or exists (select 1 from public.account_deletion_jobs
        where user_id = p_user_id and phase <> 'completed')
        or exists (select 1 from public.account_restrictions
            where user_id = p_user_id and blocked)
        or not public.has_current_ticket_terms(p_user_id) then
        raise exception 'Membership account unavailable' using errcode = '42501';
    end if;
    select count(*), min(m.subscription_id), max(m.period_end)
    into v_count, v_subscription_id, v_period_end
    from public.stripe_memberships m
    join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
    where m.user_id = p_user_id and m.status = 'active'
        and m.period_end > clock_timestamp() and m.refund_blocked_until is null
        and m.current_price_id = i.price_id and i.livemode
        and i.price_id = 'price_1ULM9fQWzwYDIuXWgs5Uj3yt';
    if v_count > 1 then
        raise exception 'Ambiguous live membership' using errcode = '23505';
    end if;
    v_today := (clock_timestamp() at time zone 'UTC')::date;
    insert into public.ticket_wallets(user_id) values(p_user_id)
        on conflict(user_id) do nothing;
    select * into v_wallet from public.ticket_wallets
        where user_id = p_user_id for update;
    if not found or v_wallet.last_live_member_grant_utc_day > v_today then
        raise exception 'Invalid membership wallet state' using errcode = '22023';
    end if;
    if v_period_end is null then
        -- A temporarily unpaid subscription with time remaining is suspended,
        -- not terminated. A silently elapsed period has no such protection.
        if not exists (
            select 1 from public.stripe_memberships m
            join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
            where m.subscription_id = v_wallet.member_ticket_subscription_id
                and m.user_id = p_user_id and i.livemode
                and i.price_id = 'price_1ULM9fQWzwYDIuXWgs5Uj3yt'
                and m.current_price_id = i.price_id
                and m.status in ('incomplete', 'trialing', 'past_due', 'unpaid', 'paused')
                and m.period_end > clock_timestamp()
                and m.refund_blocked_until is null
        ) then
            update public.ticket_wallets set member_ranked_tickets = 0,
                member_hint_tickets = 0, member_ticket_subscription_id = null
            where user_id = p_user_id returning * into v_wallet;
        end if;
    elsif v_wallet.member_ticket_subscription_id is distinct from v_subscription_id then
        update public.ticket_wallets set member_ranked_tickets = 0,
            member_hint_tickets = 0,
            member_ticket_subscription_id = v_subscription_id
        where user_id = p_user_id returning * into v_wallet;
    end if;
    if v_period_end is not null and v_wallet.last_live_member_grant_utc_day is distinct from v_today then
        v_claimed := true;
        v_ranked_credit := least(60 - v_wallet.member_ranked_tickets, 3);
        v_hint_credit := least(60 - v_wallet.member_hint_tickets, 3);
        update public.ticket_wallets set
            last_live_member_grant_utc_day = v_today,
            member_ranked_tickets = member_ranked_tickets + v_ranked_credit,
            member_hint_tickets = member_hint_tickets + v_hint_credit
        where user_id = p_user_id returning * into v_wallet;
    end if;
    return jsonb_build_object(
        'userId', p_user_id, 'active', v_period_end is not null,
        'periodEnd', v_period_end,
        'lastGrantUtcDay', to_char(v_wallet.last_live_member_grant_utc_day, 'YYYY-MM-DD'),
        'tickets', jsonb_build_object(
            'ranked', case when v_period_end is not null
                and v_wallet.member_ticket_subscription_id = v_subscription_id
                then v_wallet.member_ranked_tickets else 0 end,
            'hint', case when v_period_end is not null
                and v_wallet.member_ticket_subscription_id = v_subscription_id
                then v_wallet.member_hint_tickets else 0 end),
        'freeTickets', jsonb_build_object(
            'ranked', v_wallet.ranked_tickets, 'hint', v_wallet.hint_tickets),
        'claimed', v_claimed,
        'credited', jsonb_build_object(
            'ranked', v_ranked_credit, 'hint', v_hint_credit)
    );
end $$;

-- Previous definition: 20260930083253_ticket_wallet_daily_login.sql
create or replace function public.daily_login_reward_status(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_wallet public.ticket_wallets;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_user_id is null or length(p_user_id) not between 1 and 256
        or octet_length(convert_to(p_user_id, 'UTF8')) > 256 then
        raise exception 'Invalid reward account' using errcode = '22023';
    end if;
    if not exists (select 1 from public.profiles where id = p_user_id)
        or exists (select 1 from public.account_deletion_jobs
            where user_id = p_user_id and phase <> 'completed')
        or exists (select 1 from public.account_restrictions
            where user_id = p_user_id and blocked)
        -- Keep this version aligned with server/src/services/AccountTerms.ts.
        or not (exists (select 1 from public.account_terms_consents where user_id=p_user_id and version='2026-09-25.1') or public.has_current_ticket_terms(p_user_id)) then
        raise exception 'Reward account unavailable' using errcode = '42501';
    end if;
    select * into v_wallet from public.ticket_wallets where user_id = p_user_id;
    return jsonb_build_object(
        'userId', p_user_id,
        'enabled', true,
        'streakDays', coalesce(v_wallet.streak_days, 0),
        'tickets', jsonb_build_object(
            'ranked', coalesce(v_wallet.ranked_tickets, 0),
            'hint', coalesce(v_wallet.hint_tickets, 0)),
        'lastClaimUtcDay', to_char(v_wallet.last_claim_utc_day, 'YYYY-MM-DD'),
        'credited', jsonb_build_object('ranked', 0, 'hint', 0),
        'claimed', false
    );
end $$;

commit;
