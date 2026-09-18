-- Replay payloads are private and bounded. Result metadata and the separate
-- ranked settlement ledger remain intact, so lifetime stats/ratings do not fall.
alter table public.game_records add column replay_expired boolean not null default false;
alter table public.game_records enable row level security;
revoke all on public.game_records from public, anon, authenticated;
drop policy if exists "Anyone can read" on public.game_records;
drop policy if exists "Anyone can insert" on public.game_records;
grant select, insert, update on public.game_records to service_role;
-- Disable the old 30-day server cleanup even during a rolling deployment.
revoke delete, truncate on public.game_records from service_role;

create index game_records_white_recent on public.game_records (white_id, created_at desc nulls last, id desc);
create index game_records_black_recent on public.game_records (black_id, created_at desc nulls last, id desc);

create function public.get_private_game_records(p_user_id text, p_limit integer default 10)
returns setof public.game_records language plpgsql stable set search_path = '' as $$
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted history service required' using errcode='42501';
    end if;
    if p_user_id is null or p_user_id='' or p_user_id ~* '^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)' then
        return;
    end if;
    return query select recent.* from (
        select g.* from public.game_records g
        where g.white_id=p_user_id or g.black_id=p_user_id
        order by g.created_at desc nulls last, g.id desc
        limit greatest(0,least(coalesce(p_limit,10),10))
    ) recent where not recent.replay_expired;
end $$;
revoke all on function public.get_private_game_records(text,integer) from public, anon, authenticated;
grant execute on function public.get_private_game_records(text,integer) to service_role;

create function public.get_private_game_stats(p_user_id text)
returns jsonb language plpgsql stable set search_path = '' as $$
declare v_result jsonb;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted history service required' using errcode='42501';
    end if;
    select jsonb_build_object(
        'totalGames',count(*),
        'wins',count(*) filter(where (g.white_id=p_user_id and g.winner='white_wins') or (g.black_id=p_user_id and g.winner='black_wins')),
        'losses',count(*) filter(where (g.white_id=p_user_id and g.winner='black_wins') or (g.black_id=p_user_id and g.winner='white_wins')),
        'draws',count(*) filter(where g.winner='draw'),
        'whiteGames',count(*) filter(where g.white_id=p_user_id),
        'whiteWins',count(*) filter(where g.white_id=p_user_id and g.winner='white_wins'),
        'blackGames',count(*) filter(where g.black_id=p_user_id),
        'blackWins',count(*) filter(where g.black_id=p_user_id and g.winner='black_wins')
    ) into v_result from public.game_records g where g.white_id=p_user_id or g.black_id=p_user_id;
    return v_result;
end $$;
revoke all on function public.get_private_game_stats(text) from public, anon, authenticated;
grant execute on function public.get_private_game_stats(text) to service_role;

create function public.prune_private_replays(p_user_ids text[] default null)
returns integer language plpgsql set search_path = '' as $$
declare v_count integer;
begin
    if current_user not in ('service_role','postgres') then
        raise exception 'Trusted history service required' using errcode='42501';
    end if;
    perform pg_advisory_xact_lock(191937,10);
    update public.game_records g set moves='[]'::jsonb, replay_expired=true
    where not g.replay_expired
        and (p_user_ids is null or g.white_id=any(p_user_ids) or g.black_id=any(p_user_ids))
        -- Unowned legacy records are hidden, but not destructively attributed or
        -- removed by this per-user retention migration.
        and exists (select 1 from unnest(array[g.white_id,g.black_id]) as owners(uid)
            where uid is not null and uid<>'' and uid !~* '^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)')
        and not exists (
            select 1 from unnest(array[g.white_id,g.black_id]) as owners(uid)
            cross join lateral (
                select h.id from public.game_records h
                where h.white_id=owners.uid or h.black_id=owners.uid
                order by h.created_at desc nulls last, h.id desc limit 10
            ) retained
            where owners.uid is not null and owners.uid<>''
                and owners.uid !~* '^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)'
                and retained.id=g.id
        );
    get diagnostics v_count=row_count;
    return v_count;
end $$;
revoke all on function public.prune_private_replays(text[]) from public, anon, authenticated;
grant execute on function public.prune_private_replays(text[]) to service_role;

-- Serialize inserts before AFTER-trigger snapshots: concurrent completions must
-- not each preserve a different eleventh game. No profile locks are introduced.
create function public.lock_private_replay_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
    perform pg_advisory_xact_lock(191937,10);
    return new;
end $$;
create function public.prune_private_replay_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
    perform public.prune_private_replays(array[new.white_id,new.black_id]);
    return new;
end $$;
revoke all on function public.lock_private_replay_insert() from public, anon, authenticated;
revoke all on function public.prune_private_replay_insert() from public, anon, authenticated;
grant execute on function public.lock_private_replay_insert(), public.prune_private_replay_insert() to service_role;
create trigger lock_private_replay_insert before insert on public.game_records
for each row execute function public.lock_private_replay_insert();
create trigger prune_private_replay_insert after insert on public.game_records
for each row execute function public.prune_private_replay_insert();

select public.prune_private_replays(null);
