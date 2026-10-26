'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {ArrowLeft,LoaderCircle} from 'lucide-react';
import {dict,type Language} from '../locales/dict';
import {matchWaitingText as text} from '../locales/matchWaitingText';
import {rankedRecoveryText} from '../locales/rankedRecoveryText';
import type {MatchPreparation} from '../hooks/useMatchPreparation';
import './online-match-waiting.css';

/** Presentation only. Admission, retries, cancellations and clocks remain with the match owner. */
export function OnlineMatchWaiting({lang,mode,connected,preparation,onHome,children}:{
 lang:Language;mode?:'ranked'|'random'|'private';connected:boolean;preparation:MatchPreparation|null;onHome:()=>void;children?:ReactNode;
}){
 const [delayed,setDelayed]=useState(false);
 useEffect(()=>{
  const timer=setTimeout(()=>setDelayed(true),15000);
  return()=>clearTimeout(timer);
 },[]);
 const recovery=preparation==='recovering'||preparation==='unavailable';
 const status=preparation?rankedRecoveryText(lang)[preparation]:text(lang,connected?'syncing':'connecting');
 return <section lang={lang} className="online-match-waiting" data-match-waiting={preparation??(connected?'syncing':'connecting')}>
  <header className="waiting-heading"><span>Q-GAMBIT</span><span className="waiting-mode">{text(lang,mode==='ranked'?'ranked':'online')}</span></header>
  <div className="waiting-illustration" aria-hidden="true"><div className="waiting-board">{Array.from({length:16},(_,index)=><i key={index}/>)}</div><span className="waiting-qube"><img src="/assets/qube-companion/qube-neutral.svg" alt="" width={56} height={56}/></span><span className="waiting-orbit"/></div>
  <div className="waiting-copy"><p role="status" aria-live="polite"><LoaderCircle className="waiting-spinner" size={17} aria-hidden="true"/><span className={recovery?undefined:'sr-only'}>{status}</span></p></div>
  {delayed&&<p className="waiting-delayed" role="status">{text(lang,'delayed')}</p>}
  <div className="waiting-extras">{children}</div>
  <footer><button type="button" onClick={onHome}><ArrowLeft size={16} aria-hidden="true"/>{dict[lang].home}</button></footer>
 </section>;
}
