-- Additive release. Legacy RPC/table permissions are NOT revoked here.
begin;
create schema if not exists qg_private;
revoke all on schema qg_private from public,anon,authenticated;
grant usage on schema qg_private to service_role;

-- Safe defaults: never require an unpublished Android release.
alter table public.system_status
    add column if not exists minimum_android_build integer not null default 0 check(minimum_android_build>=0),
    add column if not exists minimum_protocol integer not null default 0 check(minimum_protocol>=0),
    add column if not exists announcements jsonb not null default '{}'::jsonb check(jsonb_typeof(announcements)='object');
-- Existing clients only read this public configuration. Remove surplus write ACLs.
revoke insert,update,delete,truncate,references,trigger on public.system_status from public,anon,authenticated;
grant select on public.system_status to anon,authenticated;

-- Deliberately private, service-only state; automatically erased with a profile.
create table public.account_restrictions (
    user_id text primary key references public.profiles(id) on delete cascade,
    blocked boolean not null default false,
    updated_at timestamptz not null default now()
);
alter table public.account_restrictions enable row level security;
revoke all on public.account_restrictions from public,anon,authenticated;
grant select,insert,update,delete on public.account_restrictions to service_role;

-- Only this internal function may inspect auth.sessions. No token payload,
-- refresh token or list of sessions leaves the database.
create function qg_private.live_auth_session(p_user_id uuid,p_session_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$ select exists(select 1 from auth.sessions s where s.id=p_session_id and s.user_id=p_user_id
    and (s.not_after is null or s.not_after>now())) $$;
revoke all on function qg_private.live_auth_session(uuid,uuid) from public,anon,authenticated;
grant execute on function qg_private.live_auth_session(uuid,uuid) to service_role;
create function public.account_session_active(p_user_id uuid,p_session_id uuid)
returns boolean language sql stable security invoker set search_path=pg_catalog
as $$ select qg_private.live_auth_session(p_user_id,p_session_id) $$;
revoke all on function public.account_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.account_session_active(uuid,uuid) to service_role;

-- The new server registration endpoint is the sole caller. Existing accounts
-- keep their passwords; no forced reset or rehash of unverified input occurs.
create function qg_private.register_account(p_id text,p_password text)
returns boolean language plpgsql security definer set search_path=pg_catalog,extensions
as $$ begin
    if p_id is null or p_id !~ '^[A-Za-z0-9]{3,15}$' or p_password is null
       or length(p_password)<12 or octet_length(p_password)>72 or p_password~'[[:cntrl:]]' then
       raise exception 'Invalid registration' using errcode='22023';
    end if;
    insert into public.profiles(id,name,password_hash,rating,rating_10s,rating_3m,rating_10m)
    values(p_id,p_id,crypt(p_password,gen_salt('bf',10)),1000,1000,1000,1000);
    return true;
exception when unique_violation then return false;
end $$;
revoke all on function qg_private.register_account(text,text) from public,anon,authenticated;
grant execute on function qg_private.register_account(text,text) to service_role;
create function public.register_account_secure(p_id text,p_password text)
returns boolean language sql security invoker set search_path=pg_catalog
as $$ select qg_private.register_account(p_id,p_password) $$;
revoke all on function public.register_account_secure(text,text) from public,anon,authenticated;
grant execute on function public.register_account_secure(text,text) to service_role;
create function public.account_security_version() returns integer language sql immutable security invoker
set search_path=pg_catalog as $$ select 1 $$;
revoke all on function public.account_security_version() from public,anon,authenticated;
grant execute on function public.account_security_version() to service_role;
commit;
