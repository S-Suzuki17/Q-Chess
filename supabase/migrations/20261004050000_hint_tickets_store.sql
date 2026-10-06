create table if not exists public.stripe_one_time_purchases (
    checkout_id text primary key,
    user_id text not null references public.users(id) on delete cascade,
    price_id text not null,
    amount_total bigint not null,
    status text not null,
    created_at timestamptz not null default now(),
    livemode boolean not null
);
alter table public.stripe_one_time_purchases enable row level security;

create or replace function public.apply_stripe_one_time_purchase(
    p_checkout_id text,
    p_user_id text,
    p_price_id text,
    p_amount_total bigint,
    p_livemode boolean,
    p_hint_tickets bigint
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
begin
    insert into public.stripe_one_time_purchases (
        checkout_id, user_id, price_id, amount_total, status, livemode
    ) values (
        p_checkout_id, p_user_id, p_price_id, p_amount_total, 'completed', p_livemode
    ) on conflict (checkout_id) do nothing;

    if not found then
        return; -- already applied
    end if;

    insert into public.ticket_wallets (user_id) values (p_user_id) on conflict do nothing;

    update public.ticket_wallets
    set hint_tickets = hint_tickets + p_hint_tickets
    where user_id = p_user_id;

end $$;

revoke all on function public.apply_stripe_one_time_purchase(text, text, text, bigint, boolean, bigint) from public, anon, authenticated, service_role;
grant execute on function public.apply_stripe_one_time_purchase(text, text, text, bigint, boolean, bigint) to service_role;
