begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Dormant server-only groundwork. The game server must call this only when a
-- ranked match becomes playable (one human for CPU fallback, two for PvP), or
-- when an actual CPU hint is ready to deliver. No route calls it yet.
-- One receipt per authenticated user and server-generated event UUID survives
-- retries; profile deletion cascades the corresponding private receipts.
create table public.ticket_spend_receipts (
    event_kind text not null check (event_kind in ('ranked_match_start', 'cpu_hint_delivered')),
    event_id uuid not null,
    user_id text not null references public.profiles(id) on delete cascade,
    -- quota is one of the three free ranked starts for this UTC day;
    -- free/paid identify the ticket wallet debited after quota is exhausted.
    pool text not null check (pool in ('quota', 'free', 'paid')
        and (event_kind = 'ranked_match_start' or pool <> 'quota')),
    spent_at timestamptz not null default clock_timestamp(),
    primary key (event_kind, event_id, user_id)
);
create index ticket_spend_receipts_user_idx on public.ticket_spend_receipts(user_id);
create index ticket_spend_receipts_ranked_quota_idx
    on public.ticket_spend_receipts(user_id, spent_at)
    where event_kind = 'ranked_match_start' and pool = 'quota';
alter table public.ticket_spend_receipts enable row level security;
revoke all on public.ticket_spend_receipts from public, anon, authenticated, service_role;
grant select, insert on public.ticket_spend_receipts to service_role;

-- A single transaction checks every participant before debiting any. The
-- event-scoped advisory lock prevents a reused match/hint UUID from charging
-- a different set of players concurrently. Profile and wallet locks are
-- always acquired in sorted user-ID order, matching grant/deletion locking.
-- Only live paid tickets are spendable; test-mode paid tickets never grant a
-- live game action. An invalid/expired live entitlement clears its paid pool.
create function public.spend_game_tickets(
    p_event_kind text, p_event_id uuid, p_user_ids text[]
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_users text[];
    v_existing_users text[];
    v_existing_entries jsonb;
    v_user text;
    v_wallet public.ticket_wallets;
    v_active_count integer;
    v_active_subscription text;
    v_suspended_count integer;
    v_pool text;
    v_started_at timestamptz;
    v_utc_day date;
    v_daily_free_count integer;
    v_entries jsonb := '[]'::jsonb;
    v_entry jsonb;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_event_kind is null or p_event_kind not in ('ranked_match_start', 'cpu_hint_delivered')
        or p_event_id is null or p_user_ids is null
        or cardinality(p_user_ids) not between 1 and 2
        or (p_event_kind = 'cpu_hint_delivered' and cardinality(p_user_ids) <> 1) then
        raise exception 'Invalid ticket event' using errcode = '22023';
    end if;
    select array_agg(distinct t.user_id order by t.user_id) into v_users
        from unnest(p_user_ids) as t(user_id);
    if v_users is null or cardinality(v_users) <> cardinality(p_user_ids) then
        raise exception 'Duplicate ticket participant' using errcode = '22023';
    end if;
    foreach v_user in array v_users loop
        if v_user is null or length(v_user) not between 1 and 256
            or octet_length(convert_to(v_user, 'UTF8')) > 256
            or v_user ~* '^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)' then
            raise exception 'Invalid ticket participant' using errcode = '22023';
        end if;
    end loop;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('qg-ticket:' || p_event_kind || ':' || p_event_id::text, 0));
    select array_agg(r.user_id order by r.user_id),
        jsonb_agg(jsonb_build_object('userId', r.user_id, 'pool', r.pool) order by r.user_id)
        into v_existing_users, v_existing_entries
        from public.ticket_spend_receipts r
        where r.event_kind = p_event_kind and r.event_id = p_event_id;
    if v_existing_users is not null then
        if v_existing_users <> v_users then
            raise exception 'Ticket event participant mismatch' using errcode = '23505';
        end if;
        return jsonb_build_object('eventKind', p_event_kind, 'eventId', p_event_id,
            'applied', false, 'duplicate', true, 'insufficient', false,
            'entries', v_existing_entries);
    end if;

    foreach v_user in array v_users loop
        perform 1 from public.profiles where id = v_user for update;
        if not found or exists (select 1 from public.account_deletion_jobs
                where user_id = v_user and phase <> 'completed')
            or exists (select 1 from public.account_restrictions
                where user_id = v_user and blocked)
            or not exists (select 1 from public.account_terms_consents
                where user_id = v_user and version = '2026-09-25.1') then
            raise exception 'Ticket account unavailable' using errcode = '42501';
        end if;
    end loop;

    foreach v_user in array v_users loop
        insert into public.ticket_wallets(user_id) values(v_user) on conflict(user_id) do nothing;
        perform 1 from public.ticket_wallets where user_id = v_user for update;
        if not found then raise exception 'Ticket wallet unavailable' using errcode = '55000'; end if;
    end loop;

    -- The sorted profile and wallet locks serialize distinct starts for every
    -- participant. Capture one database time for both sides after all lock
    -- waits, so a PvP start cannot straddle a UTC day boundary.
    v_started_at := clock_timestamp();
    v_utc_day := (v_started_at at time zone 'UTC')::date;

    foreach v_user in array v_users loop
        select * into v_wallet from public.ticket_wallets where user_id = v_user;
        if not found then raise exception 'Ticket wallet unavailable' using errcode = '55000'; end if;
        select count(*), min(m.subscription_id) into v_active_count, v_active_subscription
            from public.stripe_memberships m
            join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
            join public.stripe_customer_links l on l.customer_id = m.customer_id
            where m.user_id = v_user and i.user_id = v_user and l.user_id = v_user
                and m.status = 'active' and m.period_end > clock_timestamp()
                and m.refund_blocked_until is null
                and m.current_price_id = i.price_id and i.livemode
                and i.price_id = 'price_1ULM9fQWzwYDIuXWgs5Uj3yt';
        if v_active_count > 1 then
            raise exception 'Ambiguous paid entitlement' using errcode = '23505';
        end if;
        -- A temporary payment pause suspends paid spending, but does not
        -- forfeit this period's paid tickets. Termination, reversal, expired
        -- period, off-price, or a different active subscription do forfeit.
        select count(*) into v_suspended_count
            from public.stripe_memberships m
            join public.stripe_checkout_intents i on i.checkout_id = m.checkout_id
            join public.stripe_customer_links l on l.customer_id = m.customer_id
            where m.user_id = v_user and i.user_id = v_user and l.user_id = v_user
                and m.subscription_id = v_wallet.member_ticket_subscription_id
                and m.status in ('incomplete', 'trialing', 'past_due', 'unpaid', 'paused')
                and m.period_end > clock_timestamp() and m.refund_blocked_until is null
                and m.current_price_id = i.price_id and i.livemode
                and i.price_id = 'price_1ULM9fQWzwYDIuXWgs5Uj3yt';
        if (v_active_subscription is null and v_suspended_count = 0)
            or (v_active_subscription is not null
                and v_wallet.member_ticket_subscription_id is distinct from v_active_subscription) then
            update public.ticket_wallets set member_ranked_tickets = 0,
                member_hint_tickets = 0, member_ticket_subscription_id = null
                where user_id = v_user and (member_ranked_tickets <> 0 or member_hint_tickets <> 0
                    or member_ticket_subscription_id is not null);
            v_wallet.member_ranked_tickets := 0;
            v_wallet.member_hint_tickets := 0;
            v_wallet.member_ticket_subscription_id := null;
        end if;
        if p_event_kind = 'ranked_match_start' then
            select count(*) into v_daily_free_count
                from public.ticket_spend_receipts r
                where r.user_id = v_user and r.event_kind = 'ranked_match_start'
                    and r.pool = 'quota'
                    and r.spent_at >= (v_utc_day::timestamp at time zone 'UTC')
                    and r.spent_at < ((v_utc_day + 1)::timestamp at time zone 'UTC');
            v_pool := case when v_daily_free_count < 3 then 'quota'
                when v_wallet.ranked_tickets > 0 then 'free'
                when v_active_subscription is not null and v_wallet.member_ticket_subscription_id = v_active_subscription
                    and v_wallet.member_ranked_tickets > 0 then 'paid' else null end;
        else
            v_pool := case when v_wallet.hint_tickets > 0 then 'free'
                when v_active_subscription is not null and v_wallet.member_ticket_subscription_id = v_active_subscription
                    and v_wallet.member_hint_tickets > 0 then 'paid' else null end;
        end if;
        if v_pool is null then
            return jsonb_build_object('eventKind', p_event_kind, 'eventId', p_event_id,
                'applied', false, 'duplicate', false, 'insufficient', true,
                'entries', '[]'::jsonb);
        end if;
        v_entries := v_entries || jsonb_build_array(jsonb_build_object('userId', v_user, 'pool', v_pool));
    end loop;

    for v_entry in select value from jsonb_array_elements(v_entries) loop
        v_user := v_entry->>'userId';
        v_pool := v_entry->>'pool';
        if p_event_kind = 'ranked_match_start' and v_pool = 'quota' then
            -- The receipt itself accounts for a free daily start.
            null;
        elsif p_event_kind = 'ranked_match_start' and v_pool = 'free' then
            update public.ticket_wallets set ranked_tickets = ranked_tickets - 1
                where user_id = v_user and ranked_tickets > 0;
        elsif p_event_kind = 'ranked_match_start' and v_pool = 'paid' then
            update public.ticket_wallets set member_ranked_tickets = member_ranked_tickets - 1
                where user_id = v_user and member_ranked_tickets > 0;
        elsif p_event_kind = 'cpu_hint_delivered' and v_pool = 'free' then
            update public.ticket_wallets set hint_tickets = hint_tickets - 1
                where user_id = v_user and hint_tickets > 0;
        else
            update public.ticket_wallets set member_hint_tickets = member_hint_tickets - 1
                where user_id = v_user and member_hint_tickets > 0;
        end if;
        if v_pool <> 'quota' and not found then
            raise exception 'Ticket balance changed' using errcode = '55000';
        end if;
        insert into public.ticket_spend_receipts(event_kind, event_id, user_id, pool, spent_at)
            values(p_event_kind, p_event_id, v_user, v_pool, v_started_at);
    end loop;
    return jsonb_build_object('eventKind', p_event_kind, 'eventId', p_event_id,
        'applied', true, 'duplicate', false, 'insufficient', false, 'entries', v_entries);
end $$;

revoke all on function public.spend_game_tickets(text,uuid,text[])
    from public, anon, authenticated, service_role;
grant execute on function public.spend_game_tickets(text,uuid,text[]) to service_role;

commit;
