begin;
set local lock_timeout='3s';
set local statement_timeout='15s';

-- Pending refund requests hold new grants but are not completed reversals.
-- Keep the sticky fence for completed refunds and preserve existing balances.
-- No historical refunded flag is cleared without new canonical evidence.
create or replace function public.play_commerce_record_order(p_token_hash text,p_lease uuid,p_order jsonb,p_historical boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare o jsonb:=p_order;a public.play_commerce_accounts;t public.play_commerce_tokens;
 r public.play_commerce_orders;s public.play_commerce_sources;v_hash text:=p_token_hash;
 v_generation uuid;v_user text;v_sku text;v_test boolean;v_type text;v_hints integer;
 v_order_key text;v_paid boolean;v_refund boolean;v_duplicate boolean:=false;v_granted boolean:=false;v_credit integer:=0;
begin
 if current_user<>'service_role' or current_setting('transaction_isolation')<>'read committed' or jsonb_typeof(o) is distinct from 'object'
 then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 select * into strict t from public.play_commerce_tokens where token_hash=v_hash;
 select * into strict a from public.play_commerce_accounts where generation=t.generation;
 if a.retired_at is not null or a.user_id is null or t.retired then raise exception 'RETIRED' using errcode='42501';end if;
 perform public.match_hint_assert_account(a.user_id);
 select * into strict a from public.play_commerce_accounts where generation=t.generation for update;
 if a.retired_at is not null or a.user_id is null then raise exception 'RETIRED' using errcode='42501';end if;
 perform 1 from public.play_commerce_leases where token_hash=v_hash and lease=p_lease and expires_at>clock_timestamp() for update;
 if not found then raise exception 'BUSY' using errcode='40001';end if;
 select * into strict t from public.play_commerce_tokens where token_hash=v_hash for update;
 v_generation:=t.generation;v_user:=a.user_id;v_sku:=t.sku;v_test:=t.test;
 v_type:=case when v_sku in ('standard_monthly','plus_monthly') then 'subs' else 'inapp' end;
 perform public.play_commerce_mode(v_test);
 perform 1 from public.ticket_wallets where user_id=v_user for update;
  if o->>'sku' is distinct from v_sku or o->>'productId' is distinct from 'qg_'||v_sku or o->>'type' is distinct from v_type
   or o->>'tokenHash' is distinct from v_hash
   or jsonb_typeof(o->'test') is distinct from 'boolean' or (o->>'test')::boolean<>v_test
   or jsonb_typeof(o->'paid') is distinct from 'boolean' or o->>'requiresDatabaseGrantFence' is distinct from 'true'
   or o->>'orderId' is null or o->>'orderId' !~ '^GPA\.[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{5}(\.\.[0-9]{1,20})?$'
   or o->>'orderKey' is distinct from 'com.qgambit.app:play-order:'||(o->>'orderId')
  then raise exception 'INVALID_PURCHASE' using errcode='22023';end if;
  v_order_key:=o->>'orderKey';v_paid:=(o->>'paid')::boolean;
  if v_type='inapp' and exists(select 1 from public.play_commerce_orders where token_hash=v_hash and order_key<>v_order_key)
  then raise exception 'ACCOUNT_MISMATCH' using errcode='23505';end if;
  v_refund:=o->>'reason'='REFUND_OR_CANCELLATION' or o->>'state' in ('CANCELED','PARTIALLY_REFUNDED','REFUNDED');
  v_hints:=case v_sku when 'plus_monthly' then 10 when 'standard_monthly' then 0 when 'hints_1' then 1 when 'hints_13' then 13 when 'hints_27' then 27 when 'hints_44' then 44 when 'hints_77' then 77 when 'hints_166' then 166 end;
  if jsonb_typeof(o->'candidateHints') is distinct from 'number' or (o->>'candidateHints')::integer<>(case when v_paid then v_hints else 0 end)
   or (v_paid and (o->>'state'<>'PROCESSED' or o->'money'->>'amountNanos' !~ '^[1-9][0-9]*$'
    or o->'money'->>'currencyCode' is null or o->'money'->>'currencyCode' !~ '^[A-Z]{3}$' or o->'money'->>'amountNanos' is null or o->>'processedAt' is null))
   or (v_paid and v_type='subs' and (o->>'offerPhase' is distinct from 'BASE' or o->'paidPeriod'->>'start' is null or o->'paidPeriod'->>'end' is null))
  then raise exception 'INVALID_PURCHASE' using errcode='22023';end if;
  insert into public.play_commerce_orders(order_key,order_id,token_hash,generation,sku,test,refunded,evidence)
  values(v_order_key,o->>'orderId',v_hash,v_generation,v_sku,v_test,v_refund,o) on conflict(order_key) do nothing;
  select * into strict r from public.play_commerce_orders where order_key=v_order_key for update;
  if (r.token_hash,r.generation,r.sku,r.test) is distinct from (v_hash,v_generation,v_sku,v_test) then raise exception 'ACCOUNT_MISMATCH' using errcode='23505';end if;
  if p_historical and v_type='inapp' and not r.granted then raise exception 'INVALID_PURCHASE' using errcode='22023';end if;
  v_duplicate:=r.granted;v_refund:=v_refund or r.refunded;
  update public.play_commerce_orders set refunded=v_refund,evidence=o,checked_at=clock_timestamp() where order_key=v_order_key;
  if v_refund then
   select * into s from public.play_commerce_sources where order_key=v_order_key for update;
   if found and s.state='active' then
    if s.available>0 then perform public.adjust_play_commerce_wallet(v_user,s.origin,v_test,-s.available);end if;
    update public.play_commerce_sources set state='revoked',revoked=revoked+available,available=0 where id=s.id;
   end if;
  elsif v_paid and not r.granted and public.has_current_ticket_terms(v_user) then
   if v_hints>0 then
    insert into public.play_commerce_sources(order_key,generation,user_id,test,origin,quantity,available)
    values(v_order_key,v_generation,v_user,v_test,case when v_type='subs' then 'subscription' else 'purchased' end,v_hints,v_hints);
    perform public.adjust_play_commerce_wallet(v_user,case when v_type='subs' then 'subscription' else 'purchased' end,v_test,v_hints);
   end if;
   update public.play_commerce_orders set granted=true where order_key=v_order_key;v_credit:=v_hints;v_granted:=true;
  end if;
 if v_granted then update public.play_commerce_tokens set has_paid=true where token_hash=v_hash;end if;
 if v_refund then update public.play_commerce_tokens set active=false where token_hash=v_hash and latest_order_key=v_order_key;end if;
 return jsonb_build_object('credited',v_credit,'duplicate',v_duplicate,'granted',v_granted,'refunded',v_refund,'paid',v_paid,'orderKey',v_order_key);
end $$;

commit;
