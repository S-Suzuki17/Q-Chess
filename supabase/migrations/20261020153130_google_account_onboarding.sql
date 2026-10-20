begin;
set local lock_timeout='3s';
set local statement_timeout='15s';

-- The game account ID remains stable when a password account is linked.
create table public.google_account_links (
 auth_user_id uuid primary key references auth.users(id) on delete cascade,
 user_id text not null unique references public.profiles(id) on delete cascade,
 username text not null check(username ~ '^[A-Za-z0-9]{3,15}$'),
 created_at timestamptz not null default clock_timestamp()
);
create unique index google_account_username on public.google_account_links(lower(username));
alter table public.google_account_links enable row level security;
revoke all on public.google_account_links from public,anon,authenticated,service_role;
grant select,insert on public.google_account_links to service_role;

create table qg_private.google_account_credentials (
 auth_user_id uuid primary key references public.google_account_links(auth_user_id) on delete cascade,
 password_hash text not null check(password_hash ~ '^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{128}$'),
 updated_at timestamptz not null default clock_timestamp()
);
alter table qg_private.google_account_credentials enable row level security;
revoke all on qg_private.google_account_credentials from public,anon,authenticated,service_role;
grant select,insert,update on qg_private.google_account_credentials to service_role;

-- The service verifies Google OAuth and the live Auth session before this RPC.
-- No browser role can supply an identity, password hash or consent on its own.
create function public.complete_google_account(p_auth_user_id uuid,p_username text,p_hash text,
 p_terms_version text,p_link_existing boolean,p_legacy_password text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_id text; v_existing public.google_account_links; v_terms jsonb;
begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if p_auth_user_id is null or p_username is null or p_username !~ '^[A-Za-z0-9]{3,15}$'
  or p_username ~* '^(guest|anon|anonymous|cpu)$'
  or p_hash is null or p_hash !~ '^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{128}$'
  or p_link_existing is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('qg-google:'||p_auth_user_id::text,0));
 select * into v_existing from public.google_account_links where auth_user_id=p_auth_user_id;
 if found then
  -- Lost replies/repeated setup never rename an account or reset its password.
  return jsonb_build_object('userId',v_existing.user_id,'username',v_existing.username);
 end if;
 if p_link_existing then
  -- Never merge a second existing OAuth profile and silently abandon its data.
  if exists(select 1 from public.profiles where id=p_auth_user_id::text)
   then return jsonb_build_object('code','ALREADY_HAS_ACCOUNT'); end if;
  if p_legacy_password is null or not public.login_user(p_username,p_legacy_password)
   then return jsonb_build_object('code','LEGACY_AUTH_REQUIRED'); end if;
  v_id:=p_username;
 else
  if p_legacy_password is not null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  if exists(select 1 from public.profiles where lower(id)=lower(p_username))
   then return jsonb_build_object('code','NAME_UNAVAILABLE'); end if;
  v_id:=p_auth_user_id::text;
  insert into public.profiles(id,name,rating,rating_10s,rating_3m,rating_10m)
   values(v_id,p_username,1000,1000,1000,1000) on conflict(id) do nothing;
 end if;
 perform 1 from public.profiles where id=v_id for update;
 if not found or exists(select 1 from public.account_deletion_jobs where user_id=v_id and phase<>'completed')
  or exists(select 1 from public.account_restrictions where user_id=v_id and blocked)
  then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
 v_terms:=public.accept_current_account_terms(v_id,p_terms_version);
 if not (v_terms->>'effective')::boolean or v_terms->'consent'='null'::jsonb
  then raise exception 'TERMS_UPDATED' using errcode='42501'; end if;
 insert into public.google_account_links(auth_user_id,user_id,username) values(p_auth_user_id,v_id,p_username);
 insert into qg_private.google_account_credentials(auth_user_id,password_hash) values(p_auth_user_id,p_hash);
 if not p_link_existing then update public.profiles set name=p_username where id=v_id; end if;
 return jsonb_build_object('userId',v_id,'username',p_username);
end $$;
revoke all on function public.complete_google_account(uuid,text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.complete_google_account(uuid,text,text,text,boolean,text) to service_role;

create function public.google_account_credential(p_auth_user_id uuid) returns text
language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 return (select password_hash from qg_private.google_account_credentials where auth_user_id=p_auth_user_id);
end $$;
create function public.change_google_account_password(p_auth_user_id uuid,p_hash text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare v_id text;
begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select user_id into v_id from public.google_account_links where auth_user_id=p_auth_user_id;
 if v_id is null then return false; end if;
 perform 1 from public.profiles where id=v_id for update;
 if not found or exists(select 1 from public.account_deletion_jobs where user_id=v_id and phase<>'completed')
  then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
 update qg_private.google_account_credentials set password_hash=p_hash,updated_at=clock_timestamp()
  where auth_user_id=p_auth_user_id;
 return found;
end $$;
revoke all on function public.google_account_credential(uuid),public.change_google_account_password(uuid,text)
 from public,anon,authenticated;
grant execute on function public.google_account_credential(uuid),public.change_google_account_password(uuid,text) to service_role;

-- Preserve the deletion workflow for a linked account. No account is erased by
-- this migration; deletion still requires the player's existing confirmation.
create or replace function public.begin_account_deletion(p_user_id text,p_ticket_hash text,p_auth_user_id uuid default null)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
 if p_user_id is null or length(p_user_id) not between 1 and 256
  or p_user_id ~* '^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)'
  or p_ticket_hash is null or p_ticket_hash !~ '^[a-f0-9]{64}$'
  or (p_auth_user_id is not null and p_auth_user_id::text<>p_user_id
   and not exists(select 1 from public.google_account_links where auth_user_id=p_auth_user_id and user_id=p_user_id))
  then raise exception 'Invalid deletion request' using errcode='22023'; end if;
 perform 1 from public.profiles where id=p_user_id for update;
 if not found and p_auth_user_id is null and not exists(select 1 from public.account_deletion_jobs where user_id=p_user_id)
  then raise exception 'Account unavailable' using errcode='22023'; end if;
 delete from public.account_deletion_jobs where phase='completed' and completed_at<now()-interval '24 hours';
 insert into public.account_deletion_jobs(ticket_hash,user_id,auth_user_id) values(p_ticket_hash,p_user_id,p_auth_user_id)
  on conflict(user_id) do update set ticket_hash=excluded.ticket_hash;
end $$;

-- Retire browser-level password registration/login; verified linking stays service-only.
revoke execute on function public.login_user(text,text),public.update_user_email(text,text,text)
 from public,anon,authenticated;
grant execute on function public.login_user(text,text) to service_role;
-- register_user predates the tracked schema and is absent on some installations.
do $$ begin
 if to_regprocedure('public.register_user(text,text)') is not null then
  execute 'revoke execute on function public.register_user(text,text) from public,anon,authenticated';
 end if;
end $$;
commit;
