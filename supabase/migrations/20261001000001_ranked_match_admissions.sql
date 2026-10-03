begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

create table public.ranked_match_admissions (
    match_id uuid primary key,
    host_id text not null references public.profiles(id) on delete cascade,
    joiner_id text not null, -- could be a CPU id, so not a hard reference
    time_control integer not null,
    admitted_at timestamptz not null default clock_timestamp()
);

alter table public.ranked_match_admissions enable row level security;
revoke all on public.ranked_match_admissions from public, anon, authenticated, service_role;
grant select, insert, delete on public.ranked_match_admissions to service_role;

create function public.admit_ranked_match(
    p_match_id uuid,
    p_host_id text,
    p_joiner_id text,
    p_time_control integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_humans text[];
    v_spend_result jsonb;
    v_existing public.ranked_match_admissions;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('qg-ranked-admission:' || p_match_id::text, 0));

    select * into v_existing from public.ranked_match_admissions where match_id = p_match_id;
    if found then
        return jsonb_build_object('success', true, 'duplicate', true);
    end if;

    v_humans := ARRAY[p_host_id];
    if p_joiner_id not like 'cpu-%' then
        v_humans := array_append(v_humans, p_joiner_id);
    end if;

    v_spend_result := public.spend_game_tickets('ranked_match_start', p_match_id, v_humans);

    if v_spend_result->>'insufficient' = 'true' then
        return jsonb_build_object('success', false, 'reason', 'INSUFFICIENT_FUNDS');
    end if;

    insert into public.ranked_match_admissions (match_id, host_id, joiner_id, time_control)
    values (p_match_id, p_host_id, p_joiner_id, p_time_control);

    return jsonb_build_object('success', true, 'duplicate', false);
end;
$$;

commit;
