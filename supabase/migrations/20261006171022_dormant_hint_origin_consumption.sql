begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Dormant consumption protocol. The game-service source gate remains false.
-- Keep old receipts, aliases, pool checks and buy_cpu_hint byte-for-byte valid.
-- The old paid label is a compatibility category; this immutable allocation
-- identifies the exact new wallet source without changing ranked accounting.
create table public.cpu_hint_wallet_origins (
    receipt_id uuid primary key references public.cpu_hint_receipts(request_id) on delete cascade,
    origin text not null check (origin in ('subscription','purchased'))
);
alter table public.cpu_hint_wallet_origins enable row level security;
revoke all on public.cpu_hint_wallet_origins from public,anon,authenticated,service_role;
grant select,insert on public.cpu_hint_wallet_origins to service_role;

create function public.buy_cpu_hint_v2(p_request_id uuid,p_user_id text,p_session_id uuid,p_revision integer,
    p_state_hash text,p_move jsonb,p_hint jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_result jsonb; v_origin text; v_wallet public.ticket_wallets;
    v_session public.cpu_practice_sessions; v_receipt public.cpu_hint_receipts;
begin
    -- Waiting for a profile lock does not refresh a repeatable-read snapshot.
    -- Each authority check below must observe the latest committed admission.
    if current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'READ_COMMITTED_REQUIRED' using errcode='25001';
    end if;
    -- Match admission and hint spending share the same profile lock. The HTTP
    -- service additionally checks its queue/busy state before and after search.
    perform public.cpu_practice_assert_account(p_user_id);
    if exists(select 1 from public.ranked_match_admissions
        where state='active' and human_ids @> array[p_user_id]) then
        raise exception 'HINT_UNAVAILABLE_IN_MATCH' using errcode='42501';
    end if;
    -- Retain all existing account/session/revision/turn/hint and idempotency
    -- checks and the established free -> eligible legacy-paid spending order.
    -- Its profile, request, session and wallet locks remain held in THIS
    -- transaction. Insufficient funds creates no receipt and performs no debit.
    v_result:=public.buy_cpu_hint(p_request_id,p_user_id,p_session_id,p_revision,p_state_hash,p_move,p_hint);
    if v_result->>'error' is distinct from 'INSUFFICIENT_FUNDS' then return v_result; end if;
    select * into v_wallet from public.ticket_wallets where user_id=p_user_id for update;
    v_origin:=case when v_wallet.subscription_hint_tickets>0 then 'subscription'
        when v_wallet.purchased_hint_tickets>0 then 'purchased' else null end;
    if v_origin is null then return v_result; end if;
    -- Only live columns authorize game actions; sandbox stock never does.
    -- New earned hints are cumulative ledger stock. Consume purchased stock
    -- last; neither source depends on current membership or has a new expiry.
    if v_origin='subscription' then
        update public.ticket_wallets set subscription_hint_tickets=subscription_hint_tickets-1
            where user_id=p_user_id and subscription_hint_tickets>0;
    else
        update public.ticket_wallets set purchased_hint_tickets=purchased_hint_tickets-1
            where user_id=p_user_id and purchased_hint_tickets>0;
    end if;
    if not found then raise exception 'Ticket balance changed' using errcode='55000'; end if;
    select * into strict v_session from public.cpu_practice_sessions where session_id=p_session_id;
    insert into public.cpu_hint_receipts(request_id,user_id,session_id,revision,rules_version,session_hash,move,hint,pool)
        values(p_request_id,p_user_id,p_session_id,p_revision,v_session.rules_version,p_state_hash,p_move,p_hint,'paid')
        returning * into v_receipt;
    insert into public.cpu_hint_wallet_origins(receipt_id,origin) values(p_request_id,v_origin);
    insert into public.cpu_hint_request_aliases(request_id,receipt_id) values(p_request_id,p_request_id);
    return public.cpu_hint_payload(v_receipt);
end $$;

-- Operations-only unrecoverable-delivery repair, never an HTTP cancellation or
-- payment refund. Legacy eligibility/binding rules remain unchanged; numeric
-- saturation in any otherwise-eligible source keeps the credit retryable.
create or replace function public.restore_cpu_hint_credit(p_receipt_id uuid,p_user_id text,p_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_receipt public.cpu_hint_receipts; v_credit integer:=0; v_origin text;
begin
    -- Legacy eligibility must not be read from a snapshot predating a pause,
    -- expiry or binding change, even after waiting for the profile lock.
    if current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'READ_COMMITTED_REQUIRED' using errcode='25001';
    end if;
    perform public.cpu_practice_assert_account(p_user_id);
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qg-cpu-hint-credit:'||p_receipt_id::text,0));
    select * into v_receipt from public.cpu_hint_receipts where request_id=p_receipt_id and user_id=p_user_id;
    if not found or p_reason is distinct from 'unrecoverable_delivery'
    then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
    if exists(select 1 from public.cpu_hint_restorations where receipt_id=p_receipt_id) then return 0; end if;
    perform 1 from public.ticket_wallets where user_id=p_user_id for update;
    select origin into v_origin from public.cpu_hint_wallet_origins where receipt_id=p_receipt_id;
    if v_origin is not null then
        -- Earned/purchased credits retain their recorded source. No membership
        -- lookup, expiry, migration or payment-reversal rule is invented here.
        if v_origin='subscription' then
            update public.ticket_wallets set subscription_hint_tickets=subscription_hint_tickets+1
                where user_id=p_user_id and subscription_hint_tickets<9007199254740991;
        else
            update public.ticket_wallets set purchased_hint_tickets=purchased_hint_tickets+1
                where user_id=p_user_id and purchased_hint_tickets<9007199254740991;
        end if;
        -- A concurrent grant can fill the numeric domain after spending. Keep
        -- the credit retryable instead of recording a permanent zero credit.
        if not found then raise exception 'BALANCE_LIMIT' using errcode='22003'; end if;
        v_credit:=1;
    elsif v_receipt.pool='free' then
        update public.ticket_wallets set hint_tickets=hint_tickets+1 where user_id=p_user_id and hint_tickets<9007199254740991;
        if found then v_credit:=1;
        elsif exists(select 1 from public.ticket_wallets where user_id=p_user_id and hint_tickets=9007199254740991) then
            raise exception 'BALANCE_LIMIT' using errcode='22003';
        end if;
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
    insert into public.cpu_hint_restorations(receipt_id,reason,credited) values(p_receipt_id,p_reason,v_credit);
    return v_credit;
end $$;


revoke all on function public.buy_cpu_hint_v2(uuid,text,uuid,integer,text,jsonb,jsonb),
    public.restore_cpu_hint_credit(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.buy_cpu_hint_v2(uuid,text,uuid,integer,text,jsonb,jsonb),
    public.restore_cpu_hint_credit(uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
