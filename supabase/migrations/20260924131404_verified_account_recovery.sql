begin;
set local lock_timeout='3s';
set local statement_timeout='15s';

-- Legacy profiles.email is NOT verification evidence. Never backfill this table
-- from it. A real password proof plus a newly verified email OTP is required.
create table public.account_recovery_emails (
    user_id text primary key references public.profiles(id) on delete cascade,
    email text not null unique check (email=lower(email) and length(email)<=254),
    auth_user_id uuid not null unique,
    verified_at timestamptz not null default now()
);
alter table public.account_recovery_emails enable row level security;
alter table public.account_recovery_emails force row level security;
revoke all on public.account_recovery_emails from public,anon,authenticated,service_role;
grant select,insert,delete on public.account_recovery_emails to service_role;

-- Minimal private Auth lookup: service_role cannot read auth.users directly.
-- No user metadata is used for authorization, and no Auth row is returned.
create function qg_private.recovery_identity_matches(p_auth_id uuid,p_email text)
returns boolean language sql stable security definer set search_path='' as $$
    select exists(select 1 from auth.users u where u.id=p_auth_id and u.deleted_at is null
        and u.email_confirmed_at is not null and lower(u.email)=p_email and not coalesce(u.is_anonymous,false)
        and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='email'))
$$;
revoke all on function qg_private.recovery_identity_matches(uuid,text) from public,anon,authenticated;
grant usage on schema qg_private to service_role;
grant execute on function qg_private.recovery_identity_matches(uuid,text) to service_role;

create function public.account_recovery_ready() returns integer language sql security invoker set search_path='' as $$ select 1 $$;
create function public.enroll_account_recovery(p_user_id text,p_email text,p_auth_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare existing public.account_recovery_emails;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    perform 1 from public.profiles where id=p_user_id and password_hash is not null for update;
    if not found or exists(select 1 from public.account_deletion_jobs where user_id=p_user_id and phase<>'completed') then
        raise exception 'Account unavailable' using errcode='22023'; end if;
    if p_email is null or p_email<>lower(p_email) or p_auth_id is null
        or not qg_private.recovery_identity_matches(p_auth_id,p_email)
        or exists(select 1 from public.profiles where id=p_auth_id::text) then
        raise exception 'Recovery identity unavailable' using errcode='22023'; end if;
    select * into existing from public.account_recovery_emails where user_id=p_user_id;
    if found then
        if existing.email=p_email and existing.auth_user_id=p_auth_id then return; end if;
        raise exception 'Already linked' using errcode='22023';
    end if;
    insert into public.account_recovery_emails(user_id,email,auth_user_id) values(p_user_id,p_email,p_auth_id);
end $$;

create function public.reset_legacy_account_password(p_user_id text,p_email text,p_auth_id uuid,p_password text)
returns void language plpgsql security invoker set search_path='' as $$
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    if p_password is null or length(p_password)<12 or octet_length(p_password)>72 then
        raise exception 'Invalid password' using errcode='22023'; end if;
    perform 1 from public.profiles where id=p_user_id and password_hash is not null for update;
    if not found or exists(select 1 from public.account_deletion_jobs where user_id=p_user_id and phase<>'completed')
        or not exists(select 1 from public.account_recovery_emails where user_id=p_user_id and email=p_email and auth_user_id=p_auth_id)
        or not qg_private.recovery_identity_matches(p_auth_id,p_email) then
        raise exception 'Recovery unavailable' using errcode='22023'; end if;
    update public.profiles set password_hash=extensions.crypt(p_password,extensions.gen_salt('bf',12)) where id=p_user_id;
end $$;

-- Capture the dedicated recovery Auth identity BEFORE cascading deletion of
-- its mapping, so the existing resumable deletion worker erases it as well.
create function qg_private.capture_recovery_deletion() returns trigger language plpgsql security invoker set search_path='' as $$
begin
    if new.auth_user_id is null then
        select auth_user_id into new.auth_user_id from public.account_recovery_emails where user_id=new.user_id;
    end if;
    return new;
end $$;
revoke all on function qg_private.capture_recovery_deletion() from public,anon,authenticated;
create trigger capture_recovery_deletion before insert on public.account_deletion_jobs for each row execute function qg_private.capture_recovery_deletion();

revoke all on function public.account_recovery_ready(),public.enroll_account_recovery(text,text,uuid),public.reset_legacy_account_password(text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.account_recovery_ready(),public.enroll_account_recovery(text,text,uuid),public.reset_legacy_account_password(text,text,uuid,text) to service_role;
commit;
