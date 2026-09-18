-- Server-only API. No browser role can read balances, create intents or award credits.
create table public.ad_allowances (
 user_id text not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('hint','online')),
 day date not null default (now() at time zone 'UTC')::date,
 used integer not null default 0 check(used between 0 and 3),
 bonus integer not null default 0 check(bonus>=0),
 primary key(user_id,kind)
);
create table public.ad_reward_intents (
 id uuid primary key default gen_random_uuid(),
 user_id text not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('hint','online')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '1 hour',
 transaction_id text unique,
 credited_at timestamptz
);
create index ad_reward_intents_owner on public.ad_reward_intents(user_id,created_at desc);
create table public.ad_consumptions (
 user_id text not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('hint','online')),
 action_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(user_id,kind,action_id)
);
alter table public.ad_allowances enable row level security;
alter table public.ad_reward_intents enable row level security;
alter table public.ad_consumptions enable row level security;
revoke all on public.ad_allowances,public.ad_reward_intents,public.ad_consumptions from public,anon,authenticated;
grant select,insert,update,delete on public.ad_allowances,public.ad_reward_intents,public.ad_consumptions to service_role;

create function public.ad_consume(p_user text,p_kind text,p_action uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v public.ad_allowances; today date := (now() at time zone 'UTC')::date;
begin
 if p_action is null or p_kind is null or p_kind not in ('hint','online') then return false; end if;
 insert into public.ad_allowances(user_id,kind) values(p_user,p_kind) on conflict do nothing;
 select * into v from public.ad_allowances where user_id=p_user and kind=p_kind for update;
 if exists(select 1 from public.ad_consumptions where user_id=p_user and kind=p_kind and action_id=p_action) then return true; end if;
 if v.day<>today then v.used:=0; end if;
 if v.used>=3 and v.bonus<=0 then return false; end if;
 if v.used<3 then v.used:=v.used+1; else v.bonus:=v.bonus-1; end if;
 update public.ad_allowances set day=today,used=v.used,bonus=v.bonus where user_id=p_user and kind=p_kind;
 insert into public.ad_consumptions(user_id,kind,action_id) values(p_user,p_kind,p_action);
 return true;
end $$;

-- Called ONLY after ECDSA verification by the server. Bind reward to an opaque
-- intent; don't trust a user ID or category submitted by an app callback.
create function public.ad_credit(p_intent uuid,p_kind text,p_transaction text,p_timestamp bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v public.ad_reward_intents; rewarded_at timestamptz;
begin
 if p_kind is null or p_kind not in ('hint','online') or p_timestamp is null or p_timestamp<=0 or p_transaction is null or p_transaction !~ '^[A-Za-z0-9_]{8,128}$' then return false; end if;
 select * into v from public.ad_reward_intents where id=p_intent for update;
 if not found or v.kind<>p_kind then return false; end if;
 if v.transaction_id is not null then return v.transaction_id=p_transaction; end if;
 rewarded_at := to_timestamp(p_timestamp/1000.0);
 if rewarded_at<v.created_at-interval '5 minutes' or rewarded_at>v.expires_at or now()>v.expires_at+interval '24 hours' then return false; end if;
 if exists(select 1 from public.ad_reward_intents where transaction_id=p_transaction) then return false; end if;
 -- Unique transaction_id also protects simultaneous callbacks for different intents.
 update public.ad_reward_intents set transaction_id=p_transaction,credited_at=now() where id=p_intent;
 insert into public.ad_allowances(user_id,kind,bonus) values(v.user_id,v.kind,3)
 on conflict(user_id,kind) do update set bonus=public.ad_allowances.bonus+3;
 return true;
exception when unique_violation then return false;
end $$;
revoke all on function public.ad_consume(text,text,uuid),public.ad_credit(uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.ad_consume(text,text,uuid),public.ad_credit(uuid,text,text,bigint) to service_role;
