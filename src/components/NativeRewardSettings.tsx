'use client';
import {useEffect,useRef,useState} from 'react';
import {nativeRewardsEnabled,readRewardBalance,watchNativeReward,type RewardKind} from '../lib/nativeRewards';
import {nativeAds} from '../lib/nativeAds';

/** Available outside matches only. Disabled until backend, consent and device QA pass. */
export function NativeRewardSettings({userId,lang,locked}:{userId:string;lang:string;locked:boolean}){
 const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [balance,setBalance]=useState<Record<RewardKind,number>|null>(null);
 const [balanceError,setBalanceError]=useState(false);
 const operation=useRef(false),generation=useRef(0);
 const ja=lang==='ja';
 useEffect(()=>{
  const version=++generation.current;const allowed=nativeRewardsEnabled();setEnabled(allowed);setBalance(null);setBalanceError(false);setMessage('');setBusy(operation.current);
  if(allowed&&!locked)void readRewardBalance(userId).then(value=>{if(generation.current===version)setBalance(value);}).catch(()=>{if(generation.current===version)setBalanceError(true);});
  return()=>{generation.current++;};
 },[userId,locked]);
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
 const privacy=async()=>{
  if(operation.current||locked)return;operation.current=true;setBusy(true);const version=generation.current;
  try{
   if(!await nativeAds.privacy()&&generation.current===version)setMessage(ja?'現在プライバシー設定を開けません。後でもう一度お試しください。':'Privacy choices are currently unavailable. Try again later.');
  }finally{operation.current=false;setBusy(false);}
 };
 const watch=async(kind:RewardKind)=>{
  if(operation.current||locked)return;operation.current=true;setBusy(true);const version=generation.current;
  try{
   const result=await watchNativeReward(userId,kind);
   if(generation.current!==version)return;
   setMessage(result==='credited'?(ja?'3回追加しました':'3 uses added'):result==='pending'?(ja?'視聴を確認中です。再視聴は不要です。後ほど残り回数を再確認してください。':'Verification pending. No need to watch again; refresh your balance later.'):result==='cancelled'?(ja?'視聴を中断しました。回数は変わりません。':'Cancelled. Balance unchanged.'):result==='busy'?(ja?'別の広告処理が進行中です。少し待ってからお試しください。':'Another ad request is in progress. Please wait.'):(ja?'現在広告を利用できません。':'Ads are currently unavailable.'));
   // Refresh failure must not erase the confirmed/pending viewing outcome.
   await refresh(version);
  }catch{if(generation.current===version)setMessage(ja?'回数を確認できません。後でもう一度お試しください。':'Unable to refresh balance. Try again later.');}
  finally{operation.current=false;setBusy(false);}
 };
 if(!enabled||locked)return null;
 return <section className="mt-4 border-t border-[#4A4238] pt-4 space-y-3" aria-busy={busy}>
  <h3>{ja?'広告視聴で回数を追加':'Watch an ad for extra uses'}</h3>
  {(['hint','online'] as const).map(kind=><button type="button" className="block w-full rounded border border-[#4A4238] p-3 disabled:opacity-50" key={kind} disabled={busy||balance===null} onClick={()=>void watch(kind)}>
   {kind==='hint'?(ja?'ヒント':'Hints'):(ja?'オンライン対局':'Online matches')} · {balance?.[kind]??'—'} · {ja?'広告を1回視聴して＋3回':'Watch one ad: +3 uses'}
  </button>)}
  <button type="button" disabled={busy} onClick={()=>void recheck()}>{ja?'残り回数を再確認':'Refresh balance'}</button>
  {balanceError?<p role="status" className="text-sm">{ja?'残り回数を更新できませんでした。通信を確認して再確認してください。':'Could not update balance. Check your connection and refresh.'}</p>:null}
  <button type="button" disabled={busy} onClick={()=>void privacy()}>{ja?'広告のプライバシー設定':'Ad privacy choices'}</button>
  <p role="status" className="text-sm">{message}</p>
 </section>;
}
