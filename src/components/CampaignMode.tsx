'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, LockKeyhole, Trophy } from 'lucide-react';
import { rewardUnlocked, rewardPiece, rewardBoard, totalCircuitStars, type CampaignOutcome, type BoardFinish, type PieceFinish } from '../config/campaign';
import { CHAMPIONSHIP_REWARDS } from '../config/championshipRewards';
import { championshipText } from '../locales/championshipText';
import { campaignText, rewardName } from '../locales/campaignText';
import { dict, type Language } from '../locales/dict';
import type { User } from '../types/game';
import { useCampaignProgress } from '../hooks/useCampaignProgress';
import LocalGameBoard from './LocalGameBoard';
import { ChampionshipCollection } from './ChampionshipCollection';
import { CampaignResult } from './CampaignResult';
import { RewardSigil } from './RewardArtwork';
import { battleMusicTitle, battleMusicUrl, circuitMusic, CIRCUIT_MUSIC } from '../config/circuitMusic';
import { musicMilestoneText } from '../locales/musicMilestoneText';
import { circuitText } from '../locales/circuitText';
import { soundManager } from '../lib/SoundService';
import { RewardPreview, type VisualReward } from './RewardPreview';
import { CIRCUIT_STAGES, finishStage, stageUnlocked } from '../config/circuitStages';
import { stageText } from '../locales/stageText';
import { requestCircuitInterstitial } from '../lib/adPolicy';
import { circuitAccess } from '../lib/circuitAccess';
import { useCircuitAccess } from '../hooks/useCircuitAccess';
import { CircuitLoginGate } from './CircuitLoginGate';
import { cosmeticsSettingsText } from '../locales/cosmeticsSettingsText';
import {cloudText} from '../locales/cloudText';
import './campaign.css';


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
    const [firstClear,setFirstClear]=useState(false);
    const [run,setRun]=useState(0);
    const [side,setSide]=useState<'white'|'black'>('white');
    const [preview,setPreview]=useState<VisualReward|null>(null);
    const [outcome,setOutcome]=useState<CampaignOutcome|null>(null);
    const [runMusic,setRunMusic]=useState<readonly string[]>([]);
    const [runDesign,setRunDesign]=useState(()=>({music:progress.music,effect:progress.effect}));
    const adBreakHandled=useRef('');
    const runPermit=useRef<(()=>boolean)|null>(null);
    useEffect(()=>()=>{runPermit.current=null;onPlayingChange?.(false);},[onPlayingChange]);
    useEffect(()=>{
        if(activeId) soundManager.playBGM(battleMusicUrl(runDesign.music));
        else soundManager.stopBGM();
        return()=>soundManager.stopBGM();
    },[activeId,runDesign.music]);
    const t=(key:Parameters<typeof campaignText>[1])=>campaignText(lang,key);
    const loop=(key:Parameters<typeof championshipText>[1])=>championshipText(lang,key);
    const cleared=progress.stageStars?.length??0;
    const selected=selection??Math.min(cleared+1,100);
    const stage=CIRCUIT_STAGES[selected-1],reward=CHAMPIONSHIP_REWARDS[selected-1];
    const page=chosenPage??Math.floor((selected-1)/10);
    const complete=useCallback((result:CampaignOutcome)=>{
        if(!activeId||!runPermit.current?.()||!circuitAccess.canPlay(user))return;
        update(value=>finishStage(value,activeId,result));
        setOutcome(result);
    },[activeId,update,user]);
    const start=(id:number)=>{
        if(!circuitAccess.canPlay(user)||!loaded||!stageUnlocked(progress,id))return;
        runPermit.current=circuitAccess.permit(user);
        setRunDesign({music:progress.music,effect:progress.effect});setRunMusic(CIRCUIT_MUSIC.filter(track=>rewardUnlocked(progress,track.id)).map(track=>track.id));onPlayingChange?.(true);
        setFirstClear(!progress.stageStars?.[id-1]);setSelected(id);setOutcome(null);setRun(value=>value+1);setActiveId(id);
    };
    const leaveStage=()=>{runPermit.current=null;setActiveId(null);onPlayingChange?.(false);};
    const afterResult=async(action:()=>void)=>{
        const permit=runPermit.current;
        if(!permit?.())return;
        const key=`${activeId}-${run}`;
        if(adBreakHandled.current===key)return;
        adBreakHandled.current=key;
        try { await requestCircuitInterstitial(key); } finally { if(permit()&&runPermit.current===permit)action(); }
    };
    if(activeId) {
        const active=CIRCUIT_STAGES[activeId-1];
        return <LocalGameBoard key={`${activeId}-${run}`} lang={lang} user={user} cpuLevel={active.strength<12?1:active.strength<23?3:5}
            cpuPersonality={active.personality} cpuSearchProfile={active.search} campaignLabel={`${stageText(lang,'stage')} ${activeId} / 100 · ${loop('strength')} ${active.strength}`} opponentLabel={active.opponent}
            onlineRole={side} timeControl={active.timeControl} onComplete={complete} onHome={leaveStage}
            resultPanel={outcome&&<CampaignResult lang={lang} stageId={activeId} firstClear={firstClear} effect={runDesign.effect} outcome={outcome} saveError={storageError}
                newMusic={CIRCUIT_MUSIC.filter(track=>!runMusic.includes(track.id)&&rewardUnlocked(progress,track.id)).map(track=>track.id)}
                onRetry={()=>void afterResult(()=>start(activeId))} onBack={()=>void afterResult(leaveStage)}
                onNext={outcome.won&&activeId<100?()=>void afterResult(()=>start(activeId+1)):undefined}/>}/>;
    }
    return <section className="campaign-screen" data-circuit-stage={selected} aria-label={t('title')}>
        <header className="campaign-header"><button onClick={onBack}><ArrowLeft size={18}/>{t('back')}</button><span>Q-GAMBIT</span><span>{cleared}/100 <Trophy size={16}/></span></header>
        <div className="campaign-intro"><p>{t('title')}</p><h1>{stageText(lang,'intro')}</h1><p>{stageText(lang,'rules')}</p><p>{cloudText(lang,'help')}</p></div>
        {storageError&&<p className="campaign-save-error" role="alert">{t('saveError')}</p>}
        <section className="campaign-circuit" aria-label={loop('record')}>
            <div className="campaign-record"><span>{t('cleared')} <b>{cleared}/100</b></span><span>{loop('medals')} <b>{(progress.stageStars??[]).reduce((sum,value)=>sum+value,0)}/300</b></span><span>{loop('strength')} <b>{stage.strength}/34</b></span></div>
            <div className="campaign-circuit-nav"><button disabled={page===0} onClick={()=>setPage(page-1)}>{loop('previous')}</button><strong>{stageText(lang,'stage')} {page*10+1}–{page*10+10}</strong><button disabled={page===9} onClick={()=>setPage(page+1)}>{loop('next')}</button></div>
        </section>
        <div className="campaign-journey">
            <nav className="campaign-rounds" aria-label={t('title')}>{CIRCUIT_STAGES.slice(page*10,page*10+10).map(item=>{
                const unlocked=stageUnlocked(progress,item.id),stars=progress.stageStars?.[item.id-1]??0;
                return <button key={item.id} className="campaign-round" aria-pressed={selected===item.id} onClick={()=>setSelected(item.id)} data-stage={item.id}>
                    <span className="campaign-round-number">{String(item.id).padStart(3,'0')}</span>
                    <span><strong>{item.opponent}</strong><small>{item.timeControl==='10m'?dict[lang].tc10m:item.timeControl==='3m'?dict[lang].tc3m:dict[lang].tc10s}</small></span>
                    <span className="campaign-round-status">{stars?<span aria-label={`${stars}/3`}>{'★'.repeat(stars)}</span>:unlocked?<ArrowUpRight size={18}/>:<LockKeyhole size={17}/>}</span>
                </button>;
            })}</nav>
            <article className="campaign-boss-card">
                <div className="campaign-boss-heading"><span className="campaign-boss-seal" aria-hidden="true"><RewardSigil motif="corona" tier={Math.ceil(selected/10)}/></span><div><p>{stageText(lang,'stage')} {selected} / 100</p><h2>{stage.opponent}</h2></div></div>
                <p>{stageText(lang,'rules')}</p>
                <span className="campaign-difficulty">{loop('strength')} {stage.strength} / 34 · {stage.timeControl==='10m'?dict[lang].tc10m:stage.timeControl==='3m'?dict[lang].tc3m:dict[lang].tc10s}</span>
                <div className="campaign-boss-reward"><Trophy size={20}/><span><small>{t('rewards')}</small><strong>{rewardName(lang,reward.id)}</strong></span>{rewardUnlocked(progress,reward.id)&&<Check size={18}/>}</div>
                <button data-preview-reward={reward.id} onClick={()=>setPreview({kind:reward.kind,id:reward.id})}>{circuitText(lang,'preview')}</button>
                <fieldset className="campaign-side"><legend>{t('challenge')}</legend>{(['white','black'] as const).map(value=><button key={value} type="button" aria-pressed={side===value} onClick={()=>setSide(value)}>{t(value)}</button>)}</fieldset>
                <button className="campaign-primary" disabled={!loaded||!stageUnlocked(progress,selected)} onClick={()=>start(selected)}>{!loaded?dict[lang].loading:stageUnlocked(progress,selected)?t('challenge'):t('locked')}<ArrowUpRight size={20}/></button>
                <p className="campaign-medal-help">★ {t('win')} · ★ {t('noHints')} · ★ {stage.timeControl==='10s'?stageText(lang,'quickMoves'):t('quick')}</p>
            </article>
        </div>
        <section className="campaign-collection" aria-label={t('rewards')}><h2>{t('rewards')}</h2>
            {(['board','piece'] as const).map(kind=><div className="campaign-equipment-group" key={kind}><h3>{t(kind)}</h3><div className="campaign-equipment">
                {(kind==='board' ? ['standard','walnut','mahogany','marble','slate','obsidian'] : ['standard','boxwood','ebony','alabaster','bronze','silver','gold','crystal','copper','jade']).filter(value=>rewardUnlocked(progress,value)).map(value=>{
                    return <div key={value} className="campaign-equipment-item"><div className="flex items-center gap-3 p-2" data-acquired-reward={`${kind}-${value}`}>
                        <div className="campaign-equipment-swatch">
                            {kind === 'board' ? <span className="campaign-board-swatch" aria-hidden="true" style={{background:rewardBoard(value as BoardFinish)?.dark,borderColor:rewardBoard(value as BoardFinish)?.light}}/>
                            : kind === 'piece' ? <span className="campaign-piece-swatch" aria-hidden="true" style={{color:rewardPiece(value as PieceFinish).white,background:rewardPiece(value as PieceFinish).black}}>♞</span>
                            : kind === 'music' ? <span className="campaign-music-swatch" aria-hidden="true">♪</span>
                            : <span className="campaign-effect-swatch" aria-hidden="true">✨</span>}
                        </div>
                        <span><strong>{rewardName(lang,value)}</strong><small>{cosmeticsSettingsText(lang,'acquired')}</small></span><Check size={16}/>
                    </div><button data-preview-reward={value} onClick={()=>setPreview({kind,id:value})}>{circuitText(lang,'preview')}</button></div>;
                })}
            </div></div>)}
        </section>
        <section className="campaign-collection" aria-label={circuitText(lang,'music')}><h2>{circuitText(lang,'music')}</h2><p>{cosmeticsSettingsText(lang,'settingsOnly')}</p>
            <div className="music-star-summary"><strong>{musicMilestoneText(lang,'title')}</strong><span>{musicMilestoneText(lang,'total')} ★ {totalCircuitStars(progress)} / 300</span><p>{musicMilestoneText(lang,'help')}</p></div>
            <div className="campaign-equipment campaign-music">{['standard',...CIRCUIT_MUSIC.map(track=>track.id),...CHAMPIONSHIP_REWARDS.filter(reward=>reward.kind==='music').map(reward=>reward.id)].map(id=>{
                const acquired=rewardUnlocked(progress,id);
                const milestone=circuitMusic(id);
                return <div key={id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#3b4537] p-3" data-acquired-music={acquired?id:undefined}>
                    <span aria-hidden="true">♫</span><span><strong>{id==='standard'?t('standard'):battleMusicTitle(id)}</strong>
                    <small>{cosmeticsSettingsText(lang,acquired?'acquired':'notAcquired')}{milestone&&` · ★ ${milestone.requiredStars}`}</small>
                    {milestone&&!acquired&&<small>{musicMilestoneText(lang,'remaining')} ★ {Math.max(0,milestone.requiredStars-totalCircuitStars(progress))}</small>}
                    {milestone&&<progress className="music-star-progress" max={milestone.requiredStars} value={acquired?milestone.requiredStars:Math.min(milestone.requiredStars,totalCircuitStars(progress))} aria-label={`${battleMusicTitle(id)} · ${musicMilestoneText(lang,'total')}`}/>}</span>{acquired&&<Check size={16}/>}
                    <button data-preview-music={id} onClick={()=>setPreview({kind:'music',id})}>{circuitText(lang,'preview')}</button>
                </div>;
            })}</div>
        </section>
        {preview && <RewardPreview lang={lang} reward={preview} progress={progress} onClose={()=>setPreview(null)}/>}
        <ChampionshipCollection lang={lang} progress={progress}/>
    </section>;
}
