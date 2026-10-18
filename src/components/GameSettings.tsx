'use client';
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {ChevronLeft,ChevronRight,CircleUserRound,Headphones,LifeBuoy,Palette,Settings2,ShieldCheck,Volume2,VolumeX,X} from 'lucide-react';
import {dict,LANGUAGES,type Language} from '../locales/dict';
import {circuitText} from '../locales/circuitText';
import {settingsScreenText as text} from '../locales/settingsScreenText';
import {championshipText} from '../locales/championshipText';
import {soundManager,type SoundConfig} from '../lib/SoundService';
import './game-settings.css';

type Panel='play'|'appearance'|'account'|'privacy'|'support';
/** The native dialog owns focus; each panel keeps the existing controls mounted. */
export function GameSettings({lang,soundConfig,onLanguageChange,onClose,appearance,appearanceExtra,account,accountExtra,privacy,support}:{
 lang:Language;soundConfig:SoundConfig;onLanguageChange:(lang:Language)=>void;onClose:()=>void;
 appearance:ReactNode;appearanceExtra?:ReactNode;account?:ReactNode;accountExtra?:ReactNode;privacy:ReactNode;support:ReactNode;
}){
 const id=useId(),[selected,setSelected]=useState<Panel>('play'),[page,setPage]=useState(0);
 const content=useRef<HTMLDivElement>(null),stopPreview=useRef<()=>void>(()=>{});
 const items=[{value:'play' as const,icon:Headphones},{value:'appearance' as const,icon:Palette},
  ...(account?[{value:'account' as const,icon:CircleUserRound}]:[]),{value:'privacy' as const,icon:ShieldCheck},{value:'support' as const,icon:LifeBuoy}];
 const active=items.some(item=>item.value===selected)?selected:'play';
 const extra=active==='appearance'?appearanceExtra:active==='account'?accountExtra:null;
 const visiblePage=extra?page:0;
 useEffect(()=>{content.current?.scrollTo({top:0});stopPreview.current();},[active,visiblePage]);
 useEffect(()=>()=>stopPreview.current(),[]);
 const preview=()=>{stopPreview.current();if(!soundConfig.masterMute)stopPreview.current=soundManager.playSE('/audio/move.mp3');};
 const t=dict[lang];
 return <section lang={lang} className="game-settings" data-game-settings>
  <header className="settings-heading"><span className="settings-mark" aria-hidden="true"><Settings2 size={22}/></span>
   <div><small>Q-GAMBIT</small><h2>{t.settings}</h2></div>
   <button type="button" className="settings-close" aria-label={circuitText(lang,'close')} onClick={onClose}><X size={20}/></button>
  </header>
  <label className="settings-section-picker"><span className="sr-only">{t.settings}</span>
   <select data-settings-section-picker value={active} onChange={event=>{setSelected(event.target.value as Panel);setPage(0);}}>
    {items.map(({value})=><option key={value} value={value}>{text(lang,value)}</option>)}
   </select>
  </label>
  <div className="settings-tabs" role="tablist" aria-label={t.settings}>
   {items.map(({value,icon:Icon},index)=><button key={value} type="button" role="tab" id={`${id}-tab-${value}`} aria-controls={`${id}-panel-${value}`} aria-selected={active===value} tabIndex={active===value?0:-1}
    onClick={()=>{setSelected(value);setPage(0);}} onKeyDown={event=>{
     const next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowRight'?(index+1)%items.length:event.key==='ArrowLeft'?(index+items.length-1)%items.length:null;
     if(next===null)return;event.preventDefault();setSelected(items[next].value);setPage(0);document.getElementById(`${id}-tab-${items[next].value}`)?.focus();
    }}><Icon size={17} aria-hidden="true"/><span>{text(lang,value)}</span></button>)}
  </div>
  <div className="settings-content game-scroll" ref={content}>
   {items.map(({value})=><section key={value} role="tabpanel" id={`${id}-panel-${value}`} aria-labelledby={`${id}-tab-${value}`} hidden={active!==value} tabIndex={0}>
    <div className="settings-panel-heading"><h3>{text(lang,value)}</h3><p>{text(lang,`${value}Help`)}</p></div>
    <div className="settings-subpage" hidden={active===value&&visiblePage!==0}>{value==='play'?<>
     <div className="settings-audio">
      <div className="settings-sound-switch"><span className="settings-sound-icon" aria-hidden="true">{soundConfig.masterMute?<VolumeX size={22}/>:<Volume2 size={22}/>}</span>
       <span id={`${id}-sound-label`}>{t.masterMute}</span><button type="button" role="switch" aria-checked={!soundConfig.masterMute} aria-labelledby={`${id}-sound-label`} onClick={()=>{stopPreview.current();soundManager.updateConfig({masterMute:!soundConfig.masterMute});}}><span aria-hidden="true"/>{soundConfig.masterMute?t.muted:t.on}</button>
      </div>
      {(['bgmVolume','seVolume'] as const).map(kind=><div className="settings-volume" key={kind}>
       <label htmlFor={`${id}-${kind}`}><span>{t[kind]}</span><output htmlFor={`${id}-${kind}`}>{Math.round(soundConfig[kind]*100)}%</output></label>
       <input id={`${id}-${kind}`} type="range" min="0" max="1" step="0.05" value={soundConfig[kind]}
        onChange={event=>soundManager.updateConfig({[kind]:Number(event.target.value)})}
        onPointerUp={kind==='seVolume'?preview:undefined} onKeyUp={kind==='seVolume'?event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))preview();}:undefined}/>
      </div>)}
     </div>
     <div className="settings-language"><label htmlFor={`${id}-language`}>{t.language}</label><select id={`${id}-language`} value={lang} onChange={event=>onLanguageChange(event.target.value as Language)}>{LANGUAGES.map(language=><option key={language.code} value={language.code}>{language.label}</option>)}</select></div>
    </>:value==='appearance'?appearance:value==='account'?account:value==='privacy'?privacy:support}</div>
    {(value==='appearance'?appearanceExtra:value==='account'?accountExtra:null)&&<div className="settings-extra-page" hidden={active!==value||visiblePage!==1}>
     {value==='appearance'?appearanceExtra:accountExtra}
    </div>}
   </section>)}
  </div>
  <footer className="settings-footer">
   {extra&&<nav className="settings-pagination" aria-label={text(lang,active)}>
    <button type="button" data-settings-page-previous disabled={visiblePage===0} aria-label={championshipText(lang,'previous')} aria-controls={`${id}-panel-${active}`} onClick={()=>setPage(0)}><ChevronLeft size={16}/></button>
    <output aria-live="polite">{visiblePage+1} / 2</output>
    <button type="button" data-settings-page-next disabled={visiblePage===1} aria-label={championshipText(lang,'next')} aria-controls={`${id}-panel-${active}`} onClick={()=>setPage(1)}><ChevronRight size={16}/></button>
   </nav>}
   <button type="button" onClick={onClose}>{circuitText(lang,'close')}</button>
  </footer>
 </section>;
}
