begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Test-mode groundwork only. A future, separately reviewed migration must
-- explicitly authorize live-mode payments. Neither this file nor these RPCs
-- initiate a charge or make a checkout URL available to a browser.
-- Before production account erasure, the trusted account-deletion workflow
-- must cancel any Stripe subscription externally, then erase these local rows.
-- Cascading local rows alone does NOT stop future billing. The subscription
-- and customer IDs remain queryable here until the profile is deleted.
create table public.stripe_checkout_intents (
    checkout_id text primary key check (checkout_id ~ '^cs_test_[A-Za-z0-9]+$'),
    user_id text not null references public.profiles(id) on delete cascade,
    price_id text not null check (price_id ~ '^price_[A-Za-z0-9]+$'),
    livemode boolean not null default false check (not livemode),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    closed_at timestamptz
);
create index stripe_checkout_intents_user_expiry_idx
    on public.stripe_checkout_intents(user_id, expires_at);
alter table public.stripe_checkout_intents enable row level security;
revoke all on public.stripe_checkout_intents from public, anon, authenticated, service_role;
grant select, insert on public.stripe_checkout_intents to service_role;

-- A Stripe customer can own more than one subscription, but cannot silently
-- migrate between game accounts. These links cascade on verified deletion.
create table public.stripe_customer_links (
    customer_id text primary key check (customer_id ~ '^cus_[A-Za-z0-9]+$'),
    user_id text not null references public.profiles(id) on delete cascade
);
create index stripe_customer_links_user_idx on public.stripe_customer_links(user_id);
alter table public.stripe_customer_links enable row level security;
revoke all on public.stripe_customer_links from public, anon, authenticated, service_role;
grant select, insert on public.stripe_customer_links to service_role;

create table public.stripe_memberships (
    subscription_id text primary key check (subscription_id ~ '^sub_[A-Za-z0-9]+$'),
    checkout_id text not null unique references public.stripe_checkout_intents(checkout_id) on delete cascade,
    customer_id text not null references public.stripe_customer_links(customer_id) on delete cascade,
    user_id text not null references public.profiles(id) on delete cascade,
    current_price_id text not null check (current_price_id ~ '^price_[A-Za-z0-9]+$'),
    status text not null check (status in (
        'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due',
        'canceled', 'unpaid', 'paused', 'refunded'
    )),
    period_end timestamptz,
    refund_blocked_until timestamptz,
    event_created bigint not null check (event_created > 0),
    observed_at timestamptz not null,
    updated_at timestamptz not null default now(),
    check (status <> 'active' or period_end is not null)
);
create index stripe_memberships_user_active_idx on public.stripe_memberships(user_id, period_end)
    where status = 'active' and refund_blocked_until is null;
create index stripe_memberships_user_status_idx on public.stripe_memberships(user_id, status);
alter table public.stripe_memberships enable row level security;
revoke all on public.stripe_memberships from public, anon, authenticated, service_role;
grant select, insert, update on public.stripe_memberships to service_role;
comment on table public.stripe_memberships is
    'Test-mode local projection only. Cancel the external Stripe subscription before profile deletion; local cascade cannot stop billing.';

-- Event IDs are deduplicated transactionally with the entitlement projection.
-- The hash is SHA-256 of the exact signature-verified Stripe webhook body;
-- unlike a fetched subscription snapshot, it is immutable across retries.
create table public.stripe_webhook_receipts (
    event_id text primary key check (event_id ~ '^evt_[A-Za-z0-9]+$'),
    user_id text not null references public.profiles(id) on delete cascade,
    payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
    processed_at timestamptz not null default now()
);
create index stripe_webhook_receipts_user_idx on public.stripe_webhook_receipts(user_id);
alter table public.stripe_webhook_receipts enable row level security;
revoke all on public.stripe_webhook_receipts from public, anon, authenticated, service_role;
grant select, insert on public.stripe_webhook_receipts to service_role;

alter table public.ticket_wallets add column last_member_grant_utc_day date;

-- Render registers a *server-created* Checkout Session before returning its
-- URL to an authenticated player. A generic dashboard link has no matching
-- intent and can never create an in-game membership.
-- This preflight reduces unnecessary Stripe API calls, but it is not a
-- reservation. Registration repeats all checks while holding the profile lock.
create function public.stripe_checkout_preflight(p_user_id text)
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
        or not exists (select 1 from public.account_terms_consents
            where user_id = p_user_id and version = '2026-09-25.1') then
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

-- A terminal expired Checkout Session must be verified with Stripe by the
-- trusted server before allowing another subscription attempt. Never infer
-- non-payment from time alone: a paid webhook can be delayed or lost.
create function public.close_expired_stripe_checkout_intent(p_user_id text, p_checkout_id text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_user_id is null or p_checkout_id is null or p_checkout_id !~ '^cs_test_[A-Za-z0-9]+$' then
        raise exception 'Invalid checkout close request' using errcode = '22023';
    end if;
    perform 1 from public.profiles where id = p_user_id for update;
    if not found or exists (select 1 from public.account_deletion_jobs
        where user_id = p_user_id and phase <> 'completed') then
        raise exception 'Checkout account unavailable' using errcode = '42501';
    end if;
    update public.stripe_checkout_intents i set closed_at = clock_timestamp()
        where i.checkout_id = p_checkout_id and i.user_id = p_user_id
            and i.closed_at is null and i.expires_at <= clock_timestamp()
            and not exists (select 1 from public.stripe_memberships m
                where m.checkout_id = i.checkout_id);
    if not found then
        raise exception 'Checkout not closable' using errcode = '42501';
    end if;
end $$;

create function public.register_stripe_checkout_intent(
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
        or not exists (select 1 from public.account_terms_consents
            where user_id = p_user_id and version = '2026-09-25.1') then
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

-- Caller must verify Stripe-Signature against the raw body, then retrieve the
-- canonical subscription and Checkout Session via Stripe's server API. The
-- observed timestamp is captured after that fetch; Stripe webhooks can arrive
-- out of order. Never infer ownership from email or client-supplied metadata.
create function public.apply_stripe_membership_snapshot(
    p_event_id text, p_event_payload_hash text, p_event_type text, p_event_created bigint, p_observed_at timestamptz,
    p_subscription_id text, p_checkout_id text, p_customer_id text,
    p_user_id text, p_price_id text, p_status text, p_period_end timestamptz,
    p_livemode boolean, p_paid_new_period boolean default false
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
        or p_checkout_id is null or p_checkout_id !~ '^cs_test_[A-Za-z0-9]+$'
        or p_customer_id is null or p_customer_id !~ '^cus_[A-Za-z0-9]+$'
        or p_user_id is null or length(p_user_id) not between 1 and 256
        or octet_length(convert_to(p_user_id, 'UTF8')) > 256
        or p_price_id is null or p_price_id !~ '^price_[A-Za-z0-9]+$'
        or p_status is null or p_status not in (
            'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due',
            'canceled', 'unpaid', 'paused', 'refunded')
        or (p_status = 'active' and p_period_end is null)
        or p_livemode is distinct from false or p_paid_new_period is null then
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
    if not found or v_intent.user_id <> p_user_id or v_intent.livemode or v_intent.closed_at is not null then
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

create function public.stripe_member_status(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_wallet public.ticket_wallets;
    v_period_end timestamptz;
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
    select max(m.period_end) into v_period_end
    from public.stripe_memberships m
    join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
    where m.user_id = p_user_id and m.status = 'active'
        and m.period_end > clock_timestamp() and m.refund_blocked_until is null
        and m.current_price_id = i.price_id and not i.livemode;
    select * into v_wallet from public.ticket_wallets where user_id = p_user_id;
    return jsonb_build_object(
        'userId', p_user_id, 'active', v_period_end is not null,
        'periodEnd', v_period_end,
        'lastGrantUtcDay', to_char(v_wallet.last_member_grant_utc_day, 'YYYY-MM-DD'),
        'tickets', jsonb_build_object(
            'ranked', coalesce(v_wallet.ranked_tickets, 0),
            'hint', coalesce(v_wallet.hint_tickets, 0))
    );
end $$;

create function public.claim_stripe_member_daily_grant(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_wallet public.ticket_wallets;
    v_today date;
    v_period_end timestamptz;
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
    select max(m.period_end) into v_period_end
    from public.stripe_memberships m
    join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
    where m.user_id = p_user_id and m.status = 'active'
        and m.period_end > clock_timestamp() and m.refund_blocked_until is null
        and m.current_price_id = i.price_id and not i.livemode;
    v_today := (clock_timestamp() at time zone 'UTC')::date;
    insert into public.ticket_wallets(user_id) values(p_user_id)
        on conflict(user_id) do nothing;
    select * into v_wallet from public.ticket_wallets
        where user_id = p_user_id for update;
    if not found or v_wallet.last_member_grant_utc_day > v_today then
        raise exception 'Invalid membership wallet state' using errcode = '22023';
    end if;
    if v_period_end is not null and v_wallet.last_member_grant_utc_day is distinct from v_today then
        v_claimed := true;
        v_ranked_credit := least(20 - v_wallet.ranked_tickets, 3);
        v_hint_credit := least(20 - v_wallet.hint_tickets, 3);
        update public.ticket_wallets set
            last_member_grant_utc_day = v_today,
            ranked_tickets = ranked_tickets + v_ranked_credit,
            hint_tickets = hint_tickets + v_hint_credit
        where user_id = p_user_id returning * into v_wallet;
    end if;
    return jsonb_build_object(
        'userId', p_user_id, 'active', v_period_end is not null,
        'periodEnd', v_period_end,
        'lastGrantUtcDay', to_char(v_wallet.last_member_grant_utc_day, 'YYYY-MM-DD'),
        'tickets', jsonb_build_object(
            'ranked', v_wallet.ranked_tickets, 'hint', v_wallet.hint_tickets),
        'claimed', v_claimed,
        'credited', jsonb_build_object(
            'ranked', v_ranked_credit, 'hint', v_hint_credit)
    );
end $$;

revoke all on function public.stripe_checkout_preflight(text),
    public.close_expired_stripe_checkout_intent(text,text),
    public.register_stripe_checkout_intent(text,text,text,boolean,timestamptz),
    public.apply_stripe_membership_snapshot(text,text,text,bigint,timestamptz,text,text,text,text,text,text,timestamptz,boolean,boolean),
    public.stripe_member_status(text), public.claim_stripe_member_daily_grant(text)
    from public, anon, authenticated, service_role;
grant execute on function public.stripe_checkout_preflight(text),
    public.close_expired_stripe_checkout_intent(text,text),
    public.register_stripe_checkout_intent(text,text,text,boolean,timestamptz),
    public.apply_stripe_membership_snapshot(text,text,text,bigint,timestamptz,text,text,text,text,text,text,timestamptz,boolean,boolean),
    public.stripe_member_status(text), public.claim_stripe_member_daily_grant(text)
    to service_role;

commit;
