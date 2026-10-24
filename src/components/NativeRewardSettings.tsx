'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {subscribeAdEntitlement} from '../lib/sharedAdEligibility';
import {nativeRewardsEnabled,readRewardBalance,watchNativeReward,type RewardKind} from '../lib/nativeRewards';
import {nativeRewardText,type NativeRewardTextKey} from '../locales/nativeRewardText';

/** Available outside matches only. Disabled until backend, consent and device QA pass. */
export function NativeRewardSettings({userId,lang,locked}:{userId:string;lang:string;locked:boolean}){
 const enabled=useSyncExternalStore(subscribeAdEntitlement,()=>nativeRewardsEnabled(userId),()=>false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState<NativeRewardTextKey|null>(null);
 const [balance,setBalance]=useState<Record<RewardKind,number>|null>(null);
 const [balanceError,setBalanceError]=useState(false);
 const operation=useRef(false),generation=useRef(0);
 const text=nativeRewardText(lang);
 useEffect(()=>{
  ++generation.current;setBalance(null);setBalanceError(false);setMessage(null);setBusy(operation.current);
  return()=>{generation.current++;};
 },[userId,locked]);
 useEffect(()=>{
  let current=true;const version=generation.current;
  if(enabled&&!locked)void readRewardBalance(userId).then(value=>{if(current&&generation.current===version){setBalance(value);setBalanceError(false);}}).catch(()=>{if(current&&generation.current===version)setBalanceError(true);});
  return()=>{current=false;};
 },[enabled,userId,locked]);
 const refresh=async(version:number)=>{
  try{
   const value=await readRewardBalance(userId);
   if(generation.current===version){setBalance(value);setBalanceError(false);}
  }catch{if(generation.current===version)setBalanceError(true);}
 };
 const recheck=async()=>{
  if(operation.current||locked)return;operation.current=true;setBusy(true);
  try{await refresh(generation.current);}finally{operation.current=false;setBusy(false);}
 };
 const watch=async(kind:RewardKind)=>{
  if(operation.current||locked)return;operation.current=true;setBusy(true);const version=generation.current;
  try{
   const result=await watchNativeReward(userId,kind);
   if(generation.current!==version)return;
   setMessage(result);
   // Refresh failure must not erase the confirmed/pending viewing outcome.
   await refresh(version);
  }catch{if(generation.current===version)setMessage('balanceError');}
  finally{operation.current=false;setBusy(false);}
 };
 if(!enabled||locked)return null;
 return <section data-native-reward-settings className="mt-4 min-w-0 border-t border-[#4A4238] pt-4 space-y-3" aria-busy={busy}>
  <h3>{text.title}</h3>
  {(['hint','online'] as const).map(kind=><button type="button" className="block w-full rounded border border-[#4A4238] p-3 disabled:opacity-50" key={kind} disabled={busy||balance===null} onClick={()=>void watch(kind)}>
   <span className="block">{text[kind]} · {balance?.[kind]??'—'}</span><span className="mt-1 block">{text.offer}</span>
  </button>)}
  <button type="button" className="min-h-11 break-words" disabled={busy} onClick={()=>void recheck()}>{text.refresh}</button>
  {balanceError?<p role="status" className="text-sm">{text.balanceError}</p>:null}
  <p role="status" className="text-sm">{message?text[message]:''}</p>
 </section>;
}
