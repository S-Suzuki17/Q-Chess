begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Follow-up to the already-applied 60-ticket member cap. Do not rewrite
-- historical migrations or invoke recovery for any existing receipt here.
create or replace function public.restore_cpu_hint_credit(p_receipt_id uuid,p_user_id text,p_reason text)
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
            and member_ticket_subscription_id=v_receipt.subscription_id and member_hint_tickets<60;
        if found then v_credit:=1; end if;
    end if;
    insert into public.cpu_hint_restorations(receipt_id,reason,credited) values(p_receipt_id,p_reason,v_credit);
    return v_credit;
end $$;

revoke all on function public.restore_cpu_hint_credit(uuid,text,text) from public,anon,authenticated;
grant execute on function public.restore_cpu_hint_credit(uuid,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
