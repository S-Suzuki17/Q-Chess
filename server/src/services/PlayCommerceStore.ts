import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {isCommerceSku,type CommerceSku} from './CommerceCatalog';
import {playCommerceAccountId} from './PlayCommerceProof';
import {PlayCommerceError,playObject} from './PlayCommerceValues';
import type {PlayCanonicalPurchase} from './PlayCommerceVerifier';
import type {PlayCommercePaidOrder} from './PlayCommercePaidOrder';
export type PlayCommerceStatus={userId:string;enabled:boolean;test:boolean;active:boolean;subscriptionBlocked:boolean;sku:CommerceSku|null;periodEnd:string|null;cancelAtPeriodEnd:boolean;purchasedHintTickets:number;subscriptionHintTickets:number;deliveryPending:boolean};
export type PlayApplyResult={userId:string;credited:number;duplicate:boolean;active:boolean;deliveryPending:boolean;reconciliationPending:boolean;test:boolean};
export type PlayStoredToken={tokenHash:string;sku:CommerceSku;test:boolean;ciphertext:string;historyCursor:number};
export type PlayDelivery={tokenHash:string;sku:CommerceSku;ciphertext:string;action:'acknowledge'|'consume';lease:string};
export type PlayReceiptEvidence=PlayCanonicalPurchase&{userId?:string;tokenHash:string;lease:string;ciphertext:string};
export interface PlayCommerceStore{
 verifyUser(token:string):Promise<string|null>;ready():Promise<boolean>;status(user:string):Promise<PlayCommerceStatus>;
 intent(user:string,sku:CommerceSku):Promise<{userId:string;sku:CommerceSku;accountId:string;intentId:string;test:boolean}>;
 cancelIntent(user:string,intentId:string):Promise<void>;
 acquire(hash:string):Promise<string|null>;release(hash:string,lease:string):Promise<void>;apply(evidence:PlayReceiptEvidence):Promise<PlayApplyResult>;
 claimDelivery():Promise<PlayDelivery|null>;finishDelivery(job:PlayDelivery,success:boolean):Promise<void>;
 due():Promise<PlayStoredToken[]>;deletionTokens(user:string):Promise<PlayStoredToken[]>;
 tokenByHash(hash:string):Promise<PlayStoredToken|null>;
 historicalOrders(hash:string):Promise<string[]>;applyHistorical(hash:string,lease:string,order:PlayCommercePaidOrder):Promise<void>;
 advanceHistory(hash:string,lease:string,next:number):Promise<void>;canceledForDeletion(user:string,hash:string,proof:PlayCanonicalPurchase['purchase']):Promise<void>;
}
const hashPattern=/^[a-f0-9]{64}$/,uuidPattern=/^[a-f0-9-]{36}$/i;
const unavailable=():never=>{throw new PlayCommerceError('UNAVAILABLE');};
const errorCodes=new Set(['INVALID_PURCHASE','PENDING','ACCOUNT_MISMATCH','MODE_MISMATCH','UNAVAILABLE','BUSY','RETIRED','TERMS_REQUIRED','FEATURE_DISABLED']);
const count=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
export function createPlayCommerceStore(client:SupabaseClient,verifyUser:PlayCommerceStore['verifyUser']):PlayCommerceStore{
 const rpc=async(name:string,args:Record<string,unknown>={})=>{
  const {data,error}=await client.rpc(name,args).abortSignal(AbortSignal.timeout(15000));
  if(error)throw new PlayCommerceError(errorCodes.has(error.message)?error.message as PlayCommerceError['code']:'UNAVAILABLE');return data;
 };
 const token=(row:unknown):PlayStoredToken=>{
  if(!playObject(row)||typeof row.tokenHash!=='string'||!hashPattern.test(row.tokenHash)||!isCommerceSku(row.sku)||typeof row.test!=='boolean'||typeof row.ciphertext!=='string'||!Number.isSafeInteger(row.historyCursor)||Number(row.historyCursor)<-1)return unavailable();
  return row as unknown as PlayStoredToken;
 };
 return {
  verifyUser,
  async ready(){try{return await rpc('play_commerce_protocol')===1;}catch{return false;}},
  async status(user){
   const value=await rpc('play_commerce_status',{p_user_id:user});
   if(!playObject(value)||value.userId!==user||!['enabled','test','active','subscriptionBlocked','cancelAtPeriodEnd','deliveryPending'].every(k=>typeof value[k]==='boolean')||!count(value.purchasedHintTickets)||!count(value.subscriptionHintTickets)||!(value.sku===null||isCommerceSku(value.sku))||!(value.periodEnd===null||typeof value.periodEnd==='string'&&Number.isFinite(Date.parse(value.periodEnd))))return unavailable();
   return value as PlayCommerceStatus;
  },
  async intent(user,sku){
   const generation=randomUUID(),intentId=playCommerceAccountId(randomUUID());
   const value=await rpc('create_play_commerce_intent',{p_user_id:user,p_sku:sku,p_generation:generation,p_account_id:playCommerceAccountId(generation),p_intent_id:intentId});
   if(!playObject(value)||value.userId!==user||value.sku!==sku||typeof value.accountId!=='string'||!hashPattern.test(value.accountId)||value.intentId!==intentId||typeof value.test!=='boolean')return unavailable();
   return value as {userId:string;sku:CommerceSku;accountId:string;intentId:string;test:boolean};
  },
  async cancelIntent(user,intentId){await rpc('play_commerce_cancel_intent',{p_user_id:user,p_intent_id:intentId});},
  async acquire(hash){const value=await rpc('acquire_play_commerce_receipt',{p_token_hash:hash});if(value!==null&&(typeof value!=='string'||!uuidPattern.test(value)))return unavailable();return value;},
  async release(hash,lease){await rpc('release_play_commerce_receipt',{p_token_hash:hash,p_lease:lease});},
  async apply(evidence){
   const value=await rpc('apply_play_commerce_receipt',{p_evidence:evidence});
   if(!playObject(value)||typeof value.userId!=='string'||!count(value.credited)||!['duplicate','active','deliveryPending','reconciliationPending','test'].every(k=>typeof value[k]==='boolean'))return unavailable();
   if(evidence.userId&&value.userId!==evidence.userId)return unavailable();return value as PlayApplyResult;
  },
  async claimDelivery(){const value=await rpc('claim_play_commerce_delivery');if(value===null)return null;
   if(!playObject(value)||typeof value.tokenHash!=='string'||!hashPattern.test(value.tokenHash)||!isCommerceSku(value.sku)||typeof value.ciphertext!=='string'||!['consume','acknowledge'].includes(String(value.action))||typeof value.lease!=='string'||!uuidPattern.test(value.lease))return unavailable();return value as PlayDelivery;},
  async finishDelivery(job,success){await rpc('finish_play_commerce_delivery',{p_token_hash:job.tokenHash,p_lease:job.lease,p_success:success});},
  async due(){const rows=await rpc('play_commerce_reconcile_due');if(!Array.isArray(rows)||rows.length>4)return unavailable();return rows.map(token);},
  async tokenByHash(hash){const {data,error}=await client.from('play_commerce_tokens').select('token_hash,sku,test,ciphertext,history_cursor,retired').eq('token_hash',hash).maybeSingle();if(error)return unavailable();if(!data||data.retired)return null;return token({tokenHash:data.token_hash,sku:data.sku,test:data.test,ciphertext:data.ciphertext,historyCursor:data.history_cursor});},
  async deletionTokens(user){
   const {data:account,error}=await client.from('play_commerce_accounts').select('generation').eq('user_id',user).maybeSingle();
   if(error){if(['42P01','PGRST205'].includes(error.code))return [];return unavailable();}if(!account)return [];
   const rows=await client.from('play_commerce_tokens').select('token_hash,sku,test,ciphertext,history_cursor').eq('generation',account.generation).eq('retired',false).in('sku',['standard_monthly','plus_monthly']);
   if(rows.error||!Array.isArray(rows.data))return unavailable();return rows.data.map(r=>token({tokenHash:r.token_hash,sku:r.sku,test:r.test,ciphertext:r.ciphertext,historyCursor:r.history_cursor}));
  },
  async historicalOrders(hash){const {data,error}=await client.from('play_commerce_orders').select('order_id').eq('token_hash',hash).order('checked_at').limit(4);if(error||!Array.isArray(data))return unavailable();return data.map(r=>r.order_id);},
  async applyHistorical(hash,lease,order){await rpc('play_commerce_record_order',{p_token_hash:hash,p_lease:lease,p_order:order,p_historical:true});},
  async advanceHistory(hash,lease,next){await rpc('play_commerce_advance_history',{p_token_hash:hash,p_lease:lease,p_next:next});},
  async canceledForDeletion(user,hash,purchase){await rpc('play_commerce_deletion_canceled',{p_user_id:user,p_token_hash:hash,p_purchase:purchase});},
 };
}
