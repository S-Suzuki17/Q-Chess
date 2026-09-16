'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, LockKeyhole, Trophy } from 'lucide-react';
import { BOSSES, bossUnlocked, equipReward, finishBoss, outcomeStars, rewardUnlocked, REWARD_BOARDS, REWARD_PIECES, highestUnlockedLap, lapStars, lapCleared, campaignOpponent, type BossId, type CampaignOutcome, type VictoryFinish } from '../config/campaign';
import { CHAMPIONSHIP_REWARDS } from '../config/championshipRewards';
import { championshipText } from '../locales/championshipText';
import { campaignText, bossDescription, rewardName } from '../locales/campaignText';
import { cpuDifficulty } from '../config/cpuDifficulty';
import { matchText } from '../locales/matchText';
import { dict, type Language } from '../locales/dict';
import type { User } from '../types/game';
import { useCampaignProgress } from '../hooks/useCampaignProgress';
import LocalGameBoard from './LocalGameBoard';
import { ChampionshipCollection } from './ChampionshipCollection';
import { VictoryCelebration } from './VictoryCelebration';
import './campaign.css';

function Result({lang,bossIndex,lap,effect,outcome,onNext,onRetry,onBack,saveError}: {
    lang:Language; bossIndex:number; lap:number; effect:VictoryFinish; outcome:CampaignOutcome; onNext?:()=>void; onRetry:()=>void; onBack:()=>void; saveError:boolean;
}) {
    const dialog=useRef<HTMLDialogElement>(null);
    useEffect(()=>{ const node=dialog.current; node?.showModal(); return ()=>node?.close(); },[]);
    const t=(key:Parameters<typeof campaignText>[1])=>campaignText(lang,key);
    const boss=BOSSES[bossIndex];
    const stars=outcomeStars(outcome);
    const championReward=bossIndex===BOSSES.length-1 ? CHAMPIONSHIP_REWARDS[lap-1] : undefined;
    return <dialog ref={dialog} className="campaign-result" aria-labelledby="campaign-result-title" onCancel={event=>event.preventDefault()}>
        {outcome.won && <VictoryCelebration effect={effect}/>}
        <div className="campaign-result-card">
            <span className="campaign-result-emblem" aria-hidden="true">{outcome.won ? '♛' : boss.symbol}</span>
            <p>{championshipText(lang,'lap')} {lap} · {boss.name} · {t('round')} {bossIndex+1}</p>
            <h2 id="campaign-result-title">{outcome.won ? bossIndex===BOSSES.length-1 ? t('champion') : t('win') : outcome.draw ? t('draw') : t('retry')}</h2>
            {!outcome.won && !outcome.draw && <p>{t('loss')}</p>}
            {outcome.won && <>
                <div className="campaign-stars" aria-label={`${stars}/3`}>{'★'.repeat(stars)}{'☆'.repeat(3-stars)}</div>
                {lap===1 && <p className="campaign-reward-earned"><Check size={18}/>{t('rewards')} · {rewardName(lang,boss.reward)}</p>}
                {championReward && <p className="campaign-reward-earned"><Trophy size={18}/>{rewardName(lang,championReward.id)}</p>}
            </>}
            <p>{t('noHints')} · {t('quick')}</p>
            {saveError && <p role="alert">{t('saveError')}</p>}
            <div className="campaign-result-actions">
                {onNext && <button className="campaign-primary" onClick={onNext}>{bossIndex===BOSSES.length-1?championshipText(lang,'advance'):t('next')}<ArrowUpRight size={18}/></button>}
                <button onClick={onRetry}>{t('retry')}</button><button onClick={onBack}>{t('back')}</button>
            </div>
        </div>
    </dialog>;
}

export function CampaignMode({lang,user,onBack}: {lang:Language;user:User;onBack:()=>void}) {
    const {progress,loaded,storageError,update}=useCampaignProgress();
    const [selection,setSelected]=useState<number|null>(null);
    const [activeId,setActiveId]=useState<BossId|null>(null);
    const [chosenLap,setChosenLap]=useState<number|null>(null);
    const [activeLap,setActiveLap]=useState(1);
    const [run,setRun]=useState(0);
    const [side,setSide]=useState<'white'|'black'>('white');
    const [outcome,setOutcome]=useState<CampaignOutcome|null>(null);
    const t=(key:Parameters<typeof campaignText>[1])=>campaignText(lang,key);
    const unlockedLap=highestUnlockedLap(progress);
    const lap=chosenLap??unlockedLap;
    const roundStars=lapStars(progress,lap);
    const cleared=Object.keys(roundStars).length;
    const selected=selection??Math.min(cleared,BOSSES.length-1);
    const boss=BOSSES[selected];
    const previewOpponent=campaignOpponent(selected,lap);
    const activeIndex=Math.max(0,BOSSES.findIndex(item=>item.id===activeId));
    const activeOpponent=useMemo(()=>campaignOpponent(activeIndex,activeLap),[activeIndex,activeLap]);
    const loop=(key:Parameters<typeof championshipText>[1])=>championshipText(lang,key);
    const complete=useCallback((result:CampaignOutcome)=>{
        if (!activeId) return;
        update(value=>finishBoss(value,activeId,result,activeLap));
        setOutcome(result);
    },[activeId,activeLap,update]);
    const start=(index:number,circuit=lap)=>{
        const target=BOSSES[index];
        if (!loaded || !target || !bossUnlocked(progress,target.id,circuit)) return;
        setChosenLap(circuit); setActiveLap(circuit); setSelected(index); setOutcome(null); setRun(value=>value+1); setActiveId(target.id);
    };
    if (activeId) {
        const active=BOSSES[activeIndex];
        return <LocalGameBoard key={`${activeLap}-${activeId}-${run}`} lang={lang} user={user} cpuLevel={activeOpponent.level}
            cpuPersonality={activeOpponent.personality} cpuSearchProfile={activeOpponent.search} campaignLabel={`${loop('lap')} ${activeLap} · ${t('round')} ${activeIndex+1}`} opponentLabel={active.name}
            onlineRole={side} timeControl="10m" onComplete={complete} onHome={()=>setActiveId(null)}
            resultPanel={outcome && <Result lang={lang} bossIndex={activeIndex} lap={activeLap} effect={progress.effect} outcome={outcome} saveError={storageError}
                onRetry={()=>start(activeIndex,activeLap)} onBack={()=>setActiveId(null)}
                onNext={outcome.won ? ()=>activeIndex<BOSSES.length-1 ? start(activeIndex+1,activeLap) : start(0,activeLap+1) : undefined}/>}/>;
    }
    return <section className="campaign-screen" data-campaign-lap={lap} aria-label={t('title')}>
        <header className="campaign-header"><button onClick={onBack}><ArrowLeft size={18}/>{t('back')}</button><span>Q-GAMBIT</span><span>{cleared}/4 <Trophy size={16}/></span></header>
        <div className="campaign-intro"><p>{t('title')}</p><h1>{lap>1?loop('ascension'):cleared===4 ? t('champion') : t('intro')}</h1><p>{t('local')}</p></div>
        {storageError && <p className="campaign-save-error" role="alert">{t('saveError')}</p>}
        <section className="campaign-circuit" aria-label={loop('record')}>
            <div className="campaign-circuit-nav"><button disabled={lap===1} onClick={()=>{setChosenLap(lap-1);setSelected(null);}}>{loop('previous')}</button><strong>{loop('lap')} {lap}</strong><button disabled={lap>=unlockedLap} onClick={()=>{setChosenLap(lap+1);setSelected(null);}}>{loop('next')}</button></div>
            <div className="campaign-record"><span>{loop('wins')} <b>{unlockedLap-1}</b></span><span>{loop('medals')} <b>{Object.values(roundStars).reduce((sum,stars)=>sum+(stars??0),0)}/12</b></span><span>{loop('strength')} <b>{previewOpponent.strength}/5</b></span></div>
            <p>{loop('cap')}</p>
            {lapCleared(progress,lap) && <button className="campaign-primary" onClick={()=>{setChosenLap(lap+1);setSelected(null);}}>{loop('advance')}<ArrowUpRight size={18}/></button>}
        </section>
        <div className="campaign-journey">
            <nav className="campaign-rounds" aria-label={t('title')}>{BOSSES.map((item,index)=>{
                const unlocked=bossUnlocked(progress,item.id,lap), stars=roundStars[item.id]??0;
                return <button key={item.id} className="campaign-round" aria-pressed={selected===index} onClick={()=>setSelected(index)} data-boss={item.id}>
                    <span className="campaign-round-number">0{index+1}</span><span className="campaign-boss-icon" aria-hidden="true">{item.symbol}</span>
                    <span><strong>{item.name}</strong><small>{stars ? t('cleared') : unlocked ? `${t('round')} ${index+1}` : t('locked')}</small></span>
                    <span className="campaign-round-status">{stars ? <span aria-label={`${stars}/3`}>{'★'.repeat(stars)}</span> : unlocked ? <ArrowUpRight size={18}/> : <LockKeyhole size={17}/>}</span>
                </button>;
            })}</nav>
            <article className="campaign-boss-card">
                <div className="campaign-boss-heading"><span className="campaign-boss-seal" aria-hidden="true">{boss.symbol}</span><div><p>{t('round')} {selected+1} / 4</p><h2>{boss.name}</h2></div></div>
                <p>{lap===1?bossDescription(lang,selected):loop(previewOpponent.personality)}</p>
                <span className="campaign-difficulty">{matchText(lang,cpuDifficulty(previewOpponent.level).ja,cpuDifficulty(previewOpponent.level).en)} · {loop(previewOpponent.personality)}</span>
                <div className="campaign-boss-reward"><Trophy size={20}/><span><small>{t('rewards')} · {t(boss.rewardKind==='board'?'board':'piece')}</small><strong>{rewardName(lang,boss.reward)}</strong></span>{rewardUnlocked(progress,boss.reward) && <Check size={18}/>}</div>
                <fieldset className="campaign-side"><legend>{t('challenge')}</legend>{(['white','black'] as const).map(value=><button key={value} type="button" aria-pressed={side===value} onClick={()=>setSide(value)}>{t(value)}</button>)}</fieldset>
                <button className="campaign-primary" disabled={!loaded || !bossUnlocked(progress,boss.id,lap)} onClick={()=>start(selected)}>{!loaded ? dict[lang].loading : bossUnlocked(progress,boss.id,lap) ? t('challenge') : t('locked')}<ArrowUpRight size={20}/></button>
                <p className="campaign-medal-help">★ {t('win')} · ★ {t('noHints')} · ★ {t('quick')}</p>
            </article>
        </div>
        <section className="campaign-collection" aria-label={t('rewards')}><h2>{t('rewards')}</h2>
            {(['board','piece'] as const).map(kind=><div className="campaign-equipment-group" key={kind}><h3>{t(kind)}</h3><div className="campaign-equipment">
                {(kind==='board' ? ['standard','slate','obsidian'] : ['standard','copper','jade']).map(value=>{
                    const unlocked=rewardUnlocked(progress,value), equipped=progress[kind]===value;
                    const colors=kind==='board' ? value==='standard' ? {light:'#adb494',dark:'#424e3d'} : REWARD_BOARDS[value as keyof typeof REWARD_BOARDS] : null;
                    return <button key={value} disabled={!loaded||!unlocked} aria-pressed={equipped} onClick={()=>update(current=>equipReward(current,kind,value))} data-equipment={`${kind}-${value}`}>
                        {colors ? <span className="campaign-board-swatch" aria-hidden="true">{Array.from({length:9},(_,index)=><i key={index} style={{background:index%2?colors.dark:colors.light}}/>)}</span>
                            : <span className="campaign-piece-swatch" aria-hidden="true" style={{color:REWARD_PIECES[value as keyof typeof REWARD_PIECES].white,background:REWARD_PIECES[value as keyof typeof REWARD_PIECES].black}}>♞</span>}
                        <span><strong>{rewardName(lang,value)}</strong><small>{equipped ? t('equipped') : unlocked ? t('equip') : t('locked')}</small></span>
                        {equipped ? <Check size={16}/> : !unlocked ? <LockKeyhole size={16}/> : null}
                    </button>;
                })}
            </div></div>)}
        </section>
        <ChampionshipCollection lang={lang} progress={progress} onEquip={(kind,id)=>update(value=>equipReward(value,kind,id))}/>
    </section>;
}
