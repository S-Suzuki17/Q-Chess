begin;
set local lock_timeout='3s';
set local statement_timeout='15s';

-- Immutable weekly publications. Only the game service can read/write these tables.
create table public.learning_weeks (
 week date primary key,
 opens_at timestamptz not null,
 closes_at timestamptz not null,
 check (extract(isodow from week)=2),
 check (opens_at=(week+time '05:00') at time zone 'UTC'),
 check (closes_at=opens_at+interval '7 days')
);
create table public.learning_problems (
 week date not null references public.learning_weeks(week),
 ordinal smallint not null check(ordinal between 1 and 10),
 position_key text not null unique check(length(position_key) between 1 and 1000),
 state jsonb not null check(jsonb_typeof(state)='object'),
 primary key(week,ordinal)
);
create table public.tutorial_completions (
 user_id text not null references public.profiles(id) on delete cascade,
 lesson_id text not null check(lesson_id in (
  'pawn-step','pawn-double','opponent-capture','rook','bishop','knight','queen','king',
  'candidates','deduction-chain','opponent-deduction','captured-slots','castle','promotion',
  'decline-promotion','en-passant','check-block','self-check','king-escape','king-candidates',
  'last-king','stalemate','checkmate','quantum-mate','chess-castle')),
 reward_kind text not null check(reward_kind in ('ranked','hint')),
 completed_at timestamptz not null default clock_timestamp(),
 primary key(user_id,lesson_id)
);
create table public.weekly_problem_completions (
 user_id text not null references public.profiles(id) on delete cascade,
 week date not null,
 ordinal smallint not null,
 completed_at timestamptz not null default clock_timestamp(),
 primary key(user_id,week,ordinal),
 foreign key(week,ordinal) references public.learning_problems(week,ordinal)
);
-- The PK begins with the account for progress reads/deletion. This index supports publication FK checks.
create index weekly_problem_completions_problem on public.weekly_problem_completions(week,ordinal);
alter table public.learning_weeks enable row level security;
alter table public.learning_problems enable row level security;
alter table public.tutorial_completions enable row level security;
alter table public.weekly_problem_completions enable row level security;
revoke all on public.learning_weeks,public.learning_problems,public.tutorial_completions,public.weekly_problem_completions
 from public,anon,authenticated,service_role;
grant select,insert on public.learning_weeks,public.learning_problems,public.tutorial_completions,public.weekly_problem_completions to service_role;

create function public.publish_learning_week(p_week date,p_problems jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare v_problem jsonb; v_index integer:=0;
begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if p_week is null or extract(isodow from p_week)<>2 or jsonb_typeof(p_problems) is distinct from 'array'
  or jsonb_array_length(p_problems)<>10 then raise exception 'INVALID_WEEK' using errcode='22023'; end if;
 -- Concurrent workers/restarts publish exactly one complete set, never replace an open set.
 perform pg_advisory_xact_lock(hashtextextended('qg-learning-week:'||p_week::text,0));
 if exists(select 1 from public.learning_weeks where week=p_week) then return false; end if;
 insert into public.learning_weeks values(p_week,(p_week+time '05:00') at time zone 'UTC',
  ((p_week+7)+time '05:00') at time zone 'UTC');
 for v_problem in select value from jsonb_array_elements(p_problems) loop
  v_index:=v_index+1;
  if v_problem->>'id' is distinct from v_index::text then raise exception 'INVALID_ORDER' using errcode='22023'; end if;
  insert into public.learning_problems values(p_week,v_index,v_problem->>'positionKey',v_problem->'state');
 end loop;
 return true;
end $$;

create function public.learning_progress(p_user_id text,p_week date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_wallet public.ticket_wallets;
begin
 perform public.match_hint_assert_account(p_user_id);
 select * into v_wallet from public.ticket_wallets where user_id=p_user_id;
 return jsonb_build_object(
  'tutorial',coalesce((select jsonb_agg(lesson_id order by completed_at,lesson_id) from public.tutorial_completions where user_id=p_user_id),'[]'::jsonb),
  'weekly',coalesce((select jsonb_agg(ordinal order by ordinal) from public.weekly_problem_completions where user_id=p_user_id and week=p_week),'[]'::jsonb),
  'weeklyRewarded',exists(select 1 from public.weekly_problem_completions where user_id=p_user_id and week=p_week and ordinal=10),
  'tickets',jsonb_build_object('ranked',coalesce(v_wallet.ranked_tickets,0),'hint',coalesce(v_wallet.hint_tickets,0)));
end $$;

-- Called only after the authenticated service has replayed every submitted move.
-- Amounts, alternation, once-only identity and publication windows belong to this transaction.
create function public.complete_learning(p_user_id text,p_kind text,p_lesson_id text,p_week date,p_ordinal integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_count integer; v_reward text; v_new boolean:=false; v_ad integer:=0; v_terms jsonb;
 v_now timestamptz; v_active_week date; v_wallet public.ticket_wallets;
begin
 perform public.match_hint_assert_account(p_user_id);
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ_COMMITTED_REQUIRED' using errcode='25001'; end if;
 if p_kind is null or p_kind not in ('tutorial','weekly')
  or (p_kind='tutorial' and (p_lesson_id is null or p_week is not null or p_ordinal is not null))
  or (p_kind='weekly' and (p_week is null or p_ordinal is null or p_ordinal not between 1 and 10 or p_lesson_id is not null))
 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
 v_terms:=public.current_account_terms_status(p_user_id);
 if not coalesce((v_terms->>'effective')::boolean,false) or v_terms->'consent' is null or v_terms->'consent'='null'::jsonb
 then raise exception 'CURRENT_TICKET_TERMS_REQUIRED' using errcode='42501'; end if;
 insert into public.ticket_wallets(user_id) values(p_user_id) on conflict(user_id) do nothing;
 -- Same lock as ticket spending/other credits. Count and receipt insertion are serialized per account.
 select * into strict v_wallet from public.ticket_wallets where user_id=p_user_id for update;
 v_now:=clock_timestamp();
 select week into v_active_week from public.learning_weeks where opens_at<=v_now and closes_at>v_now;
 if p_kind='tutorial' then
  if not exists(select 1 from public.tutorial_completions where user_id=p_user_id and lesson_id=p_lesson_id) then
   select count(*) into v_count from public.tutorial_completions where user_id=p_user_id;
   v_reward:=case when v_count%2=0 then 'ranked' else 'hint' end;
   insert into public.tutorial_completions(user_id,lesson_id,reward_kind) values(p_user_id,p_lesson_id,v_reward);
   v_new:=true;
  end if;
 else
  -- A delayed retry of a committed completion may acknowledge it after rollover; it never credits again.
  if not exists(select 1 from public.weekly_problem_completions where user_id=p_user_id and week=p_week and ordinal=p_ordinal) then
   if p_week is distinct from v_active_week then raise exception 'WEEK_EXPIRED' using errcode='22023'; end if;
   select count(*) into v_count from public.weekly_problem_completions where user_id=p_user_id and week=p_week;
   if p_ordinal<>v_count+1 then raise exception 'COMPLETE_PREVIOUS_PROBLEM' using errcode='22023'; end if;
   insert into public.weekly_problem_completions(user_id,week,ordinal) values(p_user_id,p_week,p_ordinal);
   v_new:=true;
   if p_ordinal in (5,10) then v_ad:=p_ordinal; end if;
   if p_ordinal=10 then v_reward:='ranked'; end if;
  end if;
 end if;
 if v_reward is not null then
  if (case when v_reward='ranked' then v_wallet.ranked_tickets else v_wallet.hint_tickets end)>=9007199254740991
   then raise exception 'TICKET_BALANCE_OVERFLOW' using errcode='22003'; end if;
  update public.ticket_wallets set ranked_tickets=ranked_tickets+case when v_reward='ranked' then 1 else 0 end,
   hint_tickets=hint_tickets+case when v_reward='hint' then 1 else 0 end where user_id=p_user_id;
 end if;
 return public.learning_progress(p_user_id,case when p_kind='weekly' then p_week else v_active_week end)
  ||jsonb_build_object('firstClear',v_new,'reward',v_reward,'adCheckpoint',v_ad);
end $$;
revoke all on function public.publish_learning_week(date,jsonb),public.learning_progress(text,date),
 public.complete_learning(text,text,text,date,integer) from public,anon,authenticated,service_role;
grant execute on function public.publish_learning_week(date,jsonb),public.learning_progress(text,date),
 public.complete_learning(text,text,text,date,integer) to service_role;
commit;
