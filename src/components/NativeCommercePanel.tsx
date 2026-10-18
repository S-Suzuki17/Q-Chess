'use client';
import {useEffect,useRef,useState} from 'react';
import type {User} from '../types/game';
import type {Language} from '../locales/dict';
import {COMMERCE_PRODUCTS} from '../config/commerceCatalog';
import {useCircuitAccess} from '../hooks/useCircuitAccess';
import {circuitAccess} from '../lib/circuitAccess';
import {acceptCurrentAccountTerms} from '../lib/currentAccountTerms';
import {nativeCommerceEnabled,nativeCommercePrices,readNativeCommerce,buyNativeCommerce,restoreNativeCommerce,manageNativeCommerce,type PlayPrice,type NativeCommerceStatus} from '../lib/nativeCommerce';
import {playCommerceText,playSubscriptionNotice} from '../locales/playCommerceText';
import {nativeRewardText} from '../locales/nativeRewardText';
import {commerceStatusText} from '../locales/commerceStatusText';
import {stripeMembershipText} from '../locales/stripeMembershipText';
import {TermsDocument} from './TermsDocument';
import {DAILY_LOGIN_REWARD_CHANGED_EVENT} from '../lib/dailyLoginRewards';

export function NativeCommercePanel({user,lang}:{user:User;lang:Language}){
 const {allowed,revision}=useCircuitAccess(user),[status,setStatus]=useState<NativeCommerceStatus|null>(null),[prices,setPrices]=useState<PlayPrice[]>([]);
 const [selected,setSelected]=useState<PlayPrice|null>(null),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false);
 const [message,setMessage]=useState<'pending'|'done'|'failure'|null>(null),sequence=useRef(0),operation=useRef(false);
 const [balanceError,setBalanceError]=useState(false);
 const text=(key:Parameters<typeof playCommerceText>[1])=>playCommerceText(lang,key),copy=commerceStatusText(lang),membership=stripeMembershipText(lang),balanceText=nativeRewardText(lang);
 useEffect(()=>{
  const version=++sequence.current;setStatus(null);setPrices([]);setSelected(null);setAccepted(false);setMessage(null);setBalanceError(false);setBusy(operation.current);
  if(!allowed||!nativeCommerceEnabled())return;
  void readNativeCommerce(user.id).then(async value=>{if(version!==sequence.current)return;setStatus(value);if(value.enabled){const items=await nativeCommercePrices();if(version===sequence.current)setPrices(items);}}).catch(()=>{if(version===sequence.current)setMessage('failure');});
  const permit=circuitAccess.permit(user);
  const refreshed=(event:Event)=>{
   if((event as CustomEvent<{userId?:string}>).detail?.userId!==user.id||operation.current||!permit())return;
   void readNativeCommerce(user.id).then(value=>{if(permit()&&version===sequence.current){setStatus(value);setBalanceError(false);}})
    .catch(()=>{if(permit()&&version===sequence.current)setBalanceError(true);});
  };
  window.addEventListener(DAILY_LOGIN_REWARD_CHANGED_EVENT,refreshed);
  return()=>{sequence.current++;window.removeEventListener(DAILY_LOGIN_REWARD_CHANGED_EVENT,refreshed);};
 },[user.id,allowed,revision]);
 const refreshBalance=async(current:()=>boolean)=>{
  try{const refreshed=await readNativeCommerce(user.id);if(current()){setStatus(refreshed);setBalanceError(false);}}
  catch{if(current())setBalanceError(true);}
 };
 const recheckBalance=async()=>{
  if(operation.current||!allowed||!nativeCommerceEnabled())return;
  const permit=circuitAccess.permit(user),version=sequence.current,current=()=>permit()&&version===sequence.current;
  operation.current=true;setBusy(true);
  try{await refreshBalance(current);}finally{operation.current=false;setBusy(false);}
 };
 const act=async(kind:'buy'|'restore')=>{
  if(operation.current||!allowed||!status?.ready||kind==='buy'&&(!selected||!accepted||!status.enabled||status.subscriptionBlocked&&selected.period==='P1M'))return;
  const permit=circuitAccess.permit(user),version=sequence.current,current=()=>permit()&&version===sequence.current;
  operation.current=true;setBusy(true);setMessage(null);
  try{
   if(kind==='buy'){await acceptCurrentAccountTerms(user.id);if(!current())return;}
   const result=kind==='buy'?await buyNativeCommerce(user.id,selected!,current):await restoreNativeCommerce(user.id,current);
   if(!current())return;setMessage(result==='cancelled'?null:result);setAccepted(false);
   if(result!=='cancelled')setSelected(null);
   // A balance refresh failure must not replace a confirmed or pending purchase result.
   await refreshBalance(current);
  }catch{if(current()){setMessage('failure');setAccepted(false);setSelected(null);if(status.enabled){const refreshed=await nativeCommercePrices().catch(()=>[]);if(current())setPrices(refreshed);}}}
  finally{operation.current=false;setBusy(false);}
 };
 if(!allowed||!nativeCommerceEnabled())return null;
 return <section data-native-commerce aria-busy={busy} className="reward-membership space-y-3">
  <h4 className="reward-title">Google Play</h4>
  {!status?.ready?<p role="status">{message?text(message):status?text('failure'):membership.checking}</p>:<>
   {status.test&&<p>{copy.testNotice}</p>}
   {status.active&&<p>{status.sku==='plus_monthly'?'Plus':'Standard'} · {membership.active} · {status.periodEnd?new Date(status.periodEnd).toISOString().slice(0,10)+' UTC':''}</p>}
   {status.cancelAtPeriodEnd&&<p>{membership.scheduledEnd}</p>}
   {status.subscriptionBlocked&&!status.active&&<p role="status">{playSubscriptionNotice[lang]}</p>}
   <dl className="reward-balances"><div className="reward-balance"><dt>{copy.purchased}</dt><dd>{status.purchasedHintTickets}</dd></div><div className="reward-balance"><dt>{copy.subscription}</dt><dd>{status.subscriptionHintTickets}</dd></div></dl>
   {status.enabled&&<fieldset disabled={busy} className="space-y-2"><legend>{copy.hints} / Standard / Plus</legend>{prices.map(price=>{
    const product=COMMERCE_PRODUCTS.find(item=>item.sku===price.sku)!;const subscription=price.period==='P1M';
    return <label key={price.sku} className="flex min-h-11 items-start gap-3 rounded border border-[#4A4238] p-3"><input type="radio" name="play-product" checked={selected?.sku===price.sku} disabled={status.subscriptionBlocked&&subscription} onChange={()=>{setSelected(price);setAccepted(false);}} className="mt-1 shrink-0"/><span><strong>{subscription?(price.sku==='plus_monthly'?'Plus':'Standard'):copy.hints+' × '+product.hints}</strong><span className="block">{price.price}{subscription?' / '+text('month'):''}</span><span className="block">{subscription?copy.benefits:text('once')}</span>{price.sku==='plus_monthly'&&<span className="block">{text('plus')}</span>}</span></label>;
   })}</fieldset>}
   {selected&&status.enabled&&<div className="space-y-3"><p>{selected.price} {selected.period==='P1M'?text('renewal'):text('once')}</p><details><summary className="min-h-11 cursor-pointer underline">{membership.terms}</summary><TermsDocument initialLanguage={lang}/></details><label className="flex gap-3"><input type="checkbox" checked={accepted} disabled={busy} onChange={e=>setAccepted(e.target.checked)} className="mt-1 shrink-0"/>{text('accept')}</label><button type="button" disabled={busy||!accepted} onClick={()=>void act('buy')} className="min-h-11 w-full rounded border p-3 disabled:opacity-50">{text('buy')}</button></div>}
   <button type="button" disabled={busy} onClick={()=>void act('restore')} className="min-h-11 w-full rounded border p-3 disabled:opacity-50">{text('restore')}</button>
   <button type="button" disabled={busy} onClick={()=>void manageNativeCommerce(status.sku).catch(()=>setMessage('failure'))} className="min-h-11 w-full underline">{text('manage')}</button>
   {(!status.enabled||status.enabled&&prices.length===0)&&<p>{text('failure')}</p>}
   {(message||status.deliveryPending)&&<p role="status">{text(message??'pending')}</p>}
    {balanceError&&<div className="space-y-2"><p role="status">{balanceText.balanceError}</p><button type="button" disabled={busy} onClick={()=>void recheckBalance()} className="min-h-11 w-full rounded border p-3 disabled:opacity-50">{balanceText.refresh}</button></div>}
  </>}
 </section>;
}
