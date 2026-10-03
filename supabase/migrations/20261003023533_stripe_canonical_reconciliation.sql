begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- No profile FK: these minimal Stripe routing keys survive verified erasure.
-- They cannot restore a customer, account, membership or wallet.
create table public.stripe_retired_subscriptions (
    subscription_id text not null check (subscription_id ~ '^sub_[A-Za-z0-9]+$'),
    livemode boolean not null,
    retired_at timestamptz not null default clock_timestamp(),
    primary key (subscription_id, livemode)
);
create table public.stripe_reconciliation_leases (
    subscription_id text not null check (subscription_id ~ '^sub_[A-Za-z0-9]+$'),
    livemode boolean not null,
    token uuid not null,
    expires_at timestamptz not null,
    primary key (subscription_id, livemode)
);
create table public.stripe_billing_mode_pin (
    singleton boolean primary key default true check (singleton),
    live_started_at timestamptz not null default clock_timestamp()
);
alter table public.stripe_retired_subscriptions enable row level security;
alter table public.stripe_reconciliation_leases enable row level security;
alter table public.stripe_billing_mode_pin enable row level security;
revoke all on public.stripe_retired_subscriptions, public.stripe_reconciliation_leases,
    public.stripe_billing_mode_pin from public, anon, authenticated, service_role;
grant select, insert on public.stripe_retired_subscriptions, public.stripe_billing_mode_pin to service_role;
grant select, insert, update on public.stripe_reconciliation_leases to service_role;

-- Pin a DB at its first live Checkout intent. Sandbox QA uses a separate DB.
create function public.pin_stripe_live_billing_mode() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
    if new.livemode then
        insert into public.stripe_billing_mode_pin(singleton) values(true) on conflict do nothing;
    end if;
    return new;
end $$;
create trigger stripe_pin_live_mode after insert on public.stripe_checkout_intents
    for each row execute function public.pin_stripe_live_billing_mode();
insert into public.stripe_billing_mode_pin(singleton)
    select true where exists (select 1 from public.stripe_checkout_intents where livemode)
    on conflict do nothing;

create function public.assert_stripe_billing_mode(p_livemode boolean) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
    if current_user <> 'service_role' then raise exception 'Trusted service required' using errcode = '42501'; end if;
    if p_livemode is null or (not p_livemode and exists (select 1 from public.stripe_billing_mode_pin)) then
        raise exception 'Live billing mode is pinned' using errcode = '42501';
    end if;
    return true;
end $$;

-- A lease is acquired BEFORE any canonical subscription read. Only its still-
-- current token can commit. Process death leaves a bounded 90-second retry.
create function public.acquire_stripe_reconciliation(p_subscription_id text, p_livemode boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_token uuid := gen_random_uuid(); v_acquired uuid;
begin
    perform public.assert_stripe_billing_mode(p_livemode);
    if p_subscription_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9]+$' then
        raise exception 'Invalid subscription' using errcode = '22023';
    end if;
    if exists (select 1 from public.stripe_retired_subscriptions
        where subscription_id = p_subscription_id and livemode = p_livemode) then
        return jsonb_build_object('retired', true, 'token', null);
    end if;
    insert into public.stripe_reconciliation_leases(subscription_id,livemode,token,expires_at)
    values(p_subscription_id,p_livemode,v_token,clock_timestamp()+interval '90 seconds')
    on conflict(subscription_id,livemode) do update set token=excluded.token, expires_at=excluded.expires_at
        where stripe_reconciliation_leases.expires_at <= clock_timestamp()
    returning token into v_acquired;
    return jsonb_build_object('retired',false,'token',v_acquired);
end $$;

create function public.require_stripe_reconciliation(p_subscription_id text, p_livemode boolean, p_token uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
    perform public.assert_stripe_billing_mode(p_livemode);
    perform 1 from public.stripe_reconciliation_leases where subscription_id=p_subscription_id
        and livemode=p_livemode and token=p_token and expires_at>clock_timestamp() for update;
    if not found then raise exception 'Expired or superseded reconciliation' using errcode = '40001'; end if;
end $$;

create function public.release_stripe_reconciliation(p_subscription_id text, p_livemode boolean, p_token uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
    if current_user <> 'service_role' then raise exception 'Trusted service required' using errcode = '42501'; end if;
    update public.stripe_reconciliation_leases set expires_at=clock_timestamp()
    where subscription_id=p_subscription_id and livemode=p_livemode and token=p_token;
end $$;

create function public.apply_stripe_canonical_membership_snapshot(
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
        or (p_livemode and v_intent.price_id<>'price_1ULM9fQWzwYDIuXWgs5Uj3yt') then
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

create function public.apply_stripe_canonical_membership_reversal(
    p_event_id text, p_event_payload_hash text, p_event_type text,
    p_subscription_id text, p_reversed_invoice_id text, p_current_invoice_id text,
    p_checkout_id text, p_customer_id text, p_user_id text, p_period_end timestamptz,
    p_livemode boolean, p_token uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
    perform public.require_stripe_reconciliation(p_subscription_id,p_livemode,p_token);
    if exists (select 1 from public.stripe_retired_subscriptions where subscription_id=p_subscription_id and livemode=p_livemode) then
        return jsonb_build_object('applied',false,'duplicate',false,'blocked',false,'retired',true);
    end if;
    if p_livemode then
        return public.apply_stripe_live_membership_reversal(p_event_id,p_event_payload_hash,p_event_type,
            p_subscription_id,p_reversed_invoice_id,p_current_invoice_id,p_checkout_id,p_customer_id,p_user_id,p_period_end);
    end if;
    return public.apply_stripe_membership_reversal(p_event_id,p_event_payload_hash,p_event_type,
        p_subscription_id,p_reversed_invoice_id,p_current_invoice_id,p_checkout_id,p_customer_id,p_user_id,p_period_end,false);
end $$;

-- Invoked only after the guard verified external cancellation of every link.
-- No identity or customer data is retained, just canceled Subscription IDs.
create function public.retire_stripe_account_subscriptions(p_user_id text, p_subscriptions jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_item jsonb;
begin
    if current_user <> 'service_role' then raise exception 'Trusted service required' using errcode = '42501'; end if;
    perform 1 from public.profiles where id=p_user_id for update;
    if not found or not exists (select 1 from public.account_deletion_jobs where user_id=p_user_id and phase<>'completed')
        or jsonb_typeof(p_subscriptions)<>'array' or jsonb_array_length(p_subscriptions)>1000 then
        raise exception 'Deletion intent required' using errcode = '42501';
    end if;
    for v_item in select value from jsonb_array_elements(p_subscriptions) loop
        if v_item->>'subscriptionId' is null or v_item->>'subscriptionId' !~ '^sub_[A-Za-z0-9]+$'
            or jsonb_typeof(v_item->'livemode')<>'boolean'
            or not exists (select 1 from public.stripe_checkout_intents where checkout_id=v_item->>'checkoutId'
                and user_id=p_user_id and livemode=(v_item->>'livemode')::boolean) then
            raise exception 'Unbound retired subscription' using errcode = '42501';
        end if;
        insert into public.stripe_retired_subscriptions(subscription_id,livemode)
            values(v_item->>'subscriptionId',(v_item->>'livemode')::boolean) on conflict do nothing;
    end loop;
    if exists (select 1 from public.stripe_memberships m where m.user_id=p_user_id and not exists (
        select 1 from public.stripe_retired_subscriptions r join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
        where r.subscription_id=m.subscription_id and r.livemode=i.livemode)) then
        raise exception 'Incomplete canceled subscription inventory' using errcode = '42501';
    end if;
end $$;

revoke all on function public.pin_stripe_live_billing_mode(), public.assert_stripe_billing_mode(boolean),
    public.acquire_stripe_reconciliation(text,boolean), public.require_stripe_reconciliation(text,boolean,uuid),
    public.release_stripe_reconciliation(text,boolean,uuid),
    public.apply_stripe_canonical_membership_snapshot(text,text,text,bigint,timestamptz,text,text,text,text,text,text,timestamptz,boolean,boolean,boolean,uuid),
    public.apply_stripe_canonical_membership_reversal(text,text,text,text,text,text,text,text,text,timestamptz,boolean,uuid),
    public.retire_stripe_account_subscriptions(text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.pin_stripe_live_billing_mode(), public.assert_stripe_billing_mode(boolean),
    public.acquire_stripe_reconciliation(text,boolean), public.require_stripe_reconciliation(text,boolean,uuid),
    public.release_stripe_reconciliation(text,boolean,uuid),
    public.apply_stripe_canonical_membership_snapshot(text,text,text,bigint,timestamptz,text,text,text,text,text,text,timestamptz,boolean,boolean,boolean,uuid),
    public.apply_stripe_canonical_membership_reversal(text,text,text,text,text,text,text,text,text,timestamptz,boolean,uuid),
    public.retire_stripe_account_subscriptions(text,jsonb) to service_role;
commit;
