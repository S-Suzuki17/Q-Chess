begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Test-mode rewards are not purchases, but they still must not survive a
-- canceled/refunded subscription or migrate onto a new subscription.
alter table public.ticket_wallets add column test_member_ticket_subscription_id text
    check (test_member_ticket_subscription_id is null
        or test_member_ticket_subscription_id ~ '^sub_[A-Za-z0-9]+$');
-- Existing unbound test rewards have no provable subscription owner. Discard
-- only this test pool; free and live paid balances remain untouched.
update public.ticket_wallets set test_member_ranked_tickets = 0,
    test_member_hint_tickets = 0
where test_member_ranked_tickets <> 0 or test_member_hint_tickets <> 0;
alter table public.ticket_wallets add constraint test_member_tickets_bound_check check (
    (test_member_ranked_tickets = 0 and test_member_hint_tickets = 0)
    or test_member_ticket_subscription_id is not null);
comment on column public.ticket_wallets.test_member_ticket_subscription_id is
    'Test-mode ticket pool owner. A terminal event from an older subscription cannot clear a newer pool.';

-- The existing AFTER INSERT/UPDATE trigger keeps its name and points to this
-- replaced function. It only clears balances bound to the changed subscription.
create or replace function public.expire_stripe_member_tickets_on_projection()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
    v_live boolean;
    v_price text;
    v_expired boolean;
begin
    select livemode, price_id into v_live, v_price
    from public.stripe_checkout_intents where checkout_id = new.checkout_id;
    if not found then
        raise exception 'Missing registered Stripe checkout for membership';
    end if;
    v_expired := new.status in ('canceled', 'incomplete_expired', 'refunded')
        or new.refund_blocked_until is not null
        or new.current_price_id <> v_price;
    if v_expired then
        if v_live then
            update public.ticket_wallets set member_ranked_tickets = 0,
                member_hint_tickets = 0, member_ticket_subscription_id = null
            where user_id = new.user_id
                and member_ticket_subscription_id = new.subscription_id;
        else
            update public.ticket_wallets set test_member_ranked_tickets = 0,
                test_member_hint_tickets = 0,
                test_member_ticket_subscription_id = null
            where user_id = new.user_id
                and test_member_ticket_subscription_id = new.subscription_id;
        end if;
    end if;
    return new;
end $$;

create or replace function public.stripe_member_status(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_wallet public.ticket_wallets;
    v_period_end timestamptz;
    v_subscription_id text;
    v_count integer;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_user_id is null or length(p_user_id) not between 1 and 256
        or not exists (select 1 from public.profiles where id = p_user_id)
        or exists (select 1 from public.account_deletion_jobs
            where user_id = p_user_id and phase <> 'completed')
        or exists (select 1 from public.account_restrictions
            where user_id = p_user_id and blocked) then
        raise exception 'Membership account unavailable' using errcode = '42501';
    end if;
    select count(*), min(m.subscription_id), max(m.period_end)
    into v_count, v_subscription_id, v_period_end
    from public.stripe_memberships m
    join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
    where m.user_id = p_user_id and m.status = 'active'
        and m.period_end > clock_timestamp() and m.refund_blocked_until is null
        and m.current_price_id = i.price_id and not i.livemode;
    if v_count <> 1 then
        v_subscription_id := null;
        v_period_end := null;
    end if;
    select * into v_wallet from public.ticket_wallets where user_id = p_user_id;
    return jsonb_build_object(
        'userId', p_user_id, 'active', v_period_end is not null,
        'periodEnd', v_period_end,
        'lastGrantUtcDay', to_char(v_wallet.last_member_grant_utc_day, 'YYYY-MM-DD'),
        'tickets', jsonb_build_object(
            'ranked', case when v_subscription_id = v_wallet.test_member_ticket_subscription_id
                then coalesce(v_wallet.test_member_ranked_tickets, 0) else 0 end,
            'hint', case when v_subscription_id = v_wallet.test_member_ticket_subscription_id
                then coalesce(v_wallet.test_member_hint_tickets, 0) else 0 end),
        'freeTickets', jsonb_build_object(
            'ranked', coalesce(v_wallet.ranked_tickets, 0),
            'hint', coalesce(v_wallet.hint_tickets, 0))
    );
end $$;

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
        or not exists (select 1 from public.account_terms_consents
            where user_id = p_user_id and version = '2026-09-25.1') then
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
        v_ranked_credit := least(20 - v_wallet.test_member_ranked_tickets, 3);
        v_hint_credit := least(20 - v_wallet.test_member_hint_tickets, 3);
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

commit;
