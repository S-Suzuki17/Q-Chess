-- Add email registration without changing legacy account IDs or login proofs.
-- Submitted email is contact data, never verified recovery/authorization evidence.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
create table qg_private.registration_contacts (
    user_id text primary key references public.profiles(id) on delete cascade,
    email text not null check(length(email)<=254 and email=lower(btrim(email))
        and email ~ '^[^[:space:]@<>[:cntrl:]]+@[^[:space:]@<>[:cntrl:]]+\.[^[:space:]@<>[:cntrl:]]+$')
);
alter table qg_private.registration_contacts enable row level security;
revoke all on qg_private.registration_contacts from public,anon,authenticated,service_role;

create function qg_private.register_account_with_email(p_id text,p_password text,p_email text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
    if p_email is null or length(p_email)>254 or p_email<>lower(btrim(p_email))
        or p_email !~ '^[^[:space:]@<>[:cntrl:]]+@[^[:space:]@<>[:cntrl:]]+\.[^[:space:]@<>[:cntrl:]]+$' then
        raise exception 'Invalid registration' using errcode='22023';
    end if;
    if not qg_private.register_account(p_id,p_password) then return false; end if;
    insert into qg_private.registration_contacts(user_id,email) values(p_id,p_email);
    return true;
end $$;
revoke all on function qg_private.register_account_with_email(text,text,text) from public,anon,authenticated;
grant execute on function qg_private.register_account_with_email(text,text,text) to service_role;
create function public.register_account_with_email(p_id text,p_password text,p_email text)
returns boolean language sql security invoker set search_path=pg_catalog as $$
    select qg_private.register_account_with_email(p_id,p_password,p_email)
$$;
revoke all on function public.register_account_with_email(text,text,text) from public,anon,authenticated;
grant execute on function public.register_account_with_email(text,text,text) to service_role;
commit;
