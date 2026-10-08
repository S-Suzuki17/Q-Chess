begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Preserve the terms that authorized this Checkout, not a later publication.
-- Existing API grants are SELECT/INSERT only: no account or API role can alter
-- the snapshot after creation. Null triples are legacy evidence awaiting review.
-- New checkout/spend still requires canonical current ticket consent. No terms
-- version, sale switch, binding, account guard or reversal policy changes here.
alter table public.stripe_commerce_checkout_intents
    add column terms_version text,
    add column terms_accepted_at timestamptz,
    add column terms_effective_date date,
    add constraint stripe_commerce_checkout_consent_snapshot_check check (
        (terms_version is null and terms_accepted_at is null and terms_effective_date is null)
        or (terms_version is not null and terms_accepted_at is not null and terms_effective_date is not null
            and terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{1,3}$'
            and isfinite(terms_accepted_at) and isfinite(terms_effective_date)
            and terms_accepted_at >= (terms_effective_date::timestamp at time zone 'Asia/Tokyo')
            and terms_accepted_at <= created_at));

-- Bounded compatibility proof: the predecessor registration RPC required the
-- one version admitted by current_terms_policy's existing fixed-version CHECK,
-- and recorded created_at itself. Only that policy's matching original consent
-- with publication <= acceptance <= Checkout creation proves the old invariant.
-- Missing, unpublished or temporally ambiguous evidence is left null for an
-- explicit reconciliation-review error; never fabricate acceptance or dates.
update public.stripe_commerce_checkout_intents i
    set terms_version=p.version,terms_accepted_at=c.accepted_at,terms_effective_date=p.effective_date
    from public.current_terms_policy p,public.account_terms_consents c
    where p.singleton and p.effective_date is not null and isfinite(p.effective_date)
        and c.user_id=i.user_id and c.version=p.version and isfinite(c.accepted_at)
        and c.accepted_at >= (p.effective_date::timestamp at time zone 'Asia/Tokyo')
        and c.accepted_at <= i.created_at;

create or replace function public.register_stripe_commerce_checkout_intent(
    p_user_id text,p_checkout_id text,p_sku text,p_price_id text,p_amount_total bigint,
    p_currency text,p_livemode boolean,p_expires_at timestamptz
) returns void language plpgsql security invoker set search_path='' as $$
declare
    v_catalog public.stripe_commerce_catalog;
    v_intent public.stripe_commerce_checkout_intents;
    v_terms jsonb;
begin
    perform public.assert_stripe_billing_mode(p_livemode);
    -- Policy and restriction reads must observe commits after lock waits.
    if current_setting('transaction_isolation')<>'read committed' then
        raise exception 'Commerce Checkout requires READ COMMITTED' using errcode='40001';
    end if;
    if p_user_id is null or p_user_id='' or p_user_id<>btrim(p_user_id) or octet_length(p_user_id)>256
        or p_user_id ~* '^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)'
        or p_checkout_id is null or p_checkout_id !~ ('^cs_' || case when p_livemode then 'live' else 'test' end || '_[A-Za-z0-9]+$')
        or p_expires_at is null or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '2 days' then
        raise exception 'Invalid commerce Checkout registration' using errcode='22023';
    end if;
    select c.* into v_catalog from public.stripe_commerce_catalog c
        join public.stripe_commerce_price_bindings b on b.sku=c.sku
        where c.sku=p_sku and b.price_id=p_price_id and b.livemode=p_livemode;
    if not found or p_amount_total is distinct from v_catalog.amount_total or p_currency is distinct from v_catalog.currency then
        raise exception 'Unverified commerce SKU binding' using errcode='22023';
    end if;
    perform 1 from public.profiles where id=p_user_id for update;
    if not found or exists(select 1 from public.account_deletion_jobs where user_id=p_user_id and phase<>'completed')
        or exists(select 1 from public.account_restrictions where user_id=p_user_id and blocked) then
        raise exception 'Checkout account unavailable' using errcode='42501';
    end if;
    -- Capture the authoritative policy and acceptance together. These fields
    -- are not RPC inputs and API roles cannot update an existing intent.
    v_terms := public.current_account_terms_status(p_user_id);
    if (v_terms->>'effective')::boolean is distinct from true
        or v_terms->'consent' is null or v_terms->'consent' = 'null'::jsonb then
        raise exception 'Checkout account unavailable' using errcode='42501';
    end if;
    if exists(select 1 from public.stripe_commerce_consumed_checkouts where checkout_id=p_checkout_id) then
        raise exception 'Checkout already fulfilled or retired' using errcode='23505';
    end if;
    select * into v_intent from public.stripe_commerce_checkout_intents where checkout_id=p_checkout_id;
    if found then
        if (v_intent.user_id,v_intent.sku,v_intent.price_id,v_intent.amount_total,v_intent.currency,v_intent.livemode,v_intent.expires_at)
            is distinct from (p_user_id,p_sku,p_price_id,p_amount_total,p_currency,p_livemode,p_expires_at) then
            raise exception 'Commerce Checkout collision' using errcode='23505';
        end if;
        -- Re-registration must not turn an ambiguous old contract into a new
        -- payable Checkout or invent a retroactive acceptance snapshot.
        if v_intent.terms_version is null then
            raise exception 'COMMERCE_RECONCILIATION_REVIEW_REQUIRED' using errcode='42501';
        end if;
        return;
    end if;
    if exists(select 1 from public.stripe_checkout_intents where checkout_id=p_checkout_id) then
        raise exception 'Checkout already bound' using errcode='23505';
    end if;
    if v_catalog.mode='subscription' then
        if exists(select 1 from public.stripe_memberships m join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
                where m.user_id=p_user_id and i.livemode=p_livemode and m.status not in ('canceled','incomplete_expired'))
            or exists(select 1 from public.stripe_checkout_intents i where i.user_id=p_user_id and i.livemode=p_livemode
                and i.closed_at is null and not exists(select 1 from public.stripe_memberships m where m.checkout_id=i.checkout_id)) then
            raise exception 'Subscription unresolved or Checkout pending' using errcode='42501';
        end if;
        insert into public.stripe_checkout_intents(checkout_id,user_id,price_id,livemode,expires_at)
            values(p_checkout_id,p_user_id,p_price_id,p_livemode,p_expires_at);
    elsif p_livemode then
        insert into public.stripe_billing_mode_pin(singleton) values(true) on conflict do nothing;
    end if;
    insert into public.stripe_commerce_checkout_intents(checkout_id,user_id,sku,price_id,amount_total,currency,livemode,expires_at,
        terms_version,terms_accepted_at,terms_effective_date)
        values(p_checkout_id,p_user_id,p_sku,p_price_id,p_amount_total,p_currency,p_livemode,p_expires_at,
            v_terms->>'currentVersion',(v_terms->'consent'->>'acceptedAt')::timestamptz,(v_terms->>'effectiveDate')::date);
end $$;

create or replace function public.fulfill_stripe_commerce_one_time(p_evidence jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
    e record;
    v_intent public.stripe_commerce_checkout_intents;
    v_catalog public.stripe_commerce_catalog;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    -- A stale transaction snapshot must not bypass a committed account block.
    if current_setting('transaction_isolation')<>'read committed' then
        raise exception 'Commerce reconciliation requires READ COMMITTED' using errcode='40001';
    end if;
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
        or exists(select 1 from public.account_restrictions where user_id=e."userId" and blocked) then
        raise exception 'Commerce account unavailable' using errcode='42501';
    end if;
    select * into v_intent from public.stripe_commerce_checkout_intents where checkout_id=e."checkoutId";
    if not found or (v_intent.user_id,v_intent.sku,v_intent.price_id,v_intent.amount_total,v_intent.currency,v_intent.livemode)
        is distinct from (e."userId",e.sku,e."priceId",e."amountTotal",e.currency,e.livemode) then
        raise exception 'Unbound paid Checkout' using errcode='42501';
    end if;
    -- Reconcile an owned, already-paid contract using the immutable consent
    -- captured at Checkout creation. A newer policy is for new checkout/spend.
    if v_intent.terms_version is null or v_intent.terms_accepted_at is null
        or v_intent.terms_effective_date is null then
        raise exception 'COMMERCE_RECONCILIATION_REVIEW_REQUIRED' using errcode='42501';
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

create or replace function public.fulfill_stripe_commerce_subscription(p_evidence jsonb)
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
    -- A stale transaction snapshot must not bypass a committed account block.
    if current_setting('transaction_isolation')<>'read committed' then
        raise exception 'Commerce reconciliation requires READ COMMITTED' using errcode='40001';
    end if;
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
        or exists(select 1 from public.account_restrictions where user_id=e."userId" and blocked) then
        raise exception 'Commerce account unavailable' using errcode='42501';
    end if;
    select * into v_intent from public.stripe_commerce_checkout_intents where checkout_id=e."checkoutId";
    if not found or (v_intent.user_id,v_intent.sku,v_intent.price_id,v_intent.amount_total,v_intent.currency,v_intent.livemode)
        is distinct from (e."userId",e.sku,e."priceId",e."amountTotal",e.currency,e.livemode) then
        raise exception 'Unbound paid membership' using errcode='42501';
    end if;
    -- Reconcile an owned, already-paid contract using the immutable consent
    -- captured at Checkout creation. A newer policy is for new checkout/spend.
    if v_intent.terms_version is null or v_intent.terms_accepted_at is null
        or v_intent.terms_effective_date is null then
        raise exception 'COMMERCE_RECONCILIATION_REVIEW_REQUIRED' using errcode='42501';
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

-- Projection only: new Standard/Plus subscriptions must not become a legacy
-- test entitlement through the older status endpoint, including before a paid
-- invoice is durable. Keep genuine legacy test membership and ticket balances.
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
        and m.current_price_id = i.price_id and not i.livemode
        and not exists(select 1 from public.stripe_commerce_checkout_intents ci where ci.checkout_id=i.checkout_id);
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

revoke all on function public.fulfill_stripe_commerce_one_time(jsonb),public.fulfill_stripe_commerce_subscription(jsonb)
    from public,anon,authenticated,service_role;
grant execute on function public.fulfill_stripe_commerce_one_time(jsonb),public.fulfill_stripe_commerce_subscription(jsonb)
    to service_role;
notify pgrst,'reload schema';
commit;
