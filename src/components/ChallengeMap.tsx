'use client';
import {useEffect,useId,useRef,useState,type CSSProperties} from 'react';
import {ArrowLeft,ArrowRight,ArrowUpRight,Check,ChevronLeft,ChevronRight,Flag,LockKeyhole} from 'lucide-react';
import type {Language} from '../locales/dict';
import type {CampaignProgress} from '../config/campaign';
import {stageUnlocked} from '../config/circuitStages';
import {challengeMapFrontier} from '../lib/challengeMapProgress';
import {campaignText} from '../locales/campaignText';
import {stageText} from '../locales/stageText';
import {hundredMapText as text,hundredMapRangeLabel} from '../locales/hundredMapText';
import {championshipText} from '../locales/championshipText';
import {useFiniteMapMotion} from '../hooks/useFiniteMapMotion';
import {SettingsDialog} from './SettingsDialog';
import {circuitText} from '../locales/circuitText';
import './challenge-map.css';

export type MapJourney={from:number;to:number;token:string;finished:boolean};
const point=(id:number,columns=10)=>{const row=Math.floor((id-1)/columns),column=(id-1)%columns;return{x:row%2?columns-1-column:column,y:row};};

export function ChallengeMap({lang,progress,selected,page,journey,onSelect,onArrival}:{lang:Language;progress:CampaignProgress;selected:number;page:number;journey:MapJourney|null;onSelect:(id:number)=>void;onArrival:(token:string)=>void}){
 const [showOverview,setShowOverview]=useState(false);
 const cleared=progress.stageStars?.length??0,frontier=challengeMapFrontier(progress);
 const {host,finish}=useFiniteMapMotion({motionKey:journey?.token??`map:${page}`,paused:!journey||journey.finished,onEnd:()=>{if(journey)onArrival(journey.token);}});
 const overview=Array.from({length:100},(_,i)=>({id:i+1,...point(i+1)}));
 const cells=Array.from({length:10},(_,i)=>page*10+i+1);
 const destination=point((journey?.to??frontier)-page*10,5);
 const origin=journey&&journey.from>page*10?point(journey.from-page*10,5):{x:-.5,y:0};
 const movement={'--map-from-x':`${origin.x*20+10}%`,'--map-from-y':`${origin.y*50+25}%`,'--map-to-x':`${destination.x*20+10}%`,'--map-to-y':`${destination.y*50+25}%`} as CSSProperties;
 return <div ref={host} className="challenge-map" data-map-motion="still" data-map-frontier={frontier} data-map-selected={selected} data-map-journey={journey&&!journey.finished?`${journey.from}:${journey.to}`:undefined}>
  <div className="map-position"><span>{text(lang,'current')} <strong>{text(lang,'tile')} {frontier}</strong></span><button type="button" className="map-overview-trigger" aria-label={text(lang,'overview')} onClick={()=>setShowOverview(true)} aria-expanded={showOverview} aria-haspopup="dialog"><span>{text(lang,'overview')}</span><ArrowUpRight size={14} aria-hidden="true"/></button></div>
  <div className="map-segment" aria-label={`${text(lang,'tile')} ${page*10+1}–${page*10+10}`}>
   <svg className="map-trail" viewBox="0 0 500 184" preserveAspectRatio="none" aria-hidden="true"><path d="M50 44H450Q485 44 485 90T450 136H50"/><path className="map-trail-accent" d="M50 44H450Q485 44 485 90T450 136H50"/></svg>
   {cells.map((id,i)=>{const earned=progress.stageStars?.[id-1]??0,available=stageUnlocked(progress,id);return <button key={id} type="button" className="map-tile" style={{gridColumn:i<5?i+1:10-i,gridRow:i<5?1:2}} data-stage={id} data-cleared={earned>0} data-locked={!available} aria-current={id===frontier?'step':undefined} aria-pressed={selected===id} aria-label={`${text(lang,'tile')} ${id} · ${earned?`${earned}/3 ★`:available?text(lang,'current'):campaignText(lang,'locked')}`} onClick={()=>onSelect(id)}>
    <strong>{id}</strong><span aria-hidden="true">{id===frontier?<img src="/assets/qube-companion/qube-neutral.svg" alt="" width={22} height={22}/>:earned?<Check size={15}/>:id===100?<Flag size={15}/>:!available?<LockKeyhole size={13}/>:null}</span>
   </button>;})}
   {journey&&!journey.finished&&<span className="map-traveler" style={movement} aria-hidden="true"><img src="/assets/qube-companion/qube-neutral.svg" alt="" width={32} height={32}/></span>}
  </div>
  <div className="map-legend"><span><i data-kind="current" aria-hidden="true"/>{text(lang,'current')}</span><span><Check size={12} aria-hidden="true"/>{campaignText(lang,'cleared')}</span><span><LockKeyhole size={12} aria-hidden="true"/>{campaignText(lang,'locked')}</span></div>
  {journey&&!journey.finished&&<div className="map-travel-controls"><span role="status">{text(lang,'travel')}</span><button type="button" data-map-skip onClick={()=>finish.current()}>{text(lang,'skip')}</button></div>}
  {showOverview&&<SettingsDialog label={text(lang,'overview')} onClose={()=>setShowOverview(false)}><section className="map-overview map-overview-dialog"><header><h2>{text(lang,'overview')}</h2><button type="button" onClick={()=>setShowOverview(false)}>{circuitText(lang,'close')}</button></header><p>{cleared===100?text(lang,'complete'):`${campaignText(lang,'cleared')} · ${cleared}/100`}</p>
   <div className="map-legend"><span><i data-kind="current" aria-hidden="true"/>{text(lang,'current')}</span><span><Check size={12} aria-hidden="true"/>{campaignText(lang,'cleared')}</span><span><LockKeyhole size={12} aria-hidden="true"/>{campaignText(lang,'locked')}</span></div>
   <svg viewBox="0 0 320 164" role="img" aria-label={`${text(lang,'overview')} · ${text(lang,'current')} ${frontier}`} data-map-overview-cells={100}>
    <path className="map-overview-path" d={overview.map(({x,y},i)=>`${i?'L':'M'}${20+x*31},${12+y*15}`).join(' ')}/>
    {overview.map(({id,x,y})=><g key={id} transform={`translate(${20+x*31} ${12+y*15})`} data-map-overview-tile={id} data-cleared={id<=cleared} data-frontier={id===frontier} data-selected={id===selected}><circle r={id===frontier?5:3.3}/>{(id===1||id%10===0)&&<text y={10} textAnchor="middle">{id}</text>}</g>)}
   </svg>
  </section></SettingsDialog>}
 </div>;
}

/** Navigation only. Browsing locked tiles never requests stage admission. */
export function ChallengeMapPager({lang,page,current,selected,onPage,onCurrent}:{lang:Language;page:number;current:number;selected:number;onPage:(page:number)=>void;onCurrent:()=>void}){
 const id=useId();
 return <nav className="map-pager" aria-label={hundredMapRangeLabel(lang)}>
  <button type="button" disabled={page===0} onClick={()=>onPage(page-1)} aria-label={championshipText(lang,'previous')}><ChevronLeft size={18}/></button>
  <div className="map-page-choice"><label className="sr-only" htmlFor={id}>{hundredMapRangeLabel(lang)}</label><select id={id} value={page} onChange={event=>onPage(Number(event.target.value))}>{Array.from({length:10},(_,index)=><option key={index} value={index}>{text(lang,'tile')} {index*10+1}–{index*10+10} / 100</option>)}</select></div>
  <button type="button" className="map-return-current" title={`${text(lang,'current')} · ${text(lang,'tile')} ${current}`} aria-label={`${text(lang,'current')} · ${text(lang,'tile')} ${current}`} onClick={onCurrent} disabled={selected===current&&page===Math.floor((current-1)/10)}><span><span className="map-return-label">{text(lang,'current')}</span><strong>{current}</strong></span><ArrowUpRight size={14} aria-hidden="true"/></button>
  <button type="button" disabled={page===9} onClick={()=>onPage(page+1)} aria-label={championshipText(lang,'next')}><ChevronRight size={18}/></button>
 </nav>;
}

/** Match admission and clocks remain owned by LocalGameBoard. Hidden intro never starts a clock. */
export function MapBoardFocus(){
 const host=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  if(document.hidden||document.activeElement!==document.body)return;
  host.current?.closest('[data-testid="match-board"]')?.querySelector<HTMLElement>('[data-square][tabindex="0"],button:not(:disabled)')?.focus({preventScroll:true});
 },[]);
 return <span ref={host} hidden/>;
}

export function MapMatchIntro({lang,stageId,side,label,onDone,onCancel}:{lang:Language;stageId:number;side:'white'|'black';label:string;onDone:()=>void;onCancel:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),closed=useRef(false),callbacks=useRef({onDone,onCancel});
 useEffect(()=>{callbacks.current={onDone,onCancel};},[onDone,onCancel]);
 const done=()=>{if(closed.current)return;closed.current=true;dialog.current?.close();callbacks.current.onDone();};
 const {host,finish}=useFiniteMapMotion({motionKey:`intro:${stageId}:${side}`,duration:600,onEnd:done,deferHidden:true});
 const cancel=()=>{if(closed.current)return;closed.current=true;finish.current(false);dialog.current?.close();callbacks.current.onCancel();};
 useEffect(()=>{const node=dialog.current;node?.showModal();node?.querySelector<HTMLButtonElement>('[data-map-start-now]')?.focus({preventScroll:true});const back=()=>cancel();window.addEventListener('popstate',back);return()=>{window.removeEventListener('popstate',back);node?.close();};},[]);
 return <dialog ref={dialog} className="map-match-intro" aria-labelledby="map-intro-title" onCancel={event=>{event.preventDefault();cancel();}}><div ref={host} data-map-motion="still">
  <p>{text(lang,'title')}</p><div className="map-intro-tile" aria-hidden="true">{stageId}</div><h2 id="map-intro-title">{stageText(lang,'ready')}</h2><p>{label}</p><p>{campaignText(lang,side)}</p>
  <footer><button type="button" data-map-intro-cancel onClick={cancel}><ArrowLeft size={16}/>{campaignText(lang,'back')}</button><button type="button" data-map-start-now onClick={()=>finish.current()}>{text(lang,'start')}<ArrowRight size={16}/></button></footer>
 </div></dialog>;
}
