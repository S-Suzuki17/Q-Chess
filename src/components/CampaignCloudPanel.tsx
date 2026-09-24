'use client';
import {useState} from 'react';
import type {Language} from '../locales/dict';
import {dict} from '../locales/dict';
import {cloudText} from '../locales/cloudText';
import {campaignStore} from '../lib/campaignStore';
import type {SyncState} from '../lib/campaignSync';
export function CampaignCloudPanel({lang,cloud,locked}:{lang:Language;cloud:{userId:string|null;state:SyncState;retry:()=>void};locked:boolean}){
    const [confirm,setConfirm]=useState(false),[failed,setFailed]=useState(false);
    if(!cloud.userId)return null;
    const id=cloud.userId;
    const claim=()=>{if(campaignStore.getOwner()!==id||locked)return;const ok=campaignStore.importLegacy();setFailed(!ok);setConfirm(false);if(ok)cloud.retry();};
    return <section className="my-4 space-y-3 border-t border-[#4A4238] pt-4 text-sm text-[#E8E2D7]">
        <h3 className="font-bold">{cloudText(lang,'title')}</h3><p role="status">{cloudText(lang,cloud.state)}</p>
        <button type="button" disabled={cloud.state==='loading'||locked} onClick={cloud.retry} className="min-h-11 border border-[#A89C86]/40 p-3 disabled:opacity-50">{cloudText(lang,'retry')}</button>
        {!locked&&campaignStore.hasLegacyProgress()&&(confirm?<div><p>{cloudText(lang,'confirm')}</p><p className="my-2 break-all font-mono">ID: {id}</p><button type="button" onClick={claim} className="min-h-11 border p-3">{cloudText(lang,'import')}</button><button type="button" onClick={()=>setConfirm(false)} className="min-h-11 p-3">{dict[lang].cancel}</button></div>:<button type="button" onClick={()=>setConfirm(true)} className="block min-h-11 underline">{cloudText(lang,'legacy')}</button>)}
        {failed&&<p role="alert">{cloudText(lang,'error')}</p>}
    </section>;
}
