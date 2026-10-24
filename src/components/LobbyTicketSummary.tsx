'use client';
import {useEffect,useState} from 'react';
import {Ticket,Lightbulb} from 'lucide-react';
import type {User} from '../types/game';
import type {Language} from '../locales/dict';
import {DAILY_LOGIN_REWARDS_ENABLED,DAILY_LOGIN_REWARD_CHANGED_EVENT,readDailyLoginStatus,type DailyTicketAmounts} from '../lib/dailyLoginRewards';
import {ticketWalletText} from '../locales/ticketWalletText';
import {useCircuitAccess} from '../hooks/useCircuitAccess';
import {RANKED_SESSION_EVENT} from '../lib/rankedSession';

/** Only verified free stock, clearly labelled; unknown/off is never invented zero. */
export function LobbyTicketSummary({user,lang,allowed}:{user:User;lang:Language;allowed:boolean}){
 const {revision}=useCircuitAccess(user);
 const[loaded,setLoaded]=useState<{userId:string;revision:number;tickets:DailyTicketAmounts}|null>(null);
 useEffect(()=>{
  if(!DAILY_LOGIN_REWARDS_ENABLED||!allowed||user.type!=='registered')return;
  let request:AbortController|null=null,alive=true;
  const refresh=()=>{
   request?.abort();request=new AbortController();const current=request;
   void readDailyLoginStatus(user.id,current.signal).then(status=>{
    if(alive&&!current.signal.aborted)setLoaded({userId:status.userId,revision,tickets:status.tickets});
   }).catch(()=>{if(alive&&!current.signal.aborted)setLoaded(null);});
  };
  const changed=(event:Event)=>{
   const detail=(event as CustomEvent<{userId?:string;status?:{userId:string;tickets:DailyTicketAmounts}}>).detail;
   if(detail?.status?.userId===user.id&&detail.status.tickets){
    request?.abort();
    setLoaded({userId:user.id,revision,tickets:detail.status.tickets});
    return;
   }
   if(!detail?.userId||detail.userId===user.id)refresh();
  };
  const reauthenticated=()=>{setLoaded(null);refresh();};
  const visible=()=>{if(document.visibilityState==='visible')refresh();};
  refresh();window.addEventListener(DAILY_LOGIN_REWARD_CHANGED_EVENT,changed);
  window.addEventListener(RANKED_SESSION_EVENT,reauthenticated);
  window.addEventListener('online',refresh);window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
  return()=>{
   alive=false;request?.abort();window.removeEventListener(DAILY_LOGIN_REWARD_CHANGED_EVENT,changed);
   window.removeEventListener(RANKED_SESSION_EVENT,reauthenticated);
   window.removeEventListener('online',refresh);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);
  };
 },[user.id,user.type,allowed,revision]);
 const tickets=user.type==='registered'&&allowed&&DAILY_LOGIN_REWARDS_ENABLED&&loaded?.userId===user.id&&loaded.revision===revision?loaded.tickets:null;
 return <div className="lobby-ticket-summary" aria-label={ticketWalletText(lang).free} title={ticketWalletText(lang).free}>
  <small>{lang==='ja'?'無料券':ticketWalletText(lang).free}</small>
  <span><span aria-label={lang==='ja'?'対局券':'Match tickets'}><Ticket size={15} aria-hidden="true"/><b data-free-match-tickets>{tickets?.ranked??'—'}</b></span><span aria-label={lang==='ja'?'ヒント券':'Hint tickets'}><Lightbulb size={15} aria-hidden="true"/><b data-free-hint-tickets>{tickets?.hint??'—'}</b></span></span>
 </div>;
}
