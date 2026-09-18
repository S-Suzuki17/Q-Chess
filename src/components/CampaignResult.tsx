'use client';
import {useEffect,useRef} from 'react';
import {ArrowUpRight,Trophy} from 'lucide-react';
import {outcomeStars,type CampaignOutcome,type VictoryFinish} from '../config/campaign';
import {CHAMPIONSHIP_REWARDS,championshipReward} from '../config/championshipRewards';
import {CIRCUIT_STAGES} from '../config/circuitStages';
import {battleMusicTitle} from '../config/circuitMusic';
import {campaignText,rewardName} from '../locales/campaignText';
import {stageText} from '../locales/stageText';
import {circuitText} from '../locales/circuitText';
import type {Language} from '../locales/dict';
import {VictoryCelebration} from './VictoryCelebration';
import {RewardSigil} from './RewardArtwork';
import './campaign.css';
const duration=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
export function CampaignResult({lang,stageId,firstClear,effect,outcome,onNext,onRetry,onBack,saveError,newMusic=[]}: {
    lang:Language;stageId:number;firstClear:boolean;effect:VictoryFinish;outcome:CampaignOutcome;onNext?:()=>void;onRetry:()=>void;onBack:()=>void;saveError:boolean;newMusic?:readonly string[];
}) {
    const dialog=useRef<HTMLDialogElement>(null);
    useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
    const t=(key:Parameters<typeof campaignText>[1])=>campaignText(lang,key);
    const stage=CIRCUIT_STAGES[stageId-1],reward=CHAMPIONSHIP_REWARDS[stageId-1],stars=outcomeStars(outcome,stage.timeControl);
    const victoryDesign=championshipReward(effect);
    const perMove=stage.timeControl==='10s';
    return <dialog ref={dialog} className="campaign-result" data-result={outcome.won?'win':outcome.draw?'draw':'loss'} aria-labelledby="campaign-result-title" onCancel={event=>event.preventDefault()}>
        <div className="campaign-result-cinema" aria-hidden="true">
            {outcome.won&&victoryDesign?.kind==='effect'?<VictoryCelebration effect={effect} preview contained/>:<RewardSigil motif="corona" tier={outcome.won?3:1}/>}
        </div>
        <div className="campaign-result-card">
            <p>{stageText(lang,'stage')} {stageId} / 100 · {stage.opponent}</p>
            <h2 id="campaign-result-title">{outcome.won?(stageId===100?t('champion'):t('win')):outcome.draw?t('draw'):t('loss')}</h2>
            {outcome.won&&<><div className="campaign-stars" aria-label={`${stars}/3`}>{'★'.repeat(stars)}{'☆'.repeat(3-stars)}</div>
                <p className="campaign-reward-earned"><Trophy size={18}/>{stageText(lang,firstClear?'newReward':'clearedReward')} · {rewardName(lang,reward.id)}</p></>}
            {outcome.won&&newMusic.map(id=><p className="campaign-reward-earned" key={id} data-star-music-earned={id}><span aria-hidden="true">♫</span>{stageText(lang,'newReward')} · {battleMusicTitle(id)}</p>)}
            <p>{t('noHints')} · {perMove?stageText(lang,'quickMoves'):t('quick')}</p>
            <p>{perMove?`${stageText(lang,'ownMoves')} · ${outcome.playerMoves} / 40`:`${circuitText(lang,'timeLeft')} · ${duration(outcome.remainingSeconds)} / ${duration(outcome.initialSeconds)}`}</p>
            {saveError&&<p role="alert">{t('saveError')}</p>}
            <div className="campaign-result-actions">
                {onNext&&<button className="campaign-primary" onClick={onNext}>{t('next')}<ArrowUpRight size={18}/></button>}
                <button onClick={onRetry}>{t('retry')}</button><button onClick={onBack}>{t('back')}</button>
            </div>
        </div>
    </dialog>;
}
