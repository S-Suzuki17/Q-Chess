'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, ChevronLeft, ChevronRight, LockKeyhole, Music2, LayoutGrid, ChessKnight, CircleUserRound, Sparkles } from 'lucide-react';
import { rewardUnlocked, totalCircuitStars, type CampaignProgress } from '../config/campaign';
import { referencePieceForBoard } from '../config/championshipRewards';
import { campaignText, rewardName } from '../locales/campaignText';
import { championshipText } from '../locales/championshipText';
import type { Language } from '../locales/dict';
import { RewardPreview, type VisualReward } from './RewardPreview';
import { circuitText } from '../locales/circuitText';
import { stageText } from '../locales/stageText';
import { cosmeticsSettingsText } from '../locales/cosmeticsSettingsText';
import { battleMusicTitle } from '../config/circuitMusic';
import { musicMilestoneText } from '../locales/musicMilestoneText';
import { crownNavigationText } from '../locales/crownNavigationText';
import { CROWN_CATEGORIES, crownCollectionItems, crownPage, crownPageLayout, type CrownCategory } from './crownCollection';
import { CrownRewardArtwork, CrownTabs } from './CrownNavigation';
import {QubeTeacher} from './QubeTeacher';

const categoryKeys = { board: 'boards', piece: 'pieces', avatar: 'frames', effect: 'effects', music: 'music' } as const;
const categoryIcons = { board: LayoutGrid, piece: ChessKnight, avatar: CircleUserRound, effect: Sparkles, music: Music2 };

export function ChampionshipCollection({lang,progress,initialCategory='board'}:{lang:Language;progress:CampaignProgress;initialCategory?:CrownCategory;onEquip?:(kind:CrownCategory,id:string)=>void}) {
 const [preview,setPreview]=useState<VisualReward|null>(null);
 const [category,setCategory]=useState<CrownCategory>(initialCategory);
 const [pages,setPages]=useState<Partial<Record<CrownCategory,number>>>({});
 const [layout,setLayout]=useState(()=>crownPageLayout(1000,400));
 const grid=useRef<HTMLDivElement>(null);
 const previousFocus=useRef<HTMLElement|null>(null);
 const t=(key:Parameters<typeof crownNavigationText>[1])=>crownNavigationText(lang,key);
 const items=crownCollectionItems(progress,category);
 const {page,pageCount,items:visible}=crownPage(items,pages[category]??0,layout.size);
 const acquired=items.filter(item=>rewardUnlocked(progress,item.id)).length;
 const stars=totalCircuitStars(progress);
 useEffect(()=>{
  const element=grid.current;
  if(!element||typeof ResizeObserver==='undefined')return;
  const observer=new ResizeObserver(([entry])=>{
   const next=crownPageLayout(entry.contentRect.width,entry.contentRect.height);
   setLayout(previous=>previous.columns===next.columns&&previous.rows===next.rows?previous:next);
  });
  observer.observe(element);return()=>observer.disconnect();
 },[]);
 const openPreview=(reward:VisualReward)=>{previousFocus.current=document.activeElement as HTMLElement;setPreview(reward);};
 const closePreview=()=>{setPreview(null);previousFocus.current?.focus();};
 return <section className="championship-collection crown-collection" aria-label={campaignText(lang,'rewards')}>
  <CrownTabs id="crown-category" label={campaignText(lang,'rewards')} value={category} onChange={setCategory} className="crown-category-tabs"
   items={CROWN_CATEGORIES.map(value=>{const Icon=categoryIcons[value];return {value,label:t(categoryKeys[value]),icon:<Icon size={17} aria-hidden="true"/>};})}/>
  <div className="crown-collection-meta"><h2>{t(categoryKeys[category])}</h2><span>{cosmeticsSettingsText(lang,'acquired')} <b>{acquired}/{items.length}</b></span>
   {category==='music'&&<span className="crown-star-total" title={musicMilestoneText(lang,'help')}>★ {stars}/300</span>}
  </div>
  <div ref={grid} className="crown-collection-grid" style={{'--crown-columns':layout.columns,'--crown-rows':layout.rows} as CSSProperties} role="tabpanel" id={`crown-category-panel-${category}`} aria-labelledby={`crown-category-tab-${category}`} tabIndex={0}>
   {visible.map(item=>{
    const unlocked=rewardUnlocked(progress,item.id),design=item.design;
    const name=item.kind==='music'&&item.id!=='standard'?battleMusicTitle(item.id)??rewardName(lang,item.id):rewardName(lang,item.id);
    return <article key={item.id} className="crown-collection-card" data-championship-reward={design?.id} data-acquired-reward={unlocked?`${item.kind}-${item.id}`:undefined} data-piece-form={design?.kind==='piece'?design.form:undefined} data-board-profile={design?.kind==='board'?design.profile:undefined} data-reward-grade={design?.tier} data-acquired={unlocked}>
     <div className="crown-item-meta"><span>{item.requiredStars?`★ ${item.requiredStars}`:design?`${stageText(lang,'stage')} ${String(design.requiredWins).padStart(3,'0')}`:campaignText(lang,'rewards')}</span>{unlocked?<Check size={14} aria-label={cosmeticsSettingsText(lang,'acquired')}/>:<LockKeyhole size={14} aria-label={cosmeticsSettingsText(lang,'notAcquired')}/>}</div>
     <button className="crown-item-preview" data-preview-reward={item.id} data-preview-music={item.kind==='music'?item.id:undefined} aria-label={`${circuitText(lang,'preview')} · ${name}`} onClick={()=>openPreview({kind:item.kind,id:item.id})}>
      <span className="crown-item-art"><CrownRewardArtwork kind={item.kind} id={item.id}/></span>
      <strong>{name}</strong><span className="crown-preview-label">{circuitText(lang,'preview')} <ChevronRight size={14}/></span>
     </button>
     <div className="crown-item-status"><span>{cosmeticsSettingsText(lang,unlocked?'acquired':'notAcquired')}</span>
      {item.requiredStars&&!unlocked&&<small>{musicMilestoneText(lang,'remaining')} ★ {Math.max(0,item.requiredStars-stars)}</small>}
      {design?.kind==='board'&&referencePieceForBoard(item.id)&&<small>{campaignText(lang,'board')} + {campaignText(lang,'piece')}</small>}
      {item.requiredStars&&<progress max={item.requiredStars} value={unlocked?item.requiredStars:Math.min(item.requiredStars,stars)} aria-label={`${name} · ${musicMilestoneText(lang,'total')}`}/>}
     </div>
    </article>;
   })}
  </div>
  {CROWN_CATEGORIES.filter(value=>value!==category).map(value=><div key={value} role="tabpanel" id={`crown-category-panel-${value}`} aria-labelledby={`crown-category-tab-${value}`} hidden/>)}
  <footer className="crown-collection-footer">
   <QubeTeacher lang={lang} variant="compact" className="crown-collection-teacher"><p>{cosmeticsSettingsText(lang,'settingsOnly')}</p></QubeTeacher>
   <nav className="crown-pager" aria-label={`${t(categoryKeys[category])} · ${t('page')}`}>
    <button type="button" disabled={page===0} onClick={()=>setPages(previous=>({...previous,[category]:page-1}))} aria-label={championshipText(lang,'previous')}><ChevronLeft size={18}/></button>
    <span aria-live="polite" aria-atomic="true">{t('page')} {page+1} / {pageCount}</span>
    <button type="button" disabled={page===pageCount-1} onClick={()=>setPages(previous=>({...previous,[category]:page+1}))} aria-label={championshipText(lang,'next')}><ChevronRight size={18}/></button>
   </nav>
  </footer>
  {preview&&<RewardPreview lang={lang} reward={preview} progress={progress} onClose={closePreview}/>}
 </section>;
}
