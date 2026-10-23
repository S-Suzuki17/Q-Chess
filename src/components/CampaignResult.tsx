'use client';
import {useEffect,useRef} from 'react';
import {ArrowUpRight,Trophy} from 'lucide-react';
import {outcomeStars,type CampaignOutcome,type VictoryFinish,type PieceFinish} from '../config/campaign';
import {CHAMPIONSHIP_REWARDS} from '../config/championshipRewards';
import {CIRCUIT_STAGES} from '../config/circuitStages';
import {battleMusicTitle} from '../config/circuitMusic';
import {campaignText,rewardName} from '../locales/campaignText';
import {stageText} from '../locales/stageText';
import {circuitText} from '../locales/circuitText';
import {dict,type Language} from '../locales/dict';
import {CrownRewardArtwork} from './CrownNavigation';
import {QubeCompanion} from './QubeCompanion';
import {hundredMapText} from '../locales/hundredMapText';
import {VictoryCelebration} from './VictoryCelebration';
import './campaign.css';
import './campaign-result-journey.css';
import './challenge-map.css';
const duration=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
export function CampaignResult({lang,stageId,firstClear,effect,outcome,onNext,onRetry,onBack,saveError,newMusic=[],busy=false}: {
    lang:Language;stageId:number;firstClear:boolean;effect:VictoryFinish;pieceFinish?:PieceFinish;foeWhite?:boolean;outcome:CampaignOutcome;onNext?:()=>void;onRetry:()=>void;onBack:()=>void;saveError:boolean;newMusic?:readonly string[];busy?:boolean;
}) {
    const dialog=useRef<HTMLDialogElement>(null);
    const heading=useRef<HTMLHeadingElement>(null);
    useEffect(()=>{
        const node=dialog.current;
        const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
        node?.showModal();
        heading.current?.focus({preventScroll:true});
        if(node)node.scrollTop=0;
        return()=>{node?.close();if(opener?.isConnected)opener.focus({preventScroll:true});};
    },[]);
    const t=(key:Parameters<typeof campaignText>[1])=>campaignText(lang,key);
    const stage=CIRCUIT_STAGES[stageId-1],reward=CHAMPIONSHIP_REWARDS[stageId-1],stars=outcomeStars(outcome,stage.timeControl);
    const nextStage=outcome.won&&stageId<100?CIRCUIT_STAGES[stageId]:null;
    const perMove=stage.timeControl==='10s';
    return <dialog ref={dialog} className="campaign-result map-result" data-result={outcome.won?'win':outcome.draw?'draw':'loss'} aria-labelledby="campaign-result-title" onCancel={event=>event.preventDefault()}>
        <div className="campaign-result-cinema" aria-hidden="true">
            <QubeCompanion state={outcome.won&&!saveError?'victory':'encouragement'} size={64} reducedMotion decorative/><div className="map-result-tile">{stageId}</div>
            {outcome.won&&!outcome.draw&&<VictoryCelebration effect={effect} checkmate={!!outcome.checkmate} contained/>}
        </div>
        <div className="campaign-result-card">
            <p>{hundredMapText(lang,'tile')} {stageId} / 100</p>
            <h2 ref={heading} id="campaign-result-title" tabIndex={-1}>{outcome.won?(stageId===100&&!saveError?hundredMapText(lang,'complete'):t('win')):outcome.draw?t('draw'):t('loss')}</h2>
            {outcome.won&&<><div className="campaign-stars" aria-label={`${stars}/3`}>{'★'.repeat(stars)}{'☆'.repeat(3-stars)}</div>
                {!saveError&&<><div className="campaign-earned-art" aria-hidden="true"><CrownRewardArtwork kind={reward.kind} id={reward.id}/></div>
                <p className="campaign-reward-earned" role="status"><Trophy size={18}/>{stageText(lang,firstClear?'newReward':'clearedReward')} · {rewardName(lang,reward.id)}</p></>}</>}
            {outcome.won&&!saveError&&newMusic.map(id=><p className="campaign-reward-earned" key={id} data-star-music-earned={id}><span aria-hidden="true">♫</span>{stageText(lang,'newReward')} · {battleMusicTitle(id)}</p>)}
            <p>{t('noHints')} · {perMove?stageText(lang,'quickMoves'):t('quick')}</p>
            <p>{perMove?`${stageText(lang,'ownMoves')} · ${outcome.playerMoves} / 40`:`${circuitText(lang,'timeLeft')} · ${duration(outcome.remainingSeconds)} / ${duration(outcome.initialSeconds)}`}</p>
            {saveError&&<p role="alert">{t('saveError')}</p>}
            {nextStage&&onNext&&<div className="campaign-next-encounter" data-next-encounter={nextStage.id}>
                <span><small>{t('next')}</small><strong>{hundredMapText(lang,'tile')} {nextStage.id}</strong></span>
            </div>}
            {busy&&<p role="status">{dict[lang].loading}</p>}
            <div className="campaign-result-actions" aria-busy={busy}>
                {onNext&&<button disabled={busy} className="campaign-primary" data-map-next onClick={onNext}>{hundredMapText(lang,'next')}<ArrowUpRight size={18}/></button>}
                <button disabled={busy} onClick={onRetry}>{t('retry')}</button><button disabled={busy} onClick={onBack}>{t('back')}</button>
            </div>
        </div>
    </dialog>;
}
