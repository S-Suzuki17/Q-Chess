begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Only the trusted game server may resolve a Stripe Customer. Neither the
-- browser nor a user-controlled email, customer ID, or subscription ID is an
-- ownership assertion. A restricted player may still manage/cancel billing;
-- an account in the deletion workflow cannot open a new portal session.
create function public.stripe_portal_customer_for_user(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_count integer;
    v_customer text;
    v_subscription text;
    v_livemode boolean;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_user_id is null or length(p_user_id) not between 1 and 256
        or octet_length(convert_to(p_user_id, 'UTF8')) > 256 then
        raise exception 'Invalid portal account' using errcode = '22023';
    end if;
    perform 1 from public.profiles where id = p_user_id for update;
    if not found or exists (select 1 from public.account_deletion_jobs
        where user_id = p_user_id and phase <> 'completed') then
        raise exception 'Portal account unavailable' using errcode = '42501';
    end if;

    select count(*), min(m.customer_id), min(m.subscription_id), bool_and(i.livemode)
    into v_count, v_customer, v_subscription, v_livemode
    from public.stripe_memberships m
    join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
    join public.stripe_customer_links l on l.customer_id = m.customer_id
    where m.user_id = p_user_id and i.user_id = p_user_id and l.user_id = p_user_id
        and m.status not in ('canceled', 'incomplete_expired');
    if v_count = 0 then
        return jsonb_build_object('manageable', false);
    end if;
    if v_count <> 1 then
        raise exception 'Ambiguous portal customer' using errcode = '23505';
    end if;
    return jsonb_build_object('manageable', true, 'customerId', v_customer,
        'subscriptionId', v_subscription, 'livemode', v_livemode);
end $$;

revoke all on function public.stripe_portal_customer_for_user(text)
    from public, anon, authenticated, service_role;
grant execute on function public.stripe_portal_customer_for_user(text) to service_role;

commit;
