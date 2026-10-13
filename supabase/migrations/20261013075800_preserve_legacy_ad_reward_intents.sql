begin;
set local lock_timeout='3s';
set local statement_timeout='15s';

-- Compatibility preparation for the following protocol-2 migration. The
-- verified production baseline has no allowance-era table; already upgraded
-- protocol-2 databases also take the no-op branch. Never reinterpret old
-- allowances or pending intents as consented free-ticket rewards.
do $compat$
declare columns text[]; credit_definition text;
begin
 if to_regclass('public.ad_reward_intents') is null then return;end if;
 select array_agg(attname::text order by attnum) into columns from pg_attribute
 where attrelid='public.ad_reward_intents'::regclass and attnum>0 and not attisdropped;
 if 'terms_version'=any(columns) and not 'transaction_id'=any(columns) then return;end if;
 if columns is distinct from array['id','user_id','kind','created_at','expires_at','transaction_id','credited_at']
  or to_regclass('public.ad_allowance_reward_intents') is not null
  or to_regprocedure('public.ad_credit(uuid,text,text,bigint)') is null
 then raise exception 'UNRECOGNIZED_LEGACY_AD_SCHEMA';end if;

 -- Preserve all pending/credited rows, foreign keys, RLS and existing grants.
 -- The old callback can still settle its own pending intent into allowances;
 -- the new callback cannot turn those intents into ticket-wallet credit.
 select pg_get_functiondef('public.ad_credit(uuid,text,text,bigint)'::regprocedure) into credit_definition;
 if position('public.ad_reward_intents' in credit_definition)=0 then
  raise exception 'UNRECOGNIZED_LEGACY_AD_CALLBACK';end if;
 alter table public.ad_reward_intents rename to ad_allowance_reward_intents;
 alter table public.ad_allowance_reward_intents rename constraint ad_reward_intents_pkey to ad_allowance_reward_intents_pkey;
 alter table public.ad_allowance_reward_intents rename constraint ad_reward_intents_transaction_id_key to ad_allowance_reward_intents_transaction_id_key;
 alter index public.ad_reward_intents_owner rename to ad_allowance_reward_intents_owner;
 execute replace(credit_definition,'public.ad_reward_intents','public.ad_allowance_reward_intents');
end $compat$;
commit;
