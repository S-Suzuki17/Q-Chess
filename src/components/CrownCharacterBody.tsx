'use client';
import {useEffect,useState} from 'react';
import type {CrownEnemy} from '../config/crownEnemies';
import {CrownToonArtwork} from './CrownToonArtwork';
import {useReducedMotion} from '../hooks/useReducedMotion';
const bodyParts=['cape','left-foot','right-foot','body','left-hand','right-hand','head','gear'] as const;

export function CrownCharacterBody({enemy,compact=false}:{enemy:CrownEnemy;compact?:boolean}){
 const[full,setFull]=useState<string|null>(null),[failed,setFailed]=useState<string|null>(null),[atlas,setAtlas]=useState<string|null>(null),reduced=useReducedMotion();
 const base='/assets/crown-enemies/'+enemy.id;
 useEffect(()=>{
  if(compact||reduced)return;
  const n=navigator as Navigator & {deviceMemory?:number;connection?:{saveData?:boolean}};
  if(innerWidth<380||n.hardwareConcurrency<=2||(n.deviceMemory??8)<=2||n.connection?.saveData)return;
  let alive=true;const image=new Image();image.onload=()=>{if(alive)setAtlas(enemy.id);};image.onerror=()=>{};image.src=base+'-atlas.png';
  return()=>{alive=false;image.onload=null;image.onerror=null;image.src='';};
 },[enemy.id,base,compact,reduced]);
 const ready=full===enemy.id,artFailed=failed===enemy.id,sprite=atlas===enemy.id&&!compact&&!reduced;
 return <span className={`crown-character-body${compact?' crown-character-compact':''}${sprite?' crown-character-articulated':''}`} data-crown-character={enemy.id} data-character-art={ready||sprite?'toon':'fallback'} data-character-variant={ready?'full':sprite?'atlas':'flat'} aria-hidden="true">
  <CrownToonArtwork enemy={enemy}/>
  {!artFailed&&<img key={enemy.id} className="crown-character-still" src={base+'.png'} alt="" width={256} height={288} onLoad={()=>setFull(enemy.id)} onError={()=>setFailed(enemy.id)} style={{opacity:ready?1:0}}/>}
  {sprite&&<span className="crown-character-layers">{bodyParts.map((part,index)=><i key={part} data-character-part={part} style={{backgroundImage:`url("${base}-atlas.png")`,backgroundPosition:`${index%3*50}% ${Math.floor(index/3)*50}%`}}/>)}</span>}
 </span>;
}
