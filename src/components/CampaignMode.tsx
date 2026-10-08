'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, ChevronLeft, ChevronRight, Info, LockKeyhole, Trophy, ChessPawn, ChessKnight, ChessBishop, ChessRook, ChessQueen, ChessKing } from 'lucide-react';
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
import { circuitAccess } from '../lib/circuitAccess';
import { useCircuitAccess } from '../hooks/useCircuitAccess';
import { CircuitLoginGate } from './CircuitLoginGate';
import {cloudText} from '../locales/cloudText';
import { crownAdmissionEnabled } from '../config/crownAdmission';
import { authorizeCrownStage } from '../lib/crownAdmission';
import { createCrownEntryController } from '../lib/crownEntry';
import {QubeTeacher} from './QubeTeacher';
import {hintScopeText} from '../locales/hintScopeText';
import {cosmeticsSettingsText} from '../locales/cosmeticsSettingsText';
import {CrownHintRecovery} from './CrownHintRecovery';
import { PixelCastleBackdrop } from './PixelCastleBackdrop';
import { crownEncounterForStage } from './crownCollection';
import { crownNavigationText } from '../locales/crownNavigationText';
import { CrownInfoDialog, CrownOpponentArtwork, CrownRewardArtwork, CrownTabs } from './CrownNavigation';
import './campaign.css';
import './crown-enemy-staging.css';
import {QubeCompanion} from './QubeCompanion';
import './crown-companion-scene.css';


type CampaignProps={lang:Language;user:User;onBack:()=>void;onLogin:()=>void;onPlayingChange?:(playing:boolean)=>void};
export function CampaignMode(props:CampaignProps) {
    const {allowed,revision}=useCircuitAccess(props.user);
    if(!allowed)return <CircuitLoginGate lang={props.lang} onBack={props.onBack} onLogin={props.onLogin}/>;
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
    const [entry]=useState(()=>createCrownEntryController({
        enabled:crownAdmissionEnabled,authorize:authorizeCrownStage,
        legacyPaid:async(userId,signal)=>{
            const {readStripeMembershipStatus}=await import('../lib/stripeMembership');
            return (await readStripeMembershipStatus(userId,signal)).active;
        },
        legacyInterstitial:requestCircuitInterstitial,
    }));
    const runPermit=useRef<(()=>boolean)|null>(null);
    useEffect(()=>()=>{entry.cancel();runPermit.current=null;onPlayingChange?.(false);},[entry,onPlayingChange]);
    useEffect(()=>{
        const cancel=()=>{entry.cancel();setStarting(false);};
        window.addEventListener('popstate',cancel);
        return()=>window.removeEventListener('popstate',cancel);
    },[entry]);
    const cancelEntry=()=>{entry.cancel();setStarting(false);setEntryError(false);};
    useEffect(()=>{
        if(activeId) soundManager.playBGM(battleMusicUrl(runDesign.music));
        else soundManager.stopBGM();
        return()=>soundManager.stopBGM();
    },[activeId,runDesign.music]);
    const t=(key:Parameters<typeof campaignText>[1])=>campaignText(lang,key);
    const loop=(key:Parameters<typeof championshipText>[1])=>championshipText(lang,key);
    const nav=(key:Parameters<typeof crownNavigationText>[1])=>crownNavigationText(lang,key);
    const cleared=progress.stageStars?.length??0;
    const selected=selection??Math.min(cleared+1,100);
    const stage=CIRCUIT_STAGES[selected-1],reward=CHAMPIONSHIP_REWARDS[selected-1];
    const page=chosenPage??Math.floor((selected-1)/10);
    const currentStage=Math.min(cleared+1,100);
    const stars=totalCircuitStars(progress);
    const selectedStars=progress.stageStars?.[selected-1]??0;
    const unlocked=stageUnlocked(progress,selected);
    const rememberFocus=()=>{previousFocus.current=document.activeElement as HTMLElement;};
    const closeOverlay=()=>{setPreview(null);setShowInfo(false);previousFocus.current?.focus();};
    const selectStage=(id:number)=>{cancelEntry();setSelected(id);setPage(Math.floor((id-1)/10));};
    const complete=useCallback((result:CampaignOutcome)=>{
        if(!activeId||!runPermit.current?.()||!circuitAccess.canPlay(user))return;
        update(value=>finishStage(value,activeId,result));
        setOutcome(result);
    },[activeId,update,user]);
    const start=async(id:number)=>{
        if(!circuitAccess.canPlay(user)||!loaded||!stageUnlocked(progress,id))return;
        if(entry.pending)return;
        const permit=circuitAccess.permit(user);
        setStarting(true);setEntryError(false);
        const result=await entry.start(user.id,id,permit);
        if(result.state==='cancelled'||result.state==='busy')return;
        setStarting(false);
        if(result.state!=='ready'){setEntryError(true);return;}
        if(!result.canActivate())return;
        runPermit.current=permit;
        setCrownRunId(crypto.randomUUID());
        setRunPersonality(randomCPUPersonality());
        setRunDesign({music:progress.music,effect:progress.effect,piece:progress.piece});setRunMusic(CIRCUIT_MUSIC.filter(track=>rewardUnlocked(progress,track.id)).map(track=>track.id));onPlayingChange?.(true);
        setFirstClear(!progress.stageStars?.[id-1]);setSelected(id);setOutcome(null);setRun(value=>value+1);setActiveId(id);
    };
    const leaveStage=()=>{runPermit.current=null;cancelEntry();setActiveId(null);onPlayingChange?.(false);};
    const afterResult=async(action:()=>void)=>{
        const permit=runPermit.current;
        if(!permit?.())return;
        if(permit()&&runPermit.current===permit)action();
    };
    if(activeId) {
        const active=CIRCUIT_STAGES[activeId-1];
        return <LocalGameBoard key={`${activeId}-${run}`} lang={lang} user={user} cpuLevel={active.strength<12?1:active.strength<23?3:5}
            crownStageId={activeId} crownRunId={crownRunId}
            cpuPersonality={runPersonality} cpuSearchProfile={active.search} campaignLabel={`${stageText(lang,'stage')} ${activeId} / 100 · ${loop('strength')} ${active.strength}`} opponentLabel={active.opponent}
            onlineRole={side} timeControl={active.timeControl} onComplete={complete} onHome={leaveStage}
            resultPanel={outcome&&<CampaignResult lang={lang} stageId={activeId} firstClear={firstClear} effect={runDesign.effect} pieceFinish={runDesign.piece} foeWhite={side==='black'} outcome={outcome} saveError={storageError}
                newMusic={CIRCUIT_MUSIC.filter(track=>!runMusic.includes(track.id)&&rewardUnlocked(progress,track.id)).map(track=>track.id)}
                onRetry={()=>void afterResult(()=>start(activeId))} onBack={()=>void afterResult(leaveStage)}
                onNext={outcome.won&&activeId<100?()=>void afterResult(()=>start(activeId+1)):undefined}/>}/>;
    }
    return <section className="campaign-screen crown-screen" data-circuit-stage={selected} aria-label={t('title')}>
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
        <div className="crown-challenge">
            <CrownHintRecovery userId={user.id} lang={lang}/>
            <section className="crown-progress" aria-label={loop('record')}>
                <span><Trophy size={15} aria-hidden="true"/>{t('cleared')} <b>{cleared}/100</b></span>
                <progress max={100} value={cleared} aria-label={t('cleared')}/>
                <span className="crown-stars" aria-label={`${musicMilestoneText(lang,'total')} ${stars}/300`}>★ {stars}/300</span>
            </section>
            <article className="crown-encounter" data-stage-unlocked={unlocked}>
                <div className="crown-castle-scene"><PixelCastleBackdrop stageId={selected}/></div>
                <div className="crown-encounter-copy">
                    <p className="crown-eyebrow">{selectedStars?nav('improveStars'):unlocked?nav('nextStage'):t('locked')}</p>
                    <h2>{stageText(lang,'stage')} <span>{String(selected).padStart(3,'0')}</span></h2>
                    <div className="crown-opponent"><span className="crown-enemy-silhouette" aria-hidden="true"><CrownOpponentArtwork stageId={selected} player={side==='white'?'black':'white'}/></span><span className="crown-companion"><QubeCompanion key={selected} state={starting?'anticipation':'idle'} size={72} paused={tab!=='challenge'}/><span className="crown-companion-label">{nav('withQube')}</span></span><div className="crown-opponent-info"><strong>{selected===100?nav('kingBoss'):stage.opponent}</strong><span>{loop('strength')} {stage.strength}/34</span><span>{stage.timeControl==='10m'?dict[lang].tc10m:stage.timeControl==='3m'?dict[lang].tc3m:dict[lang].tc10s}</span></div></div>
                </div>
                <button className="crown-next-reward" data-preview-reward={reward.id} onClick={()=>{cancelEntry();rememberFocus();setPreview({kind:reward.kind,id:reward.id});}} aria-label={`${circuitText(lang,'preview')} · ${rewardName(lang,reward.id)}`}>
                    <span className="crown-eyebrow">{rewardUnlocked(progress,reward.id)?stageText(lang,'clearedReward'):nav('firstClear')}</span>
                    <span className="crown-next-art"><CrownRewardArtwork kind={reward.kind} id={reward.id}/></span>
                    <strong>{rewardName(lang,reward.id)}</strong>
                    <span className="crown-preview-label">{circuitText(lang,'preview')} <ArrowUpRight size={15}/></span>
                </button>
                <div className="crown-launch">
                    <fieldset className="campaign-side"><legend>{nav('chooseSide')}</legend>{(['white','black'] as const).map(value=><button key={value} type="button" aria-pressed={side===value} onClick={()=>{cancelEntry();setSide(value);}}>{t(value)}</button>)}</fieldset>
                    <button className="campaign-primary" disabled={starting||!loaded||!unlocked} onClick={()=>void start(selected)}>{starting||!loaded?dict[lang].loading:unlocked?selectedStars?t('retry'):t('challenge'):t('locked')}<ArrowUpRight size={20}/></button>
                    <p className="crown-objective">{!unlocked?nav('lockedGoal'):cleared===100?nav('completeGoal'):`★ ${t('win')} · ★ ${t('noHints')} · ★ ${stage.timeControl==='10s'?stageText(lang,'quickMoves'):t('quick')}`}</p>
                </div>
            </article>
            <nav className="crown-journey" aria-label={nav('castleRoute')}>
                <div className="crown-route">{CIRCUIT_STAGES.slice(page*10,page*10+10).map(item=>{
                    const available=stageUnlocked(progress,item.id),earned=progress.stageStars?.[item.id-1]??0,Enemy=opponentIcon(item.id);
                    return <button key={item.id} className="crown-route-node" aria-pressed={selected===item.id} aria-label={`${stageText(lang,'stage')} ${item.id} · ${item.opponent} · ${earned?`${earned}/3 ★`:available?nav('nextStage'):t('locked')}`} onClick={()=>selectStage(item.id)} data-stage={item.id} data-cleared={earned>0} data-locked={!available}>
                        <Enemy className="crown-route-piece" size={22} aria-hidden="true"/><strong>{String(item.id).padStart(2,'0')}</strong>
                        <span className="crown-route-status" aria-hidden="true">{earned?<Check size={12}/>:available?<ArrowUpRight size={12}/>:<LockKeyhole size={11}/>}</span>
                    </button>;
                })}</div>
                <div className="crown-pager"><button disabled={page===0} onClick={()=>{cancelEntry();setPage(page-1);}} aria-label={loop('previous')}><ChevronLeft size={18}/></button><div className="crown-route-caption"><span>{stageText(lang,'stage')} {page*10+1}–{page*10+10} / 100</span><button className="crown-jump-current" onClick={()=>selectStage(currentStage)} disabled={selected===currentStage&&page===Math.floor((currentStage-1)/10)}>{cleared===100?t('cleared'):nav('nextStage')} {currentStage}<ArrowUpRight size={14}/></button></div><button disabled={page===9} onClick={()=>{cancelEntry();setPage(page+1);}} aria-label={loop('next')}><ChevronRight size={18}/></button></div>
            </nav>
        </div>
        </div>
        <div className="crown-tab-panel" role="tabpanel" id="crown-main-panel-collection" aria-labelledby="crown-main-tab-collection" hidden={tab!=='collection'} tabIndex={0}>
            <ChampionshipCollection lang={lang} progress={progress}/>
        </div>
        </div>
        {preview&&<RewardPreview lang={lang} reward={preview} progress={progress} onClose={closeOverlay}/>}
        {showInfo&&<CrownInfoDialog title={nav('details')} closeLabel={circuitText(lang,'close')} onClose={closeOverlay}>
            <QubeTeacher lang={lang} variant="compact">
            <p>{nav('insideCastle')}</p><p>{stageText(lang,'intro')}</p><p>{stageText(lang,'rules')}</p><p>{cloudText(lang,'help')}</p><p>{hintScopeText(lang)}</p>
            <p>★ {t('win')}<br/>★ {t('noHints')}<br/>★ {stage.timeControl==='10s'?stageText(lang,'quickMoves'):t('quick')}</p>
            <p>{musicMilestoneText(lang,'help')}</p><p>{cosmeticsSettingsText(lang,'settingsOnly')}</p>
            </QubeTeacher>
        </CrownInfoDialog>}
    </section>;
}

function opponentIcon(stageId:number) {
    return {pawn:ChessPawn,knight:ChessKnight,bishop:ChessBishop,rook:ChessRook,queen:ChessQueen,king:ChessKing}[crownEncounterForStage(stageId).foe];
}
