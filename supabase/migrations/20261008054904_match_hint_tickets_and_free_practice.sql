begin;
set local lock_timeout='3s';
set local statement_timeout='15s';

-- The game service owns the canonical board, participant, turn and clock.
-- It must fence game mutation through commit/recovery of this RPC. No browser
-- role may submit a context or access receipts; no practice session is invented.
create table public.match_hint_receipts (
 request_id uuid primary key,
 user_id text not null references public.profiles(id) on delete cascade,
 context_id uuid not null,
 kind text not null check(kind in ('match','crown')),
 mode text not null check(mode in ('ranked','random','private','crown')),
 side text not null check(side in ('white','black')),
 revision integer not null check(revision>=0),
 state_hash text not null check(state_hash ~ '^[a-f0-9]{64}$'),
 rules_version text not null check(length(rules_version) between 1 and 128),
 move jsonb not null check(jsonb_typeof(move)='object'),
 hint jsonb not null check(jsonb_typeof(hint)='object'),
 origin text not null check(origin in ('free','member','subscription','purchased')),
 subscription_id text,
 source_id uuid references public.stripe_commerce_sources(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 unique(user_id,context_id,revision),
 check((kind='crown')=(mode='crown')),
 check((origin='member')=(subscription_id is not null)),
 check((origin in ('subscription','purchased'))=(source_id is not null))
);
create table public.match_hint_request_aliases (
 request_id uuid primary key,
 receipt_id uuid not null references public.match_hint_receipts(request_id) on delete cascade
);
create index match_hint_alias_receipt_idx on public.match_hint_request_aliases(receipt_id);
create table public.match_hint_restorations (
 receipt_id uuid primary key references public.match_hint_receipts(request_id) on delete cascade,
 reason text not null check(reason='unrecoverable_delivery'),
 credited integer not null check(credited in (0,1)),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.match_hint_receipts enable row level security;
alter table public.match_hint_receipts force row level security;
alter table public.match_hint_request_aliases enable row level security;
alter table public.match_hint_request_aliases force row level security;
alter table public.match_hint_restorations enable row level security;
alter table public.match_hint_restorations force row level security;
revoke all on public.match_hint_receipts,public.match_hint_request_aliases,public.match_hint_restorations
 from public,anon,authenticated,service_role;
-- Only profile erasure cascades may delete receipts. Service writes are append-only.
grant select,insert on public.match_hint_receipts,public.match_hint_request_aliases,public.match_hint_restorations to service_role;

create function public.match_hint_assert_account(p_user_id text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'READ_COMMITTED_REQUIRED' using errcode='25001'; end if;
 if p_user_id is null or length(p_user_id) not between 1 and 256
  or octet_length(convert_to(p_user_id,'UTF8'))>256 or p_user_id<>btrim(p_user_id)
  or p_user_id ~ '[[:cntrl:]]' or p_user_id ~* '^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)'
 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
 -- This is the same lock used by payments, risk, admission and account deletion.
 perform 1 from public.profiles where id=p_user_id for update;
 if not found or exists(select 1 from public.account_deletion_jobs where user_id=p_user_id and phase<>'completed')
  or exists(select 1 from public.account_restrictions where user_id=p_user_id and blocked)
 then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
end $$;

create function public.match_hint_payload(p_receipt public.match_hint_receipts) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('receiptId',p_receipt.request_id,'contextId',p_receipt.context_id,
  'kind',p_receipt.kind,'mode',p_receipt.mode,'revision',p_receipt.revision,
  'stateHash',p_receipt.state_hash,'rulesVersion',p_receipt.rules_version,
  'hint',p_receipt.hint,'move',p_receipt.move,'deliveryState','paid_retrievable')
$$;

create function public.match_hint_clock() returns text
language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 -- Millisecond truncation is conservative. Never derive purchase deadlines
 -- from an independently skewed application-host absolute clock.
 return to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
end $$;

create function public.read_match_hint_receipt(p_request_id uuid,p_user_id text,p_context_id uuid,p_revision integer,
 p_not_before timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_receipt public.match_hint_receipts;
begin
 perform public.match_hint_assert_account(p_user_id);
 if p_request_id is null or p_context_id is null or p_revision is null or p_revision<0 then
  raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
 if p_not_before is not null and not isfinite(p_not_before) then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
 select r.* into v_receipt from public.match_hint_request_aliases a
  join public.match_hint_receipts r on r.request_id=a.receipt_id where a.request_id=p_request_id;
 if not found then
  -- Host wall time and response arrival time cannot prove that a delayed buy
  -- has expired. Only an absent receipt needs the DB deadline check, performed
  -- AFTER taking the purchase/profile lock. Existing receipts resolve at once.
  if p_not_before is not null and clock_timestamp()<p_not_before then
   raise exception 'HINT_STORE_UNAVAILABLE' using errcode='55000'; end if;
  return null;
 end if;
 if (v_receipt.user_id,v_receipt.context_id,v_receipt.revision) is distinct from (p_user_id,p_context_id,p_revision)
 then raise exception 'REQUEST_MISMATCH' using errcode='23505'; end if;
 -- New terms, game expiry and later moves never remove an already delivered hint.
 return public.match_hint_payload(v_receipt);
end $$;

create function public.read_existing_match_hint(p_user_id text,p_context_id uuid,p_revision integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_receipt public.match_hint_receipts;
begin
 perform public.match_hint_assert_account(p_user_id);
 if p_context_id is null or p_revision is null or p_revision<0 then
  raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
 select * into v_receipt from public.match_hint_receipts
  where user_id=p_user_id and context_id=p_context_id and revision=p_revision;
 if not found then return null; end if;
 return public.match_hint_payload(v_receipt);
end $$;

create function public.buy_match_hint(p_request_id uuid,p_user_id text,p_context_id uuid,p_kind text,p_mode text,
 p_side text,p_revision integer,p_state_hash text,p_rules_version text,p_valid_until timestamptz,p_move jsonb,p_hint jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_receipt public.match_hint_receipts; v_wallet public.ticket_wallets; v_source public.stripe_commerce_sources;
 v_origin text; v_subscription text; v_active_count integer; v_suspended_count integer;
begin
 perform public.match_hint_assert_account(p_user_id);
 if p_request_id is null or p_context_id is null or p_revision is null or p_revision<0
  or p_kind is null or p_kind not in ('match','crown') or p_mode is null or p_mode not in ('ranked','random','private','crown')
  or (p_kind='crown')<>(p_mode='crown') or p_side is null or p_side not in ('white','black')
  or p_state_hash is null or p_state_hash !~ '^[a-f0-9]{64}$'
  or p_rules_version is null or length(p_rules_version) not between 1 and 128
  or p_valid_until is null or not isfinite(p_valid_until)
 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qg-match-hint:'||p_request_id::text,0));
 select r.* into v_receipt from public.match_hint_request_aliases a
  join public.match_hint_receipts r on r.request_id=a.receipt_id where a.request_id=p_request_id;
 if found and (v_receipt.user_id,v_receipt.context_id,v_receipt.revision) is distinct from (p_user_id,p_context_id,p_revision)
 then raise exception 'REQUEST_MISMATCH' using errcode='23505'; end if;
 if not found then
  select * into v_receipt from public.match_hint_receipts
   where user_id=p_user_id and context_id=p_context_id and revision=p_revision;
 end if;
 if v_receipt.request_id is not null then
  if (v_receipt.kind,v_receipt.mode,v_receipt.side,v_receipt.state_hash,v_receipt.rules_version)
   is distinct from (p_kind,p_mode,p_side,p_state_hash,p_rules_version)
  then raise exception 'REQUEST_MISMATCH' using errcode='23505'; end if;
  -- Different retry IDs share one result. Recomputed advice cannot replace it.
  insert into public.match_hint_request_aliases(request_id,receipt_id) values(p_request_id,v_receipt.request_id)
   on conflict(request_id) do nothing;
  return public.match_hint_payload(v_receipt);
 end if;
 if not public.has_current_ticket_terms(p_user_id) then raise exception 'TERMS_REQUIRED' using errcode='42501'; end if;
 if jsonb_typeof(p_move) is distinct from 'object' or jsonb_typeof(p_hint) is distinct from 'object'
  or not (p_hint ?& array['fromRow','fromCol','toRow','toCol'])
  or exists(select 1 from unnest(array['fromRow','fromCol','toRow','toCol']) k
   where jsonb_typeof(p_hint->k) is distinct from 'number' or (p_hint->>k) !~ '^[0-7]$')
  or (p_hint->>'fromRow'=p_hint->>'toRow' and p_hint->>'fromCol'=p_hint->>'toCol')
  or jsonb_typeof(p_move->'pieceId') is distinct from 'string' or (p_move->>'pieceId') !~ '^[wb]_[1-9][0-9]?$'
  or jsonb_typeof(p_move->'target') is distinct from 'object'
  or (p_move->'target'->'row') is distinct from (p_hint->'toRow')
  or (p_move->'target'->'col') is distinct from (p_hint->'toCol')
 then raise exception 'NO_LEGAL_HINT' using errcode='22023'; end if;
 insert into public.ticket_wallets(user_id) values(p_user_id) on conflict(user_id) do nothing;
 select * into strict v_wallet from public.ticket_wallets where user_id=p_user_id for update;
 -- Preserve legacy eligibility, pause and binding semantics. Never reclassify
 -- paid legacy stock as purchased stock or consume test-mode balances.
 select count(*),min(m.subscription_id) into v_active_count,v_subscription
  from public.stripe_memberships m
  join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
  join public.stripe_customer_links l on l.customer_id=m.customer_id
  where m.user_id=p_user_id and i.user_id=p_user_id and l.user_id=p_user_id
   and m.status='active' and m.period_end>clock_timestamp() and m.refund_blocked_until is null
   and m.current_price_id=i.price_id and i.livemode and i.price_id='price_1ULM9fQWzwYDIuXWgs5Uj3yt';
 if v_active_count>1 then raise exception 'AMBIGUOUS_ENTITLEMENT' using errcode='23505'; end if;
 select count(*) into v_suspended_count from public.stripe_memberships m
  join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
  join public.stripe_customer_links l on l.customer_id=m.customer_id
  where m.user_id=p_user_id and i.user_id=p_user_id and l.user_id=p_user_id
   and m.subscription_id=v_wallet.member_ticket_subscription_id
   and m.status in ('incomplete','trialing','past_due','unpaid','paused') and m.period_end>clock_timestamp()
   and m.refund_blocked_until is null and m.current_price_id=i.price_id and i.livemode
   and i.price_id='price_1ULM9fQWzwYDIuXWgs5Uj3yt';
 if (v_subscription is null and v_suspended_count=0)
  or (v_subscription is not null and v_wallet.member_ticket_subscription_id is distinct from v_subscription) then
  update public.ticket_wallets set member_ranked_tickets=0,member_hint_tickets=0,member_ticket_subscription_id=null
   where user_id=p_user_id and (member_ranked_tickets<>0 or member_hint_tickets<>0 or member_ticket_subscription_id is not null);
  v_wallet.member_hint_tickets:=0; v_wallet.member_ticket_subscription_id:=null;
 end if;
 v_origin:=case when v_wallet.hint_tickets>0 then 'free'
  when v_subscription is not null and v_wallet.member_ticket_subscription_id=v_subscription
   and v_wallet.member_hint_tickets>0 then 'member' else null end;
 if v_origin is null then
  select * into v_source from public.stripe_commerce_sources
   where user_id=p_user_id and livemode and state='active' and available>0
   order by case origin when 'subscription' then 0 else 1 end,created_at,id limit 1 for update;
  if found then v_origin:=v_source.origin; end if;
 end if;
 -- Recheck AFTER lock waits, including source/wallet locks. The trusted service
 -- also holds its canonical game mutation fence until commit is resolved.
 if p_valid_until<=clock_timestamp() then raise exception 'HINT_CONTEXT_EXPIRED' using errcode='22023'; end if;
 if v_origin is null then return jsonb_build_object('error','INSUFFICIENT_FUNDS'); end if;
 if v_origin='free' then
  update public.ticket_wallets set hint_tickets=hint_tickets-1 where user_id=p_user_id and hint_tickets>0;
 elsif v_origin='member' then
  update public.ticket_wallets set member_hint_tickets=member_hint_tickets-1 where user_id=p_user_id and member_hint_tickets>0;
 else
  perform public.adjust_stripe_commerce_source_wallet(p_user_id,v_origin,true,-1);
  update public.stripe_commerce_sources set available=available-1,consumed=consumed+1 where id=v_source.id;
 end if;
 insert into public.match_hint_receipts(request_id,user_id,context_id,kind,mode,side,revision,state_hash,rules_version,
  move,hint,origin,subscription_id,source_id)
 values(p_request_id,p_user_id,p_context_id,p_kind,p_mode,p_side,p_revision,p_state_hash,p_rules_version,
  p_move,p_hint,v_origin,case when v_origin='member' then v_subscription else null end,v_source.id)
 returning * into v_receipt;
 insert into public.match_hint_request_aliases(request_id,receipt_id) values(p_request_id,p_request_id);
 return public.match_hint_payload(v_receipt);
end $$;

-- Operations-only repair of unrecoverable delivery, never HTTP cancellation or
-- a payment refund. The immutable receipt remains retrievable after repair.
create function public.restore_match_hint_credit(p_receipt_id uuid,p_user_id text,p_reason text)
returns integer language plpgsql security invoker set search_path='' as $$
declare v_receipt public.match_hint_receipts; v_source public.stripe_commerce_sources; v_credit integer:=0;
begin
 perform public.match_hint_assert_account(p_user_id);
 if p_receipt_id is null or p_reason is distinct from 'unrecoverable_delivery' then
  raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
 select * into v_receipt from public.match_hint_receipts where request_id=p_receipt_id and user_id=p_user_id;
 if not found then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
 if exists(select 1 from public.match_hint_restorations where receipt_id=p_receipt_id) then return 0; end if;
 perform 1 from public.ticket_wallets where user_id=p_user_id for update;
 if v_receipt.origin in ('subscription','purchased') then
  select * into v_source from public.stripe_commerce_sources where id=v_receipt.source_id for update;
  if not found or v_source.user_id<>p_user_id or not v_source.livemode
   or v_source.origin<>v_receipt.origin or v_source.consumed<1 then
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
 elsif v_receipt.origin='free' then
  update public.ticket_wallets set hint_tickets=hint_tickets+1 where user_id=p_user_id and hint_tickets<9007199254740991;
  if found then v_credit:=1; else raise exception 'BALANCE_LIMIT' using errcode='22003'; end if;
 elsif exists(select 1 from public.stripe_memberships m
  join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
  join public.stripe_customer_links l on l.customer_id=m.customer_id
  where m.subscription_id=v_receipt.subscription_id and m.user_id=p_user_id and i.user_id=p_user_id and l.user_id=p_user_id
   and m.status='active' and m.period_end>clock_timestamp() and m.refund_blocked_until is null
   and m.current_price_id=i.price_id and i.livemode and i.price_id='price_1ULM9fQWzwYDIuXWgs5Uj3yt') then
  update public.ticket_wallets set member_hint_tickets=member_hint_tickets+1 where user_id=p_user_id
   and member_ticket_subscription_id=v_receipt.subscription_id and member_hint_tickets<9007199254740991;
  if found then v_credit:=1;
  elsif exists(select 1 from public.ticket_wallets where user_id=p_user_id
   and member_ticket_subscription_id=v_receipt.subscription_id and member_hint_tickets=9007199254740991) then
   raise exception 'BALANCE_LIMIT' using errcode='22003';
  end if;
 end if;
 insert into public.match_hint_restorations(receipt_id,reason,credited) values(p_receipt_id,p_reason,v_credit);
 return v_credit;
end $$;

-- Stop both historical practice purchase entry points in the database. Already
-- purchased receipts, request aliases and recovery remain valid and immutable.
create or replace function public.buy_cpu_hint(p_request_id uuid,p_user_id text,p_session_id uuid,p_revision integer,
 p_state_hash text,p_move jsonb,p_hint jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_existing jsonb; v_receipt public.cpu_hint_receipts;
begin
 perform public.cpu_practice_assert_account(p_user_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qg-cpu-hint:'||p_request_id::text,0));
 v_existing:=public.read_cpu_hint_receipt(p_request_id,p_user_id,p_session_id,p_revision);
 if v_existing is not null then return v_existing; end if;
 select * into v_receipt from public.cpu_hint_receipts
  where user_id=p_user_id and session_id=p_session_id and revision=p_revision;
 if not found then raise exception 'PRACTICE_HINTS_FREE' using errcode='42501'; end if;
 if v_receipt.session_hash is distinct from p_state_hash then raise exception 'REQUEST_MISMATCH' using errcode='23505'; end if;
 insert into public.cpu_hint_request_aliases(request_id,receipt_id) values(p_request_id,v_receipt.request_id);
 return public.cpu_hint_payload(v_receipt);
end $$;
create or replace function public.buy_cpu_hint_v2(p_request_id uuid,p_user_id text,p_session_id uuid,p_revision integer,
 p_state_hash text,p_move jsonb,p_hint jsonb) returns jsonb
language sql security invoker set search_path='' as $$
 select public.buy_cpu_hint(p_request_id,p_user_id,p_session_id,p_revision,p_state_hash,p_move,p_hint)
$$;

-- Preserve the established ranked/legacy receipt protocol while closing the
-- lower-level service-only practice debit path as well.
create or replace function public.spend_game_tickets(
    p_event_kind text, p_event_id uuid, p_user_ids text[]
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_users text[];
    v_existing_users text[];
    v_existing_entries jsonb;
    v_user text;
    v_wallet public.ticket_wallets;
    v_active_count integer;
    v_active_subscription text;
    v_suspended_count integer;
    v_pool text;
    v_started_at timestamptz;
    v_utc_day date;
    v_daily_free_count integer;
    v_entries jsonb := '[]'::jsonb;
    v_entry jsonb;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_event_kind is null or p_event_kind not in ('ranked_match_start', 'cpu_hint_delivered')
        or p_event_id is null or p_user_ids is null
        or cardinality(p_user_ids) not between 1 and 2
        or (p_event_kind = 'cpu_hint_delivered' and cardinality(p_user_ids) <> 1) then
        raise exception 'Invalid ticket event' using errcode = '22023';
    end if;
    select array_agg(distinct t.user_id order by t.user_id) into v_users
        from unnest(p_user_ids) as t(user_id);
    if v_users is null or cardinality(v_users) <> cardinality(p_user_ids) then
        raise exception 'Duplicate ticket participant' using errcode = '22023';
    end if;
    foreach v_user in array v_users loop
        if v_user is null or length(v_user) not between 1 and 256
            or octet_length(convert_to(v_user, 'UTF8')) > 256
            or v_user ~* '^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)' then
            raise exception 'Invalid ticket participant' using errcode = '22023';
        end if;
    end loop;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('qg-ticket:' || p_event_kind || ':' || p_event_id::text, 0));
    select array_agg(r.user_id order by r.user_id),
        jsonb_agg(jsonb_build_object('userId', r.user_id, 'pool', r.pool) order by r.user_id)
        into v_existing_users, v_existing_entries
        from public.ticket_spend_receipts r
        where r.event_kind = p_event_kind and r.event_id = p_event_id;
    if v_existing_users is not null then
        if v_existing_users <> v_users then
            raise exception 'Ticket event participant mismatch' using errcode = '23505';
        end if;
        return jsonb_build_object('eventKind', p_event_kind, 'eventId', p_event_id,
            'applied', false, 'duplicate', true, 'insufficient', false,
            'entries', v_existing_entries);
    end if;

    -- Practice hints are free. Only immutable old spend receipts may replay.
    if p_event_kind = 'cpu_hint_delivered' then
        raise exception 'PRACTICE_HINTS_FREE' using errcode = '42501';
    end if;

    foreach v_user in array v_users loop
        perform 1 from public.profiles where id = v_user for update;
        if not found or exists (select 1 from public.account_deletion_jobs
                where user_id = v_user and phase <> 'completed')
            or exists (select 1 from public.account_restrictions
                where user_id = v_user and blocked)
            or not exists (select 1 from public.account_terms_consents
                where user_id = v_user and version = '2026-09-25.1') then
            raise exception 'Ticket account unavailable' using errcode = '42501';
        end if;
    end loop;

    foreach v_user in array v_users loop
        insert into public.ticket_wallets(user_id) values(v_user) on conflict(user_id) do nothing;
        perform 1 from public.ticket_wallets where user_id = v_user for update;
        if not found then raise exception 'Ticket wallet unavailable' using errcode = '55000'; end if;
    end loop;

    -- The sorted profile and wallet locks serialize distinct starts for every
    -- participant. Capture one database time for both sides after all lock
    -- waits, so a PvP start cannot straddle a UTC day boundary.
    v_started_at := clock_timestamp();
    v_utc_day := (v_started_at at time zone 'UTC')::date;

    foreach v_user in array v_users loop
        select * into v_wallet from public.ticket_wallets where user_id = v_user;
        if not found then raise exception 'Ticket wallet unavailable' using errcode = '55000'; end if;
        select count(*), min(m.subscription_id) into v_active_count, v_active_subscription
            from public.stripe_memberships m
            join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
            join public.stripe_customer_links l on l.customer_id = m.customer_id
            where m.user_id = v_user and i.user_id = v_user and l.user_id = v_user
                and m.status = 'active' and m.period_end > clock_timestamp()
                and m.refund_blocked_until is null
                and m.current_price_id = i.price_id and i.livemode
                and i.price_id = 'price_1ULM9fQWzwYDIuXWgs5Uj3yt';
        if v_active_count > 1 then
            raise exception 'Ambiguous paid entitlement' using errcode = '23505';
        end if;
        -- A temporary payment pause suspends paid spending, but does not
        -- forfeit this period's paid tickets. Termination, reversal, expired
        -- period, off-price, or a different active subscription do forfeit.
        select count(*) into v_suspended_count
            from public.stripe_memberships m
            join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
            join public.stripe_customer_links l on l.customer_id = m.customer_id
            where m.user_id = v_user and i.user_id = v_user and l.user_id = v_user
                and m.subscription_id = v_wallet.member_ticket_subscription_id
                and m.status in ('incomplete', 'trialing', 'past_due', 'unpaid', 'paused')
                and m.period_end > clock_timestamp() and m.refund_blocked_until is null
                and m.current_price_id = i.price_id and i.livemode
                and i.price_id = 'price_1ULM9fQWzwYDIuXWgs5Uj3yt';
        if (v_active_subscription is null and v_suspended_count = 0)
            or (v_active_subscription is not null
                and v_wallet.member_ticket_subscription_id is distinct from v_active_subscription) then
            update public.ticket_wallets set member_ranked_tickets = 0,
                member_hint_tickets = 0, member_ticket_subscription_id = null
                where user_id = v_user and (member_ranked_tickets <> 0 or member_hint_tickets <> 0
                    or member_ticket_subscription_id is not null);
            v_wallet.member_ranked_tickets := 0;
            v_wallet.member_hint_tickets := 0;
            v_wallet.member_ticket_subscription_id := null;
        end if;
        if p_event_kind = 'ranked_match_start' then
            select count(*) into v_daily_free_count
                from public.ticket_spend_receipts r
                where r.user_id = v_user and r.event_kind = 'ranked_match_start'
                    and r.pool = 'quota'
                    and r.spent_at >= (v_utc_day::timestamp at time zone 'UTC')
                    and r.spent_at < ((v_utc_day + 1)::timestamp at time zone 'UTC');
            v_pool := case when v_daily_free_count < 3 then 'quota'
                when v_wallet.ranked_tickets > 0 then 'free'
                when v_active_subscription is not null and v_wallet.member_ticket_subscription_id = v_active_subscription
                    and v_wallet.member_ranked_tickets > 0 then 'paid' else null end;
        else
            v_pool := case when v_wallet.hint_tickets > 0 then 'free'
                when v_active_subscription is not null and v_wallet.member_ticket_subscription_id = v_active_subscription
                    and v_wallet.member_hint_tickets > 0 then 'paid' else null end;
        end if;
        if v_pool is null then
            return jsonb_build_object('eventKind', p_event_kind, 'eventId', p_event_id,
                'applied', false, 'duplicate', false, 'insufficient', true,
                'entries', '[]'::jsonb);
        end if;
        v_entries := v_entries || jsonb_build_array(jsonb_build_object('userId', v_user, 'pool', v_pool));
    end loop;

    for v_entry in select value from jsonb_array_elements(v_entries) loop
        v_user := v_entry->>'userId';
        v_pool := v_entry->>'pool';
        if p_event_kind = 'ranked_match_start' and v_pool = 'quota' then
            -- The receipt itself accounts for a free daily start.
            null;
        elsif p_event_kind = 'ranked_match_start' and v_pool = 'free' then
            update public.ticket_wallets set ranked_tickets = ranked_tickets - 1
                where user_id = v_user and ranked_tickets > 0;
        elsif p_event_kind = 'ranked_match_start' and v_pool = 'paid' then
            update public.ticket_wallets set member_ranked_tickets = member_ranked_tickets - 1
                where user_id = v_user and member_ranked_tickets > 0;
        elsif p_event_kind = 'cpu_hint_delivered' and v_pool = 'free' then
            update public.ticket_wallets set hint_tickets = hint_tickets - 1
                where user_id = v_user and hint_tickets > 0;
        else
            update public.ticket_wallets set member_hint_tickets = member_hint_tickets - 1
                where user_id = v_user and member_hint_tickets > 0;
        end if;
        if v_pool <> 'quota' and not found then
            raise exception 'Ticket balance changed' using errcode = '55000';
        end if;
        insert into public.ticket_spend_receipts(event_kind, event_id, user_id, pool, spent_at)
            values(p_event_kind, p_event_id, v_user, v_pool, v_started_at);
    end loop;
    return jsonb_build_object('eventKind', p_event_kind, 'eventId', p_event_id,
        'applied', true, 'duplicate', false, 'insufficient', false, 'entries', v_entries);
end $$;

do $$ declare v_function regprocedure;
begin
 for v_function in select p.oid::regprocedure from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('match_hint_assert_account','match_hint_payload','match_hint_clock','read_match_hint_receipt',
   'read_existing_match_hint','buy_match_hint','restore_match_hint_credit','buy_cpu_hint','buy_cpu_hint_v2','spend_game_tickets')
 loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',v_function);
  execute format('grant execute on function %s to service_role',v_function);
 end loop;
end $$;

-- Forward consent version: existing acceptance timestamps and Checkout terms
-- snapshots remain untouched. No price, inventory or production gate changes.
alter table public.current_terms_policy drop constraint current_terms_policy_version_check;
update public.current_terms_policy set version='2026-10-08.1',effective_date='2026-10-08' where singleton;
alter table public.current_terms_policy add constraint current_terms_policy_version_check check(version='2026-10-08.1');
notify pgrst, 'reload schema';
commit;
