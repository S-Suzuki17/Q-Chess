begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
grant delete on public.ticket_spend_receipts to service_role;

create function public.void_ranked_admission(p_match_id uuid,p_owner_id uuid default null,p_reason text default 'server_recovery')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_match public.ranked_match_admissions; v_alloc public.ranked_match_allocations; v_lease timestamptz;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    if p_match_id is null then raise exception 'Match required' using errcode='22023'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qg-ranked-admission:'||p_match_id::text,0));
    select * into v_match from public.ranked_match_admissions where match_id=p_match_id for update;
    if not found then
        -- Fence a delayed admission even if its transaction hasn't started.
        if p_owner_id is null then return jsonb_build_object('state','missing','success',false); end if;
        insert into public.ranked_match_admissions(match_id,owner_id,state,reason,finalized_at)
            values(p_match_id,p_owner_id,'voided',left(coalesce(p_reason,'server_recovery'),80),clock_timestamp());
        return jsonb_build_object('state','voided','success',true,'duplicate',false,'humanIds','[]'::jsonb);
    end if;
    if p_owner_id is not null and p_owner_id<>v_match.owner_id then
        raise exception 'Ranked owner mismatch' using errcode='42501'; end if;
    if v_match.state='settled' then
        return jsonb_build_object('state','settled','success',false,'duplicate',true,'humanIds',v_match.human_ids,
            'matchId',p_match_id,'result',(select result from public.ranked_match_settlements where match_id=p_match_id));
    elsif v_match.state in ('voided','rejected') then
        return jsonb_build_object('state',v_match.state,'success',true,'duplicate',true,'reason',v_match.reason,
            'matchId',p_match_id,'humanIds',v_match.human_ids);
    end if;
    select expires_at into v_lease from public.ranked_server_leases where owner_id=v_match.owner_id for share;
    if p_owner_id is null and v_lease>clock_timestamp() then
        return jsonb_build_object('state','active','success',false,'matchId',p_match_id,'humanIds',v_match.human_ids);
    end if;
    -- Lock all profiles before any wallet: identical order to admission/settle.
    perform 1 from public.profiles where id=any(v_match.human_ids) order by id collate "C" for update;
    perform 1 from public.ticket_wallets where user_id=any(v_match.human_ids) order by user_id collate "C" for update;
    for v_alloc in select * from public.ranked_match_allocations where match_id=p_match_id loop
        if v_alloc.pool='quota' then
            delete from public.ticket_spend_receipts where event_kind='ranked_match_start' and event_id=p_match_id
                and user_id=v_alloc.user_id and pool='quota';
        elsif v_alloc.refund_origin is not null then
            update public.ranked_ticket_refunds set spent_by=null
                where source_match_id=v_alloc.refund_origin and user_id=v_alloc.user_id and spent_by=p_match_id;
            if not found then raise exception 'Refund ownership mismatch' using errcode='55000'; end if;
        else
            insert into public.ranked_ticket_refunds(source_match_id,user_id,pool,subscription_id,expires_at)
                values(p_match_id,v_alloc.user_id,v_alloc.pool,v_alloc.subscription_id,v_alloc.expires_at);
        end if;
    end loop;
    update public.ranked_match_admissions set state='voided',reason=left(coalesce(p_reason,'server_recovery'),80),
        finalized_at=clock_timestamp() where match_id=p_match_id;
    return jsonb_build_object('state','voided','success',true,'duplicate',false,'reason',p_reason,
        'matchId',p_match_id,'humanIds',v_match.human_ids);
end $$;

create function public.recover_expired_ranked_admissions(p_limit integer default 100)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_result jsonb; v_results jsonb:='[]';
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    for v_id in select a.match_id from public.ranked_match_admissions a
        left join public.ranked_server_leases l on l.owner_id=a.owner_id
        where a.state='active' and (l.expires_at is null or l.expires_at<=clock_timestamp())
        order by a.admitted_at,a.match_id limit greatest(1,least(coalesce(p_limit,100),100))
    loop
        v_result:=public.void_ranked_admission(v_id,null,'server_recovery');
        if v_result->>'state'<>'active' then v_results:=v_results||jsonb_build_array(v_result); end if;
    end loop;
    return v_results;
end $$;

create function public.get_ranked_admission(p_match_id uuid,p_user_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_match public.ranked_match_admissions;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    -- Only server-authenticated participants may discover the durable state.
    select * into v_match from public.ranked_match_admissions
        where match_id=p_match_id and human_ids @> array[p_user_id];
    if not found then return null; end if;
    if v_match.state='active' then
        perform public.void_ranked_admission(p_match_id,null,'server_recovery');
        select * into v_match from public.ranked_match_admissions where match_id=p_match_id;
    end if;
    return jsonb_build_object('matchId',p_match_id,'state',v_match.state,'reason',v_match.reason,
        'ownerId',v_match.owner_id,'humanIds',v_match.human_ids,'timeControl',v_match.time_control,
        'result',(select result from public.ranked_match_settlements where match_id=p_match_id));
end $$;

create function public.ranked_account_busy(p_user_id text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    return exists(select 1 from public.ranked_match_admissions where state='active' and human_ids @> array[p_user_id]);
end $$;

-- The ingress lock alone is insufficient after a restart or on another server.
-- begin_account_deletion already takes the same profile lock; this trigger also
-- protects direct service inserts and the final profile delete.
create function public.guard_ranked_account_deletion() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_user text;
begin
    if tg_table_name='profiles' then v_user:=old.id;
    else
        if new.phase='completed' then return new; end if;
        v_user:=new.user_id;
        perform 1 from public.profiles where id=v_user for update;
    end if;
    if exists(select 1 from public.ranked_match_admissions where state='active' and human_ids @> array[v_user]) then
        raise exception 'Account has an active ranked admission' using errcode='55006'; end if;
    if tg_table_name='profiles' then
        -- Keep UUID tombstones but erase identities when account deletion finishes.
        update public.ranked_match_admissions set
            metadata_hash=sha256(convert_to(gen_random_uuid()::text,'UTF8')),
            host_id=case when host_id=v_user then null else host_id end,
            joiner_id=case when joiner_id=v_user then null else joiner_id end,
            human_ids=array_remove(human_ids,v_user)
            where human_ids @> array[v_user];
        return old;
    end if;
    return new;
end $$;
create trigger guard_ranked_deletion_job before insert or update on public.account_deletion_jobs
    for each row execute function public.guard_ranked_account_deletion();
create trigger guard_ranked_profile_deletion before delete on public.profiles
    for each row execute function public.guard_ranked_account_deletion();

revoke all on function public.void_ranked_admission(uuid,uuid,text),public.recover_expired_ranked_admissions(integer),
    public.get_ranked_admission(uuid,text),public.ranked_account_busy(text),public.guard_ranked_account_deletion()
    from public,anon,authenticated,service_role;
grant execute on function public.void_ranked_admission(uuid,uuid,text),public.recover_expired_ranked_admissions(integer),
    public.get_ranked_admission(uuid,text),public.ranked_account_busy(text),public.guard_ranked_account_deletion() to service_role;

-- Replace the nine-argument entry point with one defaulted owner argument.
-- Existing free ranked matches keep the same request/response contract.
drop function public.settle_ranked_match(uuid,text,text,text,integer,text,integer,integer,jsonb);

create or replace function public.settle_ranked_match(
    p_match_id uuid,
    p_white_id text,
    p_black_id text,
    p_winner text,
    p_time_control integer,
    p_cpu_id text,
    p_cpu_rating integer,
    p_cpu_level integer,
    p_history jsonb,
    p_owner_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_admission public.ranked_match_admissions;
    v_lease timestamptz;
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

    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qg-ranked-admission:'||p_match_id::text,0));
    select * into v_admission from public.ranked_match_admissions where match_id=p_match_id for update;
    if found then
        if v_admission.state not in ('active','settled') then
            raise exception 'Ranked admission is finalized without a result' using errcode='55000'; end if;
        if p_owner_id is distinct from v_admission.owner_id or v_admission.metadata_hash is distinct from
            sha256(convert_to(jsonb_build_object('host',p_white_id,'joiner',p_black_id,'time',p_time_control,
                'cpu',p_cpu_id,'rating',p_cpu_rating,'level',p_cpu_level)::text,'UTF8')) then
            raise exception 'Ranked admission metadata mismatch' using errcode='22023'; end if;
        if v_admission.state='active' then
            select expires_at into v_lease from public.ranked_server_leases where owner_id=p_owner_id for share;
            if not found or v_lease<=clock_timestamp() then
                raise exception 'Ranked owner expired' using errcode='55000'; end if;
        end if;
    elsif p_owner_id is not null then raise exception 'Ranked admission missing' using errcode='55000';
    end if;

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
    if v_admission.match_id is not null then
        if v_lease<=clock_timestamp() then raise exception 'Ranked owner expired' using errcode='55000'; end if;
        update public.ranked_match_admissions set state='settled',finalized_at=clock_timestamp() where match_id=p_match_id;
    end if;
    update public.ranked_match_settlements set result = v_result where match_id = p_match_id;
    return v_result;
end;
$$;

revoke all on function public.settle_ranked_match(uuid,text,text,text,integer,text,integer,integer,jsonb,uuid)
    from public,anon,authenticated,service_role;
grant execute on function public.settle_ranked_match(uuid,text,text,text,integer,text,integer,integer,jsonb,uuid) to service_role;
-- Readiness appears only when admission, compensation and settlement exclusion
-- are installed in full. A partially applied migration chain cannot start play.
create function public.ranked_admission_protocol_version() returns integer
language plpgsql security invoker set search_path='' as $$
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    return 2;
end $$;
create function public.get_ranked_refund_balance(p_user_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_free bigint; v_paid bigint;
begin
    if current_user<>'service_role' then raise exception 'Trusted service required' using errcode='42501'; end if;
    select count(*) filter(where r.pool='free'),count(*) filter(where r.pool='paid' and r.expires_at>clock_timestamp()
        and exists(select 1 from public.stripe_memberships m
            join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
            join public.stripe_customer_links l on l.customer_id=m.customer_id
            where m.subscription_id=r.subscription_id and m.user_id=r.user_id and i.user_id=r.user_id and l.user_id=r.user_id
                and m.status='active' and m.period_end>clock_timestamp() and m.refund_blocked_until is null
                and m.current_price_id=i.price_id and i.livemode and i.price_id='price_1ULM9fQWzwYDIuXWgs5Uj3yt'))
        into v_free,v_paid from public.ranked_ticket_refunds r where r.user_id=p_user_id and r.spent_by is null;
    return jsonb_build_object('freeRankedRefunds',v_free,'paidRankedRefunds',v_paid);
end $$;
revoke all on function public.ranked_admission_protocol_version(),public.get_ranked_refund_balance(text)
    from public,anon,authenticated,service_role;
grant execute on function public.ranked_admission_protocol_version(),public.get_ranked_refund_balance(text) to service_role;
notify pgrst,'reload schema';
commit;
