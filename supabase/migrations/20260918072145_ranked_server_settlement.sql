-- Applied to production as 20260918072145 on 2026-09-18 via Supabase MCP.
-- Originally prepared locally as 20260918062045; filename now matches remote history.
-- This transaction must ship with the server switching every ranked writer to
-- settle_ranked_match. Drain old server processes/matches before enabling it.
begin;
set local lock_timeout = '3s';
alter table public.profiles
    alter column rating set default 1000,
    alter column rating_10s set default 1000,
    alter column rating_3m set default 1000,
    alter column rating_10m set default 1000;

-- Deliberately independent from game_records: 30-day history cleanup must never
-- erase the durable match claim. No FK or cascade to history/profiles is used.
create table public.ranked_match_settlements (
    match_id uuid primary key,
    request_hash bytea not null check (octet_length(request_hash) = 32),
    result jsonb,
    created_at timestamptz not null default now()
);
alter table public.ranked_match_settlements enable row level security;
alter table public.ranked_match_settlements force row level security;
revoke all on public.ranked_match_settlements from public, anon, authenticated, service_role;
grant select, insert, update on public.ranked_match_settlements to service_role;
comment on table public.ranked_match_settlements is
    'Permanent ranked match idempotency ledger; never include in game history cleanup.';

-- Direct PostgREST writers retain existing cosmetic/profile operations, but
-- cannot move a rating to a different ID, change its value, replace the account's
-- password hash to steal its ranked identity, or delete/reset it.
-- SECURITY INVOKER is essential: SECURITY DEFINER would make current_user the
-- owner for every request. No client-settable custom GUC is used for authority.
create or replace function public.guard_ranked_profile_ratings()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if current_user in ('service_role', 'postgres') then
        if tg_op = 'DELETE' then return old; end if;
        return new;
    end if;
    if tg_op = 'DELETE' then
        raise exception 'Profile deletion requires the trusted account service' using errcode = '42501';
    elsif tg_op = 'INSERT' then
        if new.rating is distinct from 1000
            or new.rating_10s is distinct from 1000
            or new.rating_3m is distinct from 1000
            or new.rating_10m is distinct from 1000 then
            raise exception 'New account ratings must use the initial value' using errcode = '42501';
        end if;
    elsif new.id is distinct from old.id
        or new.password_hash is distinct from old.password_hash
        or new.rating is distinct from old.rating
        or new.rating_10s is distinct from old.rating_10s
        or new.rating_3m is distinct from old.rating_3m
        or new.rating_10m is distinct from old.rating_10m then
        raise exception 'Ranked rating, credentials, and identity changes require the trusted service' using errcode = '42501';
    end if;
    return new;
end;
$$;
revoke all on function public.guard_ranked_profile_ratings() from public, anon, authenticated;
create trigger guard_ranked_profile_ratings
before insert or update or delete on public.profiles
for each row execute function public.guard_ranked_profile_ratings();
revoke delete, truncate, trigger on public.profiles from public, anon, authenticated;

create or replace function public.guard_ranked_game_records()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if current_user in ('service_role', 'postgres') then
        if tg_op = 'DELETE' then return old; end if;
        return new;
    end if;
    if tg_op in ('UPDATE', 'DELETE') then
        if lower(btrim(old.mode)) like 'ranked%' then
            raise exception 'Ranked history requires the trusted service' using errcode = '42501';
        end if;
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
        if lower(btrim(new.mode)) like 'ranked%' then
            raise exception 'Ranked history requires the trusted service' using errcode = '42501';
        end if;
        return new;
    end if;
    return old;
end;
$$;
revoke all on function public.guard_ranked_game_records() from public, anon, authenticated;
create trigger guard_ranked_game_records
before insert or update or delete on public.game_records
for each row execute function public.guard_ranked_game_records();
revoke truncate, trigger on public.game_records from public, anon, authenticated;

-- Remove the old automatic Elo write before the replacement RPC can insert a
-- ranked record. Revoke every overload of the old callable writer, including
-- PUBLIC inheritance and direct grants. Its definition remains for audit.
drop trigger if exists trigger_update_ratings on public.game_records;
do $$
declare legacy record;
begin
    for legacy in
        select p.oid::regprocedure as signature
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('record_match_result', 'update_ratings_on_match')
    loop
        execute format('revoke all on function %s from public, anon, authenticated, service_role', legacy.signature);
    end loop;
end;
$$;

create or replace function public.settle_ranked_match(
    p_match_id uuid,
    p_white_id text,
    p_black_id text,
    p_winner text,
    p_time_control integer,
    p_cpu_id text,
    p_cpu_rating integer,
    p_cpu_level integer,
    p_history jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_request_hash bytea;
    v_previous_hash bytea;
    v_result jsonb;
    v_human_ids text[];
    v_id text;
    v_profile record;
    v_white_cpu boolean;
    v_black_cpu boolean;
    v_expected_profiles integer;
    v_found_profiles integer := 0;
    v_white_name text;
    v_black_name text;
    v_white_before integer;
    v_black_before integer;
    v_white_global integer;
    v_black_global integer;
    v_white_after integer;
    v_black_after integer;
    v_white_global_after integer;
    v_black_global_after integer;
    v_white_score numeric;
    v_expected_white numeric;
    v_expected_white_global numeric;
begin
    -- Even a future accidental grant must not expose a service-authoritative RPC.
    if current_user <> 'service_role' then
        raise exception 'Ranked settlement requires service_role' using errcode = '42501';
    end if;
    if p_match_id is null or p_winner is null or p_winner not in ('WHITE', 'BLACK', 'DRAW')
        or p_time_control is null or p_time_control not in (10, 180, 600) then
        raise exception 'Invalid ranked match metadata' using errcode = '22023';
    end if;
    if p_white_id is null or p_black_id is null or p_white_id = p_black_id then
        raise exception 'Ranked players must be distinct' using errcode = '22023';
    end if;
    foreach v_id in array array[p_white_id, p_black_id] loop
        if v_id = '' or v_id <> btrim(v_id) or octet_length(v_id) > 256 or v_id ~ '[[:cntrl:]]' then
            raise exception 'Invalid ranked player ID' using errcode = '22023';
        end if;
    end loop;
    if p_history is null or jsonb_typeof(p_history) <> 'array' then
        raise exception 'Ranked history must be an array' using errcode = '22023';
    end if;
    if jsonb_array_length(p_history) > 5000 or octet_length(p_history::text) > 2097152 then
        raise exception 'Ranked history exceeds the storage bound' using errcode = '22023';
    end if;

    v_white_cpu := p_cpu_id is not null and p_white_id = p_cpu_id;
    v_black_cpu := p_cpu_id is not null and p_black_id = p_cpu_id;
    if p_cpu_id is null then
        if p_cpu_rating is not null or p_cpu_level is not null then
            raise exception 'Human matches cannot have CPU metadata' using errcode = '22023';
        end if;
        v_human_ids := array[p_white_id, p_black_id];
    else
        if not (v_white_cpu <> v_black_cpu)
            or p_cpu_id !~ '^ai:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            or p_cpu_rating is null or p_cpu_rating not between 0 and 10000
            or p_cpu_level is null or p_cpu_level not between 1 and 100 then
            raise exception 'Invalid server CPU metadata' using errcode = '22023';
        end if;
        v_human_ids := case when v_white_cpu then array[p_black_id] else array[p_white_id] end;
    end if;
    foreach v_id in array v_human_ids loop
        if v_id ~* '^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)' then
            raise exception 'Ranked humans must be registered accounts' using errcode = '22023';
        end if;
    end loop;

    -- Hash all inputs, including moves and CPU parameters. JSONB canonicalizes
    -- object key order. Only the digest is kept after game history expires.
    v_request_hash := sha256(convert_to(jsonb_build_object(
        'whiteId', p_white_id, 'blackId', p_black_id, 'winner', p_winner,
        'timeControl', p_time_control, 'cpuId', p_cpu_id,
        'cpuRating', p_cpu_rating, 'cpuLevel', p_cpu_level, 'history', p_history
    )::text, 'UTF8'));

    -- ON CONFLICT waits on a concurrent uncommitted insert. The following
    -- statement then locks the committed claim, so duplicates return its result.
    insert into public.ranked_match_settlements (match_id, request_hash)
        values (p_match_id, v_request_hash)
        on conflict (match_id) do nothing;
    select s.request_hash, s.result into v_previous_hash, v_result
        from public.ranked_match_settlements s
        where s.match_id = p_match_id for update;
    if v_previous_hash is distinct from v_request_hash then
        raise exception 'Match ID was already used with different parameters' using errcode = '22023';
    end if;
    if v_result is not null then return v_result; end if;

    if v_white_cpu then
        v_white_before := p_cpu_rating;
        v_white_global := p_cpu_rating;
        v_white_name := 'CPU Lv.' || p_cpu_level::text;
    elsif v_black_cpu then
        v_black_before := p_cpu_rating;
        v_black_global := p_cpu_rating;
        v_black_name := 'CPU Lv.' || p_cpu_level::text;
    end if;

    -- Every settlement locks human profiles in one stable order. Never lock or
    -- create a CPU profile. Missing/null ratings abort the entire transaction.
    v_expected_profiles := cardinality(v_human_ids);
    for v_profile in
        select p.id, p.name, p.rating,
            case p_time_control
                when 10 then p.rating_10s
                when 180 then p.rating_3m
                when 600 then p.rating_10m
            end as mode_rating
        from public.profiles p
        where p.id = any(v_human_ids)
        order by p.id collate "C"
        for update of p
    loop
        v_found_profiles := v_found_profiles + 1;
        if v_profile.rating is null or v_profile.mode_rating is null
            or v_profile.rating < 0 or v_profile.mode_rating < 0 then
            raise exception 'Ranked profile rating is missing or invalid' using errcode = '22023';
        end if;
        if v_profile.id = p_white_id then
            v_white_before := v_profile.mode_rating;
            v_white_global := v_profile.rating;
            v_white_name := coalesce(nullif(v_profile.name, ''), v_profile.id);
        else
            v_black_before := v_profile.mode_rating;
            v_black_global := v_profile.rating;
            v_black_name := coalesce(nullif(v_profile.name, ''), v_profile.id);
        end if;
    end loop;
    if v_found_profiles <> v_expected_profiles then
        raise exception 'Registered ranked profile not found' using errcode = '22023';
    end if;

    v_white_score := case p_winner when 'WHITE' then 1 when 'BLACK' then 0 else 0.5 end;
    -- Saturation prevents overflow on malformed extreme int ratings; beyond
    -- +/-8000 Elo the rounded K=32 result is already identical to this bound.
    v_expected_white := 1 / (1 + power(10::numeric,
        greatest(-20::numeric, least(20::numeric, (v_black_before::numeric - v_white_before::numeric) / 400))));
    v_expected_white_global := 1 / (1 + power(10::numeric,
        greatest(-20::numeric, least(20::numeric, (v_black_global::numeric - v_white_global::numeric) / 400))));
    v_white_after := greatest(0, round(v_white_before + 32 * (v_white_score - v_expected_white)))::integer;
    v_black_after := greatest(0, round(v_black_before + 32 * (v_expected_white - v_white_score)))::integer;
    v_white_global_after := greatest(0, round(v_white_global + 32 * (v_white_score - v_expected_white_global)))::integer;
    v_black_global_after := greatest(0, round(v_black_global + 32 * (v_expected_white_global - v_white_score)))::integer;

    v_result := jsonb_build_object('timeControl', p_time_control);
    if not v_white_cpu then
        update public.profiles set
            rating = v_white_global_after,
            rating_10s = case when p_time_control = 10 then v_white_after else rating_10s end,
            rating_3m = case when p_time_control = 180 then v_white_after else rating_3m end,
            rating_10m = case when p_time_control = 600 then v_white_after else rating_10m end
        where id = p_white_id;
        v_result := v_result || jsonb_build_object('white', jsonb_build_object(
            'userId', p_white_id, 'before', v_white_before, 'after', v_white_after,
            'delta', v_white_after - v_white_before));
    end if;
    if not v_black_cpu then
        update public.profiles set
            rating = v_black_global_after,
            rating_10s = case when p_time_control = 10 then v_black_after else rating_10s end,
            rating_3m = case when p_time_control = 180 then v_black_after else rating_3m end,
            rating_10m = case when p_time_control = 600 then v_black_after else rating_10m end
        where id = p_black_id;
        v_result := v_result || jsonb_build_object('black', jsonb_build_object(
            'userId', p_black_id, 'before', v_black_before, 'after', v_black_after,
            'delta', v_black_after - v_black_before));
    end if;

    insert into public.game_records (
        id, white_player, black_player, winner, mode, cpu_level, moves,
        total_moves, white_id, black_id, time_control
    ) values (
        p_match_id, v_white_name, v_black_name,
        case p_winner when 'WHITE' then 'white_wins' when 'BLACK' then 'black_wins' else 'draw' end,
        case when p_cpu_id is null then 'ranked' else 'ranked_cpu' end,
        p_cpu_level, p_history, jsonb_array_length(p_history), p_white_id, p_black_id,
        case p_time_control when 10 then '10s' when 180 then '3m' else '10m' end
    );
    update public.ranked_match_settlements set result = v_result where match_id = p_match_id;
    return v_result;
end;
$$;
revoke all on function public.settle_ranked_match(uuid,text,text,text,integer,text,integer,integer,jsonb)
    from public, anon, authenticated;
grant execute on function public.settle_ranked_match(uuid,text,text,text,integer,text,integer,integer,jsonb)
    to service_role;

-- Explicit grants cover projects whose new tables/functions are not exposed by
-- default. Never add a permissive RLS policy to the settlement ledger.
grant select (id, name, rating, rating_10s, rating_3m, rating_10m),
    update (rating, rating_10s, rating_3m, rating_10m) on public.profiles to service_role;
grant insert on public.game_records to service_role;

create or replace function public.ranked_protocol_version()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if current_user <> 'service_role' then
        raise exception 'Ranked protocol readiness requires service_role' using errcode = '42501';
    end if;
    return 1;
end;
$$;
revoke all on function public.ranked_protocol_version() from public, anon, authenticated;
grant execute on function public.ranked_protocol_version() to service_role;
notify pgrst, 'reload schema';
commit;
