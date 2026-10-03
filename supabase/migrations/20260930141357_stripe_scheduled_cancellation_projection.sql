begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- A normal Stripe cancellation only stops renewal. Do not turn an otherwise
-- paid, active subscription into a canceled entitlement before period_end.
alter table public.stripe_memberships
    add column cancel_at_period_end boolean not null default false;

-- The existing snapshot functions validate the signed event, registered
-- Checkout, ownership, event receipt and payment-period ordering. Wrap them
-- in the SAME transaction so a receipt cannot commit without its schedule.
create function public.apply_stripe_membership_snapshot_with_schedule(
    p_event_id text, p_event_payload_hash text, p_event_type text, p_event_created bigint,
    p_observed_at timestamptz, p_subscription_id text, p_checkout_id text,
    p_customer_id text, p_user_id text, p_price_id text, p_status text,
    p_period_end timestamptz, p_livemode boolean, p_paid_new_period boolean,
    p_cancel_at_period_end boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_result jsonb;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_cancel_at_period_end is null then
        raise exception 'Missing cancellation schedule' using errcode = '22023';
    end if;
    v_result := public.apply_stripe_membership_snapshot(
        p_event_id, p_event_payload_hash, p_event_type, p_event_created,
        p_observed_at, p_subscription_id, p_checkout_id, p_customer_id,
        p_user_id, p_price_id, p_status, p_period_end, p_livemode,
        p_paid_new_period);
    if (v_result->>'duplicate')::boolean then return v_result; end if;
    -- A new event may only update the schedule on the exact canonical state
    -- it projected. Older and rejected same-second transitions cannot alter it.
    update public.stripe_memberships set
        cancel_at_period_end = p_cancel_at_period_end,
        observed_at = p_observed_at,
        updated_at = clock_timestamp()
    where subscription_id = p_subscription_id and checkout_id = p_checkout_id
        and customer_id = p_customer_id and user_id = p_user_id
        and event_created = p_event_created and observed_at <= p_observed_at
        and current_price_id = p_price_id and status = p_status
        and period_end is not distinct from p_period_end
        and cancel_at_period_end is distinct from p_cancel_at_period_end;
    if found then v_result := v_result || '{"applied":true}'::jsonb; end if;
    return v_result;
end $$;

create function public.apply_stripe_live_membership_snapshot_with_schedule(
    p_event_id text, p_event_payload_hash text, p_event_type text, p_event_created bigint,
    p_observed_at timestamptz, p_subscription_id text, p_checkout_id text,
    p_customer_id text, p_user_id text, p_price_id text, p_status text,
    p_period_end timestamptz, p_paid_new_period boolean,
    p_cancel_at_period_end boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_result jsonb;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_cancel_at_period_end is null then
        raise exception 'Missing cancellation schedule' using errcode = '22023';
    end if;
    v_result := public.apply_stripe_live_membership_snapshot(
        p_event_id, p_event_payload_hash, p_event_type, p_event_created,
        p_observed_at, p_subscription_id, p_checkout_id, p_customer_id,
        p_user_id, p_price_id, p_status, p_period_end, p_paid_new_period);
    if (v_result->>'duplicate')::boolean then return v_result; end if;
    update public.stripe_memberships set
        cancel_at_period_end = p_cancel_at_period_end,
        observed_at = p_observed_at,
        updated_at = clock_timestamp()
    where subscription_id = p_subscription_id and checkout_id = p_checkout_id
        and customer_id = p_customer_id and user_id = p_user_id
        and event_created = p_event_created and observed_at <= p_observed_at
        and current_price_id = p_price_id and status = p_status
        and period_end is not distinct from p_period_end
        and cancel_at_period_end is distinct from p_cancel_at_period_end;
    if found then v_result := v_result || '{"applied":true}'::jsonb; end if;
    return v_result;
end $$;

-- Enrich the already-validated status/claim result without changing grants,
-- ticket pools or paid-through-period eligibility.
create function public.stripe_membership_schedule(p_user_id text, p_livemode boolean)
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
        and (not p_livemode or i.price_id = 'price_1ULM9fQWzwYDIuXWgs5Uj3yt')
    order by m.period_end desc, m.subscription_id desc limit 1;
    return coalesce(v_cancel, false);
end $$;

create function public.stripe_member_status_with_schedule(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_status jsonb;
begin
    v_status := public.stripe_member_status(p_user_id);
    return v_status || jsonb_build_object('cancelAtPeriodEnd',
        (v_status->>'active')::boolean and public.stripe_membership_schedule(p_user_id, false));
end $$;

create function public.claim_stripe_member_daily_grant_with_schedule(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_status jsonb;
begin
    v_status := public.claim_stripe_member_daily_grant(p_user_id);
    return v_status || jsonb_build_object('cancelAtPeriodEnd',
        (v_status->>'active')::boolean and public.stripe_membership_schedule(p_user_id, false));
end $$;

create function public.stripe_live_member_status_with_schedule(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_status jsonb;
begin
    v_status := public.stripe_live_member_status(p_user_id);
    return v_status || jsonb_build_object('cancelAtPeriodEnd',
        (v_status->>'active')::boolean and public.stripe_membership_schedule(p_user_id, true));
end $$;

create function public.claim_stripe_live_member_daily_grant_with_schedule(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_status jsonb;
begin
    v_status := public.claim_stripe_live_member_daily_grant(p_user_id);
    return v_status || jsonb_build_object('cancelAtPeriodEnd',
        (v_status->>'active')::boolean and public.stripe_membership_schedule(p_user_id, true));
end $$;

-- A user may have both test and live subscriptions during QA. Only the
-- configured mode may be offered to the corresponding billing portal.
create function public.stripe_portal_customer_for_user(p_user_id text, p_livemode boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_count integer;
    v_customer text;
    v_subscription text;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_livemode is null or p_user_id is null or length(p_user_id) not between 1 and 256
        or octet_length(convert_to(p_user_id, 'UTF8')) > 256 then
        raise exception 'Invalid portal account or mode' using errcode = '22023';
    end if;
    perform 1 from public.profiles where id = p_user_id for update;
    if not found or exists (select 1 from public.account_deletion_jobs
        where user_id = p_user_id and phase <> 'completed') then
        raise exception 'Portal account unavailable' using errcode = '42501';
    end if;
    select count(*), min(m.customer_id), min(m.subscription_id)
    into v_count, v_customer, v_subscription
    from public.stripe_memberships m
    join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
    join public.stripe_customer_links l on l.customer_id = m.customer_id
    where m.user_id = p_user_id and i.user_id = p_user_id and l.user_id = p_user_id
        and i.livemode = p_livemode
        and m.status not in ('canceled', 'incomplete_expired');
    if v_count = 0 then return jsonb_build_object('manageable', false); end if;
    if v_count <> 1 then
        raise exception 'Ambiguous portal customer' using errcode = '23505';
    end if;
    return jsonb_build_object('manageable', true, 'customerId', v_customer,
        'subscriptionId', v_subscription, 'livemode', p_livemode);
end $$;

-- The legacy unscoped lookup must not be used by the new server.
revoke all on function public.stripe_portal_customer_for_user(text)
    from public, anon, authenticated, service_role;
revoke all on function public.apply_stripe_membership_snapshot_with_schedule(
    text,text,text,bigint,timestamptz,text,text,text,text,text,text,timestamptz,boolean,boolean,boolean),
    public.apply_stripe_live_membership_snapshot_with_schedule(
    text,text,text,bigint,timestamptz,text,text,text,text,text,text,timestamptz,boolean,boolean),
    public.stripe_membership_schedule(text,boolean),
    public.stripe_member_status_with_schedule(text),
    public.claim_stripe_member_daily_grant_with_schedule(text),
    public.stripe_live_member_status_with_schedule(text),
    public.claim_stripe_live_member_daily_grant_with_schedule(text),
    public.stripe_portal_customer_for_user(text,boolean)
    from public, anon, authenticated, service_role;
grant execute on function public.apply_stripe_membership_snapshot_with_schedule(
    text,text,text,bigint,timestamptz,text,text,text,text,text,text,timestamptz,boolean,boolean,boolean),
    public.apply_stripe_live_membership_snapshot_with_schedule(
    text,text,text,bigint,timestamptz,text,text,text,text,text,text,timestamptz,boolean,boolean),
    public.stripe_membership_schedule(text,boolean),
    public.stripe_member_status_with_schedule(text),
    public.claim_stripe_member_daily_grant_with_schedule(text),
    public.stripe_live_member_status_with_schedule(text),
    public.claim_stripe_live_member_daily_grant_with_schedule(text),
    public.stripe_portal_customer_for_user(text,boolean)
    to service_role;

commit;
