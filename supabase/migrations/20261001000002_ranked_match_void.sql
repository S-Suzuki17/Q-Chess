begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

grant delete on public.ticket_spend_receipts to service_role;

create function public.void_ranked_admission(p_match_id uuid) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('qg-ranked-admission:' || p_match_id::text, 0));

    -- if admission doesn't exist, ignore
    if not exists (select 1 from public.ranked_match_admissions where match_id = p_match_id) then
        return jsonb_build_object('success', false, 'reason', 'NOT_FOUND');
    end if;

    delete from public.ranked_match_admissions where match_id = p_match_id;
    delete from public.ticket_spend_receipts where event_id = p_match_id and event_kind = 'ranked_match_start';

    return jsonb_build_object('success', true);
end;
$$;

commit;
