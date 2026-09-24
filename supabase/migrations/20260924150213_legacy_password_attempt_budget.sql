-- Version aligned with the migration applied to production.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';

-- Bounded by the number of existing legacy accounts, never arbitrary attacker
-- supplied identifiers. No password, email or IP is retained. This short-lived
-- security counter is not a login history and is not exposed through the API.
create table qg_private.password_attempt_budgets (
    account_key bytea primary key,
    window_started timestamptz not null,
    attempts integer not null check(attempts between 1 and 10)
);
alter table qg_private.password_attempt_budgets enable row level security;
alter table qg_private.password_attempt_budgets force row level security;
revoke all on qg_private.password_attempt_budgets from public,anon,authenticated,service_role;

create or replace function public.login_user(p_id text,p_password text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_hash text; v_key bytea; v_now timestamptz; admitted integer;
begin
    if p_id is null or octet_length(p_id) not between 1 and 256
        or p_password is null or octet_length(p_password) not between 1 and 1024 then return false; end if;
    -- Serialize password verification against reset/deletion for this account.
    select password_hash into v_hash from public.profiles where id=p_id for update;
    if v_hash is null or exists(select 1 from public.account_deletion_jobs where user_id=p_id and phase<>'completed') then return false; end if;
    v_now=clock_timestamp(); v_key=sha256(convert_to(p_id,'UTF8'));
    delete from qg_private.password_attempt_budgets where window_started<v_now-interval '1 hour';
    insert into qg_private.password_attempt_budgets as b(account_key,window_started,attempts)
        values(v_key,v_now,1)
    on conflict(account_key) do update set
        window_started=case when b.window_started<=v_now-interval '1 minute' then v_now else b.window_started end,
        attempts=case when b.window_started<=v_now-interval '1 minute' then 1 else b.attempts+1 end
    where b.window_started<=v_now-interval '1 minute' or b.attempts<10
    returning attempts into admitted;
    if admitted is null then return false; end if;
    -- Return rather than raise for a failed password, so the attempt commits.
    return v_hash=extensions.crypt(p_password,v_hash);
end $$;

create or replace function public.update_user_email(p_id text,p_password text,p_email text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
    -- Share the same budget; this must not be an alternate password oracle.
    if not public.login_user(p_id,p_password) then return false; end if;
    update public.profiles set email=p_email where id=p_id;
    return found;
end $$;

-- Do not retain even pseudonymous attempt counters for a deleted account.
create function qg_private.erase_password_attempt_budget() returns trigger
language plpgsql security definer set search_path='' as $$
begin
    delete from qg_private.password_attempt_budgets where account_key=sha256(convert_to(old.id,'UTF8'));
    return old;
end $$;
revoke all on function qg_private.erase_password_attempt_budget() from public,anon,authenticated,service_role;
create trigger erase_password_attempt_budget after delete on public.profiles
for each row execute function qg_private.erase_password_attempt_budget();

-- Keep existing legacy RPC signatures/privileges for installed clients. Moving
-- registration/profile writes behind the server is a separate staged cutover.
commit;
