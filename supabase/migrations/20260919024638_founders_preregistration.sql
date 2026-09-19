-- Dedicated Google Play pre-registration entitlement; never client writable.
create table public.founders_entitlements (
    user_id text primary key references public.profiles(id) on delete cascade,
    receipt_hash text not null unique check (receipt_hash ~ '^[0-9a-f]{64}$'),
    product_id text not null default 'qg_founders_preregister' check (product_id = 'qg_founders_preregister'),
    granted_at timestamptz not null default now()
);
alter table public.founders_entitlements enable row level security;
revoke all on public.founders_entitlements from public, anon, authenticated, service_role;
grant select, insert on public.founders_entitlements to service_role;

-- The API must verify the fixed Play package/product before calling this RPC.
-- Both unique constraints make simultaneous claims idempotent and account-bound.
create function public.grant_founders_reward(p_user_id text, p_receipt_hash text)
returns text language plpgsql security invoker set search_path = '' as $$
declare inserted_count integer;
begin
    if p_user_id is null or length(p_user_id) not between 1 and 128
       or p_receipt_hash is null or p_receipt_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'Invalid entitlement';
    end if;
    insert into public.founders_entitlements(user_id, receipt_hash)
        values (p_user_id, p_receipt_hash) on conflict do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count = 1 then return 'granted'; end if;
    if exists (select 1 from public.founders_entitlements
               where user_id = p_user_id and receipt_hash = p_receipt_hash) then
        return 'owned';
    end if;
    return 'conflict';
end;
$$;
revoke all on function public.grant_founders_reward(text, text) from public, anon, authenticated;
grant execute on function public.grant_founders_reward(text, text) to service_role;
