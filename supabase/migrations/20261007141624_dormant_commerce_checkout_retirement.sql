-- Forward-only one-time Checkout retirement. Keep the commerce source gate dormant.
-- A fence records verified terminal provider routing IDs, never a fabricated grant.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';

create table public.stripe_retired_commerce_checkouts (
 checkout_id text primary key,
 livemode boolean not null,
 terminal_state text not null check(terminal_state in ('expired','completed_paid')),
 retired_at timestamptz not null default clock_timestamp(),
 check(checkout_id ~ ('^cs_'||case when livemode then 'live' else 'test' end||'_[A-Za-z0-9]+$'))
);
alter table public.stripe_retired_commerce_checkouts enable row level security;
alter table public.stripe_retired_commerce_checkouts force row level security;
revoke all on public.stripe_retired_commerce_checkouts from public,anon,authenticated,service_role;
grant select,insert on public.stripe_retired_commerce_checkouts to service_role;

create function public.stripe_commerce_deletion_protocol_version()
returns integer language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
 return 1;
end $$;

-- External verification belongs to the trusted server. SQL independently checks
-- the complete account inventory and prohibits retiring paid-but-unfulfilled purchases.
create function public.retire_stripe_commerce_account_checkouts(p_user_id text,p_checkouts jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare v_item jsonb; v_intent public.stripe_commerce_checkout_intents; v_count integer;
 v_seen text[]:='{}'; v_state text; v_live boolean; v_existing public.stripe_retired_commerce_checkouts;
begin
 if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ_COMMITTED_REQUIRED' using errcode='25001'; end if;
 if p_user_id is null or p_user_id='' or jsonb_typeof(p_checkouts) is distinct from 'array'
  or jsonb_array_length(p_checkouts)>1000 then raise exception 'Invalid deletion inventory' using errcode='22023'; end if;
 perform 1 from public.profiles where id=p_user_id for update;
 if not found then
  -- Auth-only signups can have no profile. A data-deleted retry must also be able
  -- to finish Auth removal. No new fence can be written through this empty path.
  if jsonb_array_length(p_checkouts)=0 and exists(select 1 from public.account_deletion_jobs
   where user_id=p_user_id and (phase='data_deleted'
    or (phase='pending' and auth_user_id::text=p_user_id))) then return; end if;
  raise exception 'Deletion intent required' using errcode='42501';
 end if;
 if not exists(select 1 from public.account_deletion_jobs where user_id=p_user_id and phase='pending') then
  raise exception 'Deletion intent required' using errcode='42501'; end if;
 select count(*) into v_count from public.stripe_commerce_checkout_intents i
  join public.stripe_commerce_catalog c on c.sku=i.sku where i.user_id=p_user_id and c.mode='payment';
 if v_count<>jsonb_array_length(p_checkouts) then
  raise exception 'Incomplete commerce deletion inventory' using errcode='42501'; end if;
 for v_item in select value from jsonb_array_elements(p_checkouts) loop
  if jsonb_typeof(v_item) is distinct from 'object' or jsonb_typeof(v_item->'livemode') is distinct from 'boolean'
   or jsonb_typeof(v_item->'checkoutId') is distinct from 'string'
   or jsonb_typeof(v_item->'terminalState') is distinct from 'string' then
   raise exception 'Invalid retired Checkout' using errcode='22023'; end if;
  v_live:=(v_item->>'livemode')::boolean; v_state:=v_item->>'terminalState';
  perform public.assert_stripe_billing_mode(v_live);
  if (v_item->>'checkoutId') !~ ('^cs_'||case when v_live then 'live' else 'test' end||'_[A-Za-z0-9]+$')
   or (v_item->>'checkoutId')=any(v_seen) or v_state not in ('expired','completed_paid') then
   raise exception 'Invalid retired Checkout' using errcode='22023'; end if;
  v_seen:=array_append(v_seen,v_item->>'checkoutId');
  select i.* into v_intent from public.stripe_commerce_checkout_intents i
   join public.stripe_commerce_catalog c on c.sku=i.sku
   where i.checkout_id=v_item->>'checkoutId' and i.user_id=p_user_id and i.livemode=v_live and c.mode='payment';
  if not found then raise exception 'Unbound retired Checkout' using errcode='42501'; end if;
  if (v_state='completed_paid') is distinct from exists(select 1 from public.stripe_one_time_purchases p
   where p.checkout_id=v_intent.checkout_id and p.user_id=p_user_id and p.livemode=v_live) then
   raise exception 'COMMERCE_DELETION_SETTLEMENT_REQUIRED' using errcode='42501'; end if;
  select * into v_existing from public.stripe_retired_commerce_checkouts where checkout_id=v_intent.checkout_id;
  if found and (v_existing.livemode,v_existing.terminal_state) is distinct from (v_live,v_state) then
   raise exception 'Retired Checkout collision' using errcode='23505'; end if;
  insert into public.stripe_retired_commerce_checkouts(checkout_id,livemode,terminal_state)
   values(v_intent.checkout_id,v_live,v_state) on conflict(checkout_id) do nothing;
 end loop;
end $$;

-- A verified grant already has the anonymous consumed fence. Unfulfilled payment
-- intents require explicit external expiry + retirement before any profile cascade.
create function public.guard_unretired_commerce_account_erasure()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.stripe_commerce_checkout_intents i
  join public.stripe_commerce_catalog c on c.sku=i.sku
  where i.user_id=old.id and c.mode='payment'
   and not exists(select 1 from public.stripe_retired_commerce_checkouts r
    where r.checkout_id=i.checkout_id and r.livemode=i.livemode)
   and not exists(select 1 from public.stripe_commerce_consumed_checkouts r
    where r.checkout_id=i.checkout_id and r.livemode=i.livemode)) then
  raise exception 'COMMERCE_DELETION_RETIREMENT_REQUIRED' using errcode='42501';
 end if;
 return old;
end $$;
create trigger guard_unretired_commerce_account_erasure before delete on public.profiles
 for each row execute function public.guard_unretired_commerce_account_erasure();

create or replace function public.acquire_stripe_commerce_reconciliation(p_checkout_id text,p_livemode boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_token uuid:=gen_random_uuid(); v_acquired uuid;
begin
 perform public.assert_stripe_billing_mode(p_livemode);
 if p_checkout_id is null or p_checkout_id !~ ('^cs_'||case when p_livemode then 'live' else 'test' end||'_[A-Za-z0-9]+$') then
  raise exception 'Invalid Checkout' using errcode='22023'; end if;
 if exists(select 1 from public.stripe_retired_commerce_checkouts where checkout_id=p_checkout_id and livemode=p_livemode) then return jsonb_build_object('retired',true,'token',null); end if;
 if exists(select 1 from public.stripe_commerce_consumed_checkouts where checkout_id=p_checkout_id and livemode=p_livemode)
  and not exists(select 1 from public.stripe_commerce_checkout_intents where checkout_id=p_checkout_id) then
  return jsonb_build_object('retired',true,'token',null); end if;
 insert into public.stripe_commerce_reconciliation_leases(checkout_id,livemode,token,expires_at)
  values(p_checkout_id,p_livemode,v_token,clock_timestamp()+interval '90 seconds')
 on conflict(checkout_id,livemode) do update set token=excluded.token,expires_at=excluded.expires_at
  where stripe_commerce_reconciliation_leases.expires_at<=clock_timestamp() returning token into v_acquired;
 return jsonb_build_object('retired',false,'token',v_acquired);
end $$;

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
    if exists(select 1 from public.stripe_retired_commerce_checkouts where checkout_id=p_checkout_id and livemode=p_livemode) or exists(select 1 from public.stripe_commerce_consumed_checkouts where checkout_id=p_checkout_id) then
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

create or replace function public.apply_stripe_commerce_one_time_purchase(
    p_event_id text,p_event_payload_hash text,p_checkout_id text,p_user_id text,p_sku text,
    p_price_id text,p_amount_total bigint,p_currency text,p_livemode boolean,p_payment_status text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
    v_intent public.stripe_commerce_checkout_intents; v_catalog public.stripe_commerce_catalog;
    v_receipt public.stripe_commerce_event_receipts; v_purchase public.stripe_one_time_purchases;
begin
    perform public.assert_stripe_billing_mode(p_livemode);
    if exists(select 1 from public.stripe_retired_commerce_checkouts where checkout_id=p_checkout_id and livemode=p_livemode) then return jsonb_build_object('applied',false,'duplicate',false,'retired',true,'credited',0); end if;
    if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$'
        or p_event_payload_hash is null or p_event_payload_hash !~ '^[a-f0-9]{64}$'
        or p_payment_status is distinct from 'paid' or p_checkout_id is null then
        raise exception 'Invalid paid Checkout evidence' using errcode='22023';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qg-commerce-event:'||p_event_id,0));
    select * into v_receipt from public.stripe_commerce_event_receipts where event_id=p_event_id;
    if found and (v_receipt.payload_hash<>p_event_payload_hash or v_receipt.operation<>'one_time' or v_receipt.business_key<>p_checkout_id) then
        raise exception 'Commerce event collision' using errcode='23505';
    end if;
    -- A consumed checkout whose account/intent was erased must never grant again.
    if exists(select 1 from public.stripe_commerce_consumed_checkouts where checkout_id=p_checkout_id)
        and not exists(select 1 from public.stripe_commerce_checkout_intents where checkout_id=p_checkout_id) then
        return jsonb_build_object('applied',false,'duplicate',true,'retired',true,'credited',0);
    end if;
    perform 1 from public.profiles where id=p_user_id for update;
    if exists(select 1 from public.stripe_retired_commerce_checkouts where checkout_id=p_checkout_id and livemode=p_livemode) then return jsonb_build_object('applied',false,'duplicate',false,'retired',true,'credited',0); end if;
    if not found or exists(select 1 from public.account_deletion_jobs where user_id=p_user_id and phase<>'completed')
        or exists(select 1 from public.account_restrictions where user_id=p_user_id and blocked) then
        raise exception 'Purchase account unavailable' using errcode='42501';
    end if;
    select * into v_intent from public.stripe_commerce_checkout_intents where checkout_id=p_checkout_id;
    if not found or (v_intent.user_id,v_intent.sku,v_intent.price_id,v_intent.amount_total,v_intent.currency,v_intent.livemode)
        is distinct from (p_user_id,p_sku,p_price_id,p_amount_total,p_currency,p_livemode) then
        raise exception 'Unbound paid Checkout' using errcode='42501';
    end if;
    select * into v_catalog from public.stripe_commerce_catalog where sku=p_sku and mode='payment';
    if not found or v_catalog.amount_total<>p_amount_total or v_catalog.currency<>p_currency then
        raise exception 'Invalid purchase SKU' using errcode='22023';
    end if;
    select * into v_purchase from public.stripe_one_time_purchases where checkout_id=p_checkout_id;
    if found then
        insert into public.stripe_commerce_event_receipts(event_id,payload_hash,operation,business_key)
            values(p_event_id,p_event_payload_hash,'one_time',p_checkout_id) on conflict do nothing;
        return jsonb_build_object('applied',false,'duplicate',true,'credited',0);
    end if;
    if v_receipt.event_id is not null or exists(select 1 from public.stripe_commerce_consumed_checkouts where checkout_id=p_checkout_id) then
        raise exception 'Consumed Checkout has no purchase' using errcode='23505';
    end if;
    insert into public.ticket_wallets(user_id) values(p_user_id) on conflict do nothing;
    perform 1 from public.ticket_wallets where user_id=p_user_id for update;
    if p_livemode then
        update public.ticket_wallets set purchased_hint_tickets=purchased_hint_tickets+v_catalog.hint_quantity
            where user_id=p_user_id and purchased_hint_tickets<=9007199254740991-v_catalog.hint_quantity;
    else
        update public.ticket_wallets set test_purchased_hint_tickets=test_purchased_hint_tickets+v_catalog.hint_quantity
            where user_id=p_user_id and test_purchased_hint_tickets<=9007199254740991-v_catalog.hint_quantity;
    end if;
    if not found then raise exception 'Wallet arithmetic limit' using errcode='22003'; end if;
    insert into public.stripe_one_time_purchases(checkout_id,user_id,sku,price_id,amount_total,currency,hint_quantity,livemode)
        values(p_checkout_id,p_user_id,p_sku,p_price_id,p_amount_total,p_currency,v_catalog.hint_quantity,p_livemode);
    insert into public.stripe_commerce_consumed_checkouts(checkout_id,livemode) values(p_checkout_id,p_livemode);
    insert into public.stripe_commerce_event_receipts(event_id,payload_hash,operation,business_key)
        values(p_event_id,p_event_payload_hash,'one_time',p_checkout_id);
    return jsonb_build_object('applied',true,'duplicate',false,'credited',v_catalog.hint_quantity);
end $$;

create or replace function public.apply_stripe_commerce_source_risk(p_evidence jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e record; p record; v_intent public.stripe_commerce_checkout_intents; v_catalog public.stripe_commerce_catalog;
 v_old public.stripe_commerce_source_risks; v_source public.stripe_commerce_sources;
 v_key text; v_state text; v_risk text; v_manual boolean; v_duplicate boolean;
 v_available bigint; v_held bigint; v_revoked bigint; v_recovered bigint:=0; v_released bigint:=0;
begin
 if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ_COMMITTED_REQUIRED' using errcode='25001'; end if;
 if jsonb_typeof(p_evidence) is distinct from 'object' or jsonb_typeof(p_evidence->'paymentSource') is distinct from 'object'
  or jsonb_typeof(p_evidence->'livemode') is distinct from 'boolean'
  or jsonb_typeof(p_evidence->'amountTotal') is distinct from 'number'
  or (p_evidence->>'amountTotal') !~ '^[0-9]+$'
  or jsonb_typeof(p_evidence->'paymentSource'->'amountRefunded') is distinct from 'number'
  or (p_evidence->'paymentSource'->>'amountRefunded') !~ '^[0-9]+$' then
  raise exception 'Invalid source evidence' using errcode='22023'; end if;
 select * into e from jsonb_to_record(p_evidence) as x("eventId" text,"payloadHash" text,"observedAt" timestamptz,
  "checkoutId" text,"userId" text,sku text,"priceId" text,"amountTotal" bigint,currency text,livemode boolean,
  "subscriptionId" text,"invoiceId" text,"periodStart" timestamptz,"periodEnd" timestamptz,token uuid);
 select * into p from jsonb_to_record(p_evidence->'paymentSource') as x("paymentIntentId" text,"chargeId" text,"customerId" text,
  "amountRefunded" bigint,"riskState" text,"disputeId" text,"disputeStatus" text);
 perform public.assert_stripe_billing_mode(e.livemode);
 if e."subscriptionId" is null and exists(select 1 from public.stripe_retired_commerce_checkouts where checkout_id=e."checkoutId" and livemode=e.livemode) then return jsonb_build_object('applied',false,'duplicate',false,'retired',true,'credited',0,'recovered',0,'held',0,'released',0,'manualReview',false); end if;
 if e."eventId" is null or e."eventId" !~ '^evt_[A-Za-z0-9]+$' or e."payloadHash" is null or e."payloadHash" !~ '^[a-f0-9]{64}$'
  or e."observedAt" is null or not isfinite(e."observedAt") or e."observedAt">clock_timestamp()+interval '10 minutes'
  or p."paymentIntentId" is null or p."paymentIntentId" !~ '^pi_[A-Za-z0-9]+$'
  or p."chargeId" is null or p."chargeId" !~ '^ch_[A-Za-z0-9]+$'
  or (p."customerId" is not null and p."customerId" !~ '^cus_[A-Za-z0-9]+$')
  or p."amountRefunded" is null or p."amountRefunded"<0 or p."amountRefunded">e."amountTotal"
  or p."riskState" is null or p."riskState" not in ('clear','partial_refund','refunded','disputed','dispute_lost','manual_review')
  or (p."riskState"='refunded' and p."amountRefunded" is distinct from e."amountTotal")
  or (p."riskState"='partial_refund' and not(p."amountRefunded">0 and p."amountRefunded"<e."amountTotal"))
  or (p."riskState"='clear' and p."amountRefunded"<>0)
  or (p."disputeId" is not null and p."disputeId" !~ '^(dp|du)_[A-Za-z0-9]+$')
  or (p."riskState"='disputed' and (p."disputeId" is null or p."disputeStatus" is null
   or p."disputeStatus" not in ('needs_response','under_review','warning_needs_response','warning_under_review')))
  or (p."riskState"='dispute_lost' and (p."disputeId" is null or p."disputeStatus" is distinct from 'lost')) then
  raise exception 'Invalid canonical source evidence' using errcode='22023'; end if;
 if (e."subscriptionId" is not null and exists(select 1 from public.stripe_retired_subscriptions where subscription_id=e."subscriptionId" and livemode=e.livemode))
  or (e."subscriptionId" is null and exists(select 1 from public.stripe_commerce_consumed_checkouts where checkout_id=e."checkoutId" and livemode=e.livemode)
   and not exists(select 1 from public.stripe_commerce_checkout_intents where checkout_id=e."checkoutId")) then
  return jsonb_build_object('applied',false,'duplicate',false,'retired',true,'credited',0,'recovered',0,'held',0,'released',0,'manualReview',false);
 end if;
 if e."subscriptionId" is null then
  perform public.require_stripe_commerce_reconciliation(e."checkoutId",e.livemode,e.token);
  if e."invoiceId" is not null or e."periodStart" is not null or e."periodEnd" is not null then
   raise exception 'Invalid one-time source period' using errcode='22023'; end if;
 else
  perform public.require_stripe_reconciliation(e."subscriptionId",e.livemode,e.token);
  if e."invoiceId" is null or e."invoiceId" !~ '^in_[A-Za-z0-9]+$' or p."customerId" is null
   or e."periodStart" is null or e."periodEnd" is null or not isfinite(e."periodStart") or not isfinite(e."periodEnd")
   or e."periodEnd"<e."periodStart"+interval '27 days' or e."periodEnd">e."periodStart"+interval '32 days'
   or e."periodStart">clock_timestamp()+interval '10 minutes' then
   raise exception 'Invalid paid source period' using errcode='22023'; end if;
 end if;
 -- The profile lock serializes purchase, consumption, risk, restoration and erasure.
 perform 1 from public.profiles where id=e."userId" for update;
 if e."subscriptionId" is null and exists(select 1 from public.stripe_retired_commerce_checkouts where checkout_id=e."checkoutId" and livemode=e.livemode) then return jsonb_build_object('applied',false,'duplicate',false,'retired',true,'credited',0,'recovered',0,'held',0,'released',0,'manualReview',false); end if;
 if not found then raise exception 'Commerce account unavailable' using errcode='42501'; end if;
 select * into v_intent from public.stripe_commerce_checkout_intents where checkout_id=e."checkoutId";
 if not found or (v_intent.user_id,v_intent.sku,v_intent.price_id,v_intent.amount_total,v_intent.currency,v_intent.livemode)
  is distinct from (e."userId",e.sku,e."priceId",e."amountTotal",e.currency,e.livemode) then
  raise exception 'Unbound commerce source' using errcode='42501'; end if;
 if v_intent.terms_version is null or v_intent.terms_accepted_at is null or v_intent.terms_effective_date is null then
  raise exception 'COMMERCE_RECONCILIATION_REVIEW_REQUIRED' using errcode='42501'; end if;
 select c.* into v_catalog from public.stripe_commerce_catalog c join public.stripe_commerce_price_bindings b on b.sku=c.sku
  where c.sku=e.sku and b.price_id=e."priceId" and b.livemode=e.livemode;
 if not found or (v_catalog.amount_total,v_catalog.currency) is distinct from (e."amountTotal",e.currency)
  or (v_catalog.mode='subscription') is distinct from (e."subscriptionId" is not null) then
  raise exception 'Unverified source SKU' using errcode='22023'; end if;
 if exists(select 1 from public.stripe_customer_links where customer_id=p."customerId" and user_id<>e."userId")
  or exists(select 1 from public.stripe_memberships where subscription_id=e."subscriptionId"
   and (checkout_id,user_id,customer_id) is distinct from (e."checkoutId",e."userId",p."customerId")) then
  raise exception 'Source ownership collision' using errcode='23505'; end if;
 v_key:=public.stripe_commerce_source_key(e."checkoutId",e."subscriptionId",e."periodEnd");
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qg-commerce-risk-event:'||e."eventId",0));
 if exists(select 1 from public.stripe_commerce_source_risk_receipts where event_id=e."eventId" and payload_hash<>e."payloadHash") then
  raise exception 'Source event collision' using errcode='23505'; end if;
 v_duplicate:=exists(select 1 from public.stripe_commerce_source_risk_receipts
  where event_id=e."eventId" and source_key=v_key and livemode=e.livemode);
 select * into v_old from public.stripe_commerce_source_risks where source_key=v_key and livemode=e.livemode for update;
 if found and (v_old.user_id,v_old.checkout_id,v_old.subscription_id,v_old.invoice_id,v_old.period_start,v_old.period_end,
   v_old.payment_intent_id,v_old.charge_id,v_old.customer_id)
  is distinct from (e."userId",e."checkoutId",e."subscriptionId",e."invoiceId",e."periodStart",e."periodEnd",
   p."paymentIntentId",p."chargeId",p."customerId") then
  raise exception 'Source lineage collision' using errcode='23505'; end if;
 select * into v_source from public.stripe_commerce_sources where source_key=v_key and livemode=e.livemode for update;
 if found and (v_source.user_id,v_source.checkout_id,v_source.subscription_id,v_source.period_start,v_source.period_end)
  is distinct from (e."userId",e."checkoutId",e."subscriptionId",e."periodStart",e."periodEnd") then
  raise exception 'Source period collision' using errcode='23505'; end if;
 if v_source.id is null and
  (exists(select 1 from public.stripe_one_time_purchases where checkout_id=e."checkoutId" and e."subscriptionId" is null)
   or exists(select 1 from public.stripe_commerce_paid_periods where subscription_id=e."subscriptionId" and livemode=e.livemode and period_end=e."periodEnd")) then
  raise exception 'COMMERCE_SOURCE_REVIEW_REQUIRED' using errcode='42501'; end if;
 -- Fully reversed allocations never regrant. All other transitions use the
 -- current fenced provider graph, even if event delivery is duplicate/older.
 v_risk:=case when v_old.risk_state in ('refunded','dispute_lost') then v_old.risk_state else p."riskState" end;
 v_manual:=coalesce(v_old.manual_review,false) or p."riskState" in ('partial_refund','manual_review');
 insert into public.stripe_commerce_source_risks(source_key,livemode,user_id,checkout_id,subscription_id,invoice_id,period_start,period_end,
  payment_intent_id,charge_id,customer_id,amount_refunded,risk_state,manual_review,dispute_id,dispute_status)
 values(v_key,e.livemode,e."userId",e."checkoutId",e."subscriptionId",e."invoiceId",e."periodStart",e."periodEnd",
  p."paymentIntentId",p."chargeId",p."customerId",p."amountRefunded",v_risk,v_manual,p."disputeId",p."disputeStatus")
 on conflict(source_key,livemode) do update set amount_refunded=greatest(stripe_commerce_source_risks.amount_refunded,excluded.amount_refunded),
  risk_state=excluded.risk_state,manual_review=excluded.manual_review,dispute_id=excluded.dispute_id,dispute_status=excluded.dispute_status,updated_at=clock_timestamp();
 v_state:=case when v_risk in ('refunded','dispute_lost') then 'revoked' when v_risk='disputed' then 'held' else 'active' end;
 if v_source.id is not null then
  v_available:=v_source.available; v_held:=v_source.held; v_revoked:=v_source.revoked;
  if v_state='revoked' then
   v_recovered:=v_available+v_held; v_revoked:=v_revoked+v_recovered; v_available:=0; v_held:=0;
  elsif v_state='held' then v_held:=v_held+v_available; v_available:=0;
  else v_released:=v_held; v_available:=v_available+v_held; v_held:=0; end if;
  if v_available<>v_source.available then
   perform public.adjust_stripe_commerce_source_wallet(e."userId",v_source.origin,e.livemode,v_available-v_source.available); end if;
  update public.stripe_commerce_sources set available=v_available,held=v_held,revoked=v_revoked,state=v_state where id=v_source.id;
 end if;
 insert into public.stripe_commerce_source_risk_receipts(event_id,source_key,livemode,payload_hash)
  values(e."eventId",v_key,e.livemode,e."payloadHash") on conflict do nothing;
 return jsonb_build_object('applied',not v_duplicate,'duplicate',v_duplicate,'credited',0,'recovered',v_recovered,
  'held',coalesce(v_held,0),'released',v_released,'manualReview',v_manual);
end $$;

create or replace function public.fulfill_stripe_commerce_one_time(p_evidence jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_risk jsonb; v_result jsonb;
begin
 if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
 if jsonb_typeof(p_evidence->'livemode')='boolean' and exists(select 1 from public.stripe_retired_commerce_checkouts
  where checkout_id=p_evidence->>'checkoutId' and livemode=(p_evidence->>'livemode')::boolean) then
  perform public.assert_stripe_billing_mode((p_evidence->>'livemode')::boolean); return jsonb_build_object('applied',false,'duplicate',false,'retired',true,'credited',0); end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qg-commerce-event:'||(p_evidence->>'eventId'),0));
 if p_evidence->'paymentSource' is not null and p_evidence->'paymentSource'<>'null'::jsonb then
  v_risk:=public.apply_stripe_commerce_source_risk(p_evidence||jsonb_build_object(
   'subscriptionId',null,'invoiceId',null,'periodStart',null,'periodEnd',null));
  if coalesce((v_risk->>'retired')::boolean,false) then return v_risk; end if;
 end if;
 v_result:=public.fulfill_stripe_commerce_one_time_pre_source(p_evidence);
 if exists(select 1 from public.stripe_commerce_sources where source_key=p_evidence->>'checkoutId'
  and livemode=(p_evidence->>'livemode')::boolean and state<>'active') then
  v_result:=v_result||jsonb_build_object('credited',0); end if;
 return v_result;
end $$;
revoke all on function public.stripe_commerce_deletion_protocol_version(),
 public.retire_stripe_commerce_account_checkouts(text,jsonb),public.guard_unretired_commerce_account_erasure()
 from public,anon,authenticated,service_role;
grant execute on function public.stripe_commerce_deletion_protocol_version(),
 public.retire_stripe_commerce_account_checkouts(text,jsonb) to service_role;
commit;
