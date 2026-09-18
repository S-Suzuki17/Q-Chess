'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { dict, type Language } from '../locales/dict';
import { rankedText } from '../locales/rankedText';
import { requestRankedSession } from '../lib/rankedSession';

export function RankedLoginDialog({lang,userId,onCancel,onVerified,title}:{lang:Language;userId:string;onCancel:()=>void;onVerified:()=>void;title?:string}) {
    const text={...dict.en,...dict[lang]};
    const dialog=useRef<HTMLDialogElement>(null),request=useRef<AbortController|null>(null),mounted=useRef(false);
    const [password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(false);
    useEffect(()=>{mounted.current=true;const node=dialog.current;node?.showModal();return()=>{mounted.current=false;request.current?.abort();node?.close();};},[userId]);
    const submit=async(event:FormEvent)=>{
        event.preventDefault();if(busy||!password)return;
        const controller=new AbortController();request.current=controller;
        const timeout=setTimeout(()=>controller.abort(),10000);
        setBusy(true);setError(false);
        try{await requestRankedSession(userId,password,controller.signal);if(mounted.current){setPassword('');onVerified();}}
        catch{if(mounted.current){setPassword('');setError(true);}}
        finally{clearTimeout(timeout);if(mounted.current)setBusy(false);}
    };
    return <dialog ref={dialog} aria-labelledby="ranked-login-title" aria-describedby="ranked-login-help" onCancel={event=>{event.preventDefault();onCancel();}}
        className="m-auto w-[min(92vw,420px)] border border-[#B39A62]/50 bg-[#161513] p-6 text-[#E8E2D7] backdrop:bg-black/80">
        <h2 id="ranked-login-title" className="text-lg mb-3">{title ?? rankedText(lang,'signIn')}</h2>
        <p id="ranked-login-help" className="text-sm text-[#A89C86] mb-5">{rankedText(lang,'help')}</p>
        <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="text-sm">ID<input className="block w-full border border-[#A89C86]/40 bg-[#11100E] p-3" name="username" autoComplete="username" value={userId} readOnly/></label>
            <label className="text-sm">{text.password}<input className="block w-full border border-[#A89C86]/40 bg-[#11100E] p-3" autoFocus name="password" type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)} disabled={busy}/></label>
            {error&&<p role="alert" className="text-sm text-red-300">{rankedText(lang,'failed')}</p>}
            <button type="submit" disabled={busy||!password} className="min-h-11 bg-[#B39A62] p-3 text-[#11100E] disabled:opacity-50">{busy?'…':dict[lang].login}</button>
            <button type="button" onClick={onCancel} className="min-h-11 border border-[#A89C86]/40 p-3">{dict[lang].cancel}</button>
        </form>
    </dialog>;
}
