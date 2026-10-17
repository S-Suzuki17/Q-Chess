'use client';
import { useEffect, useRef, useState } from 'react';
import type { Language } from '../locales/dict';
import { dict } from '../locales/dict';
import { rankedText } from '../locales/rankedText';
import {serviceText} from '../locales/serviceText';
import { matchText } from '../locales/matchText';
import { rankedStartText, rankedStartDiagnostic, rankedStartRecoveryText } from '../locales/rankedStartText';
import type { User } from '../types/game';
import type { MatchedRoom, QueueMode } from '../lib/rankedProtocol';
import { useSocket } from '../lib/SocketContext';
import { useMatchmaking } from '../hooks/useMatchmaking';
import { RankedLoginDialog } from './RankedLoginDialog';
import { OnlineMatchTermsGate } from './OnlineMatchTermsGate';
import { hasLocalTermsConsent, CURRENT_TERMS_ACCEPTED_EVENT } from '../lib/currentAccountTerms';
import { onlineMatchTermsText } from '../locales/onlineMatchTermsText';
import { isRankedLimitReason, rankedLimitText } from '../locales/rankedLimitText';

export function RankedMatchmakingManager({lang,user,onMatchFound,cancelSearchGlobally,onRequestLogin,timeControlTarget,mode}:{lang:Language;user:User|null;onMatchFound:(room:MatchedRoom)=>void;cancelSearchGlobally:()=>void;onRequestLogin:()=>void;timeControlTarget:number;mode:QueueMode}) {
    const {isSearching,matchedRoom,error,errorMessage,waitTime,startMatchmaking,cancelMatchmaking}=useMatchmaking(user);
    const {isConnected,isAuthenticated,authPending,connectionError,retryConnection}=useSocket();
    const attempted=useRef(false),delivered=useRef<string|null>(null);
    const [loginOpen,setLoginOpen]=useState(false),[retry,setRetry]=useState(0);
    const hasLocalConsent = Boolean(user && user.type === 'registered' && typeof hasLocalTermsConsent === 'function' && hasLocalTermsConsent(user.id));
    const [termsReadyId,setTermsReadyId]=useState<string|null>(() => hasLocalConsent ? user!.id : null);
    const termsRequired=user?.type==='registered'&&!user.id.startsWith('GUEST-')&&!hasLocalConsent;
    const termsReady=!termsRequired||termsReadyId===user?.id||hasLocalConsent;
    const dialog=useRef<HTMLDialogElement>(null);
    useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
    useEffect(()=>{
        const handleAccepted=(e:Event)=>{
            const detail=(e as CustomEvent<{userId:string}>).detail;
            if(user&&detail?.userId===user.id)setTermsReadyId(user.id);
        };
        window.addEventListener(CURRENT_TERMS_ACCEPTED_EVENT,handleAccepted);
        return()=>window.removeEventListener(CURRENT_TERMS_ACCEPTED_EVENT,handleAccepted);
    },[user]);
    const requiresLogin=!authPending&&!!user&&!user.id.startsWith('GUEST-')&&
        (connectionError==='AUTH_REQUIRED'||connectionError==='SESSION_REPLACED'||(!isAuthenticated&&isConnected&&!connectionError));
    useEffect(()=>{
        if(attempted.current||!termsReady||authPending||connectionError==='AUTH_UNAVAILABLE'||!isConnected||(mode==='ranked'&&!isAuthenticated)||requiresLogin)return;
        attempted.current=true;startMatchmaking(timeControlTarget,mode);
    },[termsReady,authPending,connectionError,isConnected,isAuthenticated,requiresLogin,timeControlTarget,mode,startMatchmaking,retry]);
    useEffect(()=>{
        if(matchedRoom&&delivered.current!==matchedRoom.id){delivered.current=matchedRoom.id;onMatchFound(matchedRoom);}
    },[matchedRoom,onMatchFound]);
    const cancel=()=>{cancelMatchmaking();cancelSearchGlobally();window.requestAnimationFrame(()=>
        document.querySelector<HTMLButtonElement>('.lobby-mode-grid button:nth-child('+(mode==='ranked'?1:2)+')')?.focus());};
    const retryQueue=()=>{cancelMatchmaking();attempted.current=false;if(!isConnected)retryConnection?.();setRetry(value=>value+1);};
    const authError=requiresLogin||(mode==='ranked'&&(!user||user.id.startsWith('GUEST-')))||error==='AUTH_REQUIRED'||error==='RANKED_AUTH_REQUIRED'||error==='SESSION_REPLACED';
    const limit = isRankedLimitReason(error) ? rankedLimitText(lang) : null;
    const failure = connectionError==='SESSION_REPLACED'?connectionError:error||connectionError;
    const startText = rankedStartText(lang);
    const recovery = rankedStartRecoveryText(lang,failure);
    const showTerms=!!user&&termsRequired&&!termsReady&&!authError&&!failure&&isAuthenticated&&!authPending;
    return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#11100E]/95 p-4 backdrop-blur-sm">
        <dialog ref={dialog} aria-labelledby="queue-title" onCancel={event=>{event.preventDefault();cancel();}} className="m-auto w-[min(92vw,24rem)] rounded-xl border border-[#B39A62]/30 bg-[#161513] p-[28px] max-h-[calc(100dvh-2rem)] overflow-y-auto text-center text-[#E8E2D7] backdrop:bg-[#11100E]/95">
            {showTerms&&user?<><h2 id="queue-title" className="sr-only">{onlineMatchTermsText(lang).title}</h2><OnlineMatchTermsGate user={user} lang={lang}
                onReady={()=>setTermsReadyId(user.id)} onCancel={cancel}/></>:<>
            <h2 id="queue-title" className="text-xl mb-4">{limit?limit.title:matchedRoom?matchText(lang,'対局が見つかりました','Match found'):authError?rankedText(lang,'signIn'):failure?startText.failed:dict[lang].searchingOpponent}</h2>
            {isSearching&&<p className="font-mono text-2xl mb-4">{String(Math.floor(waitTime/60000)).padStart(2,'0')}:{String(Math.floor(waitTime%60000/1000)).padStart(2,'0')}</p>}
            {(error||connectionError)&&!authError&&<p role="alert" data-queue-error-code={rankedStartDiagnostic(failure)} className="text-red-300 text-sm mb-4">{limit?limit.detail:error==='MAINTENANCE'?serviceText(lang,'maintenance'):error==='UPDATE_REQUIRED'?serviceText(lang,'update'):errorMessage||rankedText(lang,'unavailable')}</p>}
            {failure&&!authError&&!limit&&recovery&&<p className="mb-4 text-sm leading-relaxed">{recovery}</p>}
            {failure==='SESSION_REPLACED'&&authError&&<p role="alert" data-queue-error-code="SESSION_REPLACED" className="mb-4 text-sm leading-relaxed">{recovery}</p>}
            {failure&&!authError&&!limit&&<p className="mb-4 text-sm">{startText.code}: <code className="break-all">{rankedStartDiagnostic(failure)}</code></p>}
            {!isConnected&&!authError&&!connectionError&&<p role="status" className="text-sm mb-4">{rankedText(lang,'connection')}</p>}
            {authError&&<><p className="text-sm text-[#A89C86] mb-4">{rankedText(lang,'help')}</p><button className="min-h-11 w-full bg-[#B39A62] p-3 text-[#11100E] mb-3" onClick={()=>user&&!user.id.startsWith('GUEST-')?setLoginOpen(true):onRequestLogin()}>{dict[lang].login}</button></>}
            {failure&&!authError&&!limit&&!['MAINTENANCE','UPDATE_REQUIRED'].includes(failure)&&<button className="min-h-11 w-full border border-[#A89C86]/40 p-3 mb-3" onClick={retryQueue}>{matchText(lang,'再試行','Try again')}</button>}
            <button className="min-h-11 w-full border border-[#A89C86]/40 p-3" onClick={cancel}>{limit?dict[lang].home:dict[lang].cancel}</button>
            </>}
        </dialog>
        {loginOpen&&user&&<RankedLoginDialog lang={lang} userId={user.id} onCancel={()=>setLoginOpen(false)} onVerified={()=>{setLoginOpen(false);retryQueue();}}/>}
    </div>;
}
