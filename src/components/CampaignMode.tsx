'use client';
import {useAndroidBackHandler} from '../hooks/useAndroidBack';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Clock3, Gift, Info, Trophy } from 'lucide-react';
import { rewardUnlocked, totalCircuitStars, type CampaignOutcome } from '../config/campaign';
import { CHAMPIONSHIP_REWARDS } from '../config/championshipRewards';
import { championshipText } from '../locales/championshipText';
import { campaignText, rewardName } from '../locales/campaignText';
import { dict, type Language } from '../locales/dict';
import type { User } from '../types/game';
import { useCampaignProgress } from '../hooks/useCampaignProgress';
import LocalGameBoard from './LocalGameBoard';
import { ChampionshipCollection } from './ChampionshipCollection';
import { CampaignResult } from './CampaignResult';
import { battleMusicUrl, CIRCUIT_MUSIC } from '../config/circuitMusic';
import { musicMilestoneText } from '../locales/musicMilestoneText';
import { circuitText } from '../locales/circuitText';
import { soundManager } from '../lib/SoundService';
import { RewardPreview, type VisualReward } from './RewardPreview';
import { CIRCUIT_STAGES, finishStage, stageUnlocked } from '../config/circuitStages';
import { stageText } from '../locales/stageText';
import { randomCPUPersonality } from '../config/cpuPersonalities';
import { requestCircuitInterstitial } from '../lib/adPolicy';
import { createCircuitResultTransition } from '../lib/circuitResultAd';
import { circuitAccess } from '../lib/circuitAccess';
import { useCircuitAccess } from '../hooks/useCircuitAccess';
import { GuestCircuitPreview } from './GuestCircuitPreview';
import {cloudText} from '../locales/cloudText';
import { crownAdmissionEnabled } from '../config/crownAdmission';
import { authorizeCrownStage } from '../lib/crownAdmission';
import { createCrownEntryController } from '../lib/crownEntry';
import {QubeTeacher} from './QubeTeacher';
import {hintScopeText} from '../locales/hintScopeText';
import {cosmeticsSettingsText} from '../locales/cosmeticsSettingsText';
import {CrownHintRecovery} from './CrownHintRecovery';
import { crownNavigationText } from '../locales/crownNavigationText';
import { CrownInfoDialog, CrownRewardArtwork, CrownTabs } from './CrownNavigation';
import {ChallengeMap,ChallengeMapPager,type MapJourney} from './ChallengeMap';
import {challengeMapFrontier} from '../lib/challengeMapProgress';
import {hundredMapText} from '../locales/hundredMapText';
import {castleQuestNextStage} from '../lib/castleQuestJourney';
import './campaign.css';
import './challenge-map.css';


type CampaignProps={lang:Language;user:User;onBack:()=>void;onLogin:()=>void;onPlayingChange?:(playing:boolean)=>void};
export function CampaignMode(props:CampaignProps) {
    const {allowed,revision}=useCircuitAccess(props.user);
    if(!allowed)return <GuestCircuitPreview lang={props.lang} onBack={props.onBack} onLogin={props.onLogin}/>;
    return <MemberCircuit key={`${props.user.id}:${revision}`} {...props}/>;
}

function MemberCircuit({lang,user,onBack,onPlayingChange}:CampaignProps) {
    const {progress,loaded,storageError,update}=useCampaignProgress();
    const [selection,setSelected]=useState<number|null>(null);
    const [activeId,setActiveId]=useState<number|null>(null);
    const [chosenPage,setPage]=useState<number|null>(null);
    const [tab,setTab]=useState<'challenge'|'collection'>('challenge');
    const [showInfo,setShowInfo]=useState(false);
    const previousFocus=useRef<HTMLElement|null>(null);
    const screen=useRef<HTMLElement|null>(null),returnFocus=useRef(false);
    const [firstClear,setFirstClear]=useState(false);
    const [run,setRun]=useState(0);
    const [crownRunId,setCrownRunId]=useState<string|undefined>();
    const [runPersonality,setRunPersonality]=useState(randomCPUPersonality);
    const [side,setSide]=useState<'white'|'black'>('white');
    const [preview,setPreview]=useState<VisualReward|null>(null);
    const [outcome,setOutcome]=useState<CampaignOutcome|null>(null);
    const [runMusic,setRunMusic]=useState<readonly string[]>([]);
    const [runDesign,setRunDesign]=useState(()=>({music:progress.music,effect:progress.effect,piece:progress.piece}));
    const [starting,setStarting]=useState(false);
    const [entryError,setEntryError]=useState(false);
    const [leavingResult,setLeavingResult]=useState(false);
    const resultPending=useRef(false);
    const [resultTransition]=useState(()=>createCircuitResultTransition(requestCircuitInterstitial));
    const [journey,setJourney]=useState<MapJourney|null>(null);
    const [runProgress,setRunProgress]=useState(progress);
    const finishedRun=useRef(false);
    const [entry]=useState(()=>createCrownEntryController({
        enabled:crownAdmissionEnabled,authorize:authorizeCrownStage,
    }));
    const runPermit=useRef<(()=>boolean)|null>(null);
    useEffect(()=>()=>{entry.cancel();runPermit.current=null;onPlayingChange?.(false);},[entry,onPlayingChange]);
    useEffect(()=>{
        if(activeId===null&&returnFocus.current){
            returnFocus.current=false;
            screen.current?.querySelector<HTMLButtonElement>('.map-launch .campaign-primary')?.focus({preventScroll:true});
        }
    },[activeId]);
    useEffect(()=>{
        const cancel=()=>{entry.cancel();setStarting(false);setJourney(null);};
        window.addEventListener('popstate',cancel);
        return()=>window.removeEventListener('popstate',cancel);
    },[entry]);
    const cancelEntry=()=>{entry.cancel();setStarting(false);setEntryError(false);setJourney(null);};
    useAndroidBackHandler(()=>{
        if(activeId!==null)return false;
        cancelEntry();
        if(!starting)onBack();
        return true;
    },10);
    useEffect(()=>{
        if(activeId) soundManager.playBGM(battleMusicUrl(runDesign.music));
        else soundManager.stopBGM();
        return()=>soundManager.stopBGM();
    },[activeId,runDesign.music]);
    const t=(key:Parameters<typeof campaignText>[1])=>campaignText(lang,key);
    const loop=(key:Parameters<typeof championshipText>[1])=>championshipText(lang,key);
    const nav=(key:Parameters<typeof crownNavigationText>[1])=>crownNavigationText(lang,key);
    // A failed localStorage write retains session data, but must not advance the saved map.
    const mapProgress=storageError?runProgress:progress;
    const cleared=mapProgress.stageStars?.length??0;
    const selected=selection??Math.min(cleared+1,100);
    const stage=CIRCUIT_STAGES[selected-1],reward=CHAMPIONSHIP_REWARDS[selected-1];
    const page=chosenPage??Math.floor((selected-1)/10);
    const currentStage=challengeMapFrontier(mapProgress);
    const stars=totalCircuitStars(mapProgress);
    const selectedStars=mapProgress.stageStars?.[selected-1]??0;
    const unlocked=stageUnlocked(mapProgress,selected);
    const rememberFocus=()=>{previousFocus.current=document.activeElement as HTMLElement;};
    const closeOverlay=()=>{setPreview(null);setShowInfo(false);previousFocus.current?.focus();};
    const selectStage=(id:number)=>{cancelEntry();setSelected(id);setPage(Math.floor((id-1)/10));};
    const complete=useCallback((result:CampaignOutcome)=>{
        if(!activeId||finishedRun.current||!runPermit.current?.()||!circuitAccess.canPlay(user))return;
        finishedRun.current=true;
        update(value=>finishStage(value,activeId,result));
        setOutcome(result);
    },[activeId,update,user]);
    const start=async(id:number)=>{
        if(!circuitAccess.canPlay(user)||!loaded||!stageUnlocked(mapProgress,id))return;
        if(entry.pending)return;
        setJourney(null);
        const permit=circuitAccess.permit(user);
        setStarting(true);setEntryError(false);
        const result=await entry.start(user.id,id,permit);
        if(result.state==='cancelled'||result.state==='busy')return;
        setStarting(false);
        if(result.state!=='ready'){setEntryError(true);return;}
        if(!result.canActivate())return;
        finishedRun.current=false;
        setRunProgress(mapProgress);
        runPermit.current=permit;
        setCrownRunId(crypto.randomUUID());
        setRunPersonality(randomCPUPersonality());
        setRunDesign({music:progress.music,effect:progress.effect,piece:progress.piece});setRunMusic(CIRCUIT_MUSIC.filter(track=>rewardUnlocked(progress,track.id)).map(track=>track.id));onPlayingChange?.(true);
        setFirstClear(!progress.stageStars?.[id-1]);setSelected(id);setOutcome(null);setRun(value=>value+1);setActiveId(id);
    };
    const leaveStage=()=>{runPermit.current=null;returnFocus.current=true;cancelEntry();setActiveId(null);onPlayingChange?.(false);};
    const afterResult=async(action:()=>void|Promise<void>)=>{
        const permit=runPermit.current;
        if(resultPending.current||!outcome||!finishedRun.current||!crownRunId||!permit?.())return;
        resultPending.current=true;
        setLeavingResult(true);
        try{await resultTransition(crownRunId,user.id,()=>permit()&&runPermit.current===permit,action);}
        finally{resultPending.current=false;setLeavingResult(false);}
    };
    const nextStage=activeId?castleQuestNextStage(progress,activeId,outcome,storageError):null;
    const goNext=()=>{
        if(!activeId||!nextStage||!finishedRun.current||!runPermit.current?.()||!circuitAccess.canPlay(user))return;
        const from=activeId;
        leaveStage();
        setSelected(nextStage);setPage(Math.floor((nextStage-1)/10));
        setJourney(firstClear?{from,to:nextStage,token:crypto.randomUUID(),finished:false}:null);
    };
    const arrived=(token:string)=>{
        if(!journey||journey.token!==token||journey.finished)return;
        setJourney(current=>current?.token===token?{...current,finished:true}:current);
    };
    if(activeId) {
        const active=CIRCUIT_STAGES[activeId-1];
        return <LocalGameBoard key={`${activeId}-${run}`} lang={lang} user={user} cpuLevel={active.strength<12?1:active.strength<23?3:5}
            crownStageId={activeId} crownRunId={crownRunId}
            cpuPersonality={runPersonality} cpuSearchProfile={active.search} campaignLabel={`${hundredMapText(lang,'tile')} ${activeId} / 100 · ${loop('strength')} ${active.strength}`} opponentLabel="CPU"
            onlineRole={side} timeControl={active.timeControl} onComplete={complete} onHome={leaveStage}
            resultPanel={outcome&&<CampaignResult lang={lang} stageId={activeId} firstClear={firstClear} effect={runDesign.effect} pieceFinish={runDesign.piece} foeWhite={side==='black'} outcome={outcome} saveError={storageError}
                newMusic={CIRCUIT_MUSIC.filter(track=>!runMusic.includes(track.id)&&rewardUnlocked(progress,track.id)).map(track=>track.id)}
                onRetry={()=>void afterResult(()=>start(activeId))} onBack={()=>void afterResult(leaveStage)}
                busy={leavingResult} onNext={nextStage?()=>void afterResult(goNext):undefined}/>}/>;
    }
    return <section ref={screen} lang={lang} className="campaign-screen crown-screen map-screen" data-circuit-stage={selected} aria-label={t('title')}>
        <header className="campaign-header crown-header">
            <button onClick={()=>{cancelEntry();onBack();}} aria-label={t('back')}><ArrowLeft size={18}/><span>{t('back')}</span></button>
            <div><span className="crown-brand">Q-GAMBIT</span><h1>{t('title')}</h1></div>
            <button className="crown-help" onClick={()=>{cancelEntry();rememberFocus();setShowInfo(true);}} aria-label={nav('details')}><Info size={19}/></button>
        </header>
        <CrownTabs id="crown-main" label={t('title')} value={tab} onChange={value=>{cancelEntry();setTab(value);}}
            items={[{value:'challenge',label:nav('challenge')},{value:'collection',label:t('rewards')}]}/>
        {storageError&&<p className="campaign-save-error" role="alert">{t('saveError')}</p>}
        {entryError&&<p className="campaign-save-error" role="alert">{nav('entryError')}</p>}
        <div className="crown-panels">
        <div className="crown-tab-panel" role="tabpanel" id="crown-main-panel-challenge" aria-labelledby="crown-main-tab-challenge" hidden={tab!=='challenge'} tabIndex={0}>
        <div className="crown-challenge" data-map-layout>
            <CrownHintRecovery userId={user.id} lang={lang}/>
            <section className="crown-progress" aria-label={loop('record')}>
                <span><Trophy size={15} aria-hidden="true"/>{t('cleared')} <b>{cleared}/100</b></span>
                <progress max={100} value={cleared} aria-label={t('cleared')}/>
                <span className="crown-stars" aria-label={`${musicMilestoneText(lang,'total')} ${stars}/300`}>★ {stars}/300</span>
            </section>
                <div className="map-launch map-top-launch"><div className="map-launch-heading"><span className="map-stage-number" aria-hidden="true">{selected}</span><div><p className="map-selected">{selectedStars?nav('improveStars'):unlocked?nav('nextStage'):t('locked')}</p><h2>{hundredMapText(lang,'tile')} {selected}<small> / 100</small></h2><div className="map-challenge-meta"><span title={`${loop('strength')} ${stage.strength}/34`}>CPU · {stage.strength}/34</span><span aria-label={stage.timeControl==='10m'?dict[lang].tc10m:stage.timeControl==='3m'?dict[lang].tc3m:dict[lang].tc10s} title={stage.timeControl==='10m'?dict[lang].tc10m:stage.timeControl==='3m'?dict[lang].tc3m:dict[lang].tc10s}><Clock3 size={12} aria-hidden="true"/>{stage.timeControl==='10m'?'10:00':stage.timeControl==='3m'?'3:00':'0:30'}</span></div></div></div>
                    <fieldset className="campaign-side"><legend>{nav('chooseSide')}</legend>{(['white','black'] as const).map(value=><button key={value} type="button" aria-pressed={side===value} onClick={()=>{cancelEntry();setSide(value);}}>{t(value)}</button>)}</fieldset>
                    <button className="campaign-primary" disabled={starting||!loaded||!unlocked} onClick={()=>void start(selected)}>{starting||!loaded?dict[lang].loading:unlocked?selectedStars?t('retry'):t('challenge'):t('locked')}<ArrowUpRight size={20}/></button>
                    <p className="map-objective">{!unlocked?nav('lockedGoal'):cleared===100?hundredMapText(lang,'complete'):`★ ${t('win')} · ★ ${t('noHints')} · ★ ${stage.timeControl==='10s'?stageText(lang,'quickMoves'):t('quick')}`}</p>
                </div>
            <div className="map-layout">
            <div><ChallengeMap lang={lang} progress={mapProgress} selected={selected} page={page} journey={journey?.to===selected?journey:null} onSelect={selectStage} onArrival={arrived}/>
                <ChallengeMapPager lang={lang} page={page} current={currentStage} selected={selected} onPage={value=>{cancelEntry();setPage(value);}} onCurrent={()=>selectStage(currentStage)}/>
            </div>
            <article className="map-challenge-card">
                <div className="map-challenge-copy">
                    <p className="crown-eyebrow">{hundredMapText(lang,'selected')} · {hundredMapText(lang,'tile')} {selected}</p>
                    <h2><Gift size={19} aria-hidden="true"/>{rewardUnlocked(mapProgress,reward.id)?stageText(lang,'clearedReward'):nav('firstClear')}</h2>
                </div>
                <button className="map-reward" data-preview-reward={reward.id} onClick={()=>{cancelEntry();rememberFocus();setPreview({kind:reward.kind,id:reward.id});}} aria-label={`${circuitText(lang,'preview')} · ${rewardName(lang,reward.id)}`}><span className="map-reward-art"><CrownRewardArtwork kind={reward.kind} id={reward.id}/></span><small>{rewardUnlocked(mapProgress,reward.id)?stageText(lang,'clearedReward'):nav('firstClear')}</small><strong>{rewardName(lang,reward.id)}</strong><span>{circuitText(lang,'preview')}<ArrowUpRight size={15}/></span></button>
            </article></div>
        </div>
        </div>
        <div className="crown-tab-panel" role="tabpanel" id="crown-main-panel-collection" aria-labelledby="crown-main-tab-collection" hidden={tab!=='collection'} tabIndex={0}>
            <ChampionshipCollection lang={lang} progress={progress}/>
        </div>
        </div>
        {preview&&<RewardPreview lang={lang} reward={preview} progress={progress} onClose={closeOverlay}/>}
        {showInfo&&<CrownInfoDialog title={nav('details')} closeLabel={circuitText(lang,'close')} onClose={closeOverlay}>
            <QubeTeacher lang={lang} variant="compact">
            <p>{hundredMapText(lang,'help')}</p><p>{stageText(lang,'rules')}</p><p>{cloudText(lang,'help')}</p><p>{hintScopeText(lang)}</p>
            <p>★ {t('win')}<br/>★ {t('noHints')}<br/>★ {stage.timeControl==='10s'?stageText(lang,'quickMoves'):t('quick')}</p>
            <p>{musicMilestoneText(lang,'help')}</p><p>{cosmeticsSettingsText(lang,'settingsOnly')}</p>
            </QubeTeacher>
        </CrownInfoDialog>}
    </section>;
}

