-- Preserve account-name/password registration and login, including service-only
-- wrappers and private contacts. [.] avoids deployment-dependent SQL escaping.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';

alter table qg_private.registration_contacts
    add constraint registration_contacts_email_format_check
    check(length(email)<=254 and email=lower(btrim(email))
        and email ~ '^[^[:space:]@<>[:cntrl:]]+@[^[:space:]@<>[:cntrl:]]+[.][^[:space:]@<>[:cntrl:]]+$');
alter table qg_private.registration_contacts
    drop constraint registration_contacts_email_check;

create or replace function qg_private.register_account_with_email(p_id text,p_password text,p_email text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
    if p_email is null or length(p_email)>254 or p_email<>lower(btrim(p_email))
        or p_email !~ '^[^[:space:]@<>[:cntrl:]]+@[^[:space:]@<>[:cntrl:]]+[.][^[:space:]@<>[:cntrl:]]+$' then
        raise exception 'Invalid registration' using errcode='22023';
    end if;
    if not qg_private.register_account(p_id,p_password) then return false; end if;
    insert into qg_private.registration_contacts(user_id,email) values(p_id,p_email);
    return true;
end $$;

-- These four IDs are already reserved by RankedAuth. Never create an account
-- that its session authority will reject before password verification.
create or replace function qg_private.register_account(p_id text,p_password text)
returns boolean language plpgsql security definer set search_path=pg_catalog,extensions as $$
begin
    if p_id is null or p_id !~ '^[A-Za-z0-9]{3,15}$'
       or p_id ~* '^(guest|anon|anonymous|cpu)$' or p_password is null
       or length(p_password)<12 or octet_length(p_password)>72 or p_password~'[[:cntrl:]]' then
        raise exception 'Invalid registration' using errcode='22023';
    end if;
    insert into public.profiles(id,name,password_hash,rating,rating_10s,rating_3m,rating_10m)
    values(p_id,p_id,crypt(p_password,gen_salt('bf',10)),1000,1000,1000,1000);
    return true;
exception when unique_violation then return false;
end $$;
-- CREATE OR REPLACE preserves the existing owners, function ACLs and wrappers.
-- No provider configuration, user rows, session runtime or terms are changed.
commit;
