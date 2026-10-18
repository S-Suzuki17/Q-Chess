'use client';
import {useAndroidBackHandler} from '../hooks/useAndroidBack';

import {useRef,useState} from 'react';
import {ArrowLeft,Clock3} from 'lucide-react';
import type {Language} from '../locales/dict';
import {dict} from '../locales/dict';
import {emptyCampaign} from '../config/campaign';
import {CIRCUIT_STAGES} from '../config/circuitStages';
import {CHAMPIONSHIP_REWARDS} from '../config/championshipRewards';
import {campaignText,rewardName} from '../locales/campaignText';
import {circuitAccessText} from '../locales/circuitAccessText';
import {circuitText} from '../locales/circuitText';
import {championshipText} from '../locales/championshipText';
import {hundredMapText} from '../locales/hundredMapText';
import {crownNavigationText} from '../locales/crownNavigationText';
import {ChallengeMap,ChallengeMapPager} from './ChallengeMap';
import {ChampionshipCollection} from './ChampionshipCollection';
import {CrownTabs,CrownInfoDialog,CrownRewardArtwork} from './CrownNavigation';
import {CircuitLoginGate} from './CircuitLoginGate';
import {RewardPreview,type VisualReward} from './RewardPreview';

/** Does not load saved progression, mount a board or request admission. */
export function GuestCircuitPreview({lang,onLogin,onBack}:{lang:Language;onLogin:()=>void;onBack:()=>void}){
 useAndroidBackHandler(()=>{onBack();return true;},10);
 const [progress]=useState(emptyCampaign),[selected,setSelected]=useState(1),[page,setPage]=useState(0);
 const [tab,setTab]=useState<'challenge'|'collection'>('challenge');
 const [preview,setPreview]=useState<VisualReward|null>(null),[login,setLogin]=useState(false);
 const previousFocus=useRef<HTMLElement|null>(null);
 const remember=()=>{previousFocus.current=document.activeElement as HTMLElement;};
 const close=()=>{setPreview(null);setLogin(false);previousFocus.current?.focus();};
 const stage=CIRCUIT_STAGES[selected-1],reward=CHAMPIONSHIP_REWARDS[selected-1];
 return <section lang={lang} className="campaign-screen crown-screen map-screen" data-testid="circuit-guest-preview" aria-label={campaignText(lang,'title')}>
  <header className="campaign-header crown-header"><button onClick={onBack}><ArrowLeft size={18}/>{campaignText(lang,'back')}</button><div><span className="crown-brand">{circuitText(lang,'preview')}</span><h1>{campaignText(lang,'title')}</h1></div></header>
  <p className="map-preview-notice">{circuitAccessText(lang,'help')}</p>
  <CrownTabs id="crown-guest" label={campaignText(lang,'title')} value={tab} onChange={setTab} items={[{value:'challenge',label:crownNavigationText(lang,'challenge')},{value:'collection',label:campaignText(lang,'rewards')}]}/>
  <div className="crown-panels">
   <div className="crown-tab-panel" role="tabpanel" id="crown-guest-panel-challenge" aria-labelledby="crown-guest-tab-challenge" hidden={tab!=='challenge'}>
    <div className="crown-challenge" data-map-layout>
     <div className="map-launch map-top-launch"><div className="map-launch-heading"><span className="map-stage-number" aria-hidden="true">{selected}</span><div><p className="map-selected">{hundredMapText(lang,'selected')}</p><h2>{hundredMapText(lang,'tile')} {selected}<small> / 100</small></h2><div className="map-challenge-meta"><span>CPU · {championshipText(lang,'strength')} {stage.strength}/34</span><span><Clock3 size={12} aria-hidden="true"/>{stage.timeControl==='10m'?dict[lang].tc10m:stage.timeControl==='3m'?dict[lang].tc3m:dict[lang].tc10s}</span></div></div></div><button className="campaign-primary" onClick={()=>{remember();setLogin(true);}}>{circuitAccessText(lang,'action')}</button></div>
     <div className="map-layout"><div>
      <ChallengeMap lang={lang} progress={progress} selected={selected} page={page} journey={null} onSelect={setSelected} onArrival={()=>{}}/>
      <ChallengeMapPager lang={lang} page={page} current={1} selected={selected} onPage={setPage} onCurrent={()=>{setSelected(1);setPage(0);}}/>
     </div><article className="map-challenge-card"><div className="map-challenge-copy"><h2>{hundredMapText(lang,'tile')} {selected}</h2><div className="map-challenge-meta"><span>CPU · {championshipText(lang,'strength')} {stage.strength}/34</span><span>{stage.timeControl==='10m'?dict[lang].tc10m:stage.timeControl==='3m'?dict[lang].tc3m:dict[lang].tc10s}</span></div></div>
      <button className="map-reward" data-preview-reward={reward.id} onClick={()=>{remember();setPreview({kind:reward.kind,id:reward.id});}}><span className="map-reward-art"><CrownRewardArtwork kind={reward.kind} id={reward.id}/></span><strong>{rewardName(lang,reward.id)}</strong><span>{circuitText(lang,'preview')}</span></button>
     </article></div>
    </div>
   </div>
   <div className="crown-tab-panel" role="tabpanel" id="crown-guest-panel-collection" aria-labelledby="crown-guest-tab-collection" hidden={tab!=='collection'}><ChampionshipCollection lang={lang} progress={progress}/></div>
  </div>
  {preview&&<RewardPreview lang={lang} reward={preview} progress={progress} onClose={close}/>}
  {login&&<CrownInfoDialog title={circuitAccessText(lang,'action')} closeLabel={circuitText(lang,'close')} onClose={close}><CircuitLoginGate lang={lang} onLogin={onLogin} onBack={close}/></CrownInfoDialog>}
 </section>;
}
