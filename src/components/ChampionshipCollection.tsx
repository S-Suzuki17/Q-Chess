'use client';
import { useState } from 'react';
import { Check, LockKeyhole } from 'lucide-react';
import { CHAMPIONSHIP_REWARDS } from '../config/championshipRewards';
import { highestUnlockedLap, rewardUnlocked, type CampaignProgress } from '../config/campaign';
import { campaignText } from '../locales/campaignText';
import { championshipName, championshipText, effectPreviewLabel } from '../locales/championshipText';
import type { Language } from '../locales/dict';
import { VictoryCelebration } from './VictoryCelebration';

export function ChampionshipCollection({lang,progress,onEquip}:{lang:Language;progress:CampaignProgress;onEquip:(kind:'board'|'effect',id:string)=>void}) {
    const wins=highestUnlockedLap(progress)-1;
    const [chosenGrade,setGrade]=useState<number|null>(null);
    const [previewRun,setPreviewRun]=useState(0);
    const grade=chosenGrade??Math.min(10,Math.max(1,Math.ceil(wins/10)));
    const t=(key:Parameters<typeof championshipText>[1])=>championshipText(lang,key);
    return <section className="championship-collection" aria-label={t('collection')}>
        {previewRun>0 && <VictoryCelebration key={`${progress.effect}-${previewRun}`} effect={progress.effect}/>}
        <header><div><h2>{t('collection')}</h2><p>{Math.min(100,wins)} / 100 · {wins>=100 ? t('complete') : `${campaignText(lang,'board')} 60 · ${t('effect')} 40`}</p></div>
            <label>{t('tier')}<select value={grade} onChange={event=>setGrade(Number(event.target.value))}>{Array.from({length:10},(_,index)=><option key={index} value={index+1}>{index+1} · {index*10+1}–{index*10+10}</option>)}</select></label>
        </header>
        <div className="championship-grid">{CHAMPIONSHIP_REWARDS.slice((grade-1)*10,grade*10).map(reward=>{
            const unlocked=rewardUnlocked(progress,reward.id), equipped=progress[reward.kind]===reward.id;
            return <button key={reward.id} className="championship-reward" data-championship-reward={reward.id} data-reward-grade={reward.tier} disabled={!unlocked} aria-pressed={equipped} onClick={()=>onEquip(reward.kind,reward.id)}>
                <span className="championship-number">{String(reward.requiredWins).padStart(3,'0')} {equipped ? <Check size={15}/> : !unlocked ? <LockKeyhole size={15}/> : null}</span>
                {reward.kind==='board' ? <span className={`championship-board-preview motif-${reward.motif}`} style={{borderColor:reward.rim,boxShadow:reward.tier>=4?`inset 0 0 0 ${Math.floor(reward.tier/3)}px ${reward.accent},0 0 ${reward.tier}px ${reward.frame}`:undefined}} aria-hidden="true">
                    {Array.from({length:16},(_,index)=><i key={index} style={{background:(Math.floor(index/4)+index)%2?reward.dark:reward.light}}/>)}
                </span> : <span className={`championship-effect-preview motif-${reward.motif}`} style={{color:reward.color,borderColor:reward.accent,textShadow:`0 0 ${reward.tier*2}px ${reward.accent}`}} aria-hidden="true">{['◎','✧','✦','♛'][reward.familyIndex]}<i>{'·'.repeat(reward.tier)}</i></span>}
                <strong>{championshipName(lang,reward)}</strong>
                <small>{reward.kind==='board'?campaignText(lang,'board'):t('effect')}</small>
                <span className="championship-unlock">{equipped?campaignText(lang,'equipped'):unlocked?campaignText(lang,'equip'):`${t('unlockAt')} ${reward.requiredWins}`}</span>
            </button>;
        })}</div>
        <div className="championship-pager"><button disabled={grade===1} onClick={()=>setGrade(grade-1)}>{t('previous')}</button><span>{grade} / 10</span><button disabled={grade===10} onClick={()=>setGrade(grade+1)}>{t('next')}</button></div>
        <div className="championship-effect-actions"><button className="championship-default-effect" aria-pressed={progress.effect==='standard'} onClick={()=>onEquip('effect','standard')}>{t('effect')} · {campaignText(lang,'standard')}</button>
            <button data-testid="preview-victory-effect" disabled={progress.effect==='standard'} onClick={()=>setPreviewRun(value=>value+1)}>{effectPreviewLabel(lang)} ▷</button></div>
    </section>;
}
