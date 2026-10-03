begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- One server-owned wallet per profile. The FK removes it during the existing
-- verified account-deletion flow; clients receive neither table ACLs nor RLS
-- policies. No stored client clock, purchase data, or arbitrary reward amount.
create table public.ticket_wallets (
    user_id text primary key references public.profiles(id) on delete cascade,
    last_claim_utc_day date,
    streak_days smallint not null default 0 check (streak_days between 0 and 7),
    ranked_tickets smallint not null default 0 check (ranked_tickets between 0 and 20),
    hint_tickets smallint not null default 0 check (hint_tickets between 0 and 20),
    constraint ticket_wallets_claim_state_check check (
        (last_claim_utc_day is null and streak_days = 0)
        or (last_claim_utc_day is not null and streak_days between 1 and 7)
    )
);
alter table public.ticket_wallets enable row level security;
revoke all on public.ticket_wallets from public, anon, authenticated, service_role;
grant select, insert, update on public.ticket_wallets to service_role;
comment on table public.ticket_wallets is
    'Server-only daily-login ticket wallet. Profile FK cascade erases it with the account.';

-- This read-only RPC does not create a wallet. The trusted Render API authenticates
-- the caller and supplies its verified user ID; browser roles cannot execute it.
create function public.daily_login_reward_status(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_wallet public.ticket_wallets;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_user_id is null or length(p_user_id) not between 1 and 256
        or octet_length(convert_to(p_user_id, 'UTF8')) > 256 then
        raise exception 'Invalid reward account' using errcode = '22023';
    end if;
    if not exists (select 1 from public.profiles where id = p_user_id)
        or exists (select 1 from public.account_deletion_jobs
            where user_id = p_user_id and phase <> 'completed')
        or exists (select 1 from public.account_restrictions
            where user_id = p_user_id and blocked)
        -- Keep this version aligned with server/src/services/AccountTerms.ts.
        or not exists (select 1 from public.account_terms_consents
            where user_id = p_user_id and version = '2026-09-25.1') then
        raise exception 'Reward account unavailable' using errcode = '42501';
    end if;
    select * into v_wallet from public.ticket_wallets where user_id = p_user_id;
    return jsonb_build_object(
        'userId', p_user_id,
        'enabled', true,
        'streakDays', coalesce(v_wallet.streak_days, 0),
        'tickets', jsonb_build_object(
            'ranked', coalesce(v_wallet.ranked_tickets, 0),
            'hint', coalesce(v_wallet.hint_tickets, 0)),
        'lastClaimUtcDay', to_char(v_wallet.last_claim_utc_day, 'YYYY-MM-DD'),
        'credited', jsonb_build_object('ranked', 0, 'hint', 0),
        'claimed', false
    );
end $$;

-- Each RPC call is one transaction. Locking the profile FIRST serializes claims
-- with account deletion, then the wallet lock serializes simultaneous devices.
-- The date is taken from the DB clock after the locks, never from a client.
create function public.claim_daily_login_reward(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_wallet public.ticket_wallets;
    v_today date;
    v_streak integer;
    v_ranked_reward integer;
    v_hint_reward integer;
    v_ranked_credit integer := 0;
    v_hint_credit integer := 0;
    v_claimed boolean := false;
begin
    if current_user <> 'service_role' then
        raise exception 'Trusted service required' using errcode = '42501';
    end if;
    if p_user_id is null or length(p_user_id) not between 1 and 256
        or octet_length(convert_to(p_user_id, 'UTF8')) > 256 then
        raise exception 'Invalid reward account' using errcode = '22023';
    end if;

    perform 1 from public.profiles where id = p_user_id for update;
    if not found
        or exists (select 1 from public.account_deletion_jobs
            where user_id = p_user_id and phase <> 'completed')
        or exists (select 1 from public.account_restrictions
            where user_id = p_user_id and blocked)
        or not exists (select 1 from public.account_terms_consents
            where user_id = p_user_id and version = '2026-09-25.1') then
        raise exception 'Reward account unavailable' using errcode = '42501';
    end if;

    v_today := (clock_timestamp() at time zone 'UTC')::date;
    insert into public.ticket_wallets (user_id) values (p_user_id)
        on conflict (user_id) do nothing;
    select * into v_wallet from public.ticket_wallets where user_id = p_user_id for update;
    if not found or v_wallet.last_claim_utc_day > v_today then
        raise exception 'Invalid reward state' using errcode = '22023';
    end if;

    if v_wallet.last_claim_utc_day is distinct from v_today then
        v_claimed := true;
        v_streak := case
            when v_wallet.last_claim_utc_day = v_today - 1
                then least(7, v_wallet.streak_days + 1)
            else 1
        end;
        -- Days 1-7: ranked [1,1,1,2,2,2,3], CPU hint [2,2,3,3,4,4,5].
        -- Day 7 repeats, while each unspent balance is capped at 20.
        v_ranked_reward := case when v_streak <= 3 then 1 when v_streak <= 6 then 2 else 3 end;
        v_hint_reward := case when v_streak <= 2 then 2 when v_streak <= 4 then 3
            when v_streak <= 6 then 4 else 5 end;
        v_ranked_credit := least(20 - v_wallet.ranked_tickets, v_ranked_reward);
        v_hint_credit := least(20 - v_wallet.hint_tickets, v_hint_reward);
        update public.ticket_wallets set
            last_claim_utc_day = v_today,
            streak_days = v_streak,
            ranked_tickets = ranked_tickets + v_ranked_credit,
            hint_tickets = hint_tickets + v_hint_credit
        where user_id = p_user_id returning * into v_wallet;
    end if;

    return jsonb_build_object(
        'userId', p_user_id,
        'enabled', true,
        'streakDays', v_wallet.streak_days,
        'tickets', jsonb_build_object(
            'ranked', v_wallet.ranked_tickets,
            'hint', v_wallet.hint_tickets),
        'lastClaimUtcDay', to_char(v_wallet.last_claim_utc_day, 'YYYY-MM-DD'),
        'credited', jsonb_build_object('ranked', v_ranked_credit, 'hint', v_hint_credit),
        'claimed', v_claimed
    );
end $$;

revoke all on function public.daily_login_reward_status(text),
    public.claim_daily_login_reward(text) from public, anon, authenticated, service_role;
grant execute on function public.daily_login_reward_status(text),
    public.claim_daily_login_reward(text) to service_role;

commit;
