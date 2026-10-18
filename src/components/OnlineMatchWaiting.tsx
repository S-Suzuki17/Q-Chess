'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {ArrowLeft,Check,Clock3,LoaderCircle,Wifi} from 'lucide-react';
import {dict,type Language} from '../locales/dict';
import {matchWaitingText as text} from '../locales/matchWaitingText';
import {rankedRecoveryText} from '../locales/rankedRecoveryText';
import type {MatchPreparation} from '../hooks/useMatchPreparation';
import './online-match-waiting.css';

/** Presentation only. Admission, retries, cancellations and clocks remain with the match owner. */
export function OnlineMatchWaiting({lang,mode,connected,preparation,onHome,children}:{
 lang:Language;mode?:'ranked'|'random'|'private';connected:boolean;preparation:MatchPreparation|null;onHome:()=>void;children?:ReactNode;
}){
 const [seconds,setSeconds]=useState(0);
 useEffect(()=>{
  const started=Date.now();let timer:ReturnType<typeof setInterval>|undefined;
  const tick=()=>setSeconds(Math.max(0,Math.floor((Date.now()-started)/1000)));
  const resume=()=>{clearInterval(timer);tick();if(!document.hidden)timer=setInterval(tick,1000);};
  resume();document.addEventListener('visibilitychange',resume);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',resume);};
 },[]);
 const recovery=preparation==='recovering'||preparation==='unavailable'||preparation==='checking';
 const status=preparation?rankedRecoveryText(lang)[preparation]:text(lang,connected?'syncing':'connecting');
 const elapsed=`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
 return <section lang={lang} className="online-match-waiting" data-match-waiting={preparation??(connected?'syncing':'connecting')}>
  <header className="waiting-heading"><span>Q-GAMBIT</span><span className="waiting-mode">{text(lang,mode==='ranked'?'ranked':'online')}</span></header>
  <div className="waiting-illustration" aria-hidden="true"><div className="waiting-board">{Array.from({length:16},(_,index)=><i key={index}/>)}</div><span className="waiting-qube"><img src="/assets/qube-companion/qube-neutral.svg" alt="" width={56} height={56}/></span><span className="waiting-orbit"/></div>
  <div className="waiting-copy"><h2>{text(lang,recovery?'recovery':'title')}</h2><p role="status" aria-live="polite"><LoaderCircle className="waiting-spinner" size={17} aria-hidden="true"/><span>{status}</span></p></div>
  <ol className="waiting-steps">
   <li data-complete={connected} aria-current={!connected?'step':undefined}><span className="waiting-step-icon" aria-hidden="true">{connected?<Check size={17}/>:<Wifi size={17}/>}</span><span>{text(lang,'connection')}</span><small>{text(lang,connected?'connected':'pending')}</small></li>
   <li aria-current={connected?'step':undefined}><span className="waiting-step-icon" aria-hidden="true"><LoaderCircle className={connected?'waiting-spinner':undefined} size={17}/></span><span>{text(lang,'match')}</span><small>{text(lang,'pending')}</small></li>
  </ol>
  <div className="waiting-elapsed" aria-hidden="true"><Clock3 size={14}/><span>{text(lang,'elapsed')}</span><time>{elapsed}</time></div>
  {seconds>=15?<p className="waiting-delayed" role="status">{text(lang,'delayed')}</p>:<p className="waiting-help">{text(lang,'automatic')}</p>}
  <div className="waiting-extras">{children}</div>
  <footer><button type="button" onClick={onHome}><ArrowLeft size={16} aria-hidden="true"/>{dict[lang].home}</button></footer>
 </section>;
}
