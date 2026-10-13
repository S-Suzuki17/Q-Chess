import type {CommerceSku} from './CommerceCatalog';
import {playCommerceReceiptHash} from './PlayCommerceProof';
import {PlayCommerceError,playToken,playOrderId} from './PlayCommerceValues';
import type {PlayCommerceStore,PlayApplyResult,PlayStoredToken} from './PlayCommerceStore';
import type {PlayCommerceVerifier} from './PlayCommerceVerifier';
import {playTokenVault} from './PlayCommerceTokenVault';
type Vault=NonNullable<ReturnType<typeof playTokenVault>>;

export function createPlayCommerceService(store:PlayCommerceStore,verifier:PlayCommerceVerifier|null,vault:Vault|null){
 let running=false;
 const configured=()=>verifier!==null&&vault!==null;
 const receipt=async(sku:CommerceSku,rawToken:string,userId?:string):Promise<PlayApplyResult>=>{
  if(!verifier||!vault)throw new PlayCommerceError('UNAVAILABLE');
  const token=playToken(rawToken),tokenHash=playCommerceReceiptHash(token),lease=await store.acquire(tokenHash);
  if(!lease)throw new PlayCommerceError('BUSY');
  try{
   const canonical=await verifier.verify(sku,token);
   return await store.apply({...canonical,...(userId?{userId}:{}),tokenHash,lease,ciphertext:vault.seal(token,tokenHash)});
  }finally{await store.release(tokenHash,lease).catch(()=>{});}
 };
 const deliver=async()=>{
  if(!verifier||!vault)return;
  for(let i=0;i<4;i++){
   const job=await store.claimDelivery();if(!job)break;
   let success=false;
   let receiptLease:string|null=null;
   try{
    receiptLease=await store.acquire(job.tokenHash);if(!receiptLease)throw new PlayCommerceError('BUSY');
    const token=vault.open(job.ciphertext,job.tokenHash),canonical=await verifier.verify(job.sku,token),p=canonical.purchase;
    await store.apply({...canonical,tokenHash:job.tokenHash,lease:receiptLease,ciphertext:job.ciphertext});
    const done=p.type==='inapp'?p.consumed||p.state==='CANCELLED'||p.refundableQuantity===0:p.acknowledged||['SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'].includes(p.state);
    if(!done){if(p.state==='PENDING'||p.state==='SUBSCRIPTION_STATE_PENDING')throw new PlayCommerceError('PENDING');await verifier.deliver(job.sku,token,job.action);}
    success=true;
   }
   catch{/* The durable job stays retryable; no raw token/provider error is logged. */}
   finally{if(receiptLease)await store.release(job.tokenHash,receiptLease).catch(()=>{});}
   await store.finishDelivery(job,success);
  }
 };
 const reconcile=async(row:PlayStoredToken)=>{
  if(!verifier||!vault)return;
  const token=vault.open(row.ciphertext,row.tokenHash),lease=await store.acquire(row.tokenHash);if(!lease)return;
  try{
   let latest:string|null=null;
   try{
    const canonical=await verifier.verify(row.sku,token);latest=canonical.purchase.orderId;
    await store.apply({...canonical,tokenHash:row.tokenHash,lease,ciphertext:row.ciphertext});
   }catch(error){if(error instanceof PlayCommerceError&&['RETIRED','MODE_MISMATCH','ACCOUNT_MISMATCH'].includes(error.code))throw error;}
   // Historical Orders remains useful after Purchases stops returning an expired token.
   const orders=await store.historicalOrders(row.tokenHash);
   const oldest=orders.find(id=>id!==latest);
   if(oldest){const order=await verifier.historical(row.sku,token,oldest,row.test);await store.applyHistorical(row.tokenHash,lease,order);}
   if(row.sku.endsWith('_monthly')&&latest){
    const match=/^(GPA\.\d{4}-\d{4}-\d{4}-\d{5})(?:\.\.(\d{1,20}))?$/.exec(playOrderId(latest))!;
    const final=match[2]===undefined?-1n:BigInt(match[2]);
    // Suffixes are discovery candidates only. Every individual period requires orders.get proof.
    // Two per pass bounds provider calls; the durable cursor resumes missed renewals later.
    if(final<=100000n)for(let i=0,cursor=row.historyCursor;i<2&&BigInt(cursor)<final;i++,cursor++){
     const candidate=match[1]+(cursor<0?'':'..'+cursor);
     const order=await verifier.historical(row.sku,token,candidate,row.test);
     await store.applyHistorical(row.tokenHash,lease,order);await store.advanceHistory(row.tokenHash,lease,cursor+1);
    }
   }
  }finally{await store.release(row.tokenHash,lease).catch(()=>{});}
 };
 return {
  configured,receipt,deliver,
  async notification(sku:CommerceSku|null,rawToken:string,orderId?:string){
   if(!verifier||!vault)throw new PlayCommerceError('UNAVAILABLE');
   const token=playToken(rawToken),hash=playCommerceReceiptHash(token);
   const stored=await store.tokenByHash(hash),product=sku??stored?.sku;
   if(!product)throw new PlayCommerceError('BUSY');
   // A voided notification names an order, not a new entitlement. Its existing
   // immutable binding is enough to fetch Orders even after Purchases expires.
   if(!orderId||!stored)await receipt(product,token);
   if(orderId){
    const bound=stored??await store.tokenByHash(hash);if(!bound)throw new PlayCommerceError('RETIRED');
    const lease=await store.acquire(hash);if(!lease)throw new PlayCommerceError('BUSY');
    try{const order=await verifier.historical(bound.sku,token,playOrderId(orderId),bound.test);await store.applyHistorical(hash,lease,order);}
    finally{await store.release(hash,lease).catch(()=>{});}
   }
  },
  async tick(){
   if(running||!configured())return;running=true;
   try{if(!await store.ready())return;await deliver();for(const row of await store.due()){try{await reconcile(row);}catch{/* Scheduled retry is durable. */}}}
   finally{running=false;}
  },
  async beforeErase(userId:string){
   const rows=await store.deletionTokens(userId);if(!rows.length)return;
   if(!verifier||!vault)throw new PlayCommerceError('UNAVAILABLE');
   for(const row of rows){
    const token=vault.open(row.ciphertext,row.tokenHash);
    let {purchase}=await verifier.verify(row.sku,token);
    if(!purchase.cancelAtPeriodEnd&&!['SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'].includes(purchase.state)){
     await verifier.cancel(row.sku,token);purchase=(await verifier.verify(row.sku,token)).purchase;
    }
    if(purchase.sku!==row.sku||purchase.test!==row.test||!purchase.cancelAtPeriodEnd&&!['SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'].includes(purchase.state))throw new PlayCommerceError('UNAVAILABLE');
    await store.canceledForDeletion(userId,row.tokenHash,purchase);
   }
  },
 };
}
export type PlayCommerceService=ReturnType<typeof createPlayCommerceService>;
