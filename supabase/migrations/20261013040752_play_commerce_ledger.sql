begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

-- No sale opens on migration. Test receipts require a separately configured test database.
create table public.play_commerce_settings (
 id integer primary key check(id=1), environment text not null check(environment in ('live','test')),
 new_purchases_enabled boolean not null default false
);
insert into public.play_commerce_settings values(1,'live',false);
create table public.play_commerce_accounts (
 generation uuid primary key default gen_random_uuid(),
 user_id text unique references public.profiles(id) on delete set null,
 account_id text not null unique check(account_id ~ '^[a-f0-9]{64}$'),
 retired_at timestamptz, created_at timestamptz not null default clock_timestamp(),
 check(user_id is not null or retired_at is not null)
);
create table public.play_commerce_intents (
 intent_id text primary key check(intent_id ~ '^[a-f0-9]{64}$'),
 generation uuid not null references public.play_commerce_accounts(generation),
 sku text not null check(sku in ('standard_monthly','plus_monthly','hints_1','hints_13','hints_27','hints_44','hints_77','hints_166')),
 test boolean not null, terms_version text not null,
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null
);
create index play_commerce_intent_owner on public.play_commerce_intents(generation,created_at);
create table public.play_commerce_leases (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 lease uuid not null, expires_at timestamptz not null
);
create table public.play_commerce_tokens (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 generation uuid not null references public.play_commerce_accounts(generation),
 sku text not null, test boolean not null, ciphertext text,
 ownership jsonb not null check(jsonb_typeof(ownership)='object'),
 state text not null, active boolean not null default false, period_end timestamptz,
 cancel_at_period_end boolean not null default false, has_paid boolean not null default false,
 acknowledged boolean not null default false, consumed boolean not null default false,
 retired boolean not null default false, latest_order_key text, history_cursor bigint not null default -1 check(history_cursor>=-1),
 checked_at timestamptz not null default clock_timestamp(), next_check_at timestamptz not null default clock_timestamp(),
 check(ciphertext is null or (length(ciphertext) between 45 and 12000 and ciphertext ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')),
 check(not active or (period_end is not null and isfinite(period_end) and has_paid and not retired))
);
create index play_commerce_token_owner on public.play_commerce_tokens(generation,test);
create index play_commerce_token_reconcile on public.play_commerce_tokens(next_check_at) where not retired;
create table public.play_commerce_orders (
 order_key text primary key, order_id text not null unique,
 token_hash text not null references public.play_commerce_tokens(token_hash),
 generation uuid not null references public.play_commerce_accounts(generation),
 sku text not null, test boolean not null, refunded boolean not null default false,
 granted boolean not null default false, evidence jsonb not null,
 created_at timestamptz not null default clock_timestamp(), checked_at timestamptz not null default clock_timestamp()
);
create table public.play_commerce_sources (
 id uuid primary key default gen_random_uuid(),order_key text not null unique references public.play_commerce_orders(order_key),
 generation uuid not null references public.play_commerce_accounts(generation),
 user_id text references public.profiles(id) on delete set null,
 test boolean not null,origin text not null check(origin in ('subscription','purchased')),
 quantity bigint not null check(quantity between 1 and 166),available bigint not null check(available>=0),
 consumed bigint not null default 0 check(consumed>=0),revoked bigint not null default 0 check(revoked>=0),
 state text not null default 'active' check(state in ('active','revoked')),
 created_at timestamptz not null default clock_timestamp(),
 check(quantity=available+consumed+revoked),check(state='active' or available=0)
);
create index play_commerce_source_spend on public.play_commerce_sources(user_id,test,origin,created_at,id) where state='active' and available>0;
create table public.play_commerce_outbox (
 token_hash text primary key references public.play_commerce_tokens(token_hash),
 action text not null check(action in ('acknowledge','consume')),
 completed boolean not null default false,attempts integer not null default 0,
 available_at timestamptz not null default clock_timestamp(),job_lease uuid,lease_until timestamptz
);
create table public.play_commerce_notifications (
 message_id text primary key check(length(message_id) between 1 and 256),
 received_at timestamptz not null default clock_timestamp()
);
do $$ declare t text; begin
 foreach t in array array['play_commerce_settings','play_commerce_accounts','play_commerce_intents','play_commerce_leases',
  'play_commerce_tokens','play_commerce_orders','play_commerce_sources','play_commerce_outbox','play_commerce_notifications'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select,insert,update on public.%I to service_role',t);
 end loop;
end $$;
create function public.claim_play_commerce_delivery() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.play_commerce_outbox;t public.play_commerce_tokens;v_lease uuid:=gen_random_uuid();begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 select o.* into j from public.play_commerce_outbox o join public.play_commerce_tokens p using(token_hash)
 where not o.completed and o.available_at<=clock_timestamp() and (o.lease_until is null or o.lease_until<=clock_timestamp())
  and not p.retired and p.ciphertext is not null order by o.available_at,o.token_hash limit 1 for update of o skip locked;
 if not found then return null;end if;
 update public.play_commerce_outbox set job_lease=v_lease,lease_until=clock_timestamp()+interval '60 seconds',attempts=attempts+1 where token_hash=j.token_hash;
 select * into strict t from public.play_commerce_tokens where token_hash=j.token_hash;
 return jsonb_build_object('tokenHash',j.token_hash,'sku',t.sku,'ciphertext',t.ciphertext,'action',j.action,'lease',v_lease);
end $$;
create function public.finish_play_commerce_delivery(p_token_hash text,p_lease uuid,p_success boolean) returns void
language plpgsql security invoker set search_path='' as $$ begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 update public.play_commerce_outbox set completed=p_success,job_lease=null,lease_until=null,
  available_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer))
 where token_hash=p_token_hash and job_lease=p_lease and lease_until>clock_timestamp();
 if not found then raise exception 'BUSY' using errcode='40001';end if;
end $$;
create function public.play_commerce_status(p_user_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.play_commerce_accounts;v_test boolean;v_active boolean;v_sku text;v_end timestamptz;v_cancel boolean;
 v_purchased bigint:=0;v_subscription bigint:=0;v_enabled boolean;begin
 perform public.match_hint_assert_account(p_user_id);
 select environment='test',new_purchases_enabled into strict v_test,v_enabled from public.play_commerce_settings where id=1;
 select * into a from public.play_commerce_accounts where user_id=p_user_id and retired_at is null;
 select sku,period_end,cancel_at_period_end into v_sku,v_end,v_cancel from public.play_commerce_tokens
 where generation=a.generation and test=v_test and active and not retired and period_end>clock_timestamp()
 order by case sku when 'plus_monthly' then 0 else 1 end,period_end desc limit 1;
 v_active:=found;
 select coalesce(sum(available) filter(where origin='purchased'),0),coalesce(sum(available) filter(where origin='subscription'),0)
 into v_purchased,v_subscription from public.play_commerce_sources where generation=a.generation and test=v_test and state='active';
 return jsonb_build_object('userId',p_user_id,'enabled',v_enabled,'test',v_test,'active',v_active,
  'sku',v_sku,'periodEnd',v_end,'cancelAtPeriodEnd',coalesce(v_cancel,false),
  'subscriptionBlocked',exists(select 1 from public.play_commerce_tokens where generation=a.generation and test=v_test and not retired
   and sku in ('standard_monthly','plus_monthly') and state not in ('SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'))
   or exists(select 1 from public.play_commerce_intents where generation=a.generation and test=v_test and sku in ('standard_monthly','plus_monthly') and expires_at>clock_timestamp())
   or exists(select 1 from public.stripe_memberships m join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id where m.user_id=p_user_id and i.livemode=(not v_test) and m.status not in ('canceled','incomplete_expired'))
   or exists(select 1 from public.stripe_checkout_intents i where i.user_id=p_user_id and i.livemode=(not v_test) and i.closed_at is null and not exists(select 1 from public.stripe_memberships m where m.checkout_id=i.checkout_id)),
  'purchasedHintTickets',v_purchased,'subscriptionHintTickets',v_subscription,
  'deliveryPending',exists(select 1 from public.play_commerce_outbox o join public.play_commerce_tokens t using(token_hash) where t.generation=a.generation and not o.completed));
end $$;

-- Extend the existing receipt, leaving all prior Stripe/free/legacy allocations intact.
alter table public.match_hint_receipts add column play_source_id uuid references public.play_commerce_sources(id);
do $$ declare v_name text;begin
 select conname into strict v_name from pg_catalog.pg_constraint where conrelid='public.match_hint_receipts'::regclass
  and contype='c' and pg_catalog.pg_get_constraintdef(oid) like '%source_id IS NOT NULL%';
 execute format('alter table public.match_hint_receipts drop constraint %I',v_name);
end $$;
alter table public.match_hint_receipts add constraint match_hint_paid_source
 check((origin in ('subscription','purchased'))=(source_id is not null or play_source_id is not null)
  and not (source_id is not null and play_source_id is not null));
alter function public.buy_match_hint(uuid,text,uuid,text,text,text,integer,text,text,timestamptz,jsonb,jsonb) rename to buy_match_hint_pre_play;
create function public.buy_match_hint(p_request_id uuid,p_user_id text,p_context_id uuid,p_kind text,p_mode text,
 p_side text,p_revision integer,p_state_hash text,p_rules_version text,p_valid_until timestamptz,p_move jsonb,p_hint jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_result jsonb;s public.play_commerce_sources;r public.match_hint_receipts;begin
 -- Existing function owns auth, current terms, idempotency, canonical context,
 -- all free/legacy/Stripe spend and the profile/wallet locks in this transaction.
 v_result:=public.buy_match_hint_pre_play(p_request_id,p_user_id,p_context_id,p_kind,p_mode,p_side,p_revision,p_state_hash,p_rules_version,p_valid_until,p_move,p_hint);
 if v_result->>'error' is distinct from 'INSUFFICIENT_FUNDS' then return v_result;end if;
 select * into s from public.play_commerce_sources where user_id=p_user_id and not test and state='active' and available>0
 order by case origin when 'subscription' then 0 else 1 end,created_at,id limit 1 for update;
 if not found then return v_result;end if;
 if p_valid_until<=clock_timestamp() then raise exception 'HINT_CONTEXT_EXPIRED' using errcode='22023';end if;
 perform public.adjust_play_commerce_wallet(p_user_id,s.origin,false,-1);
 update public.play_commerce_sources set available=available-1,consumed=consumed+1 where id=s.id;
 insert into public.match_hint_receipts(request_id,user_id,context_id,kind,mode,side,revision,state_hash,rules_version,move,hint,origin,play_source_id)
 values(p_request_id,p_user_id,p_context_id,p_kind,p_mode,p_side,p_revision,p_state_hash,p_rules_version,p_move,p_hint,s.origin,s.id) returning * into r;
 insert into public.match_hint_request_aliases(request_id,receipt_id) values(p_request_id,p_request_id);
 return public.match_hint_payload(r);
end $$;
alter function public.restore_match_hint_credit(uuid,text,text) rename to restore_match_hint_credit_pre_play;
create function public.restore_match_hint_credit(p_receipt_id uuid,p_user_id text,p_reason text) returns integer
language plpgsql security invoker set search_path='' as $$
declare r public.match_hint_receipts;s public.play_commerce_sources;v_credit integer:=0;begin
 perform public.match_hint_assert_account(p_user_id);
 select * into r from public.match_hint_receipts where request_id=p_receipt_id and user_id=p_user_id;
 if not found or p_reason is distinct from 'unrecoverable_delivery' then raise exception 'INVALID_REQUEST' using errcode='22023';end if;
 if r.play_source_id is null then return public.restore_match_hint_credit_pre_play(p_receipt_id,p_user_id,p_reason);end if;
 if exists(select 1 from public.match_hint_restorations where receipt_id=p_receipt_id) then return 0;end if;
 perform 1 from public.ticket_wallets where user_id=p_user_id for update;
 select * into strict s from public.play_commerce_sources where id=r.play_source_id for update;
 if s.user_id is distinct from p_user_id or s.test or s.origin<>r.origin or s.consumed<1 then raise exception 'SOURCE_BALANCE_MISMATCH' using errcode='55000';end if;
 if s.state='active' then
  perform public.adjust_play_commerce_wallet(p_user_id,s.origin,false,1);
  update public.play_commerce_sources set consumed=consumed-1,available=available+1 where id=s.id;v_credit:=1;
 else update public.play_commerce_sources set consumed=consumed-1,revoked=revoked+1 where id=s.id;end if;
 insert into public.match_hint_restorations(receipt_id,reason,credited) values(p_receipt_id,p_reason,v_credit);
 return v_credit;
end $$;
alter function public.get_shared_match_entitlement(text) rename to get_shared_match_entitlement_pre_play;
create function public.get_shared_match_entitlement(p_user_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_previous jsonb;t public.play_commerce_tokens;begin
 v_previous:=public.get_shared_match_entitlement_pre_play(p_user_id);
 select p.* into t from public.play_commerce_tokens p join public.play_commerce_accounts a on a.generation=p.generation
 where a.user_id=p_user_id and a.retired_at is null and not p.test and not p.retired and p.active and p.period_end>clock_timestamp()
 order by case p.sku when 'plus_monthly' then 0 else 1 end,p.period_end desc limit 1;
 if not found then return v_previous;end if;
 return jsonb_build_object('plan',case when t.sku='plus_monthly' or v_previous->>'plan'='plus' then 'plus' else 'standard' end,
  'unlimitedOnlineRanked',true,'noAds',true,'periodEnd',greatest(t.period_end,(v_previous->>'periodEnd')::timestamptz));
end $$;

create function public.retire_play_commerce_account() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_generation uuid;begin
 select generation into v_generation from public.play_commerce_accounts where user_id=old.id for update;
 if not found then return old;end if;
 -- Deletion must first cancel auto renewal through the server's provider hook.
 if exists(select 1 from public.play_commerce_tokens where generation=v_generation and not retired and sku in ('standard_monthly','plus_monthly')
  and not cancel_at_period_end and state not in ('SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'))
 then raise exception 'PLAY_DELETION_RETIREMENT_REQUIRED' using errcode='42501';end if;
 update public.play_commerce_accounts set retired_at=clock_timestamp() where generation=v_generation;
 update public.play_commerce_tokens set retired=true,active=false,ciphertext=null,ownership='{}'::jsonb where generation=v_generation;
 update public.play_commerce_sources set state='revoked',revoked=revoked+available,available=0 where generation=v_generation;
 return old;
end $$;
create trigger retire_play_commerce_account before delete on public.profiles for each row execute function public.retire_play_commerce_account();

create function public.play_commerce_mode(p_test boolean) returns void
language plpgsql security invoker set search_path='' as $$ begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if p_test is null or not exists(select 1 from public.play_commerce_settings where id=1 and (environment='test')=p_test)
 then raise exception 'MODE_MISMATCH' using errcode='42501'; end if;
end $$;
create function public.adjust_play_commerce_wallet(p_user_id text,p_origin text,p_test boolean,p_delta bigint) returns void
language plpgsql security invoker set search_path='' as $$
declare v_column text;v_count integer;begin
 perform public.play_commerce_mode(p_test);
 if p_origin is null or p_origin not in ('subscription','purchased') or p_delta is null then raise exception 'INVALID_PURCHASE' using errcode='22023';end if;
 v_column:=case when p_test then 'test_' else '' end||p_origin||'_hint_tickets';
 execute format('update public.ticket_wallets set %1$I=%1$I+$2 where user_id=$1 and %1$I::numeric+$2 between 0 and 9007199254740991',v_column) using p_user_id,p_delta;
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'SOURCE_BALANCE_MISMATCH' using errcode='55000';end if;
end $$;

create function public.create_play_commerce_intent(p_user_id text,p_sku text,p_generation uuid,p_account_id text,p_intent_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.play_commerce_accounts;s public.play_commerce_settings;v_test boolean;v_terms text;begin
 perform public.match_hint_assert_account(p_user_id);
 if not public.has_current_ticket_terms(p_user_id) then raise exception 'TERMS_REQUIRED' using errcode='42501';end if;
 select * into strict s from public.play_commerce_settings where id=1;
 if not s.new_purchases_enabled then raise exception 'FEATURE_DISABLED' using errcode='42501';end if;
 v_test:=s.environment='test';perform public.play_commerce_mode(v_test);
 if p_sku is null or p_sku not in ('standard_monthly','plus_monthly','hints_1','hints_13','hints_27','hints_44','hints_77','hints_166')
  or p_generation is null or p_account_id is distinct from encode(sha256(convert_to('com.qgambit.app:commerce:'||p_generation::text,'UTF8')),'hex') or p_intent_id is null or p_intent_id !~ '^[a-f0-9]{64}$'
 then raise exception 'INVALID_PURCHASE' using errcode='22023';end if;
 select * into a from public.play_commerce_accounts where user_id=p_user_id;
 if not found then
  insert into public.play_commerce_accounts(generation,user_id,account_id) values(p_generation,p_user_id,p_account_id) returning * into a;
 end if;
 if a.retired_at is not null then raise exception 'RETIRED' using errcode='42501';end if;
 if p_sku in ('standard_monthly','plus_monthly') and (
  exists(select 1 from public.play_commerce_tokens where generation=a.generation and test=v_test and sku in ('standard_monthly','plus_monthly')
   and not retired and state not in ('SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'))
  or exists(select 1 from public.play_commerce_intents where generation=a.generation and sku in ('standard_monthly','plus_monthly') and expires_at>clock_timestamp())
  or exists(select 1 from public.stripe_memberships m join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
   where m.user_id=p_user_id and i.livemode=(not v_test) and m.status not in ('canceled','incomplete_expired'))
  or exists(select 1 from public.stripe_checkout_intents i where i.user_id=p_user_id and i.livemode=(not v_test) and i.closed_at is null
   and not exists(select 1 from public.stripe_memberships m where m.checkout_id=i.checkout_id)))
 then raise exception 'BUSY' using errcode='55006';end if;
 v_terms:=public.current_account_terms_status(p_user_id)->>'currentVersion';
 insert into public.play_commerce_intents(intent_id,generation,sku,test,terms_version,expires_at)
 values(p_intent_id,a.generation,p_sku,v_test,v_terms,clock_timestamp()+interval '30 minutes');
 return jsonb_build_object('userId',p_user_id,'sku',p_sku,'accountId',a.account_id,'intentId',p_intent_id,'test',v_test);
end $$;

-- A definitive native cancellation releases only the purchase-flow reservation.
-- Retain the ownership binding so delayed provider evidence can still settle.
create function public.play_commerce_cancel_intent(p_user_id text,p_intent_id text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform public.match_hint_assert_account(p_user_id);
 update public.play_commerce_intents i set expires_at=least(i.expires_at,clock_timestamp())
 from public.play_commerce_accounts a where i.generation=a.generation and a.user_id=p_user_id
  and a.retired_at is null and i.intent_id=p_intent_id;
end $$;

-- Both providers serialize on the profile before publishing a purchase flow.
-- Checking in the INSERT trigger also covers legacy Stripe subscription intents.
create function public.play_commerce_guard_stripe_subscription() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform public.match_hint_assert_account(new.user_id);
 if exists(select 1 from public.play_commerce_accounts a join public.play_commerce_tokens t using(generation)
   where a.user_id=new.user_id and a.retired_at is null and not t.retired and t.test=(not new.livemode)
    and t.sku in ('standard_monthly','plus_monthly') and t.state not in ('SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'))
  or exists(select 1 from public.play_commerce_accounts a join public.play_commerce_intents i using(generation)
   where a.user_id=new.user_id and a.retired_at is null and i.test=(not new.livemode)
    and i.sku in ('standard_monthly','plus_monthly') and i.expires_at>clock_timestamp())
 then raise exception 'Subscription unresolved or Checkout pending' using errcode='42501';end if;
 return new;
end $$;
create trigger play_commerce_stripe_subscription_guard before insert on public.stripe_checkout_intents
 for each row execute function public.play_commerce_guard_stripe_subscription();

create function public.acquire_play_commerce_receipt(p_token_hash text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_lease uuid:=gen_random_uuid();v_acquired uuid;begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_PURCHASE' using errcode='22023';end if;
 insert into public.play_commerce_leases(token_hash,lease,expires_at) values(p_token_hash,v_lease,clock_timestamp()+interval '90 seconds')
 on conflict(token_hash) do update set lease=excluded.lease,expires_at=excluded.expires_at
 where play_commerce_leases.expires_at<=clock_timestamp() returning lease into v_acquired;
 return v_acquired;
end $$;
create function public.release_play_commerce_receipt(p_token_hash text,p_lease uuid) returns void
language plpgsql security invoker set search_path='' as $$ begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 update public.play_commerce_leases set expires_at=clock_timestamp() where token_hash=p_token_hash and lease=p_lease;
end $$;

-- Immutable receipt owners and order mode survive restore and account erasure.
create function public.play_commerce_immutable_owner() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
 if (new.generation,new.sku,new.test,new.token_hash) is distinct from (old.generation,old.sku,old.test,old.token_hash)
 then raise exception 'ACCOUNT_MISMATCH' using errcode='23505';end if;
 if tg_table_name='play_commerce_orders' and (to_jsonb(new)->>'order_key',to_jsonb(new)->>'order_id') is distinct from (to_jsonb(old)->>'order_key',to_jsonb(old)->>'order_id')
 then raise exception 'ACCOUNT_MISMATCH' using errcode='23505';end if;
 return new;
end $$;
create trigger play_token_owner before update on public.play_commerce_tokens for each row execute function public.play_commerce_immutable_owner();
create trigger play_order_owner before update on public.play_commerce_orders for each row execute function public.play_commerce_immutable_owner();

create function public.play_commerce_resolve_owner(p_token_hash text,p_purchase jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_owner uuid;v_match uuid;v_value text;v_pair record;begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 select generation into v_owner from public.play_commerce_tokens where token_hash=p_token_hash;
 for v_pair in select * from (values
  ('account',p_purchase->>'accountId'),('intent',p_purchase->>'intentId'),
  ('token',p_purchase->'ownership'->>'linkedTokenHash'),
  ('token',p_purchase->'ownership'->'outOfApp'->>'expiredPurchaseTokenHash'),
  ('account',p_purchase->'ownership'->'outOfApp'->'expiredExternalAccountIdentifiers'->>'accountId'),
  ('intent',p_purchase->'ownership'->'outOfApp'->'expiredExternalAccountIdentifiers'->>'intentId')) as x(kind,value)
 loop
  v_value:=v_pair.value;if v_value is null then continue;end if;
  if v_value !~ '^[a-f0-9]{64}$' then raise exception 'ACCOUNT_MISMATCH' using errcode='42501';end if;
  v_match:=null;
  if v_pair.kind='account' then select generation into v_match from public.play_commerce_accounts where account_id=v_value;
  elsif v_pair.kind='intent' then select generation into v_match from public.play_commerce_intents where intent_id=v_value;
  else select generation into v_match from public.play_commerce_tokens where token_hash=v_value;end if;
  if v_match is null or (v_owner is not null and v_owner<>v_match) then raise exception 'ACCOUNT_MISMATCH' using errcode='42501';end if;
  v_owner:=v_match;
 end loop;
 if v_owner is null then raise exception 'ACCOUNT_MISMATCH' using errcode='42501';end if;
 return v_owner;
end $$;


-- Common order accounting for current purchases and separately bound historical orders.
-- Historical evidence never changes the canonical access period or latest-order pointer.
create function public.play_commerce_record_order(p_token_hash text,p_lease uuid,p_order jsonb,p_historical boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare o jsonb:=p_order;a public.play_commerce_accounts;t public.play_commerce_tokens;
 r public.play_commerce_orders;s public.play_commerce_sources;v_hash text:=p_token_hash;
 v_generation uuid;v_user text;v_sku text;v_test boolean;v_type text;v_hints integer;
 v_order_key text;v_paid boolean;v_refund boolean;v_duplicate boolean:=false;v_granted boolean:=false;v_credit integer:=0;
begin
 if current_user<>'service_role' or current_setting('transaction_isolation')<>'read committed' or jsonb_typeof(o) is distinct from 'object'
 then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 select * into strict t from public.play_commerce_tokens where token_hash=v_hash;
 select * into strict a from public.play_commerce_accounts where generation=t.generation;
 if a.retired_at is not null or a.user_id is null or t.retired then raise exception 'RETIRED' using errcode='42501';end if;
 perform public.match_hint_assert_account(a.user_id);
 select * into strict a from public.play_commerce_accounts where generation=t.generation for update;
 if a.retired_at is not null or a.user_id is null then raise exception 'RETIRED' using errcode='42501';end if;
 perform 1 from public.play_commerce_leases where token_hash=v_hash and lease=p_lease and expires_at>clock_timestamp() for update;
 if not found then raise exception 'BUSY' using errcode='40001';end if;
 select * into strict t from public.play_commerce_tokens where token_hash=v_hash for update;
 v_generation:=t.generation;v_user:=a.user_id;v_sku:=t.sku;v_test:=t.test;
 v_type:=case when v_sku in ('standard_monthly','plus_monthly') then 'subs' else 'inapp' end;
 perform public.play_commerce_mode(v_test);
 perform 1 from public.ticket_wallets where user_id=v_user for update;
  if o->>'sku' is distinct from v_sku or o->>'productId' is distinct from 'qg_'||v_sku or o->>'type' is distinct from v_type
   or o->>'tokenHash' is distinct from v_hash
   or jsonb_typeof(o->'test') is distinct from 'boolean' or (o->>'test')::boolean<>v_test
   or jsonb_typeof(o->'paid') is distinct from 'boolean' or o->>'requiresDatabaseGrantFence' is distinct from 'true'
   or o->>'orderId' is null or o->>'orderId' !~ '^GPA\.[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{5}(\.\.[0-9]{1,20})?$'
   or o->>'orderKey' is distinct from 'com.qgambit.app:play-order:'||(o->>'orderId')
  then raise exception 'INVALID_PURCHASE' using errcode='22023';end if;
  v_order_key:=o->>'orderKey';v_paid:=(o->>'paid')::boolean;
  if v_type='inapp' and exists(select 1 from public.play_commerce_orders where token_hash=v_hash and order_key<>v_order_key)
  then raise exception 'ACCOUNT_MISMATCH' using errcode='23505';end if;
  v_refund:=o->>'reason'='REFUND_OR_CANCELLATION' or o->>'state' in ('CANCELED','PENDING_REFUND','PARTIALLY_REFUNDED','REFUNDED');
  v_hints:=case v_sku when 'plus_monthly' then 10 when 'standard_monthly' then 0 when 'hints_1' then 1 when 'hints_13' then 13 when 'hints_27' then 27 when 'hints_44' then 44 when 'hints_77' then 77 when 'hints_166' then 166 end;
  if jsonb_typeof(o->'candidateHints') is distinct from 'number' or (o->>'candidateHints')::integer<>(case when v_paid then v_hints else 0 end)
   or (v_paid and (o->>'state'<>'PROCESSED' or o->'money'->>'amountNanos' !~ '^[1-9][0-9]*$'
    or o->'money'->>'currencyCode' is null or o->'money'->>'currencyCode' !~ '^[A-Z]{3}$' or o->'money'->>'amountNanos' is null or o->>'processedAt' is null))
   or (v_paid and v_type='subs' and (o->>'offerPhase' is distinct from 'BASE' or o->'paidPeriod'->>'start' is null or o->'paidPeriod'->>'end' is null))
  then raise exception 'INVALID_PURCHASE' using errcode='22023';end if;
  insert into public.play_commerce_orders(order_key,order_id,token_hash,generation,sku,test,refunded,evidence)
  values(v_order_key,o->>'orderId',v_hash,v_generation,v_sku,v_test,v_refund,o) on conflict(order_key) do nothing;
  select * into strict r from public.play_commerce_orders where order_key=v_order_key for update;
  if (r.token_hash,r.generation,r.sku,r.test) is distinct from (v_hash,v_generation,v_sku,v_test) then raise exception 'ACCOUNT_MISMATCH' using errcode='23505';end if;
  if p_historical and v_type='inapp' and not r.granted then raise exception 'INVALID_PURCHASE' using errcode='22023';end if;
  v_duplicate:=r.granted;v_refund:=v_refund or r.refunded;
  update public.play_commerce_orders set refunded=v_refund,evidence=o,checked_at=clock_timestamp() where order_key=v_order_key;
  if v_refund then
   select * into s from public.play_commerce_sources where order_key=v_order_key for update;
   if found and s.state='active' then
    if s.available>0 then perform public.adjust_play_commerce_wallet(v_user,s.origin,v_test,-s.available);end if;
    update public.play_commerce_sources set state='revoked',revoked=revoked+available,available=0 where id=s.id;
   end if;
  elsif v_paid and not r.granted and public.has_current_ticket_terms(v_user) then
   if v_hints>0 then
    insert into public.play_commerce_sources(order_key,generation,user_id,test,origin,quantity,available)
    values(v_order_key,v_generation,v_user,v_test,case when v_type='subs' then 'subscription' else 'purchased' end,v_hints,v_hints);
    perform public.adjust_play_commerce_wallet(v_user,case when v_type='subs' then 'subscription' else 'purchased' end,v_test,v_hints);
   end if;
   update public.play_commerce_orders set granted=true where order_key=v_order_key;v_credit:=v_hints;v_granted:=true;
  end if;
 if v_granted then update public.play_commerce_tokens set has_paid=true where token_hash=v_hash;end if;
 if v_refund then update public.play_commerce_tokens set active=false where token_hash=v_hash and latest_order_key=v_order_key;end if;
 return jsonb_build_object('credited',v_credit,'duplicate',v_duplicate,'granted',v_granted,'refunded',v_refund,'paid',v_paid,'orderKey',v_order_key);
end $$;

create function public.apply_play_commerce_receipt(p_evidence jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p jsonb:=p_evidence->'purchase';o jsonb:=p_evidence->'order';
 a public.play_commerce_accounts;t public.play_commerce_tokens;r public.play_commerce_orders;s public.play_commerce_sources;
 v_hash text:=p_evidence->>'tokenHash';v_lease uuid:=(p_evidence->>'lease')::uuid;
 v_generation uuid;v_user text;v_sku text:=p->>'sku';v_test boolean;v_hints integer;v_credit integer:=0;
 v_order_key text;v_paid boolean:=false;v_refund boolean:=false;v_duplicate boolean:=false;v_granted boolean:=false;
 v_order_result jsonb;v_active boolean;v_type text:=p->>'type';v_intent public.play_commerce_intents;
begin
 if current_user<>'service_role' or current_setting('transaction_isolation')<>'read committed' then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if jsonb_typeof(p_evidence) is distinct from 'object' or jsonb_typeof(p) is distinct from 'object'
  or jsonb_typeof(p->'test') is distinct from 'boolean' or jsonb_typeof(p->'active') is distinct from 'boolean'
  or jsonb_typeof(p->'acknowledged') is distinct from 'boolean' or jsonb_typeof(p->'consumed') is distinct from 'boolean'
  or jsonb_typeof(p->'cancelAtPeriodEnd') is distinct from 'boolean'
  or v_hash is null or v_hash !~ '^[a-f0-9]{64}$' or v_lease is null
  or v_sku is null or v_sku not in ('standard_monthly','plus_monthly','hints_1','hints_13','hints_27','hints_44','hints_77','hints_166')
  or p->>'productId' is distinct from 'qg_'||v_sku
  or v_type is distinct from (case when v_sku in ('standard_monthly','plus_monthly') then 'subs' else 'inapp' end)
  or jsonb_typeof(p->'ownership') is distinct from 'object' or p->'ownership'->>'requiresDatabaseMatch' is distinct from 'true'
 then raise exception 'INVALID_PURCHASE' using errcode='22023';end if;
 v_test:=(p->>'test')::boolean;perform public.play_commerce_mode(v_test);
 v_generation:=public.play_commerce_resolve_owner(v_hash,p);
 select * into strict a from public.play_commerce_accounts where generation=v_generation;
 v_user:=a.user_id;
 if v_user is null or a.retired_at is not null then raise exception 'RETIRED' using errcode='42501';end if;
 if p_evidence->>'userId' is not null and p_evidence->>'userId'<>v_user then raise exception 'ACCOUNT_MISMATCH' using errcode='42501';end if;
 perform public.match_hint_assert_account(v_user);
 select * into strict a from public.play_commerce_accounts where generation=v_generation for update;
 if a.retired_at is not null or a.user_id is distinct from v_user then raise exception 'RETIRED' using errcode='42501';end if;
 perform 1 from public.play_commerce_leases where token_hash=v_hash and lease=v_lease and expires_at>clock_timestamp() for update;
 if not found then raise exception 'BUSY' using errcode='40001';end if;
 select * into t from public.play_commerce_tokens where token_hash=v_hash for update;
 if found and (t.generation,t.sku,t.test) is distinct from (v_generation,v_sku,v_test) then raise exception 'ACCOUNT_MISMATCH' using errcode='23505';end if;
 if t.retired then raise exception 'RETIRED' using errcode='42501';end if;
 if t.token_hash is null and (p->>'consumed')::boolean then raise exception 'INVALID_PURCHASE' using errcode='42501';end if;
 if t.token_hash is null and p->'ownership'->>'kind'='stored_token' and p->'ownership'->>'linkedTokenHash' is null
 then raise exception 'ACCOUNT_MISMATCH' using errcode='42501';end if;
 if p->>'intentId' is not null then
  select * into v_intent from public.play_commerce_intents where intent_id=p->>'intentId';
  if not found or (v_intent.generation,v_intent.sku,v_intent.test) is distinct from (v_generation,v_sku,v_test)
  then raise exception 'ACCOUNT_MISMATCH' using errcode='42501';end if;
 end if;
 if t.token_hash is null and p->'ownership'->>'kind'='direct' and v_intent.intent_id is null then raise exception 'ACCOUNT_MISMATCH' using errcode='42501';end if;
 if p_evidence->>'ciphertext' is null then raise exception 'UNAVAILABLE' using errcode='22023';end if;
 insert into public.play_commerce_tokens(token_hash,generation,sku,test,ciphertext,ownership,state)
 values(v_hash,v_generation,v_sku,v_test,p_evidence->>'ciphertext',p->'ownership',p->>'state') on conflict(token_hash) do nothing;
 select * into strict t from public.play_commerce_tokens where token_hash=v_hash for update;
 insert into public.ticket_wallets(user_id) values(v_user) on conflict(user_id) do nothing;
 perform 1 from public.ticket_wallets where user_id=v_user for update;
 if jsonb_typeof(o)='object' then
  if o->>'orderId' is distinct from p->>'orderId' then raise exception 'INVALID_PURCHASE' using errcode='22023';end if;
  v_order_result:=public.play_commerce_record_order(v_hash,v_lease,o,false);
  v_order_key:=v_order_result->>'orderKey';v_credit:=(v_order_result->>'credited')::integer;
  v_duplicate:=(v_order_result->>'duplicate')::boolean;v_granted:=(v_order_result->>'granted')::boolean;
  v_refund:=(v_order_result->>'refunded')::boolean;v_paid:=(v_order_result->>'paid')::boolean;
 else
  -- An Orders outage cannot resurrect an already refunded current order.
  select coalesce(bool_or(refunded),false) into v_refund from public.play_commerce_orders
   where token_hash=v_hash and order_id=p->>'orderId';
 end if;
 if v_type='inapp' and (p->>'state'='CANCELLED' or p->>'refundableQuantity'='0') then
  for r in select * from public.play_commerce_orders where token_hash=v_hash loop
   perform public.reverse_play_commerce_order(r.order_key,v_hash,jsonb_build_object('orderKey',r.order_key,'tokenHash',v_hash,'sku',v_sku,'revoked',true));
  end loop;
  v_refund:=true;
 end if;
 v_active:=v_type='subs' and (p->>'active')::boolean and (t.has_paid or v_granted or (v_paid and v_duplicate)) and not v_refund;
 update public.play_commerce_tokens set ciphertext=p_evidence->>'ciphertext',
  ownership=case when p->'ownership'->>'persistBeforeAcknowledgement'='true' then p->'ownership' else ownership end,
  state=p->>'state',active=v_active,period_end=(p->>'periodEnd')::timestamptz,cancel_at_period_end=(p->>'cancelAtPeriodEnd')::boolean,
  has_paid=has_paid or v_granted or (v_paid and v_duplicate),acknowledged=(p->>'acknowledged')::boolean,consumed=(p->>'consumed')::boolean,
  latest_order_key=coalesce(v_order_key,latest_order_key),checked_at=clock_timestamp(),next_check_at=clock_timestamp()+interval '10 minutes'
 where token_hash=v_hash;
 if p->'ownership'->>'linkedTokenHash' is not null then
  update public.play_commerce_tokens set active=false where token_hash=p->'ownership'->>'linkedTokenHash' and generation=v_generation;
 end if;
 if (v_granted or (v_duplicate and not v_refund)) and not ((v_type='subs' and (p->>'acknowledged')::boolean) or (v_type='inapp' and (p->>'consumed')::boolean)) then
  insert into public.play_commerce_outbox(token_hash,action) values(v_hash,case when v_type='subs' then 'acknowledge' else 'consume' end) on conflict(token_hash) do nothing;
 end if;
 return jsonb_build_object('userId',v_user,'credited',v_credit,'duplicate',v_duplicate,'active',v_active and not v_test,
  'deliveryPending',exists(select 1 from public.play_commerce_outbox where token_hash=v_hash and not completed),
  'reconciliationPending',coalesce((p_evidence->>'orderUnavailable')::boolean,false) or (v_paid and not v_granted and not v_duplicate),'test',v_test);
end $$;

create function public.reverse_play_commerce_order(p_order_key text,p_token_hash text,p_evidence jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare r public.play_commerce_orders;a public.play_commerce_accounts;s public.play_commerce_sources;v_revoked integer:=0;begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 select * into r from public.play_commerce_orders where order_key=p_order_key and token_hash=p_token_hash;
 if not found then raise exception 'INVALID_PURCHASE' using errcode='22023';end if;
 select * into strict a from public.play_commerce_accounts where generation=r.generation;
 if a.user_id is null or a.retired_at is not null then return 0;end if;
 perform public.match_hint_assert_account(a.user_id);perform public.play_commerce_mode(r.test);
 select * into strict r from public.play_commerce_orders where order_key=p_order_key for update;
 if p_evidence->>'orderKey' is distinct from r.order_key or p_evidence->>'tokenHash' is distinct from r.token_hash
  or p_evidence->>'sku' is distinct from r.sku or p_evidence->>'revoked' is distinct from 'true'
 then raise exception 'INVALID_PURCHASE' using errcode='22023';end if;
 update public.play_commerce_orders set refunded=true,checked_at=clock_timestamp() where order_key=r.order_key;
 perform 1 from public.ticket_wallets where user_id=a.user_id for update;
 select * into s from public.play_commerce_sources where order_key=r.order_key for update;
 if found and s.state='active' then
  v_revoked:=s.available;perform public.adjust_play_commerce_wallet(a.user_id,s.origin,r.test,-s.available);
  update public.play_commerce_sources set state='revoked',available=0,revoked=revoked+s.available where id=s.id;
 end if;
 update public.play_commerce_tokens set active=false where token_hash=r.token_hash and latest_order_key=r.order_key;
 return v_revoked;
end $$;

create function public.play_commerce_protocol() returns integer
language sql stable security invoker set search_path='' as $$ select 1 $$;

create function public.play_commerce_reconcile_due() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.play_commerce_tokens;v_rows jsonb:='[]'::jsonb;begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 for r in select * from public.play_commerce_tokens where not retired and ciphertext is not null
  and next_check_at<=clock_timestamp() order by next_check_at,token_hash limit 4 for update skip locked loop
  update public.play_commerce_tokens set next_check_at=clock_timestamp()+interval '10 minutes' where token_hash=r.token_hash;
  v_rows:=v_rows||jsonb_build_array(jsonb_build_object('tokenHash',r.token_hash,'sku',r.sku,'test',r.test,'ciphertext',r.ciphertext,'historyCursor',r.history_cursor));
 end loop;
 return v_rows;
end $$;

create function public.play_commerce_advance_history(p_token_hash text,p_lease uuid,p_next bigint) returns void
language plpgsql security invoker set search_path='' as $$ begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if p_next is null or p_next not between 0 and 100001 then raise exception 'INVALID_PURCHASE' using errcode='22023';end if;
 if not exists(select 1 from public.play_commerce_leases where token_hash=p_token_hash and lease=p_lease and expires_at>clock_timestamp()) then raise exception 'BUSY' using errcode='40001';end if;
 update public.play_commerce_tokens set history_cursor=greatest(history_cursor,p_next) where token_hash=p_token_hash and not retired;
 if not found then raise exception 'RETIRED' using errcode='42501';end if;
end $$;

-- This narrow operation is available during a verified, pending deletion job;
-- ordinary commerce writes correctly reject that job through the profile guard.
create function public.play_commerce_deletion_canceled(p_user_id text,p_token_hash text,p_purchase jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare r public.play_commerce_tokens;begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ_COMMITTED_REQUIRED' using errcode='25001';end if;
 perform 1 from public.profiles where id=p_user_id for update;
 if not found or not exists(select 1 from public.account_deletion_jobs where user_id=p_user_id and phase='pending') then raise exception 'RETIRED' using errcode='42501';end if;
 select t.* into r from public.play_commerce_tokens t join public.play_commerce_accounts a using(generation)
  where t.token_hash=p_token_hash and a.user_id=p_user_id and a.retired_at is null and not t.retired for update of t;
 if not found or r.sku not in ('standard_monthly','plus_monthly') or p_purchase->>'sku' is distinct from r.sku
  or p_purchase->>'type' is distinct from 'subs' or p_purchase->>'test' is distinct from r.test::text
  or not (coalesce(p_purchase->>'cancelAtPeriodEnd','false')='true' or coalesce(p_purchase->>'state','') in ('SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'))
 then raise exception 'INVALID_PURCHASE' using errcode='22023';end if;
 update public.play_commerce_tokens set cancel_at_period_end=true,active=false where token_hash=p_token_hash;
end $$;

do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'play_commerce_%' or p.proname in (
  'adjust_play_commerce_wallet','create_play_commerce_intent','acquire_play_commerce_receipt','release_play_commerce_receipt',
  'apply_play_commerce_receipt','claim_play_commerce_delivery','finish_play_commerce_delivery','reverse_play_commerce_order','retire_play_commerce_account',
  'buy_match_hint','buy_match_hint_pre_play','restore_match_hint_credit','restore_match_hint_credit_pre_play',
  'get_shared_match_entitlement','get_shared_match_entitlement_pre_play')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
