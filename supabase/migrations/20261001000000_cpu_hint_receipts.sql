begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

create table public.cpu_hint_receipts (
    request_id uuid primary key,
    user_id text not null references public.profiles(id) on delete cascade,
    session_hash text not null,
    from_row integer not null,
    from_col integer not null,
    to_row integer not null,
    to_col integer not null,
    delivery_state text not null check(delivery_state in ('paid', 'delivered')),
    created_at timestamptz not null default clock_timestamp()
);

alter table public.cpu_hint_receipts enable row level security;
revoke all on public.cpu_hint_receipts from public, anon, authenticated, service_role;
grant select, insert on public.cpu_hint_receipts to service_role;

create function public.buy_cpu_hint(
    p_request_id uuid,
    p_user_id text,
    p_session_hash text,
    p_from_row integer,
    p_from_col integer,
    p_to_row integer,
    p_to_col integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_existing public.cpu_hint_receipts;
    v_spend_result jsonb;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('qg-cpu-hint:' || p_request_id::text, 0));

    select * into v_existing from public.cpu_hint_receipts where request_id = p_request_id;
    if found then
        if v_existing.user_id <> p_user_id or v_existing.session_hash <> p_session_hash then
            raise exception 'Hint request mismatch' using errcode = '23505';
        end if;
        return jsonb_build_object(
            'success', true,
            'duplicate', true,
            'hint', jsonb_build_object(
                'fromRow', v_existing.from_row,
                'fromCol', v_existing.from_col,
                'toRow', v_existing.to_row,
                'toCol', v_existing.to_col
            )
        );
    end if;

    v_spend_result := public.spend_game_tickets('cpu_hint_delivered', p_request_id, ARRAY[p_user_id]);

    if v_spend_result->>'insufficient' = 'true' then
        return jsonb_build_object('success', false, 'reason', 'INSUFFICIENT_FUNDS');
    end if;

    insert into public.cpu_hint_receipts(request_id, user_id, session_hash, from_row, from_col, to_row, to_col, delivery_state)
    values (p_request_id, p_user_id, p_session_hash, p_from_row, p_from_col, p_to_row, p_to_col, 'paid');

    return jsonb_build_object(
        'success', true,
        'duplicate', false,
        'hint', jsonb_build_object(
            'fromRow', p_from_row,
            'fromCol', p_from_col,
            'toRow', p_to_row,
            'toCol', p_to_col
        )
    );
end;
$$;

commit;
