begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Local test-mode groundwork only. This migration follows the membership
-- entitlement migration and cannot authorize a live-mode checkout or charge.
-- A risk event may settle several invoices: dedupe per event/subscription,
-- while retaining the SHA-256 of the exact signature-verified webhook body.
create table public.stripe_reversal_receipts (
    event_id text not null check (event_id ~ '^evt_[A-Za-z0-9]+$'),
    subscription_id text not null references public.stripe_memberships(subscription_id) on delete cascade,
    user_id text not null references public.profiles(id) on delete cascade,
    payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
    reversed_invoice_id text not null check (reversed_invoice_id ~ '^in_[A-Za-z0-9]+$'),
    blocked boolean not null,
    processed_at timestamptz not null default clock_timestamp(),
    primary key (event_id, subscription_id)
);
create index stripe_reversal_receipts_user_idx on public.stripe_reversal_receipts(user_id);
alter table public.stripe_reversal_receipts enable row level security;
revoke all on public.stripe_reversal_receipts from public, anon, authenticated, service_role;
grant select, insert on public.stripe_reversal_receipts to service_role;

-- Call only after verifying the Stripe-Signature on the raw body and resolving
-- Charge/Dispute -> PaymentIntent -> paid InvoicePayment -> subscription Invoice
-- through Stripe's API. The server also fetches the canonical subscription and
-- Checkout ownership. The profile lock serializes this with ticket grants.
create function public.apply_stripe_membership_reversal(
    p_event_id text, p_event_payload_hash text, p_event_type text,
    p_subscription_id text, p_reversed_invoice_id text, p_current_invoice_id text,
    p_checkout_id text, p_customer_id text, p_user_id text,
    p_period_end timestamptz, p_livemode boolean
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
        or p_checkout_id is null or p_checkout_id !~ '^cs_test_[A-Za-z0-9]+$'
        or p_customer_id is null or p_customer_id !~ '^cus_[A-Za-z0-9]+$'
        or p_user_id is null or length(p_user_id) not between 1 and 256
        or octet_length(convert_to(p_user_id, 'UTF8')) > 256
        or p_period_end is null or p_livemode is distinct from false then
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
    if not found or v_intent.user_id <> p_user_id or v_intent.livemode then
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

revoke all on function public.apply_stripe_membership_reversal(
    text,text,text,text,text,text,text,text,text,timestamptz,boolean)
    from public, anon, authenticated, service_role;
grant execute on function public.apply_stripe_membership_reversal(
    text,text,text,text,text,text,text,text,text,timestamptz,boolean)
    to service_role;

commit;
