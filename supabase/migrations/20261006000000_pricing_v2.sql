begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Additive, dormant v2 commerce contracts. The legacy $2.99 intent, snapshot,
-- refund and member grant rules remain valid for already-issued Checkouts.
-- New price bindings are empty; the server separately keeps new SKU sales OFF.
create table public.stripe_commerce_paid_evidence (
    event_id text primary key references public.stripe_webhook_receipts(event_id) on delete cascade,
    subscription_id text not null,
    checkout_id text not null references public.stripe_commerce_checkout_intents(checkout_id) on delete cascade,
    livemode boolean not null,
    period_end timestamptz not null
);
alter table public.stripe_commerce_paid_evidence enable row level security;
revoke all on public.stripe_commerce_paid_evidence from public,anon,authenticated,service_role;
grant select,insert on public.stripe_commerce_paid_evidence to service_role;

create table public.stripe_commerce_paid_periods (
    subscription_id text not null check (subscription_id ~ '^sub_[A-Za-z0-9]+$'),
    livemode boolean not null,
    period_start timestamptz not null,
    period_end timestamptz not null,
    sku text not null references public.stripe_commerce_catalog(sku),
    hint_quantity bigint not null check (hint_quantity in (0,10)),
    first_event_id text not null references public.stripe_commerce_event_receipts(event_id),
    granted_at timestamptz not null default clock_timestamp(),
    primary key(subscription_id,livemode,period_end),
    check (period_end>period_start)
);
-- Provider business keys outlive profile erasure without retaining user IDs.
alter table public.stripe_commerce_paid_periods enable row level security;
revoke all on public.stripe_commerce_paid_periods from public,anon,authenticated,service_role;
grant select,insert on public.stripe_commerce_paid_periods to service_role;

create or replace function public.apply_stripe_canonical_membership_snapshot(
    p_event_id text, p_event_payload_hash text, p_event_type text, p_event_created bigint,
    p_observed_at timestamptz, p_subscription_id text, p_checkout_id text,
    p_customer_id text, p_user_id text, p_price_id text, p_status text,
    p_period_end timestamptz, p_livemode boolean, p_paid_new_period boolean,
    p_cancel_at_period_end boolean, p_token uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_intent public.stripe_checkout_intents; v_member public.stripe_memberships;
    v_hash text; v_owner text; v_block timestamptz;
begin
    perform public.require_stripe_reconciliation(p_subscription_id,p_livemode,p_token);
    if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$'
        or p_event_payload_hash is null or p_event_payload_hash !~ '^[a-f0-9]{64}$'
        or p_event_type is null or length(p_event_type) not between 1 and 128
        or p_event_created is null or p_event_created <= 0
        or p_observed_at is null or p_observed_at > clock_timestamp()+interval '10 minutes'
        or p_checkout_id is null or p_checkout_id !~ ('^cs_' || case when p_livemode then 'live' else 'test' end || '_[A-Za-z0-9]+$')
        or p_customer_id is null or p_customer_id !~ '^cus_[A-Za-z0-9]+$'
        or p_user_id is null or length(p_user_id) not between 1 and 256 or octet_length(p_user_id)>256
        or p_price_id is null or p_price_id !~ '^price_[A-Za-z0-9]+$'
        or p_status is null or p_status not in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
        or (p_status='active' and p_period_end is null)
        or p_paid_new_period is null or p_cancel_at_period_end is null then
        raise exception 'Invalid canonical snapshot' using errcode = '22023';
    end if;
    if exists (select 1 from public.stripe_retired_subscriptions
        where subscription_id=p_subscription_id and livemode=p_livemode) then
        return jsonb_build_object('applied',false,'duplicate',false,'retired',true);
    end if;
    -- Same lock order as grants, checkout registration and account erasure.
    perform 1 from public.profiles where id=p_user_id for update;
    if not found or exists (select 1 from public.account_deletion_jobs where user_id=p_user_id and phase<>'completed')
        or exists (select 1 from public.account_restrictions where user_id=p_user_id and blocked) then
        raise exception 'Membership account unavailable' using errcode = '42501';
    end if;
    select * into v_intent from public.stripe_checkout_intents where checkout_id=p_checkout_id for update;
    if not found or v_intent.user_id<>p_user_id or v_intent.livemode<>p_livemode or v_intent.closed_at is not null
        or (p_livemode and v_intent.price_id<>'price_1ULM9fQWzwYDIuXWgs5Uj3yt'
            and not exists(select 1 from public.stripe_commerce_checkout_intents ci
                join public.stripe_commerce_catalog c on c.sku=ci.sku
                where ci.checkout_id=p_checkout_id and ci.user_id=p_user_id
                    and ci.price_id=v_intent.price_id and ci.livemode=p_livemode and c.mode='subscription')) then
        raise exception 'Unbound Checkout' using errcode = '42501';
    end if;
    select payload_hash into v_hash from public.stripe_webhook_receipts where event_id=p_event_id;
    if found then
        if v_hash<>p_event_payload_hash then raise exception 'Event collision' using errcode = '23505'; end if;
        return jsonb_build_object('applied',false,'duplicate',true);
    end if;
    insert into public.stripe_customer_links(customer_id,user_id) values(p_customer_id,p_user_id) on conflict do nothing;
    select user_id into v_owner from public.stripe_customer_links where customer_id=p_customer_id for update;
    if v_owner is distinct from p_user_id then raise exception 'Customer ownership changed' using errcode = '42501'; end if;
    select * into v_member from public.stripe_memberships where subscription_id=p_subscription_id for update;
    if found and (v_member.checkout_id<>p_checkout_id or v_member.customer_id<>p_customer_id or v_member.user_id<>p_user_id) then
        raise exception 'Subscription ownership changed' using errcode = '42501';
    end if;
    -- Stripe cannot resurrect a terminal Subscription ID. A conflicting
    -- canonical response must retry, never consume a receipt or grant access.
    if v_member.status in ('canceled','incomplete_expired') and p_status not in ('canceled','incomplete_expired') then
        raise exception 'Terminal subscription conflict' using errcode = '40001';
    end if;
    v_block := v_member.refund_blocked_until;
    if v_block is not null and p_paid_new_period and p_status='active' and p_period_end>v_block then v_block:=null; end if;
    -- event.created is audit information only. The fenced canonical read is
    -- authoritative even when the delivery's event timestamp is older.
    insert into public.stripe_memberships(subscription_id,checkout_id,customer_id,user_id,
        current_price_id,status,period_end,refund_blocked_until,event_created,observed_at,cancel_at_period_end)
    values(p_subscription_id,p_checkout_id,p_customer_id,p_user_id,p_price_id,p_status,p_period_end,
        v_block,p_event_created,p_observed_at,p_cancel_at_period_end)
    on conflict(subscription_id) do update set current_price_id=excluded.current_price_id,status=excluded.status,
        period_end=excluded.period_end,refund_blocked_until=excluded.refund_blocked_until,
        event_created=excluded.event_created,observed_at=excluded.observed_at,
        cancel_at_period_end=excluded.cancel_at_period_end,updated_at=clock_timestamp();
    insert into public.stripe_webhook_receipts(event_id,user_id,payload_hash) values(p_event_id,p_user_id,p_event_payload_hash);
    -- An active subscription update is not proof of a paid monthly invoice.
    -- Persist the verified paid marker transactionally with its canonical event.
    if p_event_type='invoice.paid' and p_paid_new_period and p_status='active'
        and p_price_id=v_intent.price_id and v_block is null
        and exists(select 1 from public.stripe_commerce_checkout_intents where checkout_id=p_checkout_id) then
        insert into public.stripe_commerce_paid_evidence(event_id,subscription_id,checkout_id,livemode,period_end)
            values(p_event_id,p_subscription_id,p_checkout_id,p_livemode,p_period_end);
    end if;
    return jsonb_build_object('applied',true,'duplicate',false);
end $$;

create or replace function public.claim_stripe_member_daily_grant(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_wallet public.ticket_wallets;
    v_today date;
    v_period_end timestamptz;
    v_subscription_id text;
    v_count integer;
    v_ranked_credit integer := 0;
    v_hint_credit integer := 0;
    v_claimed boolean := false;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_user_id is null or length(p_user_id) not between 1 and 256 then
        raise exception 'Invalid membership account' using errcode = '22023';
    end if;
    perform 1 from public.profiles where id = p_user_id for update;
    if not found or exists (select 1 from public.account_deletion_jobs
        where user_id = p_user_id and phase <> 'completed')
        or exists (select 1 from public.account_restrictions
            where user_id = p_user_id and blocked)
        or not public.has_current_ticket_terms(p_user_id) then
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
    if v_count > 1 then
        raise exception 'Ambiguous test membership' using errcode = '23505';
    end if;
    v_today := (clock_timestamp() at time zone 'UTC')::date;
    insert into public.ticket_wallets(user_id) values(p_user_id)
        on conflict(user_id) do nothing;
    select * into v_wallet from public.ticket_wallets
        where user_id = p_user_id for update;
    if not found or v_wallet.last_member_grant_utc_day > v_today then
        raise exception 'Invalid membership wallet state' using errcode = '22023';
    end if;
    if v_period_end is null then
        -- Temporary payment problems suspend use; a terminal/refunded/off-
        -- price projection or elapsed paid period expires this test pool.
        if not exists (
            select 1 from public.stripe_memberships m
            join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
            where m.subscription_id = v_wallet.test_member_ticket_subscription_id
                and m.user_id = p_user_id and not i.livemode
                and m.current_price_id = i.price_id
                and m.status in ('incomplete', 'trialing', 'past_due', 'unpaid', 'paused')
                and m.period_end > clock_timestamp()
                and m.refund_blocked_until is null
        ) then
            update public.ticket_wallets set test_member_ranked_tickets = 0,
                test_member_hint_tickets = 0,
                test_member_ticket_subscription_id = null
            where user_id = p_user_id returning * into v_wallet;
        end if;
    elsif v_wallet.test_member_ticket_subscription_id is distinct from v_subscription_id then
        update public.ticket_wallets set test_member_ranked_tickets = 0,
            test_member_hint_tickets = 0,
            test_member_ticket_subscription_id = v_subscription_id
        where user_id = p_user_id returning * into v_wallet;
    end if;
    if v_period_end is not null and v_wallet.last_member_grant_utc_day is distinct from v_today then
        v_claimed := true;
        v_ranked_credit := greatest(0, least(60 - v_wallet.test_member_ranked_tickets, 3));
        v_hint_credit := greatest(0, least(60 - v_wallet.test_member_hint_tickets, 3));
        update public.ticket_wallets set
            last_member_grant_utc_day = v_today,
            test_member_ranked_tickets = test_member_ranked_tickets + v_ranked_credit,
            test_member_hint_tickets = test_member_hint_tickets + v_hint_credit
        where user_id = p_user_id returning * into v_wallet;
    end if;
    return jsonb_build_object(
        'userId', p_user_id, 'active', v_period_end is not null,
        'periodEnd', v_period_end,
        'lastGrantUtcDay', to_char(v_wallet.last_member_grant_utc_day, 'YYYY-MM-DD'),
        'tickets', jsonb_build_object(
            'ranked', case when v_period_end is not null
                and v_wallet.test_member_ticket_subscription_id = v_subscription_id
                then v_wallet.test_member_ranked_tickets else 0 end,
            'hint', case when v_period_end is not null
                and v_wallet.test_member_ticket_subscription_id = v_subscription_id
                then v_wallet.test_member_hint_tickets else 0 end),
        'freeTickets', jsonb_build_object(
            'ranked', v_wallet.ranked_tickets, 'hint', v_wallet.hint_tickets),
        'claimed', v_claimed,
        'credited', jsonb_build_object(
            'ranked', v_ranked_credit, 'hint', v_hint_credit)
    );
end $$;

-- Called only for a provider-verified, completely paid monthly invoice after
-- its canonical subscription snapshot, using that same reconciliation fence.
-- Event receipts alone are insufficient: two Stripe events for one business
-- period cannot issue two monthly grants. Overlapping revised/prorated periods
-- are rejected pending an explicitly approved tier-change policy.
create function public.apply_stripe_commerce_paid_period(
    p_event_id text,p_event_payload_hash text,p_subscription_id text,p_checkout_id text,p_user_id text,
    p_sku text,p_price_id text,p_period_start timestamptz,p_period_end timestamptz,p_livemode boolean,p_token uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
    v_intent public.stripe_commerce_checkout_intents; v_catalog public.stripe_commerce_catalog;
    v_receipt public.stripe_commerce_event_receipts; v_period public.stripe_commerce_paid_periods;
    v_key text;
begin
    perform public.require_stripe_reconciliation(p_subscription_id,p_livemode,p_token);
    if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$'
        or p_event_payload_hash is null or p_event_payload_hash !~ '^[a-f0-9]{64}$'
        or p_period_start is null or p_period_end is null
        or not isfinite(p_period_start) or not isfinite(p_period_end)
        or p_period_end < p_period_start+interval '27 days'
        or p_period_end > p_period_start+interval '32 days'
        or p_period_start>clock_timestamp()+interval '10 minutes' then
        raise exception 'Invalid paid monthly period' using errcode='22023';
    end if;
    if exists(select 1 from public.stripe_retired_subscriptions where subscription_id=p_subscription_id and livemode=p_livemode) then
        return jsonb_build_object('applied',false,'duplicate',false,'retired',true,'credited',0);
    end if;
    perform 1 from public.profiles where id=p_user_id for update;
    if not found or exists(select 1 from public.account_deletion_jobs where user_id=p_user_id and phase<>'completed')
        or exists(select 1 from public.account_restrictions where user_id=p_user_id and blocked) then
        raise exception 'Membership account unavailable' using errcode='42501';
    end if;
    select * into v_intent from public.stripe_commerce_checkout_intents where checkout_id=p_checkout_id;
    if not found or (v_intent.user_id,v_intent.sku,v_intent.price_id,v_intent.livemode)
        is distinct from (p_user_id,p_sku,p_price_id,p_livemode) then
        raise exception 'Unbound paid membership' using errcode='42501';
    end if;
    select * into v_catalog from public.stripe_commerce_catalog where sku=p_sku and mode='subscription';
    if not found then raise exception 'Invalid monthly SKU' using errcode='22023'; end if;
    -- Immutable ownership and the signed paid evidence remain valid when a
    -- newer canonical period has already replaced the projection. Validate
    -- them before deduplicating an already-granted historical period.
    perform 1 from public.stripe_memberships m
        join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
        join public.stripe_customer_links l on l.customer_id=m.customer_id
        where m.subscription_id=p_subscription_id and m.checkout_id=p_checkout_id
            and m.user_id=p_user_id and i.user_id=p_user_id and l.user_id=p_user_id
            and i.livemode=p_livemode and i.price_id=p_price_id;
    if not found or not exists(select 1 from public.stripe_webhook_receipts
        where event_id=p_event_id and user_id=p_user_id and payload_hash=p_event_payload_hash)
        or not exists(select 1 from public.stripe_commerce_paid_evidence
            where event_id=p_event_id and subscription_id=p_subscription_id and checkout_id=p_checkout_id
                and livemode=p_livemode and period_end=p_period_end) then
        raise exception 'Canonical paid snapshot required' using errcode='42501';
    end if;
    v_key := p_subscription_id||':'||p_livemode::text||':'||extract(epoch from p_period_end)::text;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qg-commerce-event:'||p_event_id,0));
    select * into v_receipt from public.stripe_commerce_event_receipts where event_id=p_event_id;
    if found and (v_receipt.payload_hash<>p_event_payload_hash or v_receipt.operation<>'paid_period' or v_receipt.business_key<>v_key) then
        raise exception 'Commerce event collision' using errcode='23505';
    end if;
    select * into v_period from public.stripe_commerce_paid_periods
        where subscription_id=p_subscription_id and livemode=p_livemode and period_end=p_period_end;
    if found then
        if v_period.period_start<>p_period_start or v_period.sku<>p_sku then
            raise exception 'Paid period collision' using errcode='23505';
        end if;
        insert into public.stripe_commerce_event_receipts(event_id,payload_hash,operation,business_key)
            values(p_event_id,p_event_payload_hash,'paid_period',v_key) on conflict do nothing;
        return jsonb_build_object('applied',false,'duplicate',true,'credited',0);
    end if;
    -- Only a still-active same-price subscription with no refund barrier may
    -- receive a missed historical grant. A later canonical period is valid;
    -- cancellation, price changes and refunds do not authorize backfilling.
    perform 1 from public.stripe_memberships m
        where m.subscription_id=p_subscription_id and m.checkout_id=p_checkout_id
            and m.user_id=p_user_id and m.current_price_id=p_price_id
            and m.status='active' and m.refund_blocked_until is null
            and m.period_end>=p_period_end
            -- A renewal clears the current refund barrier, not historical
            -- risk. Until per-invoice risk lineage is implemented, any prior
            -- reversal blocks NEW older-period backfills for this subscription.
            -- Existing period duplicates returned above without granting.
            and not exists(select 1 from public.stripe_reversal_receipts r
                where r.subscription_id=m.subscription_id and m.period_end>p_period_end);
    if not found then raise exception 'Canonical paid snapshot required' using errcode='42501'; end if;
    if v_receipt.event_id is not null or exists(select 1 from public.stripe_commerce_paid_periods
        where subscription_id=p_subscription_id and livemode=p_livemode
            and period_start<p_period_end and period_end>p_period_start) then
        raise exception 'Overlapping paid period' using errcode='23505';
    end if;
    insert into public.ticket_wallets(user_id) values(p_user_id) on conflict do nothing;
    perform 1 from public.ticket_wallets where user_id=p_user_id for update;
    if p_livemode then
        update public.ticket_wallets set subscription_hint_tickets=subscription_hint_tickets+v_catalog.monthly_hint_quantity
            where user_id=p_user_id and subscription_hint_tickets<=9007199254740991-v_catalog.monthly_hint_quantity;
    else
        update public.ticket_wallets set test_subscription_hint_tickets=test_subscription_hint_tickets+v_catalog.monthly_hint_quantity
            where user_id=p_user_id and test_subscription_hint_tickets<=9007199254740991-v_catalog.monthly_hint_quantity;
    end if;
    if not found then raise exception 'Wallet arithmetic limit' using errcode='22003'; end if;
    insert into public.stripe_commerce_event_receipts(event_id,payload_hash,operation,business_key)
        values(p_event_id,p_event_payload_hash,'paid_period',v_key);
    insert into public.stripe_commerce_paid_periods(subscription_id,livemode,period_start,period_end,sku,hint_quantity,first_event_id)
        values(p_subscription_id,p_livemode,p_period_start,p_period_end,p_sku,v_catalog.monthly_hint_quantity,p_event_id);
    return jsonb_build_object('applied',true,'duplicate',false,'credited',v_catalog.monthly_hint_quantity);
end $$;

-- New entitlement status is separate from the legacy member status. It is not
-- connected to ranked spending or ads until the complete release is verified.
create function public.stripe_commerce_status(p_user_id text,p_livemode boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_count integer; v_sku text; v_end timestamptz; v_cancel boolean; v_wallet public.ticket_wallets;
begin
    perform public.assert_stripe_billing_mode(p_livemode);
    if not exists(select 1 from public.profiles where id=p_user_id)
        or exists(select 1 from public.account_deletion_jobs where user_id=p_user_id and phase<>'completed')
        or exists(select 1 from public.account_restrictions where user_id=p_user_id and blocked) then
        raise exception 'Commerce account unavailable' using errcode='42501';
    end if;
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
            and exists(select 1 from public.stripe_commerce_paid_periods p where p.subscription_id=m.subscription_id
                and p.livemode=p_livemode and p.period_end=m.period_end and p.sku=ci.sku);
    if v_count>1 then raise exception 'Ambiguous commerce membership' using errcode='23505'; end if;
    select * into v_wallet from public.ticket_wallets where user_id=p_user_id;
    return jsonb_build_object('userId',p_user_id,'active',v_count=1,'sku',v_sku,'periodEnd',v_end,
        'unlimitedRanked',v_count=1,'adFree',v_count=1,'cancelAtPeriodEnd',coalesce(v_cancel,false),
        'purchasedHintTickets',coalesce(case when p_livemode then v_wallet.purchased_hint_tickets else v_wallet.test_purchased_hint_tickets end,0),
        'subscriptionHintTickets',coalesce(case when p_livemode then v_wallet.subscription_hint_tickets else v_wallet.test_subscription_hint_tickets end,0));
end $$;

create function public.stripe_commerce_protocol_version() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    return jsonb_build_object('version',1,'newSalesEnabled',false,'spendingEnabled',false,'reversalsReady',false);
end $$;
revoke all on function public.apply_stripe_commerce_paid_period(text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,uuid),
    public.stripe_commerce_status(text,boolean),public.stripe_commerce_protocol_version() from public,anon,authenticated,service_role;
grant execute on function public.apply_stripe_commerce_paid_period(text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,uuid),
    public.stripe_commerce_status(text,boolean),public.stripe_commerce_protocol_version() to service_role;
notify pgrst,'reload schema';
commit;
