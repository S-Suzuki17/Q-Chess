'use client';
import { useEffect, useRef, useState } from 'react';
import type { Language } from '../locales/dict';
import { dict } from '../locales/dict';
import { rankedText } from '../locales/rankedText';
import {serviceText} from '../locales/serviceText';
import { matchText } from '../locales/matchText';
import type { User } from '../types/game';
import type { MatchedRoom, QueueMode } from '../lib/rankedProtocol';
import { useSocket } from '../lib/SocketContext';
import { useMatchmaking } from '../hooks/useMatchmaking';
import { RankedLoginDialog } from './RankedLoginDialog';

export function RankedMatchmakingManager({lang,user,onMatchFound,cancelSearchGlobally,onRequestLogin,timeControlTarget,mode}:{lang:Language;user:User|null;onMatchFound:(room:MatchedRoom)=>void;cancelSearchGlobally:()=>void;onRequestLogin:()=>void;timeControlTarget:number;mode:QueueMode}) {
    const {isSearching,matchedRoom,error,errorMessage,waitTime,clockNow,cpuFallbackAt,startMatchmaking,cancelMatchmaking}=useMatchmaking(user);
    const {isConnected,isAuthenticated,authPending,connectionError}=useSocket();
    const attempted=useRef(false),delivered=useRef<string|null>(null);
    const [loginOpen,setLoginOpen]=useState(false),[retry,setRetry]=useState(0);
    const dialog=useRef<HTMLDialogElement>(null);
    useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
    const requiresLogin=!authPending&&!!user&&!user.id.startsWith('GUEST-')&&(!isAuthenticated||connectionError==='AUTH_REQUIRED');
    useEffect(()=>{
        if(attempted.current||authPending||!isConnected||(mode==='ranked'&&!isAuthenticated)||requiresLogin)return;
        attempted.current=true;startMatchmaking(timeControlTarget,mode);
    },[authPending,isConnected,isAuthenticated,requiresLogin,timeControlTarget,mode,startMatchmaking,retry]);
    useEffect(()=>{
        if(matchedRoom&&delivered.current!==matchedRoom.id){delivered.current=matchedRoom.id;onMatchFound(matchedRoom);}
    },[matchedRoom,onMatchFound]);
    const cancel=()=>{cancelMatchmaking();cancelSearchGlobally();};
    const retryQueue=()=>{cancelMatchmaking();attempted.current=false;setRetry(value=>value+1);};
    const seconds=cpuFallbackAt===null?null:Math.max(0,Math.ceil((cpuFallbackAt-clockNow)/1000));
    const authError=requiresLogin||(mode==='ranked'&&(!user||user.id.startsWith('GUEST-')))||error==='AUTH_REQUIRED'||error==='RANKED_AUTH_REQUIRED';
    return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#11100E]/95 p-4 backdrop-blur-sm">
        <dialog ref={dialog} aria-labelledby="queue-title" onCancel={event=>{event.preventDefault();cancel();}} className="m-auto w-[min(92vw,384px)] rounded-xl border border-[#B39A62]/30 bg-[#161513] p-7 text-center text-[#E8E2D7] backdrop:bg-[#11100E]/95">
            <h2 id="queue-title" className="text-xl mb-4">{matchedRoom?matchText(lang,'対局が見つかりました','Match found'):authError?rankedText(lang,'signIn'):dict[lang].searchingOpponent}</h2>
            {isSearching&&<p className="font-mono text-2xl mb-4">{String(Math.floor(waitTime/60000)).padStart(2,'0')}:{String(Math.floor(waitTime%60000/1000)).padStart(2,'0')}</p>}
            {mode==='ranked'&&cpuFallbackAt!==null&&!authError&&<p className="text-sm text-[#A89C86] mb-4">{rankedText(lang,'fallback')}</p>}
            {mode==='ranked'&&isSearching&&seconds!==null&&<p className="text-sm mb-4">{seconds>0?`${seconds}s`:rankedText(lang,'preparing')}</p>}
            {(error||connectionError)&&!authError&&<p role="alert" className="text-red-300 text-sm mb-4">{error==='MAINTENANCE'?serviceText(lang,'maintenance'):error==='UPDATE_REQUIRED'?serviceText(lang,'update'):errorMessage||rankedText(lang,'unavailable')}</p>}
            {!isConnected&&!authError&&!connectionError&&<p role="status" className="text-sm mb-4">{rankedText(lang,'connection')}</p>}
            {authError&&<><p className="text-sm text-[#A89C86] mb-4">{rankedText(lang,'help')}</p><button className="min-h-11 w-full bg-[#B39A62] p-3 text-[#11100E] mb-3" onClick={()=>user&&!user.id.startsWith('GUEST-')?setLoginOpen(true):onRequestLogin()}>{dict[lang].login}</button></>}
            {error&&!authError&&isConnected&&<button className="min-h-11 w-full border border-[#A89C86]/40 p-3 mb-3" onClick={retryQueue}>{matchText(lang,'再試行','Try again')}</button>}
            <button className="min-h-11 w-full border border-[#A89C86]/40 p-3" onClick={cancel}>{dict[lang].cancel}</button>
        </dialog>
        {loginOpen&&user&&<RankedLoginDialog lang={lang} userId={user.id} onCancel={()=>setLoginOpen(false)} onVerified={()=>{setLoginOpen(false);retryQueue();}}/>}
    </div>;
}
