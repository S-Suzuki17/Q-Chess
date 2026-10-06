-- Migration for new Stripe prices

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
        or p_price_id not in ('price_1UNTrJQWzwYDIuXWJn9XTiRW', 'price_1UNTrJQWzwYDIuXWtdNlAMnV', 'price_1UNTrQQWzwYDIuXWcVtcwG4E', 'price_1UNTrQQWzwYDIuXWIV6hySm7', 'price_1UNTrWQWzwYDIuXWw5V6sXJ7', 'price_1UNTrWQWzwYDIuXWkZ8dH9QB', 'price_1UNTrbQWzwYDIuXWzhEumZF2', 'price_1UNTrcQWzwYDIuXWuZzJ38iY')
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

create or replace function public.apply_stripe_live_membership_snapshot(
    p_event_id text, p_event_payload_hash text, p_event_type text, p_event_created bigint, p_observed_at timestamptz,
    p_subscription_id text, p_checkout_id text, p_customer_id text,
    p_user_id text, p_price_id text, p_status text, p_period_end timestamptz,
    p_paid_new_period boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_intent public.stripe_checkout_intents;
    v_link public.stripe_customer_links;
    v_member public.stripe_memberships;
    v_existing_hash text;
    v_hash text;
    v_block timestamptz;
    v_applied boolean := false;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$'
        or p_event_payload_hash is null or p_event_payload_hash !~ '^[a-f0-9]{64}$'
        or p_event_type is null or length(p_event_type) not between 1 and 128
        or p_event_created is null or p_event_created <= 0
        or p_observed_at is null or p_observed_at > clock_timestamp() + interval '10 minutes'
        or p_subscription_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9]+$'
        or p_checkout_id is null or p_checkout_id !~ '^cs_live_[A-Za-z0-9]+$'
        or p_customer_id is null or p_customer_id !~ '^cus_[A-Za-z0-9]+$'
        or p_user_id is null or length(p_user_id) not between 1 and 256
        or octet_length(convert_to(p_user_id, 'UTF8')) > 256
        or p_price_id is null or p_price_id !~ '^price_[A-Za-z0-9]+$'
        or p_status is null or p_status not in (
            'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due',
            'canceled', 'unpaid', 'paused', 'refunded')
        or (p_status = 'active' and p_period_end is null)
        or p_paid_new_period is null then
        raise exception 'Invalid Stripe snapshot' using errcode = '22023';
    end if;
    v_hash := p_event_payload_hash;

    -- Lock profile first, matching account deletion and daily-grant lock order.
    perform 1 from public.profiles where id = p_user_id for update;
    if not found or exists (select 1 from public.account_deletion_jobs
        where user_id = p_user_id and phase <> 'completed')
        or exists (select 1 from public.account_restrictions
            where user_id = p_user_id and blocked) then
        raise exception 'Membership account unavailable' using errcode = '42501';
    end if;
    select * into v_intent from public.stripe_checkout_intents
        where checkout_id = p_checkout_id for update;
    if not found or v_intent.user_id <> p_user_id or not v_intent.livemode
        or v_intent.price_id not in ('price_1UNTrJQWzwYDIuXWJn9XTiRW', 'price_1UNTrJQWzwYDIuXWtdNlAMnV')
        or v_intent.closed_at is not null then
        raise exception 'Unbound Checkout Session' using errcode = '42501';
    end if;

    select payload_hash into v_existing_hash from public.stripe_webhook_receipts
        where event_id = p_event_id for update;
    if found then
        if v_existing_hash <> v_hash then
            raise exception 'Stripe event collision' using errcode = '23505';
        end if;
        return jsonb_build_object('applied', false, 'duplicate', true);
    end if;

    insert into public.stripe_customer_links(customer_id, user_id)
        values(p_customer_id, p_user_id) on conflict(customer_id) do nothing;
    select * into v_link from public.stripe_customer_links
        where customer_id = p_customer_id for update;
    if not found or v_link.user_id <> p_user_id then
        raise exception 'Stripe customer belongs to another account' using errcode = '42501';
    end if;

    select * into v_member from public.stripe_memberships
        where subscription_id = p_subscription_id for update;
    if found and (v_member.checkout_id <> p_checkout_id
        or v_member.customer_id <> p_customer_id or v_member.user_id <> p_user_id) then
        raise exception 'Stripe subscription ownership changed' using errcode = '42501';
    end if;
    if not found then
        v_block := case when p_status = 'refunded'
            then coalesce(p_period_end, 'infinity'::timestamptz) else null end;
        insert into public.stripe_memberships(
            subscription_id, checkout_id, customer_id, user_id,
            current_price_id, status, period_end, refund_blocked_until, event_created, observed_at
        ) values(
            p_subscription_id, p_checkout_id, p_customer_id, p_user_id,
            p_price_id, p_status, p_period_end, v_block, p_event_created, p_observed_at
        );
        v_applied := true;
    elsif p_event_created > v_member.event_created then
        v_block := v_member.refund_blocked_until;
        if p_status = 'refunded' then
            v_block := greatest(coalesce(v_block, '-infinity'::timestamptz),
                coalesce(p_period_end, 'infinity'::timestamptz));
        elsif v_block is not null and p_paid_new_period and p_period_end > v_block then
            v_block := null;
        end if;
        update public.stripe_memberships set
            current_price_id = p_price_id, status = p_status,
            period_end = p_period_end, refund_blocked_until = v_block,
            event_created = p_event_created, observed_at = p_observed_at, updated_at = clock_timestamp()
        where subscription_id = p_subscription_id;
        v_applied := true;
    elsif p_event_created = v_member.event_created and (
        v_member.current_price_id <> p_price_id or v_member.status <> p_status
        or v_member.period_end is distinct from p_period_end
        or (p_status = 'refunded' and v_member.refund_blocked_until is null)
    ) then
        -- Stripe event.created has second precision. A verified invoice.paid
        -- for the canonical current period may follow an incomplete/unpaid
        -- snapshot in that same second. Admit only that paid transition, and
        -- never revive a canceled, expired, or refunded subscription here.
        if p_status = 'active' then
            if p_price_id <> v_intent.price_id
                and p_observed_at >= v_member.observed_at
                and p_period_end >= coalesce(v_member.period_end, '-infinity'::timestamptz) then
                -- Off-price must revoke eligibility even if Stripe emitted the
                -- change in the same second. Preserve a canceled/blocked state.
                update public.stripe_memberships set
                    current_price_id = p_price_id, period_end = p_period_end,
                    observed_at = p_observed_at, updated_at = clock_timestamp()
                where subscription_id = p_subscription_id;
                v_applied := true;
            elsif p_event_type = 'invoice.paid' and p_paid_new_period
                and p_observed_at >= v_member.observed_at
                and v_member.status not in ('canceled', 'incomplete_expired', 'refunded')
                and p_period_end >= coalesce(v_member.period_end, '-infinity'::timestamptz) then
                update public.stripe_memberships set
                    current_price_id = p_price_id, status = 'active',
                    period_end = p_period_end,
                    refund_blocked_until = case
                        when refund_blocked_until is not null
                            and p_period_end > refund_blocked_until then null
                        else refund_blocked_until end,
                    observed_at = p_observed_at, updated_at = clock_timestamp()
                where subscription_id = p_subscription_id;
                v_applied := true;
            end if;
        elsif v_member.status = 'active' then
            update public.stripe_memberships set
                current_price_id = p_price_id, status = p_status,
                period_end = p_period_end,
                refund_blocked_until = case when p_status = 'refunded'
                    then greatest(coalesce(refund_blocked_until, '-infinity'::timestamptz),
                        coalesce(p_period_end, 'infinity'::timestamptz))
                    else refund_blocked_until end,
                observed_at = p_observed_at,
                updated_at = clock_timestamp()
            where subscription_id = p_subscription_id;
            v_applied := true;
        end if;
    end if;

    -- A verified newer paid billing period may arrive in an older Stripe
    -- event after a subscription.updated event. Clear only the sticky refund
    -- hold on an already-active canonical projection; never revive a canceled
    -- or unpaid status from an out-of-order event.
    if p_paid_new_period and p_status = 'active' and v_member.subscription_id is not null then
        update public.stripe_memberships set
            refund_blocked_until = null, updated_at = clock_timestamp()
        where subscription_id = p_subscription_id and status = 'active'
            and refund_blocked_until is not null
            and p_period_end > refund_blocked_until and period_end <= p_period_end;
        if found then v_applied := true; end if;
    end if;

    insert into public.stripe_webhook_receipts(event_id, user_id, payload_hash)
        values(p_event_id, p_user_id, v_hash);
    return jsonb_build_object('applied', v_applied, 'duplicate', false);
end $$;

-- Reversal affects only the verified current paid period. Later ordinary
-- subscription.updated events cannot erase its sticky refund hold.

create or replace function public.apply_stripe_live_membership_reversal(
    p_event_id text, p_event_payload_hash text, p_event_type text,
    p_subscription_id text, p_reversed_invoice_id text, p_current_invoice_id text,
    p_checkout_id text, p_customer_id text, p_user_id text,
    p_period_end timestamptz
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_member public.stripe_memberships;
    v_intent public.stripe_checkout_intents;
    v_receipt public.stripe_reversal_receipts;
    v_blocked boolean := false;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$'
        or p_event_payload_hash is null or p_event_payload_hash !~ '^[a-f0-9]{64}$'
        or p_event_type is null or p_event_type not in (
            'charge.refunded', 'charge.dispute.created', 'radar.early_fraud_warning.created')
        or p_subscription_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9]+$'
        or p_reversed_invoice_id is null or p_reversed_invoice_id !~ '^in_[A-Za-z0-9]+$'
        or p_current_invoice_id is null or p_current_invoice_id !~ '^in_[A-Za-z0-9]+$'
        or p_checkout_id is null or p_checkout_id !~ '^cs_live_[A-Za-z0-9]+$'
        or p_customer_id is null or p_customer_id !~ '^cus_[A-Za-z0-9]+$'
        or p_user_id is null or length(p_user_id) not between 1 and 256
        or octet_length(convert_to(p_user_id, 'UTF8')) > 256
        or p_period_end is null then
        raise exception 'Invalid reversal snapshot' using errcode = '22023';
    end if;

    perform 1 from public.profiles where id = p_user_id for update;
    if not found or exists (select 1 from public.account_deletion_jobs
        where user_id = p_user_id and phase <> 'completed')
        or exists (select 1 from public.account_restrictions
            where user_id = p_user_id and blocked) then
        raise exception 'Membership account unavailable' using errcode = '42501';
    end if;

    select * into v_intent from public.stripe_checkout_intents
        where checkout_id = p_checkout_id for update;
    if not found or v_intent.user_id <> p_user_id or not v_intent.livemode
        or v_intent.price_id not in ('price_1UNTrJQWzwYDIuXWJn9XTiRW', 'price_1UNTrJQWzwYDIuXWtdNlAMnV') then
        raise exception 'Unbound Checkout Session' using errcode = '42501';
    end if;
    select * into v_member from public.stripe_memberships
        where subscription_id = p_subscription_id for update;
    if not found or v_member.checkout_id <> p_checkout_id
        or v_member.customer_id <> p_customer_id or v_member.user_id <> p_user_id then
        raise exception 'Unbound subscription' using errcode = '42501';
    end if;

    select * into v_receipt from public.stripe_reversal_receipts
        where event_id = p_event_id and subscription_id = p_subscription_id for update;
    if found then
        if v_receipt.payload_hash <> p_event_payload_hash
            or v_receipt.reversed_invoice_id <> p_reversed_invoice_id then
            raise exception 'Stripe reversal event collision' using errcode = '23505';
        end if;
        return jsonb_build_object('applied', false, 'duplicate', true,
            'blocked', v_receipt.blocked);
    end if;

    -- A refund of an older invoice cannot revoke a newer paid billing period.
    -- If the DB already projects a later period than the canonical read, do
    -- not regress it. Current-period reversals persist as a sticky block so
    -- a later ordinary subscription.updated webhook cannot restore grants.
    if p_reversed_invoice_id = p_current_invoice_id
        and p_period_end >= coalesce(v_member.period_end, '-infinity'::timestamptz)
        and v_member.status not in ('canceled', 'incomplete_expired') then
        update public.stripe_memberships set
            status = 'refunded',
            period_end = p_period_end,
            refund_blocked_until = greatest(
                coalesce(refund_blocked_until, '-infinity'::timestamptz), p_period_end),
            updated_at = clock_timestamp()
        where subscription_id = p_subscription_id;
        v_blocked := true;
    end if;

    insert into public.stripe_reversal_receipts(
        event_id, subscription_id, user_id, payload_hash, reversed_invoice_id, blocked)
    values(p_event_id, p_subscription_id, p_user_id,
        p_event_payload_hash, p_reversed_invoice_id, v_blocked);
    return jsonb_build_object('applied', true, 'duplicate', false, 'blocked', v_blocked);
end $$;
-- Repoint the pre-existing TEST membership RPCs to a test-only bonus pool.
-- Their signatures and test-mode ownership checks remain unchanged.

create or replace function public.stripe_live_member_status(p_user_id text)
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
        and m.current_price_id = i.price_id and i.livemode
        and i.price_id in ('price_1UNTrJQWzwYDIuXWJn9XTiRW', 'price_1UNTrJQWzwYDIuXWtdNlAMnV');
    if v_count <> 1 then
        v_subscription_id := null;
        v_period_end := null;
    end if;
    select * into v_wallet from public.ticket_wallets where user_id = p_user_id;
    return jsonb_build_object(
        'userId', p_user_id, 'active', v_period_end is not null,
        'periodEnd', v_period_end,
        'lastGrantUtcDay', to_char(v_wallet.last_live_member_grant_utc_day, 'YYYY-MM-DD'),
        'tickets', jsonb_build_object(
            'ranked', case when v_subscription_id = v_wallet.member_ticket_subscription_id
                then coalesce(v_wallet.member_ranked_tickets, 0) else 0 end,
            'hint', case when v_subscription_id = v_wallet.member_ticket_subscription_id
                then coalesce(v_wallet.member_hint_tickets, 0) else 0 end),
        'freeTickets', jsonb_build_object(
            'ranked', coalesce(v_wallet.ranked_tickets, 0),
            'hint', coalesce(v_wallet.hint_tickets, 0))
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
        and i.price_id in ('price_1UNTrJQWzwYDIuXWJn9XTiRW', 'price_1UNTrJQWzwYDIuXWtdNlAMnV');
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
                and i.price_id in ('price_1UNTrJQWzwYDIuXWJn9XTiRW', 'price_1UNTrJQWzwYDIuXWtdNlAMnV')
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

create or replace function public.spend_game_tickets(
    p_event_kind text, p_event_id uuid, p_user_ids text[]
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_users text[];
    v_existing_users text[];
    v_existing_entries jsonb;
    v_user text;
    v_wallet public.ticket_wallets;
    v_active_count integer;
    v_active_subscription text;
    v_suspended_count integer;
    v_pool text;
    v_started_at timestamptz;
    v_utc_day date;
    v_daily_free_count integer;
    v_entries jsonb := '[]'::jsonb;
    v_entry jsonb;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_event_kind is null or p_event_kind not in ('ranked_match_start', 'cpu_hint_delivered')
        or p_event_id is null or p_user_ids is null
        or cardinality(p_user_ids) not between 1 and 2
        or (p_event_kind = 'cpu_hint_delivered' and cardinality(p_user_ids) <> 1) then
        raise exception 'Invalid ticket event' using errcode = '22023';
    end if;
    select array_agg(distinct t.user_id order by t.user_id) into v_users
        from unnest(p_user_ids) as t(user_id);
    if v_users is null or cardinality(v_users) <> cardinality(p_user_ids) then
        raise exception 'Duplicate ticket participant' using errcode = '22023';
    end if;
    foreach v_user in array v_users loop
        if v_user is null or length(v_user) not between 1 and 256
            or octet_length(convert_to(v_user, 'UTF8')) > 256
            or v_user ~* '^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)' then
            raise exception 'Invalid ticket participant' using errcode = '22023';
        end if;
    end loop;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('qg-ticket:' || p_event_kind || ':' || p_event_id::text, 0));
    select array_agg(r.user_id order by r.user_id),
        jsonb_agg(jsonb_build_object('userId', r.user_id, 'pool', r.pool) order by r.user_id)
        into v_existing_users, v_existing_entries
        from public.ticket_spend_receipts r
        where r.event_kind = p_event_kind and r.event_id = p_event_id;
    if v_existing_users is not null then
        if v_existing_users <> v_users then
            raise exception 'Ticket event participant mismatch' using errcode = '23505';
        end if;
        return jsonb_build_object('eventKind', p_event_kind, 'eventId', p_event_id,
            'applied', false, 'duplicate', true, 'insufficient', false,
            'entries', v_existing_entries);
    end if;

    foreach v_user in array v_users loop
        perform 1 from public.profiles where id = v_user for update;
        if not found or exists (select 1 from public.account_deletion_jobs
                where user_id = v_user and phase <> 'completed')
            or exists (select 1 from public.account_restrictions
                where user_id = v_user and blocked)
            or not exists (select 1 from public.account_terms_consents
                where user_id = v_user and version = '2026-09-25.1') then
            raise exception 'Ticket account unavailable' using errcode = '42501';
        end if;
    end loop;

    foreach v_user in array v_users loop
        insert into public.ticket_wallets(user_id) values(v_user) on conflict(user_id) do nothing;
        perform 1 from public.ticket_wallets where user_id = v_user for update;
        if not found then raise exception 'Ticket wallet unavailable' using errcode = '55000'; end if;
    end loop;

    -- The sorted profile and wallet locks serialize distinct starts for every
    -- participant. Capture one database time for both sides after all lock
    -- waits, so a PvP start cannot straddle a UTC day boundary.
    v_started_at := clock_timestamp();
    v_utc_day := (v_started_at at time zone 'UTC')::date;

    foreach v_user in array v_users loop
        select * into v_wallet from public.ticket_wallets where user_id = v_user;
        if not found then raise exception 'Ticket wallet unavailable' using errcode = '55000'; end if;
        select count(*), min(m.subscription_id) into v_active_count, v_active_subscription
            from public.stripe_memberships m
            join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
            join public.stripe_customer_links l on l.customer_id = m.customer_id
            where m.user_id = v_user and i.user_id = v_user and l.user_id = v_user
                and m.status = 'active' and m.period_end > clock_timestamp()
                and m.refund_blocked_until is null
                and m.current_price_id = i.price_id and i.livemode
                and i.price_id in ('price_1UNTrJQWzwYDIuXWJn9XTiRW', 'price_1UNTrJQWzwYDIuXWtdNlAMnV');
        if v_active_count > 1 then
            raise exception 'Ambiguous paid entitlement' using errcode = '23505';
        end if;
        -- A temporary payment pause suspends paid spending, but does not
        -- forfeit this period's paid tickets. Termination, reversal, expired
        -- period, off-price, or a different active subscription do forfeit.
        select count(*) into v_suspended_count
            from public.stripe_memberships m
            join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
            join public.stripe_customer_links l on l.customer_id = m.customer_id
            where m.user_id = v_user and i.user_id = v_user and l.user_id = v_user
                and m.subscription_id = v_wallet.member_ticket_subscription_id
                and m.status in ('incomplete', 'trialing', 'past_due', 'unpaid', 'paused')
                and m.period_end > clock_timestamp() and m.refund_blocked_until is null
                and m.current_price_id = i.price_id and i.livemode
                and i.price_id in ('price_1UNTrJQWzwYDIuXWJn9XTiRW', 'price_1UNTrJQWzwYDIuXWtdNlAMnV');
        if (v_active_subscription is null and v_suspended_count = 0)
            or (v_active_subscription is not null
                and v_wallet.member_ticket_subscription_id is distinct from v_active_subscription) then
            update public.ticket_wallets set member_ranked_tickets = 0,
                member_hint_tickets = 0, member_ticket_subscription_id = null
                where user_id = v_user and (member_ranked_tickets <> 0 or member_hint_tickets <> 0
                    or member_ticket_subscription_id is not null);
            v_wallet.member_ranked_tickets := 0;
            v_wallet.member_hint_tickets := 0;
            v_wallet.member_ticket_subscription_id := null;
        end if;
        if p_event_kind = 'ranked_match_start' then
            select count(*) into v_daily_free_count
                from public.ticket_spend_receipts r
                where r.user_id = v_user and r.event_kind = 'ranked_match_start'
                    and r.pool = 'quota'
                    and r.spent_at >= (v_utc_day::timestamp at time zone 'UTC')
                    and r.spent_at < ((v_utc_day + 1)::timestamp at time zone 'UTC');
            v_pool := case when v_daily_free_count < 3 then 'quota'
                when v_wallet.ranked_tickets > 0 then 'free'
                when v_active_subscription is not null and v_wallet.member_ticket_subscription_id = v_active_subscription
                    and v_wallet.member_ranked_tickets > 0 then 'paid' else null end;
        else
            v_pool := case when v_wallet.hint_tickets > 0 then 'free'
                when v_active_subscription is not null and v_wallet.member_ticket_subscription_id = v_active_subscription
                    and v_wallet.member_hint_tickets > 0 then 'paid' else null end;
        end if;
        if v_pool is null then
            return jsonb_build_object('eventKind', p_event_kind, 'eventId', p_event_id,
                'applied', false, 'duplicate', false, 'insufficient', true,
                'entries', '[]'::jsonb);
        end if;
        v_entries := v_entries || jsonb_build_array(jsonb_build_object('userId', v_user, 'pool', v_pool));
    end loop;

    for v_entry in select value from jsonb_array_elements(v_entries) loop
        v_user := v_entry->>'userId';
        v_pool := v_entry->>'pool';
        if p_event_kind = 'ranked_match_start' and v_pool = 'quota' then
            -- The receipt itself accounts for a free daily start.
            null;
        elsif p_event_kind = 'ranked_match_start' and v_pool = 'free' then
            update public.ticket_wallets set ranked_tickets = ranked_tickets - 1
                where user_id = v_user and ranked_tickets > 0;
        elsif p_event_kind = 'ranked_match_start' and v_pool = 'paid' then
            update public.ticket_wallets set member_ranked_tickets = member_ranked_tickets - 1
                where user_id = v_user and member_ranked_tickets > 0;
        elsif p_event_kind = 'cpu_hint_delivered' and v_pool = 'free' then
            update public.ticket_wallets set hint_tickets = hint_tickets - 1
                where user_id = v_user and hint_tickets > 0;
        else
            update public.ticket_wallets set member_hint_tickets = member_hint_tickets - 1
                where user_id = v_user and member_hint_tickets > 0;
        end if;
        if v_pool <> 'quota' and not found then
            raise exception 'Ticket balance changed' using errcode = '55000';
        end if;
        insert into public.ticket_spend_receipts(event_kind, event_id, user_id, pool, spent_at)
            values(p_event_kind, p_event_id, v_user, v_pool, v_started_at);
    end loop;
    return jsonb_build_object('eventKind', p_event_kind, 'eventId', p_event_id,
        'applied', true, 'duplicate', false, 'insufficient', false, 'entries', v_entries);
end $$;

revoke all on function public.spend_game_tickets(text,uuid,text[])
    from public, anon, authenticated, service_role;
grant execute on function public.spend_game_tickets(text,uuid,text[]) to service_role;

commit;

create or replace function public.stripe_membership_schedule(p_user_id text, p_livemode boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
    v_cancel boolean;
begin
    if current_user <> 'service_role' or p_livemode is null then
        raise exception 'Trusted service and mode required' using errcode = '42501';
    end if;
    select m.cancel_at_period_end into v_cancel
    from public.stripe_memberships m
    join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
    where m.user_id = p_user_id and i.livemode = p_livemode
        and m.status = 'active' and m.period_end > clock_timestamp()
        and m.refund_blocked_until is null and m.current_price_id = i.price_id
        and (not p_livemode or i.price_id in ('price_1UNTrJQWzwYDIuXWJn9XTiRW', 'price_1UNTrJQWzwYDIuXWtdNlAMnV'))
    order by m.period_end desc, m.subscription_id desc limit 1;
    return coalesce(v_cancel, false);
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
        update public.ticket_wallets set hint_tickets=hint_tickets+1 where user_id=p_user_id and hint_tickets<20;
        if found then v_credit:=1; end if;
    elsif exists(select 1 from public.stripe_memberships m
        join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
        join public.stripe_customer_links l on l.customer_id=m.customer_id
        where m.subscription_id=v_receipt.subscription_id and m.user_id=p_user_id and i.user_id=p_user_id and l.user_id=p_user_id
            and m.status='active' and m.period_end>clock_timestamp() and m.refund_blocked_until is null
            and m.current_price_id=i.price_id and i.livemode and i.price_idin ('price_1UNTrJQWzwYDIuXWJn9XTiRW', 'price_1UNTrJQWzwYDIuXWtdNlAMnV')) then
        update public.ticket_wallets set member_hint_tickets=member_hint_tickets+1 where user_id=p_user_id
            and member_ticket_subscription_id=v_receipt.subscription_id and member_hint_tickets<60;
        if found then v_credit:=1; end if;
    end if;
    insert into public.cpu_hint_restorations(receipt_id,reason,credited) values(p_receipt_id,p_reason,v_credit);
    return v_credit;
end $$;

revoke all on function public.restore_cpu_hint_credit(uuid,text,text) from public,anon,authenticated;
grant execute on function public.restore_cpu_hint_credit(uuid,text,text) to service_role;
notify pgrst, 'reload schema';
commit;

create or replace function public.admit_ranked_match(
    p_match_id uuid,p_host_id text,p_joiner_id text,p_time_control integer,
    p_owner_id uuid,p_cpu_id text default null,p_cpu_rating integer default null,p_cpu_level integer default null
) returns jsonb language plpgsql security invoker set search_path='' as $body
declare
    v_hash bytea; v_existing public.ranked_match_admissions; v_users text[]; v_user text;
    v_wallet public.ticket_wallets; v_pool text; v_refund public.ranked_ticket_refunds;
    v_active_count integer; v_subscription text; v_period_end timestamptz;
    v_started timestamptz; v_day date; v_quota integer; v_reason text;
    v_entries jsonb:='[]'; v_entry jsonb; v_lease timestamptz;
    v_ad_bonus integer;
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
                    and i.price_id in ('price_1ULM9fQWzwYDIuXWgs5Uj3yt', 'price_tier2_mock_id'); -- Both Tiers
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

            if v_subscription is null and v_quota >= 3 and v_refund.source_match_id is null and v_wallet.ranked_tickets = 0 then
                insert into public.ad_allowances(user_id,kind) values(v_user,'online') on conflict do nothing;
                select bonus into v_ad_bonus from public.ad_allowances where user_id=v_user and kind='online' for update;
            end if;

            v_pool:=case 
                when v_subscription is not null then 'sub'
                when v_quota<3 then 'quota' 
                when v_refund.source_match_id is not null then v_refund.pool
                when v_wallet.ranked_tickets>0 then 'free'
                when v_ad_bonus>0 then 'ad'
                else null end;
                
            if v_pool is null then v_reason:='INSUFFICIENT_FUNDS'; exit; end if;
            
            v_entries:=v_entries||jsonb_build_array(jsonb_build_object('userId',v_user,'pool',v_pool,
                'subscription',case when v_pool='paid' or v_pool='sub' then coalesce(v_refund.subscription_id,v_subscription) end,
                'expiry',case when v_pool='paid' or v_pool='sub' then coalesce(v_refund.expires_at,v_period_end) end,
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
        elsif v_pool='ad' then
            update public.ad_allowances set bonus=bonus-1 where user_id=v_user and kind='online';
        end if;
        insert into public.ticket_spend_receipts(event_kind,event_id,user_id,pool,spent_at)
            values('ranked_match_start',p_match_id,v_user,v_pool,v_started);
        insert into public.ranked_match_allocations(match_id,user_id,pool,utc_day,subscription_id,expires_at,refund_origin)
            values(p_match_id,v_user,v_pool,v_day,v_entry->>'subscription',(v_entry->>'expiry')::timestamptz,(v_entry->>'refund')::uuid);
    end loop;
    return jsonb_build_object('success',true,'state','active','duplicate',false,'entries',v_entries);
end $body;

commit;

create or replace function public.get_ranked_refund_balance(p_user_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_free bigint; v_paid bigint;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    select count(*) filter(where r.pool='free'),count(*) filter(where r.pool='paid' and r.expires_at>clock_timestamp()
        and exists(select 1 from public.stripe_memberships m
            join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
            join public.stripe_customer_links l on l.customer_id=m.customer_id
            where m.subscription_id=r.subscription_id and m.user_id=r.user_id and i.user_id=r.user_id and l.user_id=r.user_id
                and m.status='active' and m.period_end>clock_timestamp() and m.refund_blocked_until is null
                and m.current_price_id=i.price_id and i.livemode and i.price_idin ('price_1UNTrJQWzwYDIuXWJn9XTiRW', 'price_1UNTrJQWzwYDIuXWtdNlAMnV')))
        into v_free,v_paid from public.ranked_ticket_refunds r where r.user_id=p_user_id and r.spent_by is null;
    return jsonb_build_object('freeRankedRefunds',v_free,'paidRankedRefunds',v_paid);
end $$;
revoke all on function public.ranked_admission_protocol_version(),public.get_ranked_refund_balance(text)
    from public,anon,authenticated,service_role;
grant execute on function public.ranked_admission_protocol_version(),public.get_ranked_refund_balance(text) to service_role;
notify pgrst,'reload schema';
commit;

create or replace function public.apply_stripe_canonical_membership_snapshot(
    p_event_id text, p_event_payload_hash text, p_event_type text, p_event_created bigint,
    p_observed_at timestamptz, p_subscription_id text, p_checkout_id text,
    p_customer_id text, p_user_id text, p_price_id text, p_status text,
    p_period_end timestamptz, p_livemode boolean, p_paid_new_period boolean,
    p_cancel_at_period_end boolean, p_token uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_intent public.stripe_checkout_intents; v_member public.stripe_memberships;
    v_hash text; v_owner text; v_block timestamptz;
begin
    perform public.require_stripe_reconciliation(p_subscription_id,p_livemode,p_token);
    if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$'
        or p_event_payload_hash is null or p_event_payload_hash !~ '^[a-f0-9]{64}$'
        or p_event_type is null or length(p_event_type) not between 1 and 128
        or p_event_created is null or p_event_created <= 0
        or p_observed_at is null or p_observed_at > clock_timestamp()+interval '10 minutes'
        or p_checkout_id is null or p_checkout_id !~ ('^cs_' || case when p_livemode then 'live' else 'test' end || '_[A-Za-z0-9]+$')
        or p_customer_id is null or p_customer_id !~ '^cus_[A-Za-z0-9]+$'
        or p_user_id is null or length(p_user_id) not between 1 and 256 or octet_length(p_user_id)>256
        or p_price_id is null or p_price_id !~ '^price_[A-Za-z0-9]+$'
        or p_status is null or p_status not in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
        or (p_status='active' and p_period_end is null)
        or p_paid_new_period is null or p_cancel_at_period_end is null then
        raise exception 'Invalid canonical snapshot' using errcode = '22023';
    end if;
    if exists (select 1 from public.stripe_retired_subscriptions
        where subscription_id=p_subscription_id and livemode=p_livemode) then
        
        if p_paid_new_period and p_livemode and p_price_id = 'price_1UNTrJQWzwYDIuXWtdNlAMnV' then
            insert into public.ticket_wallets(user_id, member_hint_tickets)
            values (p_user_id, 10)
            on conflict (user_id) do update set member_hint_tickets = public.ticket_wallets.member_hint_tickets + 10;
        end if;

    return jsonb_build_object('applied',false,'duplicate',false,'retired',true);
    end if;
    -- Same lock order as grants, checkout registration and account erasure.
    perform 1 from public.profiles where id=p_user_id for update;
    if not found or exists (select 1 from public.account_deletion_jobs where user_id=p_user_id and phase<>'completed')
        or exists (select 1 from public.account_restrictions where user_id=p_user_id and blocked) then
        raise exception 'Membership account unavailable' using errcode = '42501';
    end if;
    select * into v_intent from public.stripe_checkout_intents where checkout_id=p_checkout_id for update;
    if not found or v_intent.user_id<>p_user_id or v_intent.livemode<>p_livemode or v_intent.closed_at is not null
        or (p_livemode and v_intent.price_idnot in ('price_1UNTrJQWzwYDIuXWJn9XTiRW', 'price_1UNTrJQWzwYDIuXWtdNlAMnV')) then
        raise exception 'Unbound Checkout' using errcode = '42501';
    end if;
    select payload_hash into v_hash from public.stripe_webhook_receipts where event_id=p_event_id;
    if found then
        if v_hash<>p_event_payload_hash then raise exception 'Event collision' using errcode = '23505'; end if;
        return jsonb_build_object('applied',false,'duplicate',true);
    end if;
    insert into public.stripe_customer_links(customer_id,user_id) values(p_customer_id,p_user_id) on conflict do nothing;
    select user_id into v_owner from public.stripe_customer_links where customer_id=p_customer_id for update;
    if v_owner is distinct from p_user_id then raise exception 'Customer ownership changed' using errcode = '42501'; end if;
    select * into v_member from public.stripe_memberships where subscription_id=p_subscription_id for update;
    if found and (v_member.checkout_id<>p_checkout_id or v_member.customer_id<>p_customer_id or v_member.user_id<>p_user_id) then
        raise exception 'Subscription ownership changed' using errcode = '42501';
    end if;
    -- Stripe cannot resurrect a terminal Subscription ID. A conflicting
    -- canonical response must retry, never consume a receipt or grant access.
    if v_member.status in ('canceled','incomplete_expired') and p_status not in ('canceled','incomplete_expired') then
        raise exception 'Terminal subscription conflict' using errcode = '40001';
    end if;
    v_block := v_member.refund_blocked_until;
    if v_block is not null and p_paid_new_period and p_status='active' and p_period_end>v_block then v_block:=null; end if;
    -- event.created is audit information only. The fenced canonical read is
    -- authoritative even when the delivery's event timestamp is older.
    insert into public.stripe_memberships(subscription_id,checkout_id,customer_id,user_id,
        current_price_id,status,period_end,refund_blocked_until,event_created,observed_at,cancel_at_period_end)
    values(p_subscription_id,p_checkout_id,p_customer_id,p_user_id,p_price_id,p_status,p_period_end,
        v_block,p_event_created,p_observed_at,p_cancel_at_period_end)
    on conflict(subscription_id) do update set current_price_id=excluded.current_price_id,status=excluded.status,
        period_end=excluded.period_end,refund_blocked_until=excluded.refund_blocked_until,
        event_created=excluded.event_created,observed_at=excluded.observed_at,
        cancel_at_period_end=excluded.cancel_at_period_end,updated_at=clock_timestamp();
    insert into public.stripe_webhook_receipts(event_id,user_id,payload_hash) values(p_event_id,p_user_id,p_event_payload_hash);
    return jsonb_build_object('applied',true,'duplicate',false);
end $$;


