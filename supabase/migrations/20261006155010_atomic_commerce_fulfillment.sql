begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Callable boundaries for the dormant new-SKU path. A PostgREST RPC is one
-- transaction: an unsuccessful grant rolls back its snapshot and all evidence.
-- No price bindings, sale switches, spending changes or reversal policy here.
create function public.fulfill_stripe_commerce_one_time(p_evidence jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
    e record;
    v_intent public.stripe_commerce_checkout_intents;
    v_catalog public.stripe_commerce_catalog;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    if jsonb_typeof(p_evidence) is distinct from 'object'
        or jsonb_typeof(p_evidence->'livemode') is distinct from 'boolean'
        or jsonb_typeof(p_evidence->'amountTotal') is distinct from 'number'
        or (p_evidence->>'amountTotal') !~ '^[0-9]+$' then
        raise exception 'Invalid commerce evidence envelope' using errcode='22023';
    end if;
    select * into e from jsonb_to_record(p_evidence) as x(
        "eventId" text,"payloadHash" text,"checkoutId" text,"userId" text,"sku" text,
        "priceId" text,"amountTotal" bigint,currency text,livemode boolean,"paymentStatus" text);
    perform public.assert_stripe_billing_mode(e.livemode);
    if e."eventId" is null or e."eventId" !~ '^evt_[A-Za-z0-9]+$'
        or e."payloadHash" is null or e."payloadHash" !~ '^[a-f0-9]{64}$'
        or e."paymentStatus" is distinct from 'paid' then
        raise exception 'Invalid paid Checkout evidence' using errcode='22023';
    end if;
    -- Match the existing one-time grant lock order, including duplicate calls.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qg-commerce-event:'||e."eventId",0));
    perform 1 from public.profiles where id=e."userId" for update;
    if not found or exists(select 1 from public.account_deletion_jobs where user_id=e."userId" and phase<>'completed')
        or exists(select 1 from public.account_restrictions where user_id=e."userId" and blocked)
        or public.has_current_ticket_terms(e."userId") is distinct from true then
        raise exception 'Commerce account or current terms unavailable' using errcode='42501';
    end if;
    select * into v_intent from public.stripe_commerce_checkout_intents where checkout_id=e."checkoutId";
    if not found or (v_intent.user_id,v_intent.sku,v_intent.price_id,v_intent.amount_total,v_intent.currency,v_intent.livemode)
        is distinct from (e."userId",e.sku,e."priceId",e."amountTotal",e.currency,e.livemode) then
        raise exception 'Unbound paid Checkout' using errcode='42501';
    end if;
    select c.* into v_catalog from public.stripe_commerce_catalog c
        join public.stripe_commerce_price_bindings b on b.sku=c.sku
        where c.sku=e.sku and c.mode='payment' and b.price_id=e."priceId" and b.livemode=e.livemode;
    if not found or (v_catalog.amount_total,v_catalog.currency) is distinct from (e."amountTotal",e.currency) then
        raise exception 'Unverified commerce SKU binding' using errcode='22023';
    end if;
    return public.apply_stripe_commerce_one_time_purchase(e."eventId",e."payloadHash",e."checkoutId",e."userId",
        e.sku,e."priceId",e."amountTotal",e.currency,e.livemode,e."paymentStatus");
end $$;

create function public.fulfill_stripe_commerce_subscription(p_evidence jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
    e record;
    p record;
    v_intent public.stripe_commerce_checkout_intents;
    v_catalog public.stripe_commerce_catalog;
    v_member public.stripe_memberships;
    v_paid public.stripe_commerce_paid_evidence;
    v_snapshot jsonb;
    v_grant jsonb;
    v_has_period boolean;
    v_current_paid boolean;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    if jsonb_typeof(p_evidence) is distinct from 'object'
        or jsonb_typeof(p_evidence->'livemode') is distinct from 'boolean'
        or jsonb_typeof(p_evidence->'paidNewPeriod') is distinct from 'boolean'
        or jsonb_typeof(p_evidence->'cancelAtPeriodEnd') is distinct from 'boolean'
        or jsonb_typeof(p_evidence->'amountTotal') is distinct from 'number'
        or (p_evidence->>'amountTotal') !~ '^[0-9]+$'
        or jsonb_typeof(p_evidence->'eventCreated') is distinct from 'number'
        or (p_evidence->>'eventCreated') !~ '^[0-9]+$'
        or (p_evidence->'paidPeriod' is not null and jsonb_typeof(p_evidence->'paidPeriod') not in ('object','null')) then
        raise exception 'Invalid commerce evidence envelope' using errcode='22023';
    end if;
    select * into e from jsonb_to_record(p_evidence) as x(
        "eventId" text,"payloadHash" text,"eventType" text,"eventCreated" bigint,"observedAt" timestamptz,
        "subscriptionId" text,"checkoutId" text,"customerId" text,"userId" text,sku text,"priceId" text,
        "amountTotal" bigint,currency text,status text,"periodEnd" timestamptz,livemode boolean,
        "paidNewPeriod" boolean,"cancelAtPeriodEnd" boolean,token uuid,"latestInvoiceId" text);
    v_has_period := jsonb_typeof(p_evidence->'paidPeriod')='object';
    select * into p from jsonb_to_record(coalesce(nullif(p_evidence->'paidPeriod','null'::jsonb),'{}'::jsonb)) as x(
        "invoiceId" text,"periodStart" timestamptz,"periodEnd" timestamptz);
    perform public.require_stripe_reconciliation(e."subscriptionId",e.livemode,e.token);
    if e."observedAt" is null or not isfinite(e."observedAt")
        or (e."periodEnd" is not null and not isfinite(e."periodEnd"))
        or (e.status='active' and (e."latestInvoiceId" is null or e."latestInvoiceId" !~ '^in_[A-Za-z0-9]+$'))
        or (e."latestInvoiceId" is not null and e."latestInvoiceId" !~ '^in_[A-Za-z0-9]+$') then
        raise exception 'Invalid canonical invoice evidence' using errcode='22023';
    end if;
    if v_has_period and (e."eventType" is distinct from 'invoice.paid'
        or p."invoiceId" is null or p."invoiceId" !~ '^in_[A-Za-z0-9]+$'
        or p."periodStart" is null or p."periodEnd" is null
        or not isfinite(p."periodStart") or not isfinite(p."periodEnd")
        or e."periodEnd" is null or p."periodEnd">e."periodEnd") then
        raise exception 'Invalid paid monthly evidence' using errcode='22023';
    end if;
    v_current_paid := coalesce(v_has_period and e."eventType"='invoice.paid'
        and p."invoiceId"=e."latestInvoiceId" and p."periodEnd"=e."periodEnd",false);
    if e."paidNewPeriod" is distinct from v_current_paid then
        raise exception 'Canonical paid invoice mismatch' using errcode='22023';
    end if;
    perform 1 from public.profiles where id=e."userId" for update;
    if not found or exists(select 1 from public.account_deletion_jobs where user_id=e."userId" and phase<>'completed')
        or exists(select 1 from public.account_restrictions where user_id=e."userId" and blocked)
        or public.has_current_ticket_terms(e."userId") is distinct from true then
        raise exception 'Commerce account or current terms unavailable' using errcode='42501';
    end if;
    select * into v_intent from public.stripe_commerce_checkout_intents where checkout_id=e."checkoutId";
    if not found or (v_intent.user_id,v_intent.sku,v_intent.price_id,v_intent.amount_total,v_intent.currency,v_intent.livemode)
        is distinct from (e."userId",e.sku,e."priceId",e."amountTotal",e.currency,e.livemode) then
        raise exception 'Unbound paid membership' using errcode='42501';
    end if;
    select c.* into v_catalog from public.stripe_commerce_catalog c
        join public.stripe_commerce_price_bindings b on b.sku=c.sku
        where c.sku=e.sku and c.mode='subscription' and b.price_id=e."priceId" and b.livemode=e.livemode;
    if not found or (v_catalog.amount_total,v_catalog.currency) is distinct from (e."amountTotal",e.currency) then
        raise exception 'Unverified commerce SKU binding' using errcode='22023';
    end if;
    -- Validate immutable ownership even when the snapshot event is a duplicate.
    if exists(select 1 from public.stripe_customer_links where customer_id=e."customerId" and user_id<>e."userId")
        or exists(select 1 from public.stripe_webhook_receipts where event_id=e."eventId"
            and (user_id<>e."userId" or payload_hash<>e."payloadHash")) then
        raise exception 'Commerce event ownership collision' using errcode='23505';
    end if;
    select * into v_member from public.stripe_memberships where subscription_id=e."subscriptionId" for update;
    if found and (v_member.checkout_id,v_member.customer_id,v_member.user_id)
        is distinct from (e."checkoutId",e."customerId",e."userId") then
        raise exception 'Subscription ownership changed' using errcode='42501';
    end if;
    if v_has_period and e."periodEnd"<v_member.period_end then
        raise exception 'Canonical paid period regressed' using errcode='40001';
    end if;
    v_snapshot := public.apply_stripe_canonical_membership_snapshot(e."eventId",e."payloadHash",e."eventType",
        e."eventCreated",e."observedAt",e."subscriptionId",e."checkoutId",e."customerId",e."userId",e."priceId",
        e.status,e."periodEnd",e.livemode,e."paidNewPeriod",e."cancelAtPeriodEnd",e.token);
    if not coalesce(v_has_period,false) or coalesce((v_snapshot->>'retired')::boolean,false) then
        return v_snapshot||jsonb_build_object('credited',0,'snapshot',v_snapshot);
    end if;
    -- A reordered invoice has its own paid period. The snapshot persists the
    -- current canonical period, and intentionally inserts no historical marker.
    -- Insert that event's evidence here, in the SAME transaction as its grant.
    -- Current-invoice snapshots may already have inserted the identical row.
    insert into public.stripe_commerce_paid_evidence(event_id,subscription_id,checkout_id,livemode,period_end)
        values(e."eventId",e."subscriptionId",e."checkoutId",e.livemode,p."periodEnd") on conflict do nothing;
    select * into strict v_paid from public.stripe_commerce_paid_evidence where event_id=e."eventId";
    if (v_paid.subscription_id,v_paid.checkout_id,v_paid.livemode,v_paid.period_end)
        is distinct from (e."subscriptionId",e."checkoutId",e.livemode,p."periodEnd") then
        raise exception 'Paid evidence collision' using errcode='23505';
    end if;
    v_grant := public.apply_stripe_commerce_paid_period(e."eventId",e."payloadHash",e."subscriptionId",e."checkoutId",
        e."userId",e.sku,e."priceId",p."periodStart",p."periodEnd",e.livemode,e.token);
    return v_grant||jsonb_build_object('snapshot',v_snapshot);
end $$;

revoke all on function public.fulfill_stripe_commerce_one_time(jsonb),public.fulfill_stripe_commerce_subscription(jsonb)
    from public,anon,authenticated,service_role;
grant execute on function public.fulfill_stripe_commerce_one_time(jsonb),public.fulfill_stripe_commerce_subscription(jsonb)
    to service_role;
notify pgrst,'reload schema';
commit;
