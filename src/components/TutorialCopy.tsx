'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import type {Language} from '../locales/dict';
import {championshipText} from '../locales/championshipText';
import {textPageBreaks} from '../lib/textPageBreaks';
import {NaturalText,measureNaturalText} from './NaturalText';

/** Paginate the existing copy to its measured space; keep every grapheme. */
export function TutorialCopy({text,lang,step}:{text:string;lang:Language;step:number}){
 const host=useRef<HTMLDivElement>(null),measure=useRef<HTMLDivElement>(null);
 const [pages,setPages]=useState([text]),[index,setIndex]=useState(0);
 useLayoutEffect(()=>{
  let active=true;
  const fit=()=>{
   const box=host.current,probe=measure.current;if(!active||!box||!probe||box.clientHeight<24)return;
   // clientWidth rounds subpixels and can fit an extra word that the visible copy cannot.
   probe.style.width=`${box.getBoundingClientRect().width}px`;
   const {chars,pageEnd}=textPageBreaks(text,lang),next:string[]=[];
   let start=0;
   while(start<chars.length){
    let low=1,high=chars.length-start,end=1;
    while(low<=high){const length=Math.floor((low+high)/2);measureNaturalText(probe,chars.slice(start,start+length).join(''),lang);if(probe.scrollHeight<=box.clientHeight+1&&probe.scrollWidth<=box.clientWidth+1){end=length;low=length+1;}else high=length-1;}
    end=pageEnd(start,end)-start;
    next.push(chars.slice(start,start+end).join(''));start+=end;
   }
   setPages(current=>current.length===next.length&&current.every((page,i)=>page===next[i])?current:next);
   setIndex(current=>Math.min(current,Math.max(0,next.length-1)));
  };
  fit();const observer=new ResizeObserver(fit);if(host.current)observer.observe(host.current);
  window.addEventListener('resize',fit);void document.fonts?.ready.then(fit);
  return()=>{active=false;observer.disconnect();window.removeEventListener('resize',fit);};
 },[text,lang]);
 const page=Math.min(index,pages.length-1);
 return <div className="tutorial-paged-copy" data-copy-source={text}>
  <div className="tutorial-copy-space" ref={host}><div data-tutorial-step={step} aria-live="polite" aria-atomic="true"><NaturalText text={pages[page]} lang={lang}/></div><div ref={measure} className="tutorial-copy-measure" aria-hidden="true"/></div>
  <nav className="tutorial-copy-navigation" aria-label={lang==='ja'?'説明のページ':'Explanation pages'}>
   <button type="button" data-copy-previous disabled={page===0} aria-label={championshipText(lang,'previous')} onClick={()=>setIndex(value=>Math.max(0,value-1))}><ChevronLeft size={16}/></button>
   <output data-copy-page>{page+1} / {pages.length}</output>
   <button type="button" data-copy-next disabled={page===pages.length-1} aria-label={championshipText(lang,'next')} onClick={()=>setIndex(value=>Math.min(pages.length-1,value+1))}><ChevronRight size={16}/></button>
  </nav>
 </div>;
}
