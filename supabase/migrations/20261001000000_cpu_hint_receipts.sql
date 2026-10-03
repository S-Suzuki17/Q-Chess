begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Replacement for the never-released client-history hint groundwork.
-- Only the authenticated game service creates/advances these sessions.
drop function if exists public.buy_cpu_hint(uuid,text,text,integer,integer,integer,integer);

create table public.cpu_practice_sessions (
    session_id uuid primary key,
    user_id text not null references public.profiles(id) on delete cascade,
    kind text not null default 'cpu_practice' check (kind = 'cpu_practice'),
    rules_version text not null check (rules_version = 'quantum-practice-v1'),
    player_side text not null check (player_side in ('white','black')),
    level integer not null check (level in (1,3,5)),
    seconds integer not null check (seconds in (10,180,600)),
    revision integer not null default 0 check (revision >= 0),
    state jsonb not null,
    state_hash text not null check (length(state_hash) = 64),
    history jsonb not null default '[]' check (jsonb_typeof(history) = 'array'),
    status text not null default 'active' check (status in ('active','finished')),
    white_ms bigint not null,
    black_ms bigint not null,
    turn_started_at timestamptz not null default clock_timestamp(),
    expires_at timestamptz not null default clock_timestamp() + interval '24 hours',
    created_at timestamptz not null default clock_timestamp()
);
create index cpu_practice_sessions_owner_idx on public.cpu_practice_sessions(user_id);

create table public.cpu_practice_operations (
    operation_id uuid primary key,
    session_id uuid not null references public.cpu_practice_sessions(session_id) on delete cascade,
    revision integer not null,
    intent_hash text not null,
    snapshot jsonb not null
);
create index cpu_practice_operations_session_idx on public.cpu_practice_operations(session_id);

create table public.cpu_hint_receipts (
    request_id uuid primary key,
    user_id text not null references public.profiles(id) on delete cascade,
    session_id uuid not null references public.cpu_practice_sessions(session_id) on delete cascade,
    revision integer not null,
    rules_version text not null,
    session_hash text not null,
    move jsonb not null,
    hint jsonb not null,
    pool text not null check (pool in ('free','paid')),
    subscription_id text,
    delivery_state text not null default 'paid_retrievable' check (delivery_state = 'paid_retrievable'),
    created_at timestamptz not null default clock_timestamp(),
    unique(session_id,revision)
);
create index cpu_hint_receipts_owner_idx on public.cpu_hint_receipts(user_id,created_at);
create table public.cpu_hint_request_aliases (
    request_id uuid primary key,
    receipt_id uuid not null references public.cpu_hint_receipts(request_id) on delete cascade
);
create index cpu_hint_alias_receipt_idx on public.cpu_hint_request_aliases(receipt_id);
create table public.cpu_hint_restorations (
    receipt_id uuid primary key references public.cpu_hint_receipts(request_id) on delete cascade,
    reason text not null check (reason = 'unrecoverable_delivery'),
    credited integer not null check (credited in (0,1)),
    created_at timestamptz not null default clock_timestamp()
);

alter table public.cpu_practice_sessions enable row level security;
alter table public.cpu_practice_operations enable row level security;
alter table public.cpu_hint_receipts enable row level security;
alter table public.cpu_hint_request_aliases enable row level security;
alter table public.cpu_hint_restorations enable row level security;
revoke all on public.cpu_practice_sessions,public.cpu_practice_operations,public.cpu_hint_receipts,
    public.cpu_hint_request_aliases,public.cpu_hint_restorations from public,anon,authenticated,service_role;
grant select,insert,update on public.cpu_practice_sessions to service_role;
-- No UPDATE/DELETE privilege on immutable move and hint receipts.
grant select,insert on public.cpu_practice_operations,public.cpu_hint_receipts,
    public.cpu_hint_request_aliases,public.cpu_hint_restorations to service_role;

create function public.cpu_practice_assert_account(p_user_id text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
    if current_user <> 'service_role' then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;
    perform 1 from public.profiles where id=p_user_id for update;
    if not found or p_user_id ~* '^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)'
        or exists(select 1 from public.account_deletion_jobs where user_id=p_user_id and phase<>'completed')
        or exists(select 1 from public.account_restrictions where user_id=p_user_id and blocked)
        or not exists(select 1 from public.account_terms_consents where user_id=p_user_id and version='2026-09-25.1')
    then raise exception 'ACCOUNT_UNAVAILABLE' using errcode = '42501'; end if;
end $$;

create function public.cpu_practice_snapshot(p_session public.cpu_practice_sessions) returns jsonb
language sql stable security invoker set search_path = '' as $$
    select jsonb_build_object(
        'sessionId',p_session.session_id,'userId',p_session.user_id,'kind',p_session.kind,
        'rulesVersion',p_session.rules_version,'playerSide',p_session.player_side,
        'level',p_session.level,'seconds',p_session.seconds,'revision',p_session.revision,
        'stateHash',p_session.state_hash,'state',p_session.state,'history',p_session.history,
        'status',case when p_session.expires_at<=clock_timestamp()
            or (case when p_session.state->>'sideToMove'='white' then p_session.white_ms else p_session.black_ms end)
                <=extract(epoch from clock_timestamp()-p_session.turn_started_at)*1000
            then 'finished' else p_session.status end,
        'whiteMs',greatest(0,p_session.white_ms-case when p_session.status='active' and p_session.state->>'sideToMove'='white'
            then (extract(epoch from clock_timestamp()-p_session.turn_started_at)*1000)::bigint else 0 end),
        'blackMs',greatest(0,p_session.black_ms-case when p_session.status='active' and p_session.state->>'sideToMove'='black'
            then (extract(epoch from clock_timestamp()-p_session.turn_started_at)*1000)::bigint else 0 end))
$$;

create function public.cpu_practice_open(p_session_id uuid,p_user_id text,p_player_side text,
    p_level integer,p_seconds integer,p_rules_version text,p_state jsonb,p_state_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_session public.cpu_practice_sessions;
begin
    perform public.cpu_practice_assert_account(p_user_id);
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qg-practice:'||p_session_id::text,0));
    select * into v_session from public.cpu_practice_sessions where session_id=p_session_id for update;
    if found then
        if v_session.user_id<>p_user_id or v_session.player_side<>p_player_side
            or v_session.level<>p_level or v_session.seconds<>p_seconds or v_session.rules_version<>p_rules_version
        then raise exception 'REQUEST_MISMATCH' using errcode='23505'; end if;
    else
        if p_state->>'sideToMove'<>'white' or (p_state->>'ply')::integer<>0
            or p_state->>'winner' is not null or jsonb_array_length(p_state->'pieces')<>32
        then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
        if (select count(*) from public.cpu_practice_sessions where user_id=p_user_id
            and status='active' and expires_at>clock_timestamp())>=10
        then raise exception 'SESSION_LIMIT' using errcode='54000'; end if;
        insert into public.cpu_practice_sessions(session_id,user_id,player_side,level,seconds,rules_version,state,state_hash,white_ms,black_ms)
        values(p_session_id,p_user_id,p_player_side,p_level,p_seconds,p_rules_version,p_state,p_state_hash,p_seconds*1000,p_seconds*1000)
        returning * into v_session;
    end if;
    return public.cpu_practice_snapshot(v_session);
end $$;

create function public.cpu_practice_read(p_session_id uuid,p_user_id text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_session public.cpu_practice_sessions;
begin
    perform public.cpu_practice_assert_account(p_user_id);
    select * into v_session from public.cpu_practice_sessions where session_id=p_session_id and user_id=p_user_id;
    if not found then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
    return public.cpu_practice_snapshot(v_session);
end $$;

create function public.cpu_practice_operation(p_operation_id uuid,p_session_id uuid,p_user_id text,
    p_revision integer,p_intent_hash text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_operation public.cpu_practice_operations;
begin
    perform public.cpu_practice_assert_account(p_user_id);
    perform 1 from public.cpu_practice_sessions where session_id=p_session_id and user_id=p_user_id;
    if not found then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
    select * into v_operation from public.cpu_practice_operations where operation_id=p_operation_id;
    if not found then return null; end if;
    if v_operation.session_id<>p_session_id or v_operation.revision<>p_revision or v_operation.intent_hash<>p_intent_hash
    then raise exception 'REQUEST_MISMATCH' using errcode='23505'; end if;
    return v_operation.snapshot;
end $$;

create function public.cpu_practice_commit_move(p_operation_id uuid,p_session_id uuid,p_user_id text,
    p_revision integer,p_intent_hash text,p_actor text,p_state_hash text,p_next_state jsonb,p_next_hash text,p_move jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_session public.cpu_practice_sessions; v_existing jsonb; v_elapsed bigint; v_snapshot jsonb;
begin
    perform public.cpu_practice_assert_account(p_user_id);
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qg-practice-op:'||p_operation_id::text,0));
    v_existing:=public.cpu_practice_operation(p_operation_id,p_session_id,p_user_id,p_revision,p_intent_hash);
    if v_existing is not null then return v_existing; end if;
    select * into v_session from public.cpu_practice_sessions where session_id=p_session_id and user_id=p_user_id for update;
    if not found then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
    if v_session.revision<>p_revision or v_session.state_hash<>p_state_hash
    then raise exception 'STALE_REVISION' using errcode='40001'; end if;
    if public.cpu_practice_snapshot(v_session)->>'status'<>'active' or v_session.state->>'winner' is not null
    then raise exception 'SESSION_FINISHED' using errcode='22023'; end if;
    if p_actor not in ('human','cpu') or
        (v_session.state->>'sideToMove'=v_session.player_side)<>(p_actor='human')
    then raise exception 'NOT_YOUR_TURN' using errcode='22023'; end if;
    if (p_next_state->>'ply')::integer<>p_revision+1
        or p_next_state->>'sideToMove'=v_session.state->>'sideToMove'
    then raise exception 'INVALID_MOVE' using errcode='22023'; end if;
    v_elapsed:=greatest(0,(extract(epoch from clock_timestamp()-v_session.turn_started_at)*1000)::bigint);
    update public.cpu_practice_sessions set state=p_next_state,state_hash=p_next_hash,
        revision=revision+1,history=history||jsonb_build_array(p_move),
        white_ms=case when seconds=10 then 10000 when state->>'sideToMove'='white' then white_ms-v_elapsed else white_ms end,
        black_ms=case when seconds=10 then 10000 when state->>'sideToMove'='black' then black_ms-v_elapsed else black_ms end,
        status=case when p_next_state->>'winner' is null then 'active' else 'finished' end,
        turn_started_at=clock_timestamp()
        where session_id=p_session_id returning * into v_session;
    v_snapshot:=public.cpu_practice_snapshot(v_session);
    insert into public.cpu_practice_operations values(p_operation_id,p_session_id,p_revision,p_intent_hash,v_snapshot);
    return v_snapshot;
end $$;

create function public.cpu_practice_close(p_session_id uuid,p_user_id text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_session public.cpu_practice_sessions;
begin
    perform public.cpu_practice_assert_account(p_user_id);
    update public.cpu_practice_sessions set status='finished' where session_id=p_session_id and user_id=p_user_id
        returning * into v_session;
    if not found then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
    return public.cpu_practice_snapshot(v_session);
end $$;

create function public.cpu_hint_payload(p_receipt public.cpu_hint_receipts) returns jsonb
language sql immutable security invoker set search_path = '' as $$
    select jsonb_build_object('receiptId',p_receipt.request_id,'sessionId',p_receipt.session_id,
        'revision',p_receipt.revision,'stateHash',p_receipt.session_hash,'rulesVersion',p_receipt.rules_version,
        'hint',p_receipt.hint,'move',p_receipt.move,'deliveryState',p_receipt.delivery_state)
$$;
create function public.read_cpu_hint_receipt(p_request_id uuid,p_user_id text,p_session_id uuid,p_revision integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_receipt public.cpu_hint_receipts;
begin
    perform public.cpu_practice_assert_account(p_user_id);
    select r.* into v_receipt from public.cpu_hint_request_aliases a
        join public.cpu_hint_receipts r on r.request_id=a.receipt_id where a.request_id=p_request_id;
    if not found then return null; end if;
    if v_receipt.user_id<>p_user_id or v_receipt.session_id<>p_session_id or v_receipt.revision<>p_revision
    then raise exception 'REQUEST_MISMATCH' using errcode='23505'; end if;
    return public.cpu_hint_payload(v_receipt);
end $$;

create function public.cpu_practice_existing_hint(p_session_id uuid,p_user_id text,p_revision integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_receipt public.cpu_hint_receipts;
begin
    perform public.cpu_practice_assert_account(p_user_id);
    perform 1 from public.cpu_practice_sessions where session_id=p_session_id and user_id=p_user_id;
    if not found then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
    select * into v_receipt from public.cpu_hint_receipts where session_id=p_session_id and revision=p_revision;
    if not found then return null; end if;
    return public.cpu_hint_payload(v_receipt);
end $$;

create function public.buy_cpu_hint(p_request_id uuid,p_user_id text,p_session_id uuid,p_revision integer,
    p_state_hash text,p_move jsonb,p_hint jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_session public.cpu_practice_sessions; v_receipt public.cpu_hint_receipts;
    v_existing jsonb; v_spend jsonb; v_pool text; v_subscription text;
begin
    perform public.cpu_practice_assert_account(p_user_id);
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qg-cpu-hint:'||p_request_id::text,0));
    v_existing:=public.read_cpu_hint_receipt(p_request_id,p_user_id,p_session_id,p_revision);
    -- Previously charged receipts remain retrievable after moves, expiry or close.
    if v_existing is not null then return v_existing; end if;
    select * into v_session from public.cpu_practice_sessions where session_id=p_session_id and user_id=p_user_id for update;
    if not found then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
    if v_session.revision<>p_revision or v_session.state_hash<>p_state_hash
    then raise exception 'STALE_REVISION' using errcode='40001'; end if;
    if v_session.kind<>'cpu_practice' or v_session.rules_version<>'quantum-practice-v1'
        or public.cpu_practice_snapshot(v_session)->>'status'<>'active' or v_session.state->>'winner' is not null
    then raise exception 'SESSION_FINISHED' using errcode='22023'; end if;
    if v_session.state->>'sideToMove'<>v_session.player_side
    then raise exception 'NOT_YOUR_TURN' using errcode='22023'; end if;
    -- The session lock makes different request IDs for one revision spend once.
    select * into v_receipt from public.cpu_hint_receipts where session_id=p_session_id and revision=p_revision;
    if not found then
        if p_move is null or p_hint is null or jsonb_typeof(p_hint)<>'object'
            or not (p_hint ?& array['fromRow','fromCol','toRow','toCol']) or
            not ((p_hint->>'fromRow')::integer between 0 and 7 and (p_hint->>'fromCol')::integer between 0 and 7
                and (p_hint->>'toRow')::integer between 0 and 7 and (p_hint->>'toCol')::integer between 0 and 7)
            or (p_hint->>'fromRow'=p_hint->>'toRow' and p_hint->>'fromCol'=p_hint->>'toCol')
        then raise exception 'NO_LEGAL_HINT' using errcode='22023'; end if;
        v_spend:=public.spend_game_tickets('cpu_hint_delivered',p_request_id,array[p_user_id]);
        -- Preserve invalid-paid-pool expiry performed by the wallet RPC even
        -- when no ticket is available. No receipt is created on this result.
        if v_spend->>'insufficient'='true' then return jsonb_build_object('error','INSUFFICIENT_FUNDS'); end if;
        if v_spend->>'applied'<>'true' then raise exception 'REQUEST_MISMATCH' using errcode='23505'; end if;
        v_pool:=v_spend->'entries'->0->>'pool';
        select member_ticket_subscription_id into v_subscription from public.ticket_wallets where user_id=p_user_id;
        insert into public.cpu_hint_receipts(request_id,user_id,session_id,revision,rules_version,session_hash,move,hint,pool,subscription_id)
        values(p_request_id,p_user_id,p_session_id,p_revision,v_session.rules_version,p_state_hash,p_move,p_hint,v_pool,
            case when v_pool='paid' then v_subscription else null end) returning * into v_receipt;
    end if;
    insert into public.cpu_hint_request_aliases values(p_request_id,v_receipt.request_id);
    return public.cpu_hint_payload(v_receipt);
end $$;

-- Operations-only recovery, never mounted in the user HTTP API. A separate
-- immutable credit record preserves the purchased hint and prevents double refunds.
create function public.restore_cpu_hint_credit(p_receipt_id uuid,p_user_id text,p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_receipt public.cpu_hint_receipts; v_credit integer:=0;
begin
    perform public.cpu_practice_assert_account(p_user_id);
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qg-cpu-hint-credit:'||p_receipt_id::text,0));
    select * into v_receipt from public.cpu_hint_receipts where request_id=p_receipt_id and user_id=p_user_id;
    if not found or p_reason is distinct from 'unrecoverable_delivery'
    then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
    if exists(select 1 from public.cpu_hint_restorations where receipt_id=p_receipt_id) then return 0; end if;
    perform 1 from public.ticket_wallets where user_id=p_user_id for update;
    if v_receipt.pool='free' then
        update public.ticket_wallets set hint_tickets=hint_tickets+1 where user_id=p_user_id and hint_tickets<20;
        if found then v_credit:=1; end if;
    elsif exists(select 1 from public.stripe_memberships m
        join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
        join public.stripe_customer_links l on l.customer_id=m.customer_id
        where m.subscription_id=v_receipt.subscription_id and m.user_id=p_user_id and i.user_id=p_user_id and l.user_id=p_user_id
            and m.status='active' and m.period_end>clock_timestamp() and m.refund_blocked_until is null
            and m.current_price_id=i.price_id and i.livemode and i.price_id='price_1ULM9fQWzwYDIuXWgs5Uj3yt') then
        update public.ticket_wallets set member_hint_tickets=member_hint_tickets+1 where user_id=p_user_id
            and member_ticket_subscription_id=v_receipt.subscription_id and member_hint_tickets<20;
        if found then v_credit:=1; end if;
    end if;
    insert into public.cpu_hint_restorations(receipt_id,reason,credited) values(p_receipt_id,p_reason,v_credit);
    return v_credit;
end $$;

do $$
declare v_function regprocedure;
begin
    for v_function in select p.oid::regprocedure from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
        and (p.proname like 'cpu_practice_%' or p.proname in ('cpu_hint_payload','buy_cpu_hint','read_cpu_hint_receipt','restore_cpu_hint_credit'))
    loop
        execute format('revoke all on function %s from public,anon,authenticated,service_role',v_function);
        execute format('grant execute on function %s to service_role',v_function);
    end loop;
end $$;
commit;
