begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Dormant commerce storage. There are deliberately NO price bindings or sale
-- activation rows in this migration. A later verified rollout must bind prices.
-- Amounts are cents, currency is USD; quantities are server-owned constants.
create table public.stripe_commerce_catalog (
    sku text primary key,
    mode text not null check (mode in ('payment','subscription')),
    amount_total bigint not null check (amount_total > 0),
    currency text not null check (currency = 'usd'),
    hint_quantity bigint not null check (hint_quantity between 0 and 166),
    monthly_hint_quantity bigint not null check (monthly_hint_quantity in (0,10)),
    unlimited_ranked boolean not null,
    ad_free boolean not null,
    check ((mode='payment' and hint_quantity>0 and monthly_hint_quantity=0 and not unlimited_ranked and not ad_free)
        or (mode='subscription' and hint_quantity=0 and unlimited_ranked and ad_free))
);
insert into public.stripe_commerce_catalog values
    ('standard_monthly','subscription',300,'usd',0,0,true,true),
    ('plus_monthly','subscription',600,'usd',0,10,true,true),
    ('hints_1','payment',100,'usd',1,0,false,false),
    ('hints_13','payment',1000,'usd',13,0,false,false),
    ('hints_27','payment',2000,'usd',27,0,false,false),
    ('hints_44','payment',3000,'usd',44,0,false,false),
    ('hints_77','payment',5000,'usd',77,0,false,false),
    ('hints_166','payment',10000,'usd',166,0,false,false);

create table public.stripe_commerce_price_bindings (
    sku text not null references public.stripe_commerce_catalog(sku),
    price_id text not null check (price_id ~ '^price_[A-Za-z0-9]+$'),
    livemode boolean not null,
    primary key(sku,livemode),
    unique(price_id,livemode),
    unique(sku,price_id,livemode)
);
-- The historical environment CHECK pinned one legacy live price. Preserve
-- that price and move any additional live-price admission to a trusted binding
-- trigger, because SQL CHECK constraints cannot contain catalog subqueries.
alter table public.stripe_checkout_intents
    drop constraint stripe_checkout_intents_environment_check,
    add constraint stripe_checkout_intents_environment_check check (
        (not livemode and checkout_id ~ '^cs_test_[A-Za-z0-9]+$')
        or (livemode and checkout_id ~ '^cs_live_[A-Za-z0-9]+$'));
create function public.validate_stripe_checkout_price_binding() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
    if new.livemode and new.price_id<>'price_1ULM9fQWzwYDIuXWgs5Uj3yt'
        and not exists(select 1 from public.stripe_commerce_price_bindings b
            join public.stripe_commerce_catalog c on c.sku=b.sku
            where b.livemode and b.price_id=new.price_id and c.mode='subscription') then
        raise exception 'Unverified live subscription price' using errcode='23514';
    end if;
    return new;
end $$;
create trigger stripe_validate_checkout_price before insert or update of price_id,livemode
    on public.stripe_checkout_intents for each row execute function public.validate_stripe_checkout_price_binding();
revoke all on function public.validate_stripe_checkout_price_binding() from public,anon,authenticated;
grant execute on function public.validate_stripe_checkout_price_binding() to service_role;

create table public.stripe_commerce_checkout_intents (
    checkout_id text primary key,
    user_id text not null references public.profiles(id) on delete cascade,
    sku text not null,
    price_id text not null,
    amount_total bigint not null check (amount_total>0),
    currency text not null check (currency='usd'),
    livemode boolean not null,
    created_at timestamptz not null default clock_timestamp(),
    expires_at timestamptz not null,
    foreign key(sku,price_id,livemode) references public.stripe_commerce_price_bindings(sku,price_id,livemode),
    check(checkout_id ~ ('^cs_' || case when livemode then 'live' else 'test' end || '_[A-Za-z0-9]+$'))
);
create index stripe_commerce_checkout_owner_idx on public.stripe_commerce_checkout_intents(user_id);

-- Minimal provider replay fences survive verified erasure. They retain no
-- account/customer identifiers and cannot recreate an account or a balance.
create table public.stripe_commerce_consumed_checkouts (
    checkout_id text primary key,
    livemode boolean not null,
    fulfilled_at timestamptz not null default clock_timestamp()
);
create table public.stripe_one_time_purchases (
    checkout_id text primary key references public.stripe_commerce_checkout_intents(checkout_id) on delete cascade,
    user_id text not null references public.profiles(id) on delete cascade,
    sku text not null references public.stripe_commerce_catalog(sku),
    price_id text not null,
    amount_total bigint not null check (amount_total>0),
    currency text not null check (currency='usd'),
    hint_quantity bigint not null check (hint_quantity between 1 and 166),
    livemode boolean not null,
    created_at timestamptz not null default clock_timestamp()
);
create index stripe_one_time_purchases_owner_idx on public.stripe_one_time_purchases(user_id);
create table public.stripe_commerce_event_receipts (
    event_id text primary key check (event_id ~ '^evt_[A-Za-z0-9]+$'),
    payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
    operation text not null check (operation in ('one_time','paid_period')),
    business_key text not null,
    processed_at timestamptz not null default clock_timestamp()
);

-- Never combine purchases/Plus grants with free or legacy membership stock.
-- Existing expiry/reversal procedures cannot erase these new-origin pools.
alter table public.ticket_wallets
    add column purchased_hint_tickets bigint not null default 0 check (purchased_hint_tickets between 0 and 9007199254740991),
    add column test_purchased_hint_tickets bigint not null default 0 check (test_purchased_hint_tickets between 0 and 9007199254740991),
    add column subscription_hint_tickets bigint not null default 0 check (subscription_hint_tickets between 0 and 9007199254740991),
    add column test_subscription_hint_tickets bigint not null default 0 check (test_subscription_hint_tickets between 0 and 9007199254740991);

alter table public.stripe_commerce_catalog enable row level security;
alter table public.stripe_commerce_price_bindings enable row level security;
alter table public.stripe_commerce_checkout_intents enable row level security;
alter table public.stripe_commerce_consumed_checkouts enable row level security;
alter table public.stripe_one_time_purchases enable row level security;
alter table public.stripe_commerce_event_receipts enable row level security;
revoke all on public.stripe_commerce_catalog,public.stripe_commerce_price_bindings,
    public.stripe_commerce_checkout_intents,public.stripe_commerce_consumed_checkouts,
    public.stripe_one_time_purchases,public.stripe_commerce_event_receipts from public,anon,authenticated,service_role;
grant select on public.stripe_commerce_catalog,public.stripe_commerce_price_bindings to service_role;
grant select,insert on public.stripe_commerce_checkout_intents,public.stripe_commerce_consumed_checkouts,
    public.stripe_one_time_purchases,public.stripe_commerce_event_receipts to service_role;

create function public.register_stripe_commerce_checkout_intent(
    p_user_id text,p_checkout_id text,p_sku text,p_price_id text,p_amount_total bigint,
    p_currency text,p_livemode boolean,p_expires_at timestamptz
) returns void language plpgsql security invoker set search_path='' as $$
declare v_catalog public.stripe_commerce_catalog; v_intent public.stripe_commerce_checkout_intents;
begin
    perform public.assert_stripe_billing_mode(p_livemode);
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
        or exists(select 1 from public.account_restrictions where user_id=p_user_id and blocked)
        or not public.has_current_ticket_terms(p_user_id) then
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
    insert into public.stripe_commerce_checkout_intents(checkout_id,user_id,sku,price_id,amount_total,currency,livemode,expires_at)
        values(p_checkout_id,p_user_id,p_sku,p_price_id,p_amount_total,p_currency,p_livemode,p_expires_at);
end $$;

-- Payment evidence is accepted only from the signature-verified server. There
-- is intentionally no caller-supplied ticket quantity and no SECURITY DEFINER.
create function public.apply_stripe_commerce_one_time_purchase(
    p_event_id text,p_event_payload_hash text,p_checkout_id text,p_user_id text,p_sku text,
    p_price_id text,p_amount_total bigint,p_currency text,p_livemode boolean,p_payment_status text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
    v_intent public.stripe_commerce_checkout_intents; v_catalog public.stripe_commerce_catalog;
    v_receipt public.stripe_commerce_event_receipts; v_purchase public.stripe_one_time_purchases;
begin
    perform public.assert_stripe_billing_mode(p_livemode);
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
revoke all on function public.register_stripe_commerce_checkout_intent(text,text,text,text,bigint,text,boolean,timestamptz),
    public.apply_stripe_commerce_one_time_purchase(text,text,text,text,text,text,bigint,text,boolean,text)
    from public,anon,authenticated,service_role;
grant execute on function public.register_stripe_commerce_checkout_intent(text,text,text,text,bigint,text,boolean,timestamptz),
    public.apply_stripe_commerce_one_time_purchase(text,text,text,text,text,text,bigint,text,boolean,text) to service_role;
notify pgrst,'reload schema';
commit;
