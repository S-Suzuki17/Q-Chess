import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {account,wallet,scalar,contended,bind,register,HASH,unique} from './commerce-postgres-support.mjs';

export async function playCommerceDelta(t,{admin,a,b,rpc,purchase,apply,status,reverse,hint,spend}){
 const check=(name,fn)=>t.test(name,{skip:!!process.env.QG_PLAY_QA_FILTER&&!new RegExp(process.env.QG_PLAY_QA_FILTER).test(name)},fn);
 const ad=async(user,kind='hint')=>{
  const intent=await rpc(a,'create_ad_ticket_reward',[user,kind]);
  const timestamp=Number(await scalar(a,'select floor(extract(epoch from created_at)*1000)::bigint as result from public.ad_reward_intents where id=$1',[intent]));
  return{intent,kind,timestamp,transaction:unique('DELTA_AD_')};
 };
 const credit=(db,e)=>rpc(db,'credit_ad_ticket_reward',[e.intent,e.kind,e.transaction,e.timestamp,HASH]);
 const begin=(db,user,ticket)=>rpc(db,'begin_account_deletion',[user,ticket,null]);
 const erase=async(db,user,ticket)=>{await begin(db,user,ticket);await rpc(db,'erase_account_data',[ticket]);await rpc(db,'finish_account_deletion',[ticket]);return 'erased';};
 const ticket=()=>randomUUID().replaceAll('-','').repeat(2);
 const protectedPools=w=>Object.fromEntries(Object.entries(w).filter(([key])=>/^(test_|member_|purchased_|subscription_)/.test(key)));

 await check('review: pending refunds preserve spent and unused balances until a completed reversal',async()=>{
  const user=await account(admin),e=await purchase(a,user);await apply(a,e);await spend(a,hint(user));
  for(const state of ['PROCESSED','PENDING_REFUND']){
   const pending={...e,order:{...e.order,state,paid:false,candidateHints:0,reason:'REFUND_PENDING'}};
   await apply(a,pending);assert.equal((await status(a,user)).purchasedHintTickets,12);
   assert.equal(await scalar(a,'select refunded as result from public.play_commerce_orders where order_key=$1',[e.order.orderKey]),false);
  }
  await apply(a,e);assert.equal((await status(a,user)).purchasedHintTickets,12,'withdrawn pending refund neither loses nor regrants credit');
  await apply(a,{...e,order:{...e.order,state:'PARTIALLY_REFUNDED',paid:false,candidateHints:0,reason:'REFUND_OR_CANCELLATION'}});
  assert.equal((await status(a,user)).purchasedHintTickets,0);
  await apply(a,e);assert.equal((await status(a,user)).purchasedHintTickets,0,'completed reversal remains sticky');
 });
 await check('review: a pending refund before the initial grant can recover once after withdrawal',async()=>{
  const user=await account(admin),e=await purchase(a,user);
  await apply(a,{...e,order:{...e.order,state:'PENDING_REFUND',paid:false,candidateHints:0,reason:'REFUND_PENDING'}});
  assert.equal((await status(a,user)).purchasedHintTickets,0);
  assert.equal((await apply(a,e)).credited,13);assert.equal((await apply(a,e)).credited,0);
 });
 await check('review: historical pending refund preserves current Plus access; completed order revokes it without Purchases',async()=>{
  const user=await account(admin),e=await purchase(a,user,'plus_monthly');await apply(a,e);
  await rpc(a,'play_commerce_record_order',[e.tokenHash,e.lease,{...e.order,state:'PENDING_REFUND',paid:false,candidateHints:0,reason:'REFUND_PENDING'},true]);
  assert.equal((await status(a,user)).active,true);assert.equal((await status(a,user)).subscriptionHintTickets,10);
  await rpc(a,'play_commerce_record_order',[e.tokenHash,e.lease,{...e.order,state:'REFUNDED',paid:false,candidateHints:0,reason:'REFUND_OR_CANCELLATION'},true]);
  assert.equal((await status(a,user)).active,false);assert.equal((await status(a,user)).subscriptionHintTickets,0);
 });
 await check('review: stored terminal subscriptions allow erasure without a remote cancellation proof',async()=>{
  for(const state of ['SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED']){
   const user=await account(admin),e=await purchase(a,user,'standard_monthly');await apply(a,e);
   await apply(a,{...e,purchase:{...e.purchase,state,active:false,cancelAtPeriodEnd:false}});
   await erase(a,user,ticket());
   assert.equal(await scalar(a,'select retired as result from public.play_commerce_tokens where token_hash=$1',[e.tokenHash]),true);
  }
 });

 await check('delta: every runtime RPC exists, and receipt/history/outbox leases recover without duplication',async()=>{
  assert.equal(await rpc(a,'play_commerce_protocol',[]),1);
  const user=await account(admin),e=await purchase(a,user);await apply(a,e);
  await admin.query('update public.play_commerce_tokens set next_check_at=clock_timestamp()+interval \'1 day\'');
  await admin.query('update public.play_commerce_tokens set next_check_at=clock_timestamp()-interval \'1 second\' where token_hash=$1',[e.tokenHash]);
  const due=await rpc(a,'play_commerce_reconcile_due',[]);assert.equal(due.length,1);assert.equal(due[0].tokenHash,e.tokenHash);assert.equal(due[0].historyCursor,-1);assert.deepEqual(await rpc(a,'play_commerce_reconcile_due',[]),[]);
  await rpc(a,'play_commerce_advance_history',[e.tokenHash,e.lease,2]);await rpc(a,'play_commerce_advance_history',[e.tokenHash,e.lease,1]);
  assert.equal(Number(await scalar(a,'select history_cursor as result from public.play_commerce_tokens where token_hash=$1',[e.tokenHash])),2);
  await assert.rejects(rpc(a,'play_commerce_advance_history',[e.tokenHash,randomUUID(),3]),{code:'40001'});
  await admin.query('update public.play_commerce_outbox set available_at=clock_timestamp()+interval \'1 day\'');
  await admin.query('update public.play_commerce_outbox set available_at=clock_timestamp()-interval \'1 second\' where token_hash=$1',[e.tokenHash]);
  const job=await rpc(a,'claim_play_commerce_delivery',[]);assert.equal(job.tokenHash,e.tokenHash);assert.equal(await rpc(b,'claim_play_commerce_delivery',[]),null);
  await assert.rejects(rpc(a,'finish_play_commerce_delivery',[e.tokenHash,randomUUID(),true]),{code:'40001'});
  await rpc(a,'finish_play_commerce_delivery',[e.tokenHash,job.lease,false]);
  await admin.query('update public.play_commerce_outbox set available_at=clock_timestamp()-interval \'1 second\' where token_hash=$1',[e.tokenHash]);
  const retry=await rpc(a,'claim_play_commerce_delivery',[]);assert.notEqual(retry.lease,job.lease);await rpc(a,'finish_play_commerce_delivery',[e.tokenHash,retry.lease,true]);assert.equal((await status(a,user)).deliveryPending,false);assert.equal((await status(a,user)).purchasedHintTickets,13);
 });
 await check('delta: cancellation releases only the owned flow and preserves late verified settlement',async()=>{
  const user=await account(admin),other=await account(admin),e=await purchase(a,user,'plus_monthly');
  await rpc(a,'play_commerce_cancel_intent',[other,e.purchase.intentId]);await assert.rejects(purchase(a,user,'standard_monthly'),{code:'55006'});
  await rpc(a,'play_commerce_cancel_intent',[user,e.purchase.intentId]);assert.equal((await status(a,user)).subscriptionBlocked,false);
  const next=await purchase(a,user,'standard_monthly');assert.ok(next);assert.equal((await apply(a,e)).credited,10);
 });
 await check('delta: cross-provider subscription flows serialize in both lock orders',async()=>{
  await bind(admin);
  for(const playFirst of [true,false]){
   const user=await account(admin);
   const createPlay=db=>purchase(db,user,'plus_monthly');
   const createStripe=db=>register(db,user,'standard_monthly',true);
   const reject=fn=>async db=>{try{await fn(db);return 'unexpected';}catch(e){return e.code;}};
   const pair=await contended(admin,a,b,playFirst?createPlay:createStripe,reject(playFirst?createStripe:createPlay));
   assert.equal(pair[1],playFirst?'42501':'55006');assert.equal((await status(a,user)).subscriptionBlocked,true);
  }
 });
 await check('delta D01: legacy ad recorder rejects every unsupported isolation without writing',async()=>{
  const user=await account(admin),record=db=>rpc(db,'record_verified_rewarded_ad',[randomUUID(),user,'online_ranked_match',randomUUID(),'admob',unique('DELTA_OLD_'),HASH,null]);
  const count=()=>scalar(admin,'select count(*)::integer as result from public.verified_rewarded_ad_grants');
  const before=await count();
  for(const isolation of ['read uncommitted','repeatable read','serializable']){
   await a.query('begin isolation level '+isolation);try{await assert.rejects(record(a),{code:'25001'});}finally{await a.query('rollback');}assert.equal(await count(),before);
  }
  await record(a);assert.equal(await count(),before+1);
 });
 await check('delta D02: ad credit and ranked/hint returns preserve four free tickets in both orders',async()=>{
  for(const adFirst of [true,false])for(const kind of ['online','hint']){
   const user=await account(admin,{quota:3,ranked:1}),reward=await ad(user,kind);let restore;
   if(kind==='online'){
    const id=randomUUID(),owner=randomUUID(),consent=randomUUID();
    await rpc(a,'renew_ranked_server_lease',[owner]);
    await rpc(a,'issue_shared_match_consent',[consent,user,id,'ticket',null]);
    await rpc(a,'admit_shared_match',[id,user,'ai:'+id,600,owner,'ranked',{[user]:consent},'ai:'+id,1200,4]);
    restore=db=>rpc(db,'void_ranked_admission',[id,owner,'delta_failure']);
   }else{
    await admin.query('update public.ticket_wallets set hint_tickets=1 where user_id=$1',[user]);const h=hint(user);await spend(a,h);restore=db=>rpc(db,'restore_match_hint_credit',[h[0],user,'unrecoverable_delivery']);
   }
   const pools=protectedPools(await wallet(a,user));
   await contended(admin,a,b,adFirst?db=>credit(db,reward):restore,adFirst?restore:db=>credit(db,reward));await restore(a);
   const after=await wallet(a,user);assert.deepEqual(protectedPools(after),pools);
   const returns=kind==='online'?Number(await scalar(a,"select count(*)::integer as result from public.ranked_ticket_refunds where user_id=$1 and pool='free' and spent_by is null",[user])):0;
   assert.equal(Number(kind==='online'?after.ranked_tickets:after.hint_tickets)+returns,4);
   assert.equal(await scalar(a,'select count(*)::integer as result from public.ad_ticket_reward_receipts where intent_id=$1',[reward.intent]),1);
  }
 });
 await check('delta D05: Play activation and own-order refund preserve earned ad credit in both orders',async()=>{
  for(const adFirst of [true,false])for(const action of ['activate','refund']){
   const user=await account(admin),reward=await ad(user),e=await purchase(a,user,action==='activate'?'plus_monthly':'hints_13');
   if(action==='refund')await apply(a,e);
   const operation=db=>action==='activate'?apply(db,e):reverse(db,e);
   await contended(admin,a,b,adFirst?db=>credit(db,reward):operation,adFirst?operation:db=>credit(db,reward));
   assert.equal((await wallet(a,user)).hint_tickets,3);assert.equal((await status(a,user)).purchasedHintTickets,0);
   if(action==='activate'){assert.equal((await status(a,user)).subscriptionHintTickets,10);await assert.rejects(ad(user),{code:'42501'});}
  }
 });
 await check('delta D05: deletion and earned credit serialize, retaining only anonymous replay fences',async()=>{
  for(const adFirst of [true,false]){
   const user=await account(admin),reward=await ad(user),e=await purchase(a,user);await apply(a,e);const deletion=ticket();
   const raceCredit=async db=>{try{return await credit(db,reward);}catch(error){assert.equal(error.code,'42501');return 'retry-after-retirement';}};
   await contended(admin,a,b,adFirst?db=>credit(db,reward):db=>erase(db,user,deletion),adFirst?db=>erase(db,user,deletion):raceCredit);
   assert.equal(await scalar(a,'select count(*)::integer as result from public.profiles where id=$1',[user]),0);
   assert.equal((await credit(a,reward)).status,adFirst?'duplicate':'ignored');
   assert.equal(await scalar(a,'select retired as result from public.play_commerce_tokens where token_hash=$1',[e.tokenHash]),true);
  }
 });
 await check('delta: deletion cancellation RPC requires the pending job and matching canonical subscription',async()=>{
  const user=await account(admin),e=await purchase(a,user,'plus_monthly');await apply(a,e);
  const proof={...e.purchase,cancelAtPeriodEnd:true};await assert.rejects(rpc(a,'play_commerce_deletion_canceled',[user,e.tokenHash,proof]),{code:'42501'});
  const deletion=ticket();await begin(a,user,deletion);
  await assert.rejects(rpc(a,'play_commerce_deletion_canceled',[user,e.tokenHash,{...proof,test:true}]),{code:'22023'});
  await rpc(a,'play_commerce_deletion_canceled',[user,e.tokenHash,proof]);await rpc(a,'erase_account_data',[deletion]);await rpc(a,'finish_account_deletion',[deletion]);
  assert.equal(await scalar(a,'select ciphertext as result from public.play_commerce_tokens where token_hash=$1',[e.tokenHash]),null);
 });
 await check('delta: test receipts stay in test sources and never grant live access or hint spending',async()=>{
  await admin.query("update public.play_commerce_settings set environment='test' where id=1");
  try{
   const user=await account(admin),reward=await ad(user),e=await purchase(a,user,'plus_monthly',true);await apply(a,e);await credit(a,reward);
   const w=await wallet(a,user);assert.equal(w.test_subscription_hint_tickets,10);assert.equal(w.subscription_hint_tickets,0);assert.equal(w.hint_tickets,3);
   assert.equal((await rpc(a,'get_shared_match_entitlement',[user])).plan,'free');
   await admin.query('update public.ticket_wallets set hint_tickets=0 where user_id=$1',[user]);assert.equal((await spend(a,hint(user))).error,'INSUFFICIENT_FUNDS');
   assert.equal((await wallet(a,user)).test_subscription_hint_tickets,10);
  }finally{await admin.query("update public.play_commerce_settings set environment='live' where id=1");}
 });
}
