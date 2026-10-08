begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Unreleased migration repaired before its first deployment. Preserve every
-- existing balance and provenance; the limit is a JSON/JavaScript arithmetic
-- safety bound, not a product holding cap. SMALLINT cannot hold uncapped stock.
alter table public.ticket_wallets
    drop constraint ticket_wallets_ranked_tickets_check,
    alter column ranked_tickets type bigint,
    drop constraint ticket_wallets_hint_tickets_check,
    alter column hint_tickets type bigint,
    drop constraint ticket_wallets_member_ranked_tickets_check,
    alter column member_ranked_tickets type bigint,
    drop constraint ticket_wallets_member_hint_tickets_check,
    alter column member_hint_tickets type bigint,
    drop constraint ticket_wallets_test_member_ranked_tickets_check,
    alter column test_member_ranked_tickets type bigint,
    drop constraint ticket_wallets_test_member_hint_tickets_check,
    alter column test_member_hint_tickets type bigint;
alter table public.ticket_wallets
    add constraint ticket_wallets_ranked_tickets_check check (ranked_tickets between 0 and 9007199254740991),
    add constraint ticket_wallets_hint_tickets_check check (hint_tickets between 0 and 9007199254740991),
    add constraint ticket_wallets_member_ranked_tickets_check check (member_ranked_tickets between 0 and 9007199254740991),
    add constraint ticket_wallets_member_hint_tickets_check check (member_hint_tickets between 0 and 9007199254740991),
    add constraint ticket_wallets_test_member_ranked_tickets_check check (test_member_ranked_tickets between 0 and 9007199254740991),
    add constraint ticket_wallets_test_member_hint_tickets_check check (test_member_hint_tickets between 0 and 9007199254740991);

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
                then case when v_wallet.streak_days = 7 then 1 else v_wallet.streak_days + 1 end
            else 1
        end;
        -- Seven-day cycle; a missed UTC day resets to day one.
        v_ranked_reward := case when v_streak <= 2 then 1 when v_streak <= 4 then 2 else 3 end;
        v_hint_reward := case when v_streak = 7 then 1 else 0 end;
        if v_wallet.ranked_tickets > 9007199254740991 - v_ranked_reward
            or v_wallet.hint_tickets > 9007199254740991 - v_hint_reward then
            raise exception 'Wallet arithmetic limit' using errcode='22003';
        end if;
        v_ranked_credit := v_ranked_reward;
        v_hint_credit := v_hint_reward;
        update public.ticket_wallets set
            last_claim_utc_day = v_today,
            streak_days = v_streak,
            ranked_tickets = ranked_tickets + v_ranked_credit,
            hint_tickets = hint_tickets + v_hint_credit
        where user_id = p_user_id returning * into v_wallet;
    end if;

    return jsonb_build_object(
        'userId', p_user_id, 'rewardPolicyVersion', 2,
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
        'userId', p_user_id, 'rewardPolicyVersion', 2,
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

-- Preserve the existing $2.99 daily benefit (3+3, cap 60) until its own
-- migration policy is approved. Above-60 stored values must never be debited
-- by a grant, so clamp the credit at zero rather than applying a negative one.
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
        v_ranked_credit := greatest(0, least(60 - v_wallet.test_member_ranked_tickets, 3));
        v_hint_credit := greatest(0, least(60 - v_wallet.test_member_hint_tickets, 3));
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
        v_ranked_credit := greatest(0, least(60 - v_wallet.member_ranked_tickets, 3));
        v_hint_credit := greatest(0, least(60 - v_wallet.member_hint_tickets, 3));
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

create or replace function public.restore_cpu_hint_credit(p_receipt_id uuid,p_user_id text,p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_receipt public.cpu_hint_receipts; v_credit integer:=0;
begin
    perform public.cpu_practice_assert_account(p_user_id);
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qg-cpu-hint-credit:'||p_receipt_id::text,0));
    select * into v_receipt from public.cpu_hint_receipts where request_id=p_receipt_id and user_id=p_user_id;
    if not found or p_reason is distinct from 'unrecoverable_delivery'
    then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
    if exists(select 1 from public.cpu_hint_restorations where receipt_id=p_receipt_id) then return 0; end if;
    perform 1 from public.ticket_wallets where user_id=p_user_id for update;
    if v_receipt.pool='free' then
        update public.ticket_wallets set hint_tickets=hint_tickets+1 where user_id=p_user_id and hint_tickets<9007199254740991;
        if found then v_credit:=1; end if;
    elsif exists(select 1 from public.stripe_memberships m
        join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
        join public.stripe_customer_links l on l.customer_id=m.customer_id
        where m.subscription_id=v_receipt.subscription_id and m.user_id=p_user_id and i.user_id=p_user_id and l.user_id=p_user_id
            and m.status='active' and m.period_end>clock_timestamp() and m.refund_blocked_until is null
            and m.current_price_id=i.price_id and i.livemode and i.price_id='price_1ULM9fQWzwYDIuXWgs5Uj3yt') then
        update public.ticket_wallets set member_hint_tickets=member_hint_tickets+1 where user_id=p_user_id
            and member_ticket_subscription_id=v_receipt.subscription_id and member_hint_tickets<9007199254740991;
        if found then v_credit:=1; end if;
    end if;
    insert into public.cpu_hint_restorations(receipt_id,reason,credited) values(p_receipt_id,p_reason,v_credit);
    return v_credit;
end $$;

create function public.daily_login_reward_protocol_version() returns integer
language plpgsql stable security invoker set search_path='' as $$
begin
    if current_user <> 'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    return 2;
end $$;
revoke all on function public.daily_login_reward_protocol_version(),
    public.claim_daily_login_reward(text),public.daily_login_reward_status(text),
    public.claim_stripe_member_daily_grant(text),public.claim_stripe_live_member_daily_grant(text),
    public.restore_cpu_hint_credit(uuid,text,text) from public,anon,authenticated;
grant execute on function public.daily_login_reward_protocol_version(),
    public.claim_daily_login_reward(text),public.daily_login_reward_status(text),
    public.claim_stripe_member_daily_grant(text),public.claim_stripe_live_member_daily_grant(text),
    public.restore_cpu_hint_credit(uuid,text,text) to service_role;

-- Deliberately do not replace ranked admission or add 'ad'/'sub' receipt pools.
-- Provider verification and the new admission/consent protocol are not ready.
-- The existing server feature flags continue to keep ticket enforcement OFF.
notify pgrst, 'reload schema';
commit;
