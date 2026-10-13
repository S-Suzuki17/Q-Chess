'use client';
import {useEffect,useRef,useState} from 'react';
import {isAndroidApp,nativeAds,type AdPrivacyRequirement} from '../lib/nativeAds';
import {nativeRewardText} from '../locales/nativeRewardText';
/** Privacy access is independent of account, entitlement and reward offer flags. */
export function NativeAdPrivacySettings({lang,locked}:{lang:string;locked:boolean}){
 const text=nativeRewardText(lang),[available,setAvailable]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),operation=useRef(false);
 const [requirement,setRequirement]=useState<AdPrivacyRequirement>('UNKNOWN');
 useEffect(()=>{let current=true;const android=isAndroidApp();setAvailable(android);if(android)void nativeAds.privacyRequirement().then(value=>{if(current)setRequirement(value);});return()=>{current=false;};},[]);
 const open=async()=>{
  if(locked||operation.current)return;operation.current=true;setBusy(true);setFailed(false);
  try{const result=await nativeAds.privacy();if(result==='not-required')setRequirement('NOT_REQUIRED');else if(result==='opened')setRequirement('REQUIRED');else setFailed(true);}finally{operation.current=false;setBusy(false);}
 };
 if(!available||requirement==='NOT_REQUIRED')return null;
 return <section data-ad-privacy-settings data-privacy-requirement={requirement} className="min-w-0 space-y-2 pt-3">
  <button type="button" disabled={locked||busy} aria-busy={busy} className="block min-h-11 w-full break-words rounded border border-[#4A4238] p-3" onClick={()=>void open()}>{text.privacy}</button>
  <p role="status" className="text-sm">{failed?text.privacyError:''}</p>
 </section>;
}
