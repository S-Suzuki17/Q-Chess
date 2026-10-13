'use client';
import {useEffect,useRef} from 'react';

/** Presentation ownership only: this hook cannot save, grant a reward or start a match. */
export function useFiniteMapMotion({motionKey,duration=800,paused=false,onEnd,deferHidden=false}:{motionKey:string;duration?:number;paused?:boolean;onEnd?:()=>void;deferHidden?:boolean}){
 const host=useRef<HTMLDivElement>(null),callback=useRef(onEnd),finish=useRef<(notify?:boolean)=>void>(()=>{});
 useEffect(()=>{callback.current=onEnd;},[onEnd]);
 useEffect(()=>{
  const node=host.current;if(!node)return;
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  let disposed=false,ended=false,deferred=false,frame=0,timer:ReturnType<typeof setTimeout>|undefined;
  const stop=()=>{cancelAnimationFrame(frame);clearTimeout(timer);};
  const settle=(notify=true)=>{
   if(disposed||ended)return;
   if(notify&&deferHidden&&document.hidden){stop();deferred=true;node.dataset.mapMotion='settled';return;}
   const skipFocused=node.querySelector('[data-map-skip]')===document.activeElement;
   ended=true;stop();node.dataset.mapMotion='settled';if(notify)callback.current?.();
   if(skipFocused&&!document.hidden)node.closest('[data-map-layout]')?.querySelector<HTMLButtonElement>('.map-launch .campaign-primary')?.focus({preventScroll:true});
  };
  finish.current=settle;
  const visibility=()=>{if(document.hidden){stop();node.dataset.mapMotion='settled';if(deferHidden&&!ended)deferred=true;else settle();}else if(deferred){deferred=false;settle();}};
  const reduced=()=>{if(media.matches){if(document.hidden&&deferHidden)visibility();else settle();}};
  document.addEventListener('visibilitychange',visibility);media.addEventListener('change',reduced);
  node.dataset.mapMotion='still';
  if(paused)settle(false);
  else if(document.hidden)visibility();
  else if(media.matches){node.dataset.mapMotion='settled';timer=setTimeout(settle,80);}
  else{timer=setTimeout(settle,duration);frame=requestAnimationFrame(()=>{if(!disposed&&!ended&&!document.hidden)node.dataset.mapMotion='active';});}
  return()=>{disposed=true;stop();finish.current=()=>{};node.dataset.mapMotion='settled';document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',reduced);};
 },[duration,motionKey,paused,deferHidden]);
 return {host,finish};
}
