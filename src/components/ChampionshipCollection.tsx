'use client';
import { useState } from 'react';
import { Check, LockKeyhole } from 'lucide-react';
import { CHAMPIONSHIP_REWARDS, ARCHIVED_REWARDS, referencePieceForBoard } from '../config/championshipRewards';
import { rewardClearCount, rewardUnlocked, type CampaignProgress } from '../config/campaign';
import { campaignText, rewardName } from '../locales/campaignText';
import { championshipText, effectPreviewLabel } from '../locales/championshipText';
import type { Language } from '../locales/dict';
import { RewardPreview, type VisualReward } from './RewardPreview';
import { circuitText } from '../locales/circuitText';
import { VictoryCelebration } from './VictoryCelebration';
import { BoardRewardArtwork, EffectRewardArtwork, PieceRewardArtwork, MusicRewardArtwork } from './RewardArtwork';
import { AccountAvatar } from './AccountAvatar';
import { stageText } from '../locales/stageText';
import { rewardCraftText } from '../locales/rewardCraftText';
import { cosmeticsSettingsText } from '../locales/cosmeticsSettingsText';
import { circuitIconForFrame } from '../config/circuitIcons';
import { iconEditorText } from '../locales/iconEditorText';

export function ChampionshipCollection({lang,progress}:{lang:Language;progress:CampaignProgress;onEquip?:(kind:'board'|'effect'|'piece'|'music'|'avatar',id:string)=>void}) {
    const [preview,setPreview]=useState<VisualReward|null>(null);
    const wins=rewardClearCount(progress);
    const [chosenGrade,setGrade]=useState<number|null>(null);
    const [previewRun,setPreviewRun]=useState(0);
    const grade=chosenGrade??Math.min(10,Math.max(1,Math.ceil(wins/10)));
    const t=(key:Parameters<typeof championshipText>[1])=>championshipText(lang,key);
    return <section className="championship-collection" aria-label={t('collection')}>
        {previewRun>0 && <VictoryCelebration key={`${progress.effect}-${previewRun}`} effect={progress.effect}/>}
        <header><div><h2>{t('collection')}</h2><p>{Math.min(100,wins)} / 100 · {wins>=100 ? t('complete') : `${campaignText(lang,'board')} 30 · ${campaignText(lang,'piece')} 25 · ${stageText(lang,'frame')} 15 · ${t('effect')} 20 · ${circuitText(lang,'music')} 10`}</p></div>
            <label>{t('tier')}<select value={grade} onChange={event=>setGrade(Number(event.target.value))}>{Array.from({length:10},(_,index)=><option key={index} value={index+1}>{index+1} · {index*10+1}–{index*10+10}</option>)}</select></label>
        </header>
        <div className="championship-grid">{CHAMPIONSHIP_REWARDS.slice((grade-1)*10,grade*10).map(reward=>{
            const unlocked=rewardUnlocked(progress,reward.id);
            return <article key={reward.id} className="championship-reward" data-championship-reward={reward.id} data-piece-form={reward.kind==='piece'?reward.form:undefined} data-board-profile={reward.kind==='board'?reward.profile:undefined} data-reward-grade={reward.tier} data-acquired={unlocked}>
                <span className="championship-number"><span>{String(reward.requiredWins).padStart(3,'0')} <span className="championship-edition">/ 100</span></span>{unlocked ? <Check size={15}/> : <LockKeyhole size={13}/>}</span>
                {reward.kind==='music'?<div className="reward-art-stage"><MusicRewardArtwork tier={reward.tier}/></div>:<button className="reward-art-stage" aria-label={`${circuitText(lang,'preview')} · ${rewardName(lang,reward.id)}`} onClick={()=>setPreview({kind:reward.kind,id:reward.id})}>
                    {reward.kind==='board'?<BoardRewardArtwork preset={reward}/>:reward.kind==='effect'?<EffectRewardArtwork preset={reward}/>:reward.kind==='avatar'?<AccountAvatar name="Q" url={circuitIconForFrame(reward.id)?.url} frame={reward.id} size={100}/>:<PieceRewardArtwork finish={reward.id} tier={reward.tier}/>}
                </button>}
                <div className="reward-grade-line" aria-hidden="true">{Array.from({length:10},(_,i)=><i key={i} data-active={i<reward.tier}/>)}</div>
                <strong>{rewardName(lang,reward.id)}</strong>
                <small className="reward-craft-caption">{reward.kind==='board'?rewardCraftText(lang,reward.motif):reward.kind==='piece'?rewardName(lang,reward.motif):reward.kind==='music'?circuitText(lang,'music'):reward.kind==='avatar'?stageText(lang,'frame'):t('effect')}</small>
                {reward.kind==='board'&&referencePieceForBoard(reward.id)&&<small>{campaignText(lang,'board')} + {campaignText(lang,'piece')}</small>}
                {reward.kind==='avatar'&&<small>{iconEditorText(lang,'portrait',circuitIconForFrame(reward.id)?.number)}</small>}
                <span className="championship-unlock">{cosmeticsSettingsText(lang,unlocked?'acquired':'notAcquired')}{!unlocked&&` · ${stageText(lang,'stage')} ${reward.requiredWins}`}</span>
                <div className="championship-reward-actions">{reward.kind!=='music'&&<button data-preview-reward={reward.id} onClick={()=>setPreview({kind:reward.kind,id:reward.id})}>{circuitText(lang,'preview')}</button>}
                </div>
            </article>;
        })}</div>
        <div className="championship-pager"><button disabled={grade===1} onClick={()=>setGrade(grade-1)}>{t('previous')}</button><span>{grade} / 10</span><button disabled={grade===10} onClick={()=>setGrade(grade+1)}>{t('next')}</button></div>
        <p>{cosmeticsSettingsText(lang,'settingsOnly')}</p>
        {ARCHIVED_REWARDS.some(reward=>rewardUnlocked(progress,reward.id))&&<details className="campaign-legacy-collection"><summary>{campaignText(lang,'rewards')} · {cosmeticsSettingsText(lang,'acquired')}</summary><div className="campaign-equipment">{ARCHIVED_REWARDS.filter(reward=>rewardUnlocked(progress,reward.id)).map(reward=><div key={reward.id}><strong>{rewardName(lang,reward.id)}</strong><small>{cosmeticsSettingsText(lang,'acquired')}</small>{reward.kind!=='music'&&<button data-preview-reward={reward.id} onClick={()=>setPreview({kind:reward.kind,id:reward.id})}>{circuitText(lang,'preview')}</button>}</div>)}</div></details>}
        <div className="championship-effect-actions">
            <button data-testid="preview-victory-effect" disabled={progress.effect==='standard'} onClick={()=>setPreviewRun(value=>value+1)}>{effectPreviewLabel(lang)} ▷</button></div>
        {preview && <RewardPreview lang={lang} reward={preview} progress={progress} onClose={()=>setPreview(null)}/>}
    </section>;
}
