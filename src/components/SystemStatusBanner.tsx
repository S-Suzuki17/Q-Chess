'use client';
import {useEffect,useState} from 'react';
import {matchText} from '../locales/matchText';
import type {Language} from '../locales/dict';
import {serviceText} from '../locales/serviceText';
import {gameServerUrl} from '../lib/rankedSession';
import {clientRelease} from '../lib/clientRelease';
type Status={maintenance:boolean;minimumProtocol:number;minimumAndroidBuild:number;announcement:Record<string,string>;revision:string};
export function SystemStatusBanner({lang,playing=false}:{lang:Language;playing?:boolean}){
    const [status,setStatus]=useState<Status|null>(null),[dismissed,setDismissed]=useState('');
    useEffect(()=>{
        let active=true,pending=false;const abort=new AbortController();
        const refresh=async()=>{
            if(pending||document.hidden)return;pending=true;
            try{
                const url=new URL('/service/status',gameServerUrl());
                if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))return;
                const response=await fetch(url,{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(8000)])});
                const value=response.ok?await response.json():null;
                if(active&&value&&typeof value.maintenance==='boolean'&&Number.isSafeInteger(value.minimumProtocol)&&Number.isSafeInteger(value.minimumAndroidBuild)&&value.announcement&&typeof value.announcement==='object'&&typeof value.revision==='string')setStatus(value);
            }catch{/* An offline status request must not lock offline play. */}finally{pending=false;}
        };
        try{setDismissed(sessionStorage.getItem('qg_notice_seen')??'');}catch{/* Optional read state. */}
        void refresh();const timer=setInterval(()=>void refresh(),30000);
        document.addEventListener('visibilitychange',refresh);
        return()=>{active=false;abort.abort();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
    },[]);
    if(!status||playing)return null;
    const update=clientRelease.protocol<status.minimumProtocol||(clientRelease.platform==='android'&&clientRelease.build<status.minimumAndroidBuild);
    const announcement=status.announcement[lang]??status.announcement.en??status.announcement.ja;
    const message=status.maintenance?serviceText(lang,'maintenance'):update?serviceText(lang,'update'):dismissed!==status.revision&&typeof announcement==='string'?announcement:null;
    if(!message)return null;
    const dismiss=()=>{setDismissed(status.revision);try{sessionStorage.setItem('qg_notice_seen',status.revision);}catch{/* Keep memory state. */}};
    return <aside role="status" className="fixed top-0 inset-x-0 z-[150] flex items-center justify-center gap-3 border-b border-[#B39A62]/50 bg-[#211E18] px-4 py-3 text-sm text-[#E8E2D7] shadow-xl">
        <p className="max-w-2xl">{message}</p>
        {update&&!status.maintenance&&(clientRelease.platform==='android'?<a className="min-h-11 p-3 underline" href="https://play.google.com/store/apps/details?id=com.qgambit.app" target="_blank" rel="noopener noreferrer">{serviceText(lang,'action')}</a>:<button type="button" className="min-h-11 p-3 underline" onClick={()=>window.location.reload()}>{serviceText(lang,'action')}</button>)}
        {!status.maintenance&&!update&&<button type="button" aria-label={matchText(lang,'閉じる','Close')} className="min-h-11 min-w-11 p-3" onClick={dismiss}>×</button>}
    </aside>;
}
