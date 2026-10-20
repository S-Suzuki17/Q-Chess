import {playCommerceDelta} from './play-commerce-delta.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {setupBaseline} from './fixtures/commerce-postgres-baseline.mjs';
import {combinedPendingMigrations,hintPolicyMigrations,emailRegistrationMigrations,learningMigrations,googleAccountMigrations} from './fixtures/session-postgres-baseline.mjs';
import {connect,scalar,wallet,account,contended,MAX,HASH} from './commerce-postgres-support.mjs';
const migration='20261013040752_play_commerce_ledger.sql';
const preceding=[...combinedPendingMigrations,...hintPolicyMigrations,...emailRegistrationMigrations].sort();
const after=['20261013071700_conventional_registration_repair.sql','20261013075800_preserve_legacy_ad_reward_intents.sql','20261013075925_admob_verified_ticket_rewards.sql','20261013115237_play_commerce_terms_release.sql','20261013135400_play_pending_refund_state.sql',...learningMigrations,...googleAccountMigrations];
const text=name=>readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
const hash=value=>createHash('sha256').update('com.qgambit.app:commerce:'+value).digest('hex');
let sequence=0;
const rpc=(db,name,values)=>scalar(db,`select public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) as result`,values);
const status=(db,user)=>rpc(db,'play_commerce_status',[user]);
const apply=(db,e)=>rpc(db,'apply_play_commerce_receipt',[e]);
const hints={standard_monthly:0,plus_monthly:10,hints_1:1,hints_13:13,hints_27:27,hints_44:44,hints_77:77,hints_166:166};
async function purchase(db,user,sku='hints_13',test=false){
 const generation=randomUUID(),intentId=hash(randomUUID());
 const intent=await rpc(db,'create_play_commerce_intent',[user,sku,generation,hash(generation),intentId]);
 const tokenHash=hash(randomUUID()),lease=await rpc(db,'acquire_play_commerce_receipt',[tokenHash]);
 const orderId='GPA.0000-0000-0000-'+String(++sequence).padStart(5,'0'),orderKey='com.qgambit.app:play-order:'+orderId;
 const now=new Date(Date.now()-1000).toISOString(),end=new Date(Date.now()+30*86400000).toISOString(),type=sku.endsWith('_monthly')?'subs':'inapp';
 return {userId:user,tokenHash,lease,ciphertext:'v1.'+'n'.repeat(16)+'.'+'t'.repeat(22)+'.'+'c'.repeat(30),orderUnavailable:false,
  purchase:{sku,productId:'qg_'+sku,type,accountId:intent.accountId,intentId,test,state:type==='subs'?'SUBSCRIPTION_STATE_ACTIVE':'PURCHASED',active:type==='subs',periodEnd:type==='subs'?end:null,cancelAtPeriodEnd:false,consumed:false,acknowledged:false,currentOfferPhase:type==='subs'?'BASE':null,refundableQuantity:type==='inapp'?1:null,orderId,
   ownership:{kind:'direct',requiresDatabaseMatch:true,persistBeforeAcknowledgement:false,linkedTokenHash:null,outOfApp:null}},
  order:{sku,productId:'qg_'+sku,type,orderId,orderKey,tokenHash,test,paid:true,reason:'PAID_ORDER',candidateHints:hints[sku],state:'PROCESSED',money:{currencyCode:'USD',amountNanos:'1000000000'},processedAt:now,offerPhase:type==='subs'?'BASE':null,paidPeriod:type==='subs'?{start:now,end}:null,requiresDatabaseGrantFence:true}};
}
const reverse=(db,e)=>rpc(db,'reverse_play_commerce_order',[e.order.orderKey,e.tokenHash,{orderKey:e.order.orderKey,tokenHash:e.tokenHash,sku:e.purchase.sku,revoked:true}]);
function hint(user){return [randomUUID(),user,randomUUID(),'match','ranked','white',0,HASH,'quantum-match-v1',new Date(Date.now()+3600000).toISOString(),{pieceId:'w_1',target:{row:5,col:0}},{fromRow:6,fromCol:0,toRow:5,toCol:0}];}
const spend=(db,h)=>rpc(db,'buy_match_hint',h);
test('Play ledger forward migration on disposable PostgreSQL 17; no provider or hosted proof',async t=>{
 const baseline=(name,fn)=>t.test(name,{skip:process.env.QG_PLAY_QA_DELTA_ONLY==='1'},fn);
 const admin=await connect();let a,b;
 try{
  await setupBaseline(admin);for(const name of preceding)await admin.query(await text(name));
  a=await connect('service_role');b=await connect('service_role');
  const inventory=(await readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')&&n>=preceding[0]).sort();assert.deepEqual(inventory,[...preceding,migration,...after].sort());
  const existing=await account(admin),before=await wallet(admin,existing);
  const consents=await scalar(admin,'select jsonb_agg(to_jsonb(c) order by version) as result from public.account_terms_consents c where user_id=$1',[existing]);
  await admin.query(await text(migration));for(const name of after)await admin.query(await text(name));
  await t.test('migration preserves existing wallet and keeps new sales closed',async()=>{
   assert.deepEqual(await scalar(admin,'select jsonb_agg(to_jsonb(c) order by version) as result from public.account_terms_consents c where user_id=$1',[existing]),consents);
   assert.equal(await scalar(admin,'select version as result from public.current_terms_policy where singleton'),'2026-10-13.1');
   assert.equal(await scalar(admin,'select new_purchases_enabled as result from public.play_commerce_settings where id=1'),false);
   assert.deepEqual(await wallet(admin,existing),before);await assert.rejects(purchase(a,existing),{code:'42501'});
   await admin.query('update public.play_commerce_settings set new_purchases_enabled=true where id=1');
  });
  await baseline('all eight server catalog amounts; duplicate restore never credits twice',async()=>{
   for(const [sku,quantity]of Object.entries(hints)){
    const user=await account(admin),e=await purchase(a,user,sku);assert.equal((await apply(a,e)).credited,quantity);
    assert.equal((await apply(a,e)).credited,0);const s=await status(a,user);
    assert.equal(s.purchasedHintTickets,sku.startsWith('hints')?quantity:0);assert.equal(s.subscriptionHintTickets,sku==='plus_monthly'?10:0);assert.equal(s.active,sku.endsWith('monthly'));
    assert.equal(await scalar(a,'select count(*)::integer as result from public.play_commerce_outbox where token_hash=$1',[e.tokenHash]),1);
   }
  });
  await baseline('canonical order missing holds credit and delivery; later evidence recovers once',async()=>{
   const user=await account(admin),e=await purchase(a,user);assert.equal((await apply(a,{...e,order:null,orderUnavailable:true})).credited,0);
   assert.equal((await status(a,user)).deliveryPending,false);assert.equal((await apply(a,e)).credited,13);
  });
  await baseline('owner, intent SKU, account and test mode conflicts never rebind',async()=>{
   const user=await account(admin),other=await account(admin),e=await purchase(a,user);await apply(a,e);
   await assert.rejects(apply(a,{...e,userId:other}),{code:'42501'});
   await assert.rejects(apply(a,{...e,purchase:{...e.purchase,test:true},order:{...e.order,test:true}}),{code:'42501'});
   await assert.rejects(apply(a,{...e,purchase:{...e.purchase,accountId:hash(randomUUID())}}),{code:'42501'});
   assert.equal((await status(a,user)).purchasedHintTickets,13);assert.equal((await status(a,other)).purchasedHintTickets,0);
  });
  await baseline('real contention grants one immutable source',async()=>{
   const user=await account(admin),e=await purchase(a,user);const outcomes=await contended(admin,a,b,db=>apply(db,e),db=>apply(db,e));
   assert.deepEqual(outcomes.map(x=>x.credited),[13,0]);assert.equal((await status(a,user)).purchasedHintTickets,13);
  });
  await baseline('rollback releases the grant for a waiting replica',async()=>{
   const user=await account(admin),e=await purchase(a,user);const outcomes=await contended(admin,a,b,db=>apply(db,e),db=>apply(db,e),{rollback:true});
   assert.deepEqual(outcomes.map(x=>x.credited),[13,13]);assert.equal((await status(a,user)).purchasedHintTickets,13);
  });
  await baseline('spending five and refunding recovers only eight; restoration cannot resurrect',async()=>{
   const user=await account(admin),e=await purchase(a,user);await apply(a,e);const receipts=[];
   for(let i=0;i<5;i++){const h=hint(user);await spend(a,h);receipts.push(h[0]);}
   assert.equal((await status(a,user)).purchasedHintTickets,8);assert.equal(await reverse(a,e),8);assert.equal(await reverse(a,e),0);
   assert.equal(await rpc(a,'restore_match_hint_credit',[receipts[0],user,'unrecoverable_delivery']),0);
   assert.equal((await status(a,user)).purchasedHintTickets,0);assert.equal((await apply(a,e)).credited,0);
  });
  await baseline('historical Plus refund leaves current paid order, benefits and hints intact',async()=>{
   const user=await account(admin),e=await purchase(a,user,'plus_monthly');await apply(a,e);
   const orderId=e.order.orderId+'..1',second={...e,purchase:{...e.purchase,orderId},order:{...e.order,orderId,orderKey:'com.qgambit.app:play-order:'+orderId}};
   await apply(a,second);assert.equal((await status(a,user)).subscriptionHintTickets,20);assert.equal(await reverse(a,e),10);
   const s=await status(a,user);assert.equal(s.subscriptionHintTickets,10);assert.equal(s.active,true);
   assert.equal((await rpc(a,'get_shared_match_entitlement',[user])).plan,'plus');
  });
  await baseline('order marked refunded before grant never credits on stale paid evidence',async()=>{
   const user=await account(admin),e=await purchase(a,user),refunded={...e,order:{...e.order,state:'REFUNDED',paid:false,candidateHints:0,reason:'ORDER_NOT_PROCESSED'}};
   assert.equal((await apply(a,refunded)).credited,0);assert.equal((await apply(a,e)).credited,0);assert.equal((await status(a,user)).purchasedHintTickets,0);
  });
  await baseline('normal cancellation and expiry never mint new Plus hints',async()=>{
   const user=await account(admin),e=await purchase(a,user,'plus_monthly');await apply(a,e);
   const canceled={...e,purchase:{...e.purchase,state:'SUBSCRIPTION_STATE_CANCELED',cancelAtPeriodEnd:true}};assert.equal((await apply(a,canceled)).credited,0);assert.equal((await status(a,user)).active,true);
   await apply(a,{...canceled,purchase:{...canceled.purchase,active:false,state:'SUBSCRIPTION_STATE_EXPIRED',periodEnd:new Date(Date.now()-1000).toISOString()}});
   assert.equal((await status(a,user)).active,false);assert.equal((await status(a,user)).subscriptionHintTickets,10);
  });
  await baseline('historical canonical period grants once without overwriting current expiry or pointer',async()=>{
   const user=await account(admin),e=await purchase(a,user,'plus_monthly');await apply(a,e);
   const previous={...e.order,orderId:e.order.orderId+'..7',orderKey:e.order.orderKey+'..7',paidPeriod:{start:'2026-08-01T00:00:00Z',end:'2026-09-01T00:00:00Z'}};
   await rpc(a,'play_commerce_record_order',[e.tokenHash,e.lease,previous,true]);await rpc(a,'play_commerce_record_order',[e.tokenHash,e.lease,previous,true]);
   assert.equal((await status(a,user)).subscriptionHintTickets,20);
   const stored=await scalar(a,'select to_jsonb(t) as result from public.play_commerce_tokens t where token_hash=$1',[e.tokenHash]);assert.equal(stored.latest_order_key,e.order.orderKey);assert.equal(Date.parse(stored.period_end),Date.parse(e.purchase.periodEnd));
  });
  await baseline('Orders outage cannot resurrect refunded current subscription benefits',async()=>{
   const user=await account(admin),e=await purchase(a,user,'plus_monthly');await apply(a,e);await reverse(a,e);
   await apply(a,{...e,order:null,orderUnavailable:true});assert.equal((await status(a,user)).active,false);assert.equal((await status(a,user)).subscriptionHintTickets,0);
  });
  await baseline('canonical zero refundable quantity revokes only this in-app order despite Orders outage',async()=>{
   const user=await account(admin),e=await purchase(a,user),other=await purchase(a,user,'hints_1');await apply(a,e);await apply(a,other);
   await apply(a,{...e,purchase:{...e.purchase,refundableQuantity:0},order:null,orderUnavailable:true});assert.equal((await status(a,user)).purchasedHintTickets,1);
  });
  await baseline('an in-app token cannot fund a second order identity',async()=>{
   const user=await account(admin),e=await purchase(a,user);await apply(a,e);const id=e.order.orderId+'..1';
   await assert.rejects(apply(a,{...e,purchase:{...e.purchase,orderId:id},order:{...e.order,orderId:id,orderKey:'com.qgambit.app:play-order:'+id}}),{code:'23505'});
  });
  await baseline('free/practice allocations stay separate and paid restoration is idempotent',async()=>{
   const user=await account(admin),e=await purchase(a,user);await apply(a,e);await admin.query('update public.ticket_wallets set hint_tickets=3,ranked_tickets=7 where user_id=$1',[user]);
   const free=hint(user);await spend(a,free);assert.equal((await wallet(a,user)).hint_tickets,2);assert.equal((await status(a,user)).purchasedHintTickets,13);
   await admin.query('update public.ticket_wallets set hint_tickets=0 where user_id=$1',[user]);const h=hint(user);await spend(a,h);
   assert.equal(await rpc(a,'restore_match_hint_credit',[h[0],user,'unrecoverable_delivery']),1);assert.equal(await rpc(a,'restore_match_hint_credit',[h[0],user,'unrecoverable_delivery']),0);
   assert.equal((await status(a,user)).purchasedHintTickets,13);assert.equal((await wallet(a,user)).ranked_tickets,7);
   await assert.rejects(rpc(a,'buy_cpu_hint',[randomUUID(),user,randomUUID(),0,HASH,{},{}]),{code:'42501'});
  });
  await baseline('refund contends with hint spend without debt',async()=>{
   const user=await account(admin),e=await purchase(a,user,'hints_1');await apply(a,e);const h=hint(user);
   const outcomes=await contended(admin,a,b,db=>spend(db,h),db=>reverse(db,e));assert.equal(outcomes[1],0);assert.equal((await status(a,user)).purchasedHintTickets,0);
  });
  await baseline('balance overflow rolls back order, source and outbox',async()=>{
   const user=await account(admin),e=await purchase(a,user);await admin.query('update public.ticket_wallets set purchased_hint_tickets=$2 where user_id=$1',[user,MAX]);
   await assert.rejects(apply(a,e),{code:'55000'});assert.equal(await scalar(a,'select count(*)::integer as result from public.play_commerce_tokens where token_hash=$1',[e.tokenHash]),0);
  });
  await baseline('stale receipt lease cannot write after canonical fetch',async()=>{
   const user=await account(admin),e=await purchase(a,user);await rpc(a,'release_play_commerce_receipt',[e.tokenHash,e.lease]);await assert.rejects(apply(a,e),{code:'40001'});
  });
  await baseline('new generation after deletion cannot restore a tombstoned token',async()=>{
   const user=await account(admin),e=await purchase(a,user);await apply(a,e);await admin.query('delete from public.profiles where id=$1',[user]);
   await admin.query('insert into public.profiles(id,name) values($1,$1)',[user]);await assert.rejects(apply(a,e),{code:'42501'});
   const row=await scalar(admin,'select to_jsonb(t) as result from public.play_commerce_tokens t where token_hash=$1',[e.tokenHash]);assert.equal(row.retired,true);assert.equal(row.ciphertext,null);
  });
  await baseline('renewing subscriptions prevent unverified account deletion',async()=>{
   const user=await account(admin),e=await purchase(a,user,'standard_monthly');await apply(a,e);await assert.rejects(admin.query('delete from public.profiles where id=$1',[user]),{code:'42501'});
   await apply(a,{...e,purchase:{...e.purchase,cancelAtPeriodEnd:true}});await admin.query('delete from public.profiles where id=$1',[user]);
  });
  await baseline('client roles cannot query ledger or call RPC; source quantities conserved',async()=>{
   for(const role of ['anon','authenticated']){const db=await connect(role);try{await assert.rejects(status(db,existing),{code:'42501'});await assert.rejects(db.query('select * from public.play_commerce_sources'),{code:'42501'});}finally{await db.end();}}
   assert.equal(await scalar(admin,'select count(*)::integer as result from public.play_commerce_sources where quantity<>available+consumed+revoked or available<0 or consumed<0 or revoked<0'),0);
  });
  await playCommerceDelta(t,{admin,a,b,rpc,purchase,apply,status,reverse,hint,spend});
 }finally{await Promise.all([admin.end(),a?.end(),b?.end()]);}
});
