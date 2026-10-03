begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Additive live-mode schema only. This migration does not configure a Stripe
-- secret, create a Checkout Session, enable server routes, or expose a button.
-- Keep the original test-only RPCs intact; live mode uses separate RPC names.
-- Verify the original CHECK names rather than silently dropping an unknown
-- constraint. The whole migration rolls back if the expected baseline differs.
do $$ begin
    if not exists (select 1 from pg_constraint
        where conrelid = 'public.stripe_checkout_intents'::regclass
            and conname = 'stripe_checkout_intents_checkout_id_check')
        or not exists (select 1 from pg_constraint
            where conrelid = 'public.stripe_checkout_intents'::regclass
                and conname = 'stripe_checkout_intents_livemode_check') then
        raise exception 'Unexpected Stripe checkout baseline; inspect before enabling live mode';
    end if;
end $$;
alter table public.stripe_checkout_intents
    drop constraint stripe_checkout_intents_checkout_id_check,
    drop constraint stripe_checkout_intents_livemode_check;
alter table public.stripe_checkout_intents
    add constraint stripe_checkout_intents_environment_check check (
        (not livemode and checkout_id ~ '^cs_test_[A-Za-z0-9]+$')
        or (livemode and checkout_id ~ '^cs_live_[A-Za-z0-9]+$'
            and price_id = 'price_1ULM9fQWzwYDIuXWgs5Uj3yt')
    );
-- PostgreSQL also requires UPDATE privilege for SELECT ... FOR UPDATE.
-- Existing test and new live RPCs lock these rows, while close_expired_*
-- genuinely updates the intent's closed_at. Only the server role receives it.
grant update on public.stripe_checkout_intents to service_role;
grant update on public.stripe_customer_links to service_role;
grant update on public.stripe_webhook_receipts to service_role;
grant update on public.stripe_reversal_receipts to service_role;
alter table public.ticket_wallets
    add column last_live_member_grant_utc_day date,
    add column member_ticket_subscription_id text
        check (member_ticket_subscription_id is null
            or member_ticket_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
    add column member_ranked_tickets smallint not null default 0
        check (member_ranked_tickets between 0 and 20),
    add column member_hint_tickets smallint not null default 0
        check (member_hint_tickets between 0 and 20),
    add column test_member_ranked_tickets smallint not null default 0
        check (test_member_ranked_tickets between 0 and 20),
    add column test_member_hint_tickets smallint not null default 0
        check (test_member_hint_tickets between 0 and 20);
alter table public.ticket_wallets
    add constraint live_paid_tickets_bound_check check (
        (member_ranked_tickets = 0 and member_hint_tickets = 0)
        or member_ticket_subscription_id is not null
    );
comment on column public.ticket_wallets.member_ranked_tickets is
    'Live paid ranked-ticket pool; separate from the free daily-login pool.';
comment on column public.ticket_wallets.member_hint_tickets is
    'Live paid hint-ticket pool; separate from the free daily-login pool.';
comment on column public.ticket_wallets.member_ticket_subscription_id is
    'Live paid tickets are spendable only against this still-active Stripe subscription.';
comment on column public.ticket_wallets.test_member_ranked_tickets is
    'Test-mode only. Never count this pool as a live purchased entitlement.';
comment on column public.ticket_wallets.test_member_hint_tickets is
    'Test-mode only. Never count this pool as a live purchased entitlement.';
comment on table public.stripe_memberships is
    'Server-only Stripe subscription projection. Cancel externally before account deletion; local cascade does not stop billing.';

-- Expire unused member tickets on a terminal/reversed/off-price projection.
-- A new subscription never inherits tickets granted under an older one.
-- Temporary past_due/unpaid states suspend spending but do not erase tickets
-- until the entitlement actually terminates or its paid period expires.
create function public.expire_stripe_member_tickets_on_projection()
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
    if v_live then
        if v_expired then
            update public.ticket_wallets set member_ranked_tickets = 0,
                member_hint_tickets = 0, member_ticket_subscription_id = null
            where user_id = new.user_id
                and member_ticket_subscription_id = new.subscription_id;
            -- A delayed terminal event for an older subscription must not
            -- erase tickets already granted under a newer subscription.
            -- New-subscription grants reset the old pool in the claim function.
        end if;
    end if;
    return new;
end $$;
revoke all on function public.expire_stripe_member_tickets_on_projection()
    from public, anon, authenticated, service_role;
grant execute on function public.expire_stripe_member_tickets_on_projection()
    to service_role;
create trigger stripe_member_ticket_expiry
after insert or update of status, refund_blocked_until, current_price_id
on public.stripe_memberships
for each row execute function public.expire_stripe_member_tickets_on_projection();

-- Live Checkout cannot be requested by a guest, a blocked account, or an
-- account without current terms consent. The profile lock serializes both
-- preflight and registration with deletion and parallel purchase attempts.
create function public.stripe_live_checkout_preflight(p_user_id text)
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

-- The server must first verify Stripe's terminal expired state. Elapsed time
-- alone is not proof that a payment did not complete just before expiry.
create function public.close_expired_stripe_live_checkout_intent(
    p_user_id text, p_checkout_id text
) returns void language plpgsql security invoker set search_path = '' as $$
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_user_id is null or p_checkout_id is null
        or p_checkout_id !~ '^cs_live_[A-Za-z0-9]+$' then
        raise exception 'Invalid Checkout close request' using errcode = '22023';
    end if;
    perform 1 from public.profiles where id = p_user_id for update;
    if not found or exists (select 1 from public.account_deletion_jobs
        where user_id = p_user_id and phase <> 'completed') then
        raise exception 'Checkout account unavailable' using errcode = '42501';
    end if;
    update public.stripe_checkout_intents i set closed_at = clock_timestamp()
        where i.checkout_id = p_checkout_id and i.user_id = p_user_id
            and i.livemode and i.closed_at is null
            and i.expires_at <= clock_timestamp()
            and not exists (select 1 from public.stripe_memberships m
                where m.checkout_id = i.checkout_id);
    if not found then
        raise exception 'Checkout not closable' using errcode = '42501';
    end if;
end $$;

create function public.register_stripe_live_checkout_intent(
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
        or not exists (select 1 from public.account_terms_consents
            where user_id = p_user_id and version = '2026-09-25.1') then
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

-- Verified Stripe webhook event plus canonical live-mode subscription snapshot.
-- The event receipt dedupes on the hash of the original signed body, never
-- on observation time or a mutable canonical API response.
create function public.apply_stripe_live_membership_snapshot(
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
        or v_intent.price_id <> 'price_1ULM9fQWzwYDIuXWgs5Uj3yt'
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
create function public.apply_stripe_live_membership_reversal(
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
        or v_intent.price_id <> 'price_1ULM9fQWzwYDIuXWgs5Uj3yt' then
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
create or replace function public.stripe_member_status(p_user_id text)
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
            'ranked', coalesce(v_wallet.test_member_ranked_tickets, 0),
            'hint', coalesce(v_wallet.test_member_hint_tickets, 0)),
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
            'ranked', v_wallet.test_member_ranked_tickets, 'hint', v_wallet.test_member_hint_tickets),
        'freeTickets', jsonb_build_object(
            'ranked', v_wallet.ranked_tickets, 'hint', v_wallet.hint_tickets),
        'claimed', v_claimed,
        'credited', jsonb_build_object(
            'ranked', v_ranked_credit, 'hint', v_hint_credit)
    );
end $$;

-- Live purchased benefits use their own paid pool. The free daily-login
-- balance is displayed separately and never reduces the daily paid grant.
create function public.stripe_live_member_status(p_user_id text)
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
        and i.price_id = 'price_1ULM9fQWzwYDIuXWgs5Uj3yt';
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

create function public.claim_stripe_live_member_daily_grant(p_user_id text)
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
        v_ranked_credit := least(20 - v_wallet.member_ranked_tickets, 3);
        v_hint_credit := least(20 - v_wallet.member_hint_tickets, 3);
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

revoke all on function public.stripe_live_checkout_preflight(text),
    public.close_expired_stripe_live_checkout_intent(text,text),
    public.register_stripe_live_checkout_intent(text,text,text,timestamptz),
    public.apply_stripe_live_membership_snapshot(
        text,text,text,bigint,timestamptz,text,text,text,text,text,text,timestamptz,boolean),
    public.apply_stripe_live_membership_reversal(
        text,text,text,text,text,text,text,text,text,timestamptz),
    public.stripe_live_member_status(text),
    public.claim_stripe_live_member_daily_grant(text)
    from public, anon, authenticated, service_role;
grant execute on function public.stripe_live_checkout_preflight(text),
    public.close_expired_stripe_live_checkout_intent(text,text),
    public.register_stripe_live_checkout_intent(text,text,text,timestamptz),
    public.apply_stripe_live_membership_snapshot(
        text,text,text,bigint,timestamptz,text,text,text,text,text,text,timestamptz,boolean),
    public.apply_stripe_live_membership_reversal(
        text,text,text,text,text,text,text,text,text,timestamptz),
    public.stripe_live_member_status(text),
    public.claim_stripe_live_member_daily_grant(text)
    to service_role;

commit;
