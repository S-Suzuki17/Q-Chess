'use client';
import {registerPlugin} from '@capacitor/core';
import {Browser} from '@capacitor/browser';
import {COMMERCE_PRODUCTS,type CommerceSku} from '../config/commerceCatalog';
import {isAndroidApp} from './nativeAds';
import {requestRewardApi} from './nativeRewards';
import {DAILY_LOGIN_REWARD_CHANGED_EVENT} from './dailyLoginRewards';
import {resetAdEntitlement} from './sharedAdEligibility';
export type PlayPrice={sku:CommerceSku;price:string;currency:string;priceMicros:string;period:'P1M'|''};
type NativePurchase={sku:CommerceSku;state:'purchased'|'pending';purchaseToken?:string};
const plugin=registerPlugin<{
 commerceProducts():Promise<{products:PlayPrice[]}>;
 commercePurchase(value:PlayPrice&{accountId:string;intentId:string}):Promise<{status:'cancelled'|'received';purchases:NativePurchase[]}>;
 commerceRestore():Promise<{purchases:NativePurchase[]}>;
}>('PlayRewards');
export const nativeCommerceEnabled=()=>isAndroidApp()&&process.env.NEXT_PUBLIC_NATIVE_COMMERCE_ENABLED==='true';
// Serialize before creating an intent, including foreground recovery.
let commerceQueue:Promise<unknown>=Promise.resolve();
function commerceOperation<T>(operation:()=>Promise<T>):Promise<T>{
 const result=commerceQueue.then(operation);
 commerceQueue=result.catch(()=>{});
 return result;
}
const sku=(value:unknown):value is CommerceSku=>COMMERCE_PRODUCTS.some(p=>p.sku===value);
export type NativeCommerceStatus={ready:boolean;enabled:boolean;userId:string;active:boolean;subscriptionBlocked:boolean;sku:CommerceSku|null;periodEnd:string|null;cancelAtPeriodEnd:boolean;test:boolean;purchasedHintTickets:number;subscriptionHintTickets:number;deliveryPending:boolean};
export async function readNativeCommerce(userId:string):Promise<NativeCommerceStatus>{
 const value=await requestRewardApi(userId,'/commerce/play/status');
 if(value.userId!==userId||typeof value.ready!=='boolean'||typeof value.enabled!=='boolean')throw new Error('UNAVAILABLE');
 if(!value.ready)return {userId,ready:false,enabled:false,active:false,subscriptionBlocked:true,sku:null,periodEnd:null,cancelAtPeriodEnd:false,test:false,purchasedHintTickets:0,subscriptionHintTickets:0,deliveryPending:false};
 if(!['active','subscriptionBlocked','cancelAtPeriodEnd','test','deliveryPending'].every(k=>typeof value[k]==='boolean')||!['purchasedHintTickets','subscriptionHintTickets'].every(k=>Number.isSafeInteger(value[k])&&Number(value[k])>=0)||!(value.sku===null||sku(value.sku))||!(value.periodEnd===null||typeof value.periodEnd==='string'&&Number.isFinite(Date.parse(value.periodEnd))))throw new Error('UNAVAILABLE');
 return value as NativeCommerceStatus;
}
export async function nativeCommercePrices():Promise<PlayPrice[]>{
 return commerceOperation(async()=>{
 if(!nativeCommerceEnabled())return [];
 const {products}=await plugin.commerceProducts();if(!Array.isArray(products)||products.length>8)throw new Error('UNAVAILABLE');const seen=new Set<string>();
 return products.map(p=>{if(!p||!sku(p.sku)||seen.has(p.sku)||typeof p.price!=='string'||!p.price||p.price.length>100||typeof p.currency!=='string'||!/^[A-Z]{3}$/.test(p.currency)||typeof p.priceMicros!=='string'||!(/^[1-9][0-9]{0,18}$/).test(p.priceMicros)||p.period!==(p.sku.endsWith('_monthly')?'P1M':''))throw new Error('UNAVAILABLE');seen.add(p.sku);return p;});
 });
}
async function submitPurchases(userId:string,purchases:NativePurchase[],current:()=>boolean){
 if(!current())throw new Error('AUTH_REQUIRED');
 if(!Array.isArray(purchases))throw new Error('UNAVAILABLE');let pending=purchases.length>20;
 for(const purchase of purchases.slice(0,20)){
  if(!current())throw new Error('AUTH_REQUIRED');
  if(!sku(purchase?.sku)||!['pending','purchased'].includes(purchase.state))throw new Error('UNAVAILABLE');
  if(purchase.state==='pending'){pending=true;continue;}
  if(typeof purchase.purchaseToken!=='string'||purchase.purchaseToken.length<16||purchase.purchaseToken.length>4096)throw new Error('UNAVAILABLE');
  const result=await requestRewardApi(userId,'/commerce/play/receipt',{sku:purchase.sku,purchaseToken:purchase.purchaseToken});
  if(!current())throw new Error('AUTH_REQUIRED');
  if(result.userId!==userId||typeof result.reconciliationPending!=='boolean'||typeof result.deliveryPending!=='boolean')throw new Error('UNAVAILABLE');
  pending||=result.reconciliationPending||result.deliveryPending;
 }
 if(current()){resetAdEntitlement();window.dispatchEvent(new CustomEvent(DAILY_LOGIN_REWARD_CHANGED_EVENT,{detail:{userId}}));}
 return pending?'pending' as const:'done' as const;
}
export async function buyNativeCommerce(userId:string,price:PlayPrice,current:()=>boolean){
 return commerceOperation(async()=>{
 if(!nativeCommerceEnabled()||!current())throw new Error('AUTH_REQUIRED');
 const intent=await requestRewardApi(userId,'/commerce/play/intent',{sku:price.sku});
 if(!current()||intent.userId!==userId||intent.sku!==price.sku||typeof intent.accountId!=='string'||!/^[a-f0-9]{64}$/.test(intent.accountId)||typeof intent.intentId!=='string'||!/^[a-f0-9]{64}$/.test(intent.intentId))throw new Error('UNAVAILABLE');
 const cancel=async()=>{if(current())await requestRewardApi(userId,'/commerce/play/intent/cancel',{intentId:intent.intentId}).catch(()=>{});};
 let result:Awaited<ReturnType<typeof plugin.commercePurchase>>;
 try{result=await plugin.commercePurchase({...price,accountId:intent.accountId,intentId:intent.intentId});}
 // These native errors occur before launchBillingFlow. Keep ambiguous errors
 // attached to their intent so a delayed purchase can still be recovered.
 catch(error){if(error instanceof Error&&['PRICE_CHANGED','PRODUCT_UNAVAILABLE'].includes(error.message))await cancel();throw error;}
 if(result.status==='cancelled'){await cancel();return 'cancelled' as const;}if(result.status!=='received')throw new Error('UNAVAILABLE');
 return submitPurchases(userId,result.purchases,current);
 });
}
export async function restoreNativeCommerce(userId:string,current:()=>boolean){
 return commerceOperation(async()=>{
 if(!nativeCommerceEnabled()||!current())throw new Error('AUTH_REQUIRED');
 return submitPurchases(userId,(await plugin.commerceRestore()).purchases,current);
 });
}
export async function manageNativeCommerce(product:CommerceSku|null){
 if(!nativeCommerceEnabled())throw new Error('UNAVAILABLE');
 const url=new URL('https://play.google.com/store/account/subscriptions');url.searchParams.set('package','com.qgambit.app');
 if(product&&product.endsWith('_monthly'))url.searchParams.set('sku','qg_'+product);
 await Browser.open({url:url.href});
}
