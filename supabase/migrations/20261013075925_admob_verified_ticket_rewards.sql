begin;
set local lock_timeout='3s';
set local statement_timeout='15s';

-- Protocol 2 uses the existing FREE ticket pools, never the obsolete daily
-- allowance model, a paid pool, a client reward event, or a synthetic game.
create table public.ad_reward_intents (
 id uuid primary key default gen_random_uuid(),
 user_id text not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('hint','online')),
 terms_version text not null check(length(terms_version) between 1 and 128),
 terms_accepted_at timestamptz not null,
 eligible_no_ads boolean not null check(not eligible_no_ads),
 created_at timestamptz not null,
 expires_at timestamptz not null,
 credited_at timestamptz,
 check(isfinite(created_at) and isfinite(expires_at) and isfinite(terms_accepted_at)),
 check(terms_accepted_at<=created_at and expires_at>created_at),
 check(credited_at is null or isfinite(credited_at))
);
create index ad_reward_intents_owner on public.ad_reward_intents(user_id,id);

-- Anonymous replay tombstones survive erasure. No account ID, profile/intent
-- cascade FK, provider query, email or purchase token is retained here.
create table public.ad_ticket_reward_receipts (
 intent_id uuid primary key,
 transaction_sha256 text not null unique check(transaction_sha256 ~ '^[a-f0-9]{64}$'),
 kind text not null check(kind in ('hint','online')),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 amount integer not null default 3 check(amount=3),
 earned_at timestamptz not null check(isfinite(earned_at)),
 credited_at timestamptz not null default clock_timestamp() check(isfinite(credited_at))
);
alter table public.ad_reward_intents enable row level security;
alter table public.ad_reward_intents force row level security;
alter table public.ad_ticket_reward_receipts enable row level security;
alter table public.ad_ticket_reward_receipts force row level security;
revoke all on public.ad_reward_intents,public.ad_ticket_reward_receipts from public,anon,authenticated,service_role;
-- Existing service-only account erasure explicitly deletes optional intents
-- before deleting the profile. Anonymous receipt tombstones remain undeletable.
grant select,insert,update,delete on public.ad_reward_intents to service_role;
grant select,insert on public.ad_ticket_reward_receipts to service_role;

create function public.ad_ticket_reward_protocol() returns integer
language plpgsql stable security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 return 2;
end $$;

create function public.ad_ticket_reward_balance(p_user_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_wallet public.ticket_wallets;
begin
 perform public.match_hint_assert_account(p_user_id);
 select * into v_wallet from public.ticket_wallets where user_id=p_user_id;
 return jsonb_build_object('hint',coalesce(v_wallet.hint_tickets,0),'online',coalesce(v_wallet.ranked_tickets,0));
end $$;

create function public.create_ad_ticket_reward(p_user_id text,p_kind text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_terms jsonb; v_entitlement jsonb; v_now timestamptz; v_id uuid;
begin
 perform public.match_hint_assert_account(p_user_id);
 if p_kind is null or p_kind not in ('hint','online') then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
 v_terms:=public.current_account_terms_status(p_user_id);
 if not coalesce((v_terms->>'effective')::boolean,false) or v_terms->'consent' is null or v_terms->'consent'='null'::jsonb then
  raise exception 'CURRENT_TICKET_TERMS_REQUIRED' using errcode='42501'; end if;
 v_entitlement:=public.get_shared_match_entitlement(p_user_id);
 if coalesce((v_entitlement->>'noAds')::boolean,true) then raise exception 'AD_FREE_ACCOUNT' using errcode='42501'; end if;
 v_now:=clock_timestamp();
 insert into public.ad_reward_intents(user_id,kind,terms_version,terms_accepted_at,eligible_no_ads,created_at,expires_at)
 values(p_user_id,p_kind,v_terms->>'currentVersion',(v_terms->'consent'->>'acceptedAt')::timestamptz,false,v_now,v_now+interval '1 hour')
 returning id into v_id;
 return v_id;
end $$;

create function public.ad_ticket_reward_status(p_user_id text,p_intent uuid) returns text
language plpgsql security invoker set search_path='' as $$
declare v_intent public.ad_reward_intents;
begin
 perform public.match_hint_assert_account(p_user_id);
 select * into v_intent from public.ad_reward_intents where id=p_intent and user_id=p_user_id;
 if not found then return 'missing'; end if;
 return case when v_intent.credited_at is null then 'pending' else 'credited' end;
end $$;

create function public.credit_ad_ticket_reward(p_intent uuid,p_kind text,p_transaction text,p_timestamp bigint,p_evidence_sha256 text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_intent public.ad_reward_intents; v_receipt public.ad_ticket_reward_receipts;
 v_owner text; v_key text; v_earned timestamptz; v_now timestamptz; v_wallet public.ticket_wallets;
begin
 if current_user<>'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ_COMMITTED_REQUIRED' using errcode='25001'; end if;
 if p_intent is null or p_kind is null or p_kind not in ('hint','online') or p_transaction is null
  or p_transaction !~ '^[a-zA-Z0-9_]{8,128}$' or p_timestamp is null or p_timestamp<=0
  or p_evidence_sha256 is null or p_evidence_sha256 !~ '^[a-f0-9]{64}$'
 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
 v_key:=encode(extensions.digest('admob:'||p_transaction,'sha256'),'hex');
 v_earned:=to_timestamp(p_timestamp::numeric/1000);
 -- Exact no-charge replay may be acknowledged after erasure, membership or
 -- terms changes. It never reconstructs a deleted owner, intent or wallet.
 select * into v_receipt from public.ad_ticket_reward_receipts where transaction_sha256=v_key or intent_id=p_intent;
 if found then
  if (v_receipt.intent_id,v_receipt.transaction_sha256,v_receipt.kind,v_receipt.evidence_sha256,v_receipt.earned_at)
   is distinct from (p_intent,v_key,p_kind,p_evidence_sha256,v_earned)
  then raise exception 'PROVIDER_REWARD_COLLISION' using errcode='23505'; end if;
  return jsonb_build_object('status','duplicate');
 end if;
 select user_id into v_owner from public.ad_reward_intents where id=p_intent;
 if v_owner is null then
  -- A valid Google-signed diagnostic/unknown/deleted nonce is acknowledged but
  -- never credited. The HTTP verifier must run before calling this RPC.
  return jsonb_build_object('status','ignored');
 end if;
 perform public.match_hint_assert_account(v_owner);
 perform pg_advisory_xact_lock(hashtextextended('qg-verified-ad:admob:'||p_transaction,0));
 select * into v_receipt from public.ad_ticket_reward_receipts where transaction_sha256=v_key or intent_id=p_intent;
 if found then
  if (v_receipt.intent_id,v_receipt.transaction_sha256,v_receipt.kind,v_receipt.evidence_sha256,v_receipt.earned_at)
   is distinct from (p_intent,v_key,p_kind,p_evidence_sha256,v_earned)
  then raise exception 'PROVIDER_REWARD_COLLISION' using errcode='23505'; end if;
  return jsonb_build_object('status','duplicate');
 end if;
 if exists(select 1 from public.verified_rewarded_ad_grants where provider='admob' and transaction_id=p_transaction) then
  raise exception 'PROVIDER_REWARD_COLLISION' using errcode='23505'; end if;
 select * into v_intent from public.ad_reward_intents where id=p_intent and user_id=v_owner for update;
 if not found then return jsonb_build_object('status','ignored'); end if;
 if v_intent.kind<>p_kind or v_intent.credited_at is not null then raise exception 'PROVIDER_REWARD_COLLISION' using errcode='23505'; end if;
 v_now:=clock_timestamp();
 if v_earned>v_now+interval '5 minutes' or v_earned<v_intent.created_at-interval '5 minutes'
  or v_earned>v_intent.expires_at+interval '5 minutes' or v_now>v_intent.expires_at+interval '7 days'
 then return jsonb_build_object('status','ignored'); end if;
 -- Honor the immutable, server-checked offer made at nonce issuance. A later
 -- paid upgrade or legal publication must not erase a completed reward. New
 -- nonce issuance still requires the current terms and non-ad-free entitlement.
 if v_intent.eligible_no_ads or v_intent.terms_version is null or v_intent.terms_accepted_at>v_intent.created_at then
  raise exception 'INVALID_REWARD_INTENT' using errcode='42501'; end if;
 insert into public.ticket_wallets(user_id) values(v_owner) on conflict(user_id) do nothing;
 select * into strict v_wallet from public.ticket_wallets where user_id=v_owner for update;
 if (case when p_kind='hint' then v_wallet.hint_tickets else v_wallet.ranked_tickets end)>9007199254740988 then
  raise exception 'TICKET_BALANCE_OVERFLOW' using errcode='22003'; end if;
 update public.ticket_wallets set hint_tickets=hint_tickets+case when p_kind='hint' then 3 else 0 end,
  ranked_tickets=ranked_tickets+case when p_kind='online' then 3 else 0 end where user_id=v_owner;
 insert into public.ad_ticket_reward_receipts(intent_id,transaction_sha256,kind,evidence_sha256,earned_at)
 values(p_intent,v_key,p_kind,p_evidence_sha256,v_earned);
 update public.ad_reward_intents set credited_at=v_now where id=p_intent;
 return jsonb_build_object('status','credited');
end $$;

-- Same provider transaction cannot fund both an old match/crown grant and a
-- new ticket reward, in either order. Preserve the existing recorder's owner,
-- ACL, current-terms policy, paid policy and lock order.
create or replace function public.record_verified_rewarded_ad(p_grant_id uuid,p_user_id text,p_purpose text,p_target_key text,
 p_provider text,p_transaction_id text,p_evidence_sha256 text,p_expires_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_existing public.verified_rewarded_ad_grants;
begin
 if current_user<>'service_role' then raise exception 'Trusted verifier required' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ_COMMITTED_REQUIRED' using errcode='25001'; end if;
 if p_grant_id is null or p_user_id is null or p_expires_at is not null then
  raise exception 'Invalid verified reward' using errcode='22023'; end if;
 perform 1 from public.profiles where id=p_user_id for update;
 if not found or exists(select 1 from public.account_restrictions where user_id=p_user_id and blocked)
  or exists(select 1 from public.account_deletion_jobs where user_id=p_user_id and phase<>'completed') then
  raise exception 'Reward account unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('qg-verified-ad:'||p_provider||':'||p_transaction_id,0));
 if p_provider='admob' and exists(select 1 from public.ad_ticket_reward_receipts
  where transaction_sha256=encode(extensions.digest('admob:'||p_transaction_id,'sha256'),'hex')) then
  raise exception 'Provider reward collision' using errcode='23505'; end if;
 select * into v_existing from public.verified_rewarded_ad_grants where provider=p_provider and transaction_id=p_transaction_id;
 if found then
  if (v_existing.grant_id,v_existing.user_id,v_existing.purpose,v_existing.target_key,v_existing.evidence_sha256)
   is distinct from (p_grant_id,p_user_id,p_purpose,p_target_key,p_evidence_sha256) then
   raise exception 'Provider reward collision' using errcode='23505'; end if;
  return jsonb_build_object('grantId',v_existing.grant_id,'duplicate',true);
 end if;
 if not public.has_current_ticket_terms(p_user_id) then raise exception 'CURRENT_TICKET_TERMS_REQUIRED' using errcode='42501'; end if;
 if (public.get_shared_match_entitlement(p_user_id)->>'noAds')::boolean then raise exception 'Ad-free account' using errcode='42501'; end if;
 insert into public.verified_rewarded_ad_grants(grant_id,user_id,purpose,target_key,provider,transaction_id,evidence_sha256,expires_at)
 values(p_grant_id,p_user_id,p_purpose,p_target_key,p_provider,p_transaction_id,p_evidence_sha256,p_expires_at);
 return jsonb_build_object('grantId',p_grant_id,'duplicate',false);
end $$;

revoke all on function public.ad_ticket_reward_protocol(),public.ad_ticket_reward_balance(text),
 public.create_ad_ticket_reward(text,text),public.ad_ticket_reward_status(text,uuid),
 public.credit_ad_ticket_reward(uuid,text,text,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.ad_ticket_reward_protocol(),public.ad_ticket_reward_balance(text),
 public.create_ad_ticket_reward(text,text),public.ad_ticket_reward_status(text,uuid),
 public.credit_ad_ticket_reward(uuid,text,text,bigint,text) to service_role;
commit;
