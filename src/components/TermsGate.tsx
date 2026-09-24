'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {User} from '../types/game';
import type {Language} from '../locales/dict';
import {dict} from '../locales/dict';
import {termsText} from '../locales/termsText';
import {TermsDocument} from './TermsDocument';
import {AccountDeletionPanel} from './AccountDeletionPanel';
import {accountTermsStatus,acceptAccountTerms} from '../lib/accountTerms';
import {TERMS_VERSION} from '../config/terms';
import {PUBLIC_SUPPORT_EMAIL} from '../config/publicContact';

/** Consent is account-scoped. The old Play protocol remains supported until its rollout gate. */
export function TermsGate({user,lang,playing,children,onExit,onReady}:{user:User|null;lang:Language;playing:boolean;children:ReactNode;onExit:()=>void;onReady:(id:string)=>void}){
    const [status,setStatus]=useState<'loading'|'needed'|'accepted'|'error'|'updated'>('loading');
    const [checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
    const alive=useRef(false),pending=useRef(false),ready=useRef(onReady);ready.current=onReady;
    const text=termsText(lang),id=user?.id;
    useEffect(()=>{
        alive.current=true;let active=true;setChecked(false);setStatus('loading');
        if(!user)return()=>{alive.current=false;};
        if(user.type!=='registered'){
            let accepted=false;try{accepted=localStorage.getItem('qg_guest_terms')===TERMS_VERSION;}catch{}
            setStatus(accepted?'accepted':'needed');if(accepted)ready.current(user.id);
        }else void accountTermsStatus(user.id).then(accepted=>{if(active){setStatus(accepted?'accepted':'needed');if(accepted)ready.current(user.id);}}).catch(error=>{if(active)setStatus(error?.message==='TERMS_UPDATED'?'updated':'error');});
        return()=>{active=false;alive.current=false;};
    },[id,user?.type,retry]);
    const accept=async()=>{
        if(!user||!checked||status!=='needed'||pending.current)return;
        pending.current=true;setBusy(true);
        try{
            if(user.type==='registered')await acceptAccountTerms(user.id);
            else try{localStorage.setItem('qg_guest_terms',TERMS_VERSION);}catch{/* Session consent still works. */}
            if(alive.current){setStatus('accepted');ready.current(user.id);}
        }catch(error){if(alive.current)setStatus(error instanceof Error&&error.message==='TERMS_UPDATED'?'updated':'error');}
        finally{pending.current=false;if(alive.current)setBusy(false);}
    };
    if(!user||playing||status==='accepted')return children;
    return <main data-terms-gate className="h-[100dvh] overflow-y-auto bg-[#11100E] px-5 py-8 text-[#E8E2D7]"><div className="mx-auto max-w-3xl space-y-6 pb-16">
        <h1 className="text-2xl font-semibold">{text[0]}</h1><p>{text[7]}</p>
        <TermsDocument initialLanguage={lang}/>
        <a href="https://q-gambit.com/privacy/" target="_blank" rel="noopener noreferrer" className="inline-block underline">{dict[lang].privacyPolicy}</a>
        {status==='loading'&&<p role="status">{text[4]}</p>}
        {(status==='error'||status==='updated')&&<div role="alert"><p>{text[status==='updated'?8:5]}</p><button onClick={()=>setRetry(n=>n+1)} className="my-3 min-h-11 border p-3">{text[6]}</button></div>}
        {status==='needed'&&<form onSubmit={event=>{event.preventDefault();void accept();}} className="space-y-4 rounded border border-[#A89C86]/40 p-4">
            <label className="flex gap-3"><input type="checkbox" data-terms-checkbox checked={checked} disabled={busy} onChange={event=>setChecked(event.target.checked)} className="mt-1 h-5 w-5 shrink-0"/><span>{text[1]}</span></label>
            <button data-terms-accept type="submit" disabled={!checked||busy} className="min-h-11 w-full bg-[#D4B872] p-3 font-semibold text-[#11100E] disabled:opacity-40">{text[2]}</button>
        </form>}
        <button type="button" disabled={busy} onClick={onExit} className="min-h-11 w-full border border-[#A89C86]/40 p-3">{text[3]}</button>
        <a href={`mailto:${PUBLIC_SUPPORT_EMAIL}`} className="block break-all underline">{PUBLIC_SUPPORT_EMAIL}</a>
        {user.type==='registered'&&<AccountDeletionPanel userId={user.id} lang={lang} onDeleted={onExit}/>}
    </div></main>;
}
