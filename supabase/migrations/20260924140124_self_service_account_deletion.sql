-- Filename aligned with the version assigned by the production migration tool.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- A retry capability is random, never derived from a user ID. Completed receipts
-- contain no personal identifiers and are eligible for cleanup after 24h on the
-- next deletion request. Pending jobs remain resumable.
create table public.account_deletion_jobs (
    ticket_hash text primary key check (ticket_hash ~ '^[a-f0-9]{64}$'),
    user_id text unique,
    auth_user_id uuid,
    phase text not null default 'pending' check (phase in ('pending','data_deleted','completed')),
    created_at timestamptz not null default now(),
    completed_at timestamptz,
    check ((phase='completed' and user_id is null and auth_user_id is null and completed_at is not null)
        or (phase<>'completed' and user_id is not null and completed_at is null))
);
alter table public.account_deletion_jobs enable row level security;
alter table public.account_deletion_jobs force row level security;
revoke all on public.account_deletion_jobs from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.account_deletion_jobs to service_role;

create function public.account_deletion_ready() returns integer language sql security invoker set search_path='' as $$ select 1 $$;

create function public.begin_account_deletion(p_user_id text, p_ticket_hash text, p_auth_user_id uuid default null)
returns void language plpgsql security invoker set search_path='' as $$
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    if p_user_id is null or length(p_user_id) not between 1 and 256 or p_user_id ~* '^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)'
        or p_ticket_hash is null or p_ticket_hash !~ '^[a-f0-9]{64}$'
        or (p_auth_user_id is not null and p_auth_user_id::text<>p_user_id) then
        raise exception 'Invalid deletion request' using errcode='22023';
    end if;
    perform 1 from public.profiles where id=p_user_id for update;
    -- A verified Auth identity may have no application profile after a failed
    -- signup or earlier partial erasure. It must still be able to delete itself.
    if not found and p_auth_user_id is null and not exists(select 1 from public.account_deletion_jobs where user_id=p_user_id) then
        raise exception 'Account unavailable' using errcode='22023';
    end if;
    delete from public.account_deletion_jobs where phase='completed' and completed_at<now()-interval '24 hours';
    insert into public.account_deletion_jobs(ticket_hash,user_id,auth_user_id) values(p_ticket_hash,p_user_id,p_auth_user_id)
    on conflict(user_id) do update set ticket_hash=excluded.ticket_hash;
end $$;

-- Metadata lookup only. Real object deletion MUST go through the Storage API.
create function public.account_deletion_objects(p_ticket_hash text)
returns table(bucket_id text,name text) language sql stable security invoker set search_path='' as $$
    select o.bucket_id,o.name from storage.objects o
    join public.account_deletion_jobs j on j.ticket_hash=p_ticket_hash and j.phase<>'completed'
    where current_user='service_role' and (
        o.owner_id=j.user_id or o.owner::text=j.user_id
        or (o.bucket_id='avatars' and starts_with(o.name,'u/'||encode(sha256(convert_to(j.user_id,'UTF8')),'hex')||'/'))
    ) order by o.bucket_id,o.name limit 100
$$;

create function public.erase_account_data(p_ticket_hash text)
returns void language plpgsql security invoker set search_path='' as $$
declare job public.account_deletion_jobs; target text; optional_table text;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    select * into job from public.account_deletion_jobs where ticket_hash=p_ticket_hash for update;
    if not found then raise exception 'Deletion unavailable' using errcode='22023'; end if;
    if job.phase<>'pending' then return; end if;
    target=job.user_id;
    perform 1 from public.profiles where id=target for update;
    if exists(select 1 from public.account_deletion_objects(p_ticket_hash)) then
        raise exception 'Stored images must be erased first' using errcode='55000';
    end if;
    -- Keep only the other account's anonymous result for lifetime win/loss stats.
    -- Never infer ownership from a display name: names can be duplicated or changed.
    delete from public.game_records g where (g.white_id=target or g.black_id=target)
        and not exists(select 1 from public.profiles p where p.id<>target
            and p.id=case when g.white_id=target then g.black_id else g.white_id end);
    update public.game_records set
        white_player=case when white_id=target then 'Deleted player' else white_player end,
        black_player=case when black_id=target then 'Deleted player' else black_player end,
        white_id=case when white_id=target then null else white_id end,
        black_id=case when black_id=target then null else black_id end,
        moves='[]'::jsonb,replay_expired=true
        where white_id=target or black_id=target;
    -- Preserve idempotency keys, but erase the departing player's receipt and the
    -- original fingerprint. Any late changed retry fails instead of restoring data.
    update public.ranked_match_settlements set
        result=case when result->'white'->>'userId'=target then result-'white' else result end
        - case when result->'black'->>'userId'=target then 'black' else '__no_such_receipt__' end,
        request_hash=sha256(convert_to(gen_random_uuid()::text,'UTF8'))
        where result->'white'->>'userId'=target or result->'black'->>'userId'=target;
    delete from public.friends where user_id=target or friend_id=target;
    delete from public.active_matches where white_id=target or black_id=target;
    foreach optional_table in array array['ad_allowances','ad_reward_intents','ad_consumptions','founders_entitlements'] loop
        if to_regclass('public.'||optional_table) is not null then
            execute format('delete from public.%I where user_id=$1',optional_table) using target;
        end if;
    end loop;
    delete from public.profiles where id=target;
    update public.account_deletion_jobs set phase='data_deleted' where ticket_hash=p_ticket_hash;
end $$;

create function public.finish_account_deletion(p_ticket_hash text)
returns void language plpgsql security invoker set search_path='' as $$
declare job public.account_deletion_jobs;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    select * into job from public.account_deletion_jobs where ticket_hash=p_ticket_hash for update;
    if not found then raise exception 'Deletion unavailable' using errcode='22023'; end if;
    if job.phase='completed' then return; end if;
    if job.phase<>'data_deleted' or exists(select 1 from public.profiles where id=job.user_id)
        or exists(select 1 from public.account_deletion_objects(p_ticket_hash)) then
        raise exception 'Deletion incomplete' using errcode='55000';
    end if;
    -- The trusted orchestrator calls this only after successful Auth admin deletion.
    update public.account_deletion_jobs set user_id=null,auth_user_id=null,phase='completed',completed_at=now()
        where ticket_hash=p_ticket_hash;
end $$;

create schema if not exists qg_private;
revoke all on schema qg_private from public,anon,authenticated;
-- A trigger needs to see pending jobs despite client RLS. Keep the definer helper
-- outside exposed schemas, with an empty search_path and no public EXECUTE grants.
create function qg_private.guard_account_deletion_writes() returns trigger
language plpgsql security definer set search_path='' as $$
declare ids text[]; candidate text; requester uuid;
begin
    requester=auth.uid();
    if requester is not null and not exists(select 1 from auth.users where id=requester) then
        raise exception 'Account no longer exists' using errcode='42501';
    end if;
    if tg_table_name='profiles' then ids=array[new.id];
    elsif tg_table_name='friends' then ids=array[new.user_id,new.friend_id];
    else ids=array[new.white_id,new.black_id]; end if;
    foreach candidate in array ids loop
        if exists(select 1 from public.account_deletion_jobs where user_id=candidate and phase<>'completed') then
            raise exception 'Account deletion in progress' using errcode='42501';
        end if;
    end loop;
    return new;
end $$;
revoke all on function qg_private.guard_account_deletion_writes() from public,anon,authenticated;
create trigger guard_account_deletion before insert or update on public.profiles for each row execute function qg_private.guard_account_deletion_writes();
create trigger guard_account_deletion before insert or update on public.friends for each row execute function qg_private.guard_account_deletion_writes();
create trigger guard_account_deletion before insert on public.game_records for each row execute function qg_private.guard_account_deletion_writes();
create trigger guard_account_deletion before insert or update on public.active_matches for each row execute function qg_private.guard_account_deletion_writes();

revoke all on function public.account_deletion_ready() from public,anon,authenticated;
revoke all on function public.begin_account_deletion(text,text,uuid) from public,anon,authenticated;
revoke all on function public.account_deletion_objects(text) from public,anon,authenticated;
revoke all on function public.erase_account_data(text) from public,anon,authenticated;
revoke all on function public.finish_account_deletion(text) from public,anon,authenticated;
grant execute on function public.account_deletion_ready(),public.begin_account_deletion(text,text,uuid),public.account_deletion_objects(text),public.erase_account_data(text),public.finish_account_deletion(text) to service_role;
commit;
