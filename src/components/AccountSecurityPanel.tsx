'use client';
import {useEffect,useRef,useState} from 'react';
import {revokeAllAccountSessions} from '../lib/accountSecurity';
import {accountSecurityText} from '../locales/accountSecurityText';
import {dict,type Language} from '../locales/dict';
export function AccountSecurityPanel({userId,lang,onSignedOut}:{userId:string;lang:Language;onSignedOut:()=>void}){
    const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
    const pending=useRef(false),alive=useRef(false);
    useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
    const text=(key:Parameters<typeof accountSecurityText>[1])=>accountSecurityText(lang,key);
    const logout=async()=>{
        if(pending.current)return;pending.current=true;setBusy(true);setNotice('');
        try{await revokeAllAccountSessions(userId);if(alive.current)onSignedOut();}
        catch{if(alive.current)setNotice(text('failed'));}
        finally{pending.current=false;if(alive.current)setBusy(false);}
    };
    const copy=async()=>{try{await navigator.clipboard.writeText(userId);if(alive.current)setNotice(text('copied'));}catch{if(alive.current)setNotice(`ID: ${userId}`);}};
    return <section className="mt-4 space-y-3 text-sm" aria-label={text('logoutAll')}>
        <button type="button" onClick={()=>void copy()} className="w-full border border-[#A89C86]/40 p-3">{text('copy')}</button>
        {confirm?<><p>{text('explain')}</p><button type="button" disabled={busy} onClick={()=>void logout()} className="border border-[#A89C86]/40 p-3">{text('confirm')}</button><button type="button" disabled={busy} onClick={()=>setConfirm(false)} className="p-3">{dict[lang].cancel}</button></>
            :<button type="button" onClick={()=>{setNotice('');setConfirm(true);}} className="w-full border border-[#A89C86]/40 p-3">{text('logoutAll')}</button>}
        {notice&&<p role="status">{notice}</p>}
    </section>;
}
