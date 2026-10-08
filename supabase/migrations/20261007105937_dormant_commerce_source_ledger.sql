begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

-- Record only actual new grants; never fabricate purchase origins from old aggregates.
create table public.stripe_commerce_sources (
 id uuid primary key default gen_random_uuid(), source_key text not null,
 user_id text not null references public.profiles(id) on delete cascade,
 checkout_id text not null references public.stripe_commerce_checkout_intents(checkout_id) on delete cascade,
 subscription_id text, livemode boolean not null, period_start timestamptz, period_end timestamptz,
 origin text not null check(origin in ('purchased','subscription')),
 quantity bigint not null check(quantity between 0 and 166),
 available bigint not null check(available>=0), held bigint not null default 0 check(held>=0),
 consumed bigint not null default 0 check(consumed>=0), revoked bigint not null default 0 check(revoked>=0),
 state text not null check(state in ('active','held','revoked')), created_at timestamptz not null default clock_timestamp(),
 unique(source_key,livemode), check(quantity=available+held+consumed+revoked),
 check((state='active' and held=0) or (state='held' and available=0) or (state='revoked' and available=0 and held=0)),
 check((origin='purchased' and subscription_id is null and period_start is null and period_end is null)
  or (origin='subscription' and subscription_id is not null and subscription_id ~ '^sub_[A-Za-z0-9]+$'
   and period_start is not null and period_end is not null and isfinite(period_start) and isfinite(period_end) and period_end>period_start))
);
create index stripe_commerce_sources_spend on public.stripe_commerce_sources(user_id,livemode,origin,created_at,id) where available>0;
create table public.stripe_commerce_source_risks (
 source_key text not null, livemode boolean not null,
 user_id text not null references public.profiles(id) on delete cascade,
 checkout_id text not null references public.stripe_commerce_checkout_intents(checkout_id) on delete cascade,
 subscription_id text, invoice_id text, period_start timestamptz, period_end timestamptz,
 payment_intent_id text not null check(payment_intent_id ~ '^pi_[A-Za-z0-9]+$'),
 charge_id text not null check(charge_id ~ '^ch_[A-Za-z0-9]+$'), customer_id text,
 amount_refunded bigint not null check(amount_refunded>=0),
 risk_state text not null check(risk_state in ('clear','partial_refund','refunded','disputed','dispute_lost','manual_review')),
 manual_review boolean not null default false, dispute_id text, dispute_status text,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(source_key,livemode), unique(payment_intent_id,livemode), unique(charge_id,livemode), unique(invoice_id,livemode)
);
-- Minimal replay fences survive account erasure, without profile/customer identifiers.
create table public.stripe_commerce_source_risk_receipts (
 event_id text not null check(event_id ~ '^evt_[A-Za-z0-9]+$'), source_key text not null, livemode boolean not null,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'), primary key(event_id,source_key,livemode)
);
create table public.stripe_commerce_reconciliation_leases (
 checkout_id text not null, livemode boolean not null, token uuid not null, expires_at timestamptz not null,
 primary key(checkout_id,livemode)
);
alter table public.cpu_hint_wallet_origins add column source_id uuid references public.stripe_commerce_sources(id) on delete cascade;
alter table public.stripe_commerce_sources enable row level security;
alter table public.stripe_commerce_source_risks enable row level security;
alter table public.stripe_commerce_source_risk_receipts enable row level security;
alter table public.stripe_commerce_reconciliation_leases enable row level security;
revoke all on public.stripe_commerce_sources,public.stripe_commerce_source_risks,public.stripe_commerce_source_risk_receipts,
 public.stripe_commerce_reconciliation_leases from public,anon,authenticated,service_role;
grant select,insert,update on public.stripe_commerce_sources,public.stripe_commerce_source_risks,public.stripe_commerce_reconciliation_leases to service_role;
grant select,insert on public.stripe_commerce_source_risk_receipts to service_role;

create function public.stripe_commerce_source_key(p_checkout_id text,p_subscription_id text,p_period_end timestamptz)
returns text language sql immutable security invoker set search_path='' as $$
 select case when p_subscription_id is null then p_checkout_id else p_subscription_id||':'||extract(epoch from p_period_end)::text end
$$;
create function public.acquire_stripe_commerce_reconciliation(p_checkout_id text,p_livemode boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_token uuid:=gen_random_uuid(); v_acquired uuid;
begin
 perform public.assert_stripe_billing_mode(p_livemode);
 if p_checkout_id is null or p_checkout_id !~ ('^cs_'||case when p_livemode then 'live' else 'test' end||'_[A-Za-z0-9]+$') then
  raise exception 'Invalid Checkout' using errcode='22023'; end if;
 if exists(select 1 from public.stripe_commerce_consumed_checkouts where checkout_id=p_checkout_id and livemode=p_livemode)
  and not exists(select 1 from public.stripe_commerce_checkout_intents where checkout_id=p_checkout_id) then
  return jsonb_build_object('retired',true,'token',null); end if;
 insert into public.stripe_commerce_reconciliation_leases(checkout_id,livemode,token,expires_at)
  values(p_checkout_id,p_livemode,v_token,clock_timestamp()+interval '90 seconds')
 on conflict(checkout_id,livemode) do update set token=excluded.token,expires_at=excluded.expires_at
  where stripe_commerce_reconciliation_leases.expires_at<=clock_timestamp() returning token into v_acquired;
 return jsonb_build_object('retired',false,'token',v_acquired);
end $$;
create function public.require_stripe_commerce_reconciliation(p_checkout_id text,p_livemode boolean,p_token uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform public.assert_stripe_billing_mode(p_livemode);
 perform 1 from public.stripe_commerce_reconciliation_leases where checkout_id=p_checkout_id and livemode=p_livemode
  and token=p_token and expires_at>clock_timestamp() for update;
 if not found then raise exception 'Expired or superseded commerce reconciliation' using errcode='40001'; end if;
end $$;
create function public.release_stripe_commerce_reconciliation(p_checkout_id text,p_livemode boolean,p_token uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
 update public.stripe_commerce_reconciliation_leases set expires_at=clock_timestamp()
  where checkout_id=p_checkout_id and livemode=p_livemode and token=p_token;
end $$;

-- All callers hold the profile lock. Never clamp/debit another origin to conceal drift.
create function public.adjust_stripe_commerce_source_wallet(p_user_id text,p_origin text,p_livemode boolean,p_delta bigint)
returns void language plpgsql security invoker set search_path='' as $$
declare v_column text; v_count integer;
begin
 perform public.assert_stripe_billing_mode(p_livemode);
 if p_origin is null or p_origin not in ('purchased','subscription') or p_delta is null then
  raise exception 'Invalid source adjustment' using errcode='22023'; end if;
 v_column:=case when p_livemode then '' else 'test_' end||p_origin||'_hint_tickets';
 execute format('update public.ticket_wallets set %1$I=%1$I+$2 where user_id=$1 and %1$I::numeric+$2 between 0 and 9007199254740991',v_column)
  using p_user_id,p_delta;
 get diagnostics v_count=row_count;
 if v_count<>1 then
  if p_delta>0 then raise exception 'BALANCE_LIMIT' using errcode='22003';
  else raise exception 'SOURCE_BALANCE_MISMATCH' using errcode='55000'; end if;
 end if;
end $$;
create function public.record_stripe_commerce_source() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_checkout text; v_user text; v_sub text; v_start timestamptz; v_end timestamptz;
 v_live boolean; v_quantity bigint; v_origin text; v_key text; v_risk text; v_state text;
begin
 if tg_table_name='stripe_one_time_purchases' then
  v_checkout:=new.checkout_id; v_user:=new.user_id; v_live:=new.livemode; v_quantity:=new.hint_quantity; v_origin:='purchased';
 else
  v_sub:=new.subscription_id; v_live:=new.livemode; v_start:=new.period_start; v_end:=new.period_end;
  v_quantity:=new.hint_quantity; v_origin:='subscription';
  select m.checkout_id,m.user_id into strict v_checkout,v_user from public.stripe_memberships m where m.subscription_id=v_sub;
 end if;
 v_key:=public.stripe_commerce_source_key(v_checkout,v_sub,v_end);
 select risk_state into v_risk from public.stripe_commerce_source_risks where source_key=v_key and livemode=v_live;
 v_state:=case when v_risk in ('refunded','dispute_lost') then 'revoked' when v_risk='disputed' then 'held' else 'active' end;
 insert into public.stripe_commerce_sources(source_key,user_id,checkout_id,subscription_id,livemode,period_start,period_end,
  origin,quantity,available,held,revoked,state)
 values(v_key,v_user,v_checkout,v_sub,v_live,v_start,v_end,v_origin,v_quantity,
  case when v_state='active' then v_quantity else 0 end,case when v_state='held' then v_quantity else 0 end,
  case when v_state='revoked' then v_quantity else 0 end,v_state);
 if v_state<>'active' and v_quantity>0 then perform public.adjust_stripe_commerce_source_wallet(v_user,v_origin,v_live,-v_quantity); end if;
 return new;
end $$;
create trigger stripe_commerce_purchase_source after insert on public.stripe_one_time_purchases for each row execute function public.record_stripe_commerce_source();
create trigger stripe_commerce_period_source after insert on public.stripe_commerce_paid_periods for each row execute function public.record_stripe_commerce_source();


create function public.apply_stripe_commerce_source_risk(p_evidence jsonb)
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
  or (p."disputeId" is not null and p."disputeId" !~ '^dp_[A-Za-z0-9]+$')
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


-- Free and legacy credits retain their original order. New paid credits can
-- only be consumed through a durable source allocation; aggregate legacy stock
-- is never assigned a guessed provenance during upgrade.
create or replace function public.buy_cpu_hint_v2(p_request_id uuid,p_user_id text,p_session_id uuid,p_revision integer,
 p_state_hash text,p_move jsonb,p_hint jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_result jsonb; v_source public.stripe_commerce_sources;
 v_session public.cpu_practice_sessions; v_receipt public.cpu_hint_receipts;
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'READ_COMMITTED_REQUIRED' using errcode='25001'; end if;
 perform public.cpu_practice_assert_account(p_user_id);
 if exists(select 1 from public.ranked_match_admissions where state='active' and human_ids @> array[p_user_id]) then
  raise exception 'HINT_UNAVAILABLE_IN_MATCH' using errcode='42501'; end if;
 v_result:=public.buy_cpu_hint(p_request_id,p_user_id,p_session_id,p_revision,p_state_hash,p_move,p_hint);
 if v_result->>'error' is distinct from 'INSUFFICIENT_FUNDS' then return v_result; end if;
 perform 1 from public.ticket_wallets where user_id=p_user_id for update;
 select * into v_source from public.stripe_commerce_sources
  where user_id=p_user_id and livemode and state='active' and available>0
  order by case origin when 'subscription' then 0 else 1 end,created_at,id limit 1 for update;
 if not found then return v_result; end if;
 perform public.adjust_stripe_commerce_source_wallet(p_user_id,v_source.origin,true,-1);
 update public.stripe_commerce_sources set available=available-1,consumed=consumed+1 where id=v_source.id;
 select * into strict v_session from public.cpu_practice_sessions where session_id=p_session_id;
 insert into public.cpu_hint_receipts(request_id,user_id,session_id,revision,rules_version,session_hash,move,hint,pool)
  values(p_request_id,p_user_id,p_session_id,p_revision,v_session.rules_version,p_state_hash,p_move,p_hint,'paid')
  returning * into v_receipt;
 insert into public.cpu_hint_wallet_origins(receipt_id,origin,source_id) values(p_request_id,v_source.origin,v_source.id);
 insert into public.cpu_hint_request_aliases(request_id,receipt_id) values(p_request_id,p_request_id);
 return public.cpu_hint_payload(v_receipt);
end $$;

alter function public.restore_cpu_hint_credit(uuid,text,text) rename to restore_cpu_hint_credit_pre_source;
create function public.restore_cpu_hint_credit(p_receipt_id uuid,p_user_id text,p_reason text)
returns integer language plpgsql security invoker set search_path='' as $$
declare v_receipt public.cpu_hint_receipts; v_origin public.cpu_hint_wallet_origins;
 v_source public.stripe_commerce_sources; v_credit integer:=0;
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'READ_COMMITTED_REQUIRED' using errcode='25001'; end if;
 perform public.cpu_practice_assert_account(p_user_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qg-cpu-hint-credit:'||p_receipt_id::text,0));
 select * into v_receipt from public.cpu_hint_receipts where request_id=p_receipt_id and user_id=p_user_id;
 if not found or p_reason is distinct from 'unrecoverable_delivery' then
  raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
 if exists(select 1 from public.cpu_hint_restorations where receipt_id=p_receipt_id) then return 0; end if;
 select * into v_origin from public.cpu_hint_wallet_origins where receipt_id=p_receipt_id;
 if not found then return public.restore_cpu_hint_credit_pre_source(p_receipt_id,p_user_id,p_reason); end if;
 if v_origin.source_id is null then raise exception 'ORIGIN_REVIEW_REQUIRED' using errcode='42501'; end if;
 perform 1 from public.ticket_wallets where user_id=p_user_id for update;
 select * into v_source from public.stripe_commerce_sources where id=v_origin.source_id for update;
 if not found or v_source.user_id<>p_user_id or not v_source.livemode
  or v_source.origin<>v_origin.origin or v_source.consumed<1 then
  raise exception 'SOURCE_BALANCE_MISMATCH' using errcode='55000'; end if;
 if v_source.state='active' then
  perform public.adjust_stripe_commerce_source_wallet(p_user_id,v_source.origin,true,1);
  update public.stripe_commerce_sources set consumed=consumed-1,available=available+1 where id=v_source.id;
  v_credit:=1;
 elsif v_source.state='held' then
  update public.stripe_commerce_sources set consumed=consumed-1,held=held+1 where id=v_source.id;
 else
  update public.stripe_commerce_sources set consumed=consumed-1,revoked=revoked+1 where id=v_source.id;
 end if;
 insert into public.cpu_hint_restorations(receipt_id,reason,credited) values(p_receipt_id,p_reason,v_credit);
 return v_credit;
end $$;

-- Apply the current, fenced payment risk BEFORE a first grant so the same
-- transaction can record refunded/held units without making them spendable.
-- Historical envelopes remain accepted while the source rollout stays dormant.
alter function public.fulfill_stripe_commerce_one_time(jsonb) rename to fulfill_stripe_commerce_one_time_pre_source;
create function public.fulfill_stripe_commerce_one_time(p_evidence jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_risk jsonb; v_result jsonb;
begin
 if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
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

alter function public.fulfill_stripe_commerce_subscription(jsonb) rename to fulfill_stripe_commerce_subscription_pre_source;
create function public.fulfill_stripe_commerce_subscription(p_evidence jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_period jsonb; v_risk jsonb; v_result jsonb; v_name text;
begin
 if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
 foreach v_name in array array['currentPaidPeriod','paidPeriod'] loop
  v_period:=p_evidence->v_name;
  if v_period is not null and v_period<>'null'::jsonb then
   if jsonb_typeof(v_period)<>'object' then raise exception 'Invalid paid period' using errcode='22023'; end if;
   if v_name='currentPaidPeriod' and ((v_period->>'invoiceId') is distinct from (p_evidence->>'latestInvoiceId')
    or (v_period->>'periodEnd')::timestamptz is distinct from (p_evidence->>'periodEnd')::timestamptz) then
    raise exception 'Invalid current paid period' using errcode='22023'; end if;
   if v_period->'paymentSource' is not null and v_period->'paymentSource'<>'null'::jsonb then
    v_risk:=public.apply_stripe_commerce_source_risk(p_evidence||v_period);
    if coalesce((v_risk->>'retired')::boolean,false) then return v_risk; end if;
   end if;
  end if;
 end loop;
 v_result:=public.fulfill_stripe_commerce_subscription_pre_source(p_evidence);
 v_period:=p_evidence->'paidPeriod';
 if exists(select 1 from public.stripe_commerce_sources where source_key=public.stripe_commerce_source_key(
   p_evidence->>'checkoutId',p_evidence->>'subscriptionId',(v_period->>'periodEnd')::timestamptz)
  and livemode=(p_evidence->>'livemode')::boolean and state<>'active') then
  v_result:=v_result||jsonb_build_object('credited',0); end if;
 return v_result;
end $$;


-- Current-period access follows the current paid source. Reversing an older
-- period cannot disable a newer paid subscription period or its earned stock.
create or replace function public.stripe_commerce_status(p_user_id text,p_livemode boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_count integer; v_sku text; v_end timestamptz; v_cancel boolean; v_wallet public.ticket_wallets;
begin
 perform public.assert_stripe_billing_mode(p_livemode);
 if not exists(select 1 from public.profiles where id=p_user_id)
  or exists(select 1 from public.account_deletion_jobs where user_id=p_user_id and phase<>'completed')
  or exists(select 1 from public.account_restrictions where user_id=p_user_id and blocked) then
  raise exception 'Commerce account unavailable' using errcode='42501'; end if;
 select count(*),min(ci.sku),max(m.period_end),bool_or(m.cancel_at_period_end)
 into v_count,v_sku,v_end,v_cancel from public.stripe_memberships m
 join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
 join public.stripe_commerce_checkout_intents ci on ci.checkout_id=i.checkout_id
 join public.stripe_customer_links l on l.customer_id=m.customer_id
 where m.user_id=p_user_id and i.user_id=p_user_id and ci.user_id=p_user_id and l.user_id=p_user_id
  and i.livemode=p_livemode and ci.livemode=p_livemode
  and m.current_price_id=i.price_id and m.current_price_id=ci.price_id
  and m.status='active' and m.period_end>clock_timestamp() and m.refund_blocked_until is null
  and not exists(select 1 from public.stripe_retired_subscriptions r where r.subscription_id=m.subscription_id and r.livemode=p_livemode)
  and exists(select 1 from public.stripe_commerce_paid_periods p
   join public.stripe_commerce_sources s on s.source_key=public.stripe_commerce_source_key(m.checkout_id,p.subscription_id,p.period_end)
    and s.livemode=p.livemode and s.user_id=p_user_id and s.checkout_id=m.checkout_id and s.state='active'
   where p.subscription_id=m.subscription_id and p.livemode=p_livemode and p.period_end=m.period_end and p.sku=ci.sku);
 if v_count>1 then raise exception 'Ambiguous commerce membership' using errcode='23505'; end if;
 select * into v_wallet from public.ticket_wallets where user_id=p_user_id;
 return jsonb_build_object('userId',p_user_id,'active',v_count=1,'sku',v_sku,'periodEnd',v_end,
  'unlimitedRanked',v_count=1,'adFree',v_count=1,'cancelAtPeriodEnd',coalesce(v_cancel,false),
  'purchasedHintTickets',coalesce(case when p_livemode then v_wallet.purchased_hint_tickets else v_wallet.test_purchased_hint_tickets end,0),
  'subscriptionHintTickets',coalesce(case when p_livemode then v_wallet.subscription_hint_tickets else v_wallet.test_subscription_hint_tickets end,0));
end $$;

create or replace function public.get_shared_match_entitlement(p_user_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_count bigint; v_sku text; v_end timestamptz; v_legacy boolean;
begin
 if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
 select count(*),min(c.sku),min(m.period_end) into v_count,v_sku,v_end
 from public.stripe_memberships m
 join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
 join public.stripe_customer_links l on l.customer_id=m.customer_id
 join public.stripe_commerce_checkout_intents ci on ci.checkout_id=m.checkout_id
 join public.stripe_commerce_catalog c on c.sku=ci.sku
 where m.user_id=p_user_id and i.user_id=p_user_id and ci.user_id=p_user_id and l.user_id=p_user_id
  and m.status='active' and m.period_end>clock_timestamp() and isfinite(m.period_end)
  and m.refund_blocked_until is null and m.current_price_id=i.price_id and ci.price_id=i.price_id
  and i.livemode and ci.livemode and c.sku in ('standard_monthly','plus_monthly')
  and c.mode='subscription' and c.unlimited_ranked and c.ad_free
  and not exists(select 1 from public.stripe_retired_subscriptions r where r.subscription_id=m.subscription_id and r.livemode)
  and exists(select 1 from public.stripe_commerce_paid_periods p
   join public.stripe_commerce_sources s on s.source_key=public.stripe_commerce_source_key(m.checkout_id,p.subscription_id,p.period_end)
    and s.livemode and s.user_id=p_user_id and s.checkout_id=m.checkout_id and s.state='active'
   where p.subscription_id=m.subscription_id and p.livemode and p.period_end=m.period_end and p.sku=ci.sku);
 if v_count>1 then raise exception 'Ambiguous shared membership' using errcode='23505'; end if;
 if v_count=1 then return jsonb_build_object('plan',case v_sku when 'standard_monthly' then 'standard' else 'plus' end,
  'unlimitedOnlineRanked',true,'noAds',true,'periodEnd',v_end); end if;
 select exists(select 1 from public.stripe_memberships m
  join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
  join public.stripe_customer_links l on l.customer_id=m.customer_id
  where m.user_id=p_user_id and i.user_id=p_user_id and l.user_id=p_user_id and i.livemode
   and m.status='active' and m.period_end>clock_timestamp() and m.refund_blocked_until is null
   and m.current_price_id=i.price_id and i.price_id='price_1ULM9fQWzwYDIuXWgs5Uj3yt') into v_legacy;
 return jsonb_build_object('plan',case when v_legacy then 'legacy299' else 'free' end,
  'unlimitedOnlineRanked',false,'noAds',false,'periodEnd',null);
end $$;

revoke all on function public.stripe_commerce_source_key(text,text,timestamptz),
 public.acquire_stripe_commerce_reconciliation(text,boolean),
 public.require_stripe_commerce_reconciliation(text,boolean,uuid),
 public.release_stripe_commerce_reconciliation(text,boolean,uuid),
 public.adjust_stripe_commerce_source_wallet(text,text,boolean,bigint),
 public.record_stripe_commerce_source(),public.apply_stripe_commerce_source_risk(jsonb),
 public.buy_cpu_hint_v2(uuid,text,uuid,integer,text,jsonb,jsonb),
 public.restore_cpu_hint_credit_pre_source(uuid,text,text),public.restore_cpu_hint_credit(uuid,text,text),
 public.fulfill_stripe_commerce_one_time_pre_source(jsonb),public.fulfill_stripe_commerce_one_time(jsonb),
 public.fulfill_stripe_commerce_subscription_pre_source(jsonb),public.fulfill_stripe_commerce_subscription(jsonb),
 public.stripe_commerce_status(text,boolean),public.get_shared_match_entitlement(text)
 from public,anon,authenticated,service_role;
grant execute on function public.stripe_commerce_source_key(text,text,timestamptz),
 public.acquire_stripe_commerce_reconciliation(text,boolean),
 public.require_stripe_commerce_reconciliation(text,boolean,uuid),
 public.release_stripe_commerce_reconciliation(text,boolean,uuid),
 public.adjust_stripe_commerce_source_wallet(text,text,boolean,bigint),
 public.record_stripe_commerce_source(),public.apply_stripe_commerce_source_risk(jsonb),
 public.buy_cpu_hint_v2(uuid,text,uuid,integer,text,jsonb,jsonb),
 public.restore_cpu_hint_credit_pre_source(uuid,text,text),public.restore_cpu_hint_credit(uuid,text,text),
 public.fulfill_stripe_commerce_one_time_pre_source(jsonb),public.fulfill_stripe_commerce_one_time(jsonb),
 public.fulfill_stripe_commerce_subscription_pre_source(jsonb),public.fulfill_stripe_commerce_subscription(jsonb),
 public.stripe_commerce_status(text,boolean),public.get_shared_match_entitlement(text)
 to service_role;
-- No protocol/version or release-ready gate is enabled by this migration.
notify pgrst,'reload schema';
commit;

