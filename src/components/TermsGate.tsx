'use client';
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import type {User} from '../types/game';
import type {Language} from '../locales/dict';
import {dict} from '../locales/dict';
import {termsText} from '../locales/termsText';
import {TermsDocument} from './TermsDocument';
import {AccountDeletionPanel} from './AccountDeletionPanel';
import {currentAccountTermsStatus,acceptCurrentAccountTerms} from '../lib/currentAccountTerms';
import {PUBLIC_SUPPORT_EMAIL} from '../config/publicContact';

type Status='loading'|'needed'|'accepted'|'error'|'updated';
interface TermsRequest{identity:string;controller:AbortController;ready:boolean}

/** Registered consent stays account-scoped; guest practice needs no acceptance. */
export function TermsGate({user,lang,playing,children,onExit,onReady}:{user:User|null;lang:Language;playing:boolean;children?:ReactNode;onExit:()=>void;onReady:(id:string)=>void}){
    const identity=user?`${user.type}:${user.id}`:'none',id=user?.id,type=user?.type;
    const [state,setState]=useState<{identity:string;status:Status}>(()=>({identity,status:'loading'}));
    const [checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
    const owner=useRef(identity),request=useRef<TermsRequest|null>(null),pending=useRef<TermsRequest|null>(null),ready=useRef(onReady);
    const text=termsText(lang),status=state.identity===identity?state.status:'loading';
    const active=(scope:TermsRequest)=>request.current===scope&&owner.current===scope.identity&&!scope.controller.signal.aborted;
    const complete=(scope:TermsRequest,userId:string)=>{
        if(!active(scope)||scope.ready)return;
        scope.ready=true;setState({identity:scope.identity,status:'accepted'});ready.current(userId);
    };
    useLayoutEffect(()=>{
        owner.current=identity;ready.current=onReady;
        if(request.current&&request.current.identity!==identity){request.current.controller.abort();request.current=null;pending.current=null;}
    },[identity,onReady]);
    useEffect(()=>{
        request.current?.controller.abort();request.current=null;pending.current=null;
        setChecked(false);setBusy(false);setState({identity,status:'loading'});
        if(!id)return;
        const scope:TermsRequest={identity,controller:new AbortController(),ready:false};request.current=scope;
        if(type==='guest')complete(scope,id);
        else void currentAccountTermsStatus(id,scope.controller.signal).then(value=>{
            if(!active(scope))return;
            if(value.accepted)complete(scope,id);
            else setState({identity,status:value.effective?'needed':'updated'});
        }).catch(error=>{if(active(scope))setState({identity,status:error?.message==='TERMS_UPDATED'?'updated':'error'});});
        return()=>{scope.controller.abort();if(request.current===scope)request.current=null;if(pending.current===scope)pending.current=null;};
    },[identity,id,type,retry]);
    const accept=async()=>{
        const scope=request.current;
        if(user?.type!=='registered'||!scope||!active(scope)||!checked||status!=='needed'||pending.current)return;
        pending.current=scope;setBusy(true);
        try{
            await acceptCurrentAccountTerms(user.id,scope.controller.signal);
            complete(scope,user.id);
        }catch(error){if(active(scope))setState({identity:scope.identity,status:error instanceof Error&&error.message==='TERMS_UPDATED'?'updated':'error'});}
        finally{if(pending.current===scope)pending.current=null;if(active(scope))setBusy(false);}
    };
    const exit=()=>{request.current?.controller.abort();request.current=null;pending.current=null;onExit();};
    if(!user||user.type==='guest'||playing||status==='accepted')return children;
    // A pending check is not a request for consent. In particular, do not flash
    // the document on every reload while the account's saved consent is fetched.
    // Keep access closed until that response; a local cache is not authorization.
    if(status==='loading')return <main data-terms-loading aria-busy="true" className="flex h-[100dvh] items-center justify-center bg-[#11100E] px-5 text-[#E8E2D7]">
        <div className="w-full max-w-sm space-y-6 text-center">
            <h1 className="text-2xl font-semibold tracking-widest">Q-GAMBIT</h1>
            <p role="status" className="text-sm text-[#A89C86]">{dict[lang].loading}</p>
            <button type="button" onClick={exit} className="min-h-11 px-6 underline">{dict[lang].back}</button>
        </div>
    </main>;
    return <main data-terms-gate className="h-[100dvh] overflow-y-auto bg-[#11100E] px-5 py-8 text-[#E8E2D7]"><div className="mx-auto max-w-3xl space-y-6 pb-16">
        <h1 className="text-2xl font-semibold">{status==='needed'?text[0]:'Q-GAMBIT'}</h1>
        {status==='needed'&&<>
            <p>{text[7]}</p>
            <TermsDocument initialLanguage={lang}/>
            <a href="https://q-gambit.com/privacy/" target="_blank" rel="noopener noreferrer" className="inline-block underline">{dict[lang].privacyPolicy}</a>
        </>}
        {(status==='error'||status==='updated')&&<div role="alert"><p>{text[status==='updated'?8:5]}</p><button onClick={()=>setRetry(n=>n+1)} className="my-3 min-h-11 border p-3">{text[6]}</button></div>}
        {status==='needed'&&<form onSubmit={event=>{event.preventDefault();void accept();}} className="space-y-4 rounded border border-[#A89C86]/40 p-4">
            <label className="flex gap-3"><input type="checkbox" data-terms-checkbox checked={checked} disabled={busy} onChange={event=>setChecked(event.target.checked)} className="mt-1 h-5 w-5 shrink-0"/><span>{text[1]}</span></label>
            <button data-terms-accept type="submit" disabled={!checked||busy} className="min-h-11 w-full bg-[#D4B872] p-3 font-semibold text-[#11100E] disabled:opacity-40">{text[2]}</button>
        </form>}
        <button type="button" disabled={busy} onClick={exit} className="min-h-11 w-full border border-[#A89C86]/40 p-3">{status==='needed'?text[3]:dict[lang].back}</button>
        <a href={`mailto:${PUBLIC_SUPPORT_EMAIL}`} className="block break-all underline">{PUBLIC_SUPPORT_EMAIL}</a>
        {user.type==='registered'&&<AccountDeletionPanel userId={user.id} lang={lang} onDeleted={exit}/>}
    </div></main>;
}
