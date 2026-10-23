'use client';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {Language} from '../locales/dict';
import {learningText} from '../locales/learningText';
import {weeklyProblemText} from '../locales/weeklyProblemText';
import {matchText} from '../locales/matchText';
import {useLearningRewards} from '../hooks/useLearningRewards';
import {useAndroidBackHandler} from '../hooks/useAndroidBack';
import {LearningRewardNotice} from './LearningRewardNotice';
import {Board2D} from './Board2D';
import {positionForDisplay} from '../lib/localGame';
import {tutorialMoves} from '../lib/tutorialCourse';
import {isQuantumProblem,problemMoveResult} from '../../server/src/learning/weeklyProblems';
import {TYPE_TO_BIT} from '../quantum-engine/adapter';
import type {PieceType} from '../config/gameConfig';
import type {GameState} from '../quantum-engine/types';
import {requestLearningInterstitial} from '../lib/adPolicy';
import './weekly-problems.css';

export function WeeklyProblems({lang,userId,onClose,requestAd=requestLearningInterstitial}:{lang:Language;userId?:string;onClose:()=>void;requestAd?:typeof requestLearningInterstitial}) {
    const t=learningText(lang),copy=weeklyProblemText(lang),account=useLearningRewards(userId);
    const dialog=useRef<HTMLDialogElement>(null),initialized=useRef<string|null>(null),adAttempts=useRef(new Set<string>()),mounted=useRef(false);
    const [index,setIndex]=useState(0),[selected,setSelected]=useState<string|null>(null);
    const [result,setResult]=useState<GameState|null>(null),[feedback,setFeedback]=useState('');
    const [adBusy,setAdBusy]=useState(false);
    const submitting=useRef(false);
    const weeklySet=account.status?.weeklySet;
    const problem=weeklySet?.problems[index];
    const done=!!account.status?.weekly.includes(index+1),allDone=!!account.status?.weeklyRewarded;
    const boardState=result??problem?.state;
    const view=useMemo(()=>boardState?positionForDisplay(boardState):null,[boardState]);
    const valid=useMemo(()=>boardState&&selected&&!result&&!done?tutorialMoves(boardState,selected):[],[boardState,selected,result,done]);
    const inspected=boardState?.pieces.find(p=>p.alive&&p.id===selected);
    const names:Record<PieceType,string>={King:'キング',Queen:'クイーン',Rook:'ルーク',Bishop:'ビショップ',Knight:'ナイト',Pawn:'ポーン'};
    const selectedNames=inspected?(Object.keys(TYPE_TO_BIT) as PieceType[])
        .filter(type=>(inspected.state&TYPE_TO_BIT[type])!==0).map(type=>matchText(lang,names[type],type)).join(' / '):'';
    const mixed=weeklySet?.problems.some(p=>isQuantumProblem(p.state));
    useAndroidBackHandler(()=>{if(adBusy)return true;onClose();return true;},70);
    useEffect(()=>{
        const previous=document.activeElement as HTMLElement|null,modal=dialog.current;
        mounted.current=true;
        modal?.showModal();return()=>{mounted.current=false;modal?.close();previous?.focus({preventScroll:true});};
    },[]);
    useEffect(()=>{
        if(weeklySet&&initialized.current!==weeklySet.week){
            initialized.current=weeklySet.week;
            setIndex(Math.min(account.status?.weekly.length??0,9));setSelected(null);setResult(null);setFeedback('');
        }
    },[weeklySet,account.status?.weekly.length]);
    useEffect(()=>{
        const checkpoint=account.receipt?.adCheckpoint;
        const source=account.receipt?.submission;
        if(!userId||!checkpoint||!weeklySet||source?.kind!=='weekly'||source.week!==weeklySet.week)return;
        const key=`${userId}:${weeklySet.week}:${checkpoint}`;
        if(adAttempts.current.has(key))return;
        adAttempts.current.add(key);setAdBusy(true);
        void requestAd(key,userId).catch(()=>{}).finally(()=>{if(mounted.current)setAdBusy(false);});
    },[account.receipt,userId,weeklySet?.week,requestAd]);
    async function clickSquare(row:number,col:number){
        if(!userId||!problem||!boardState||adBusy)return;
        const occupant=boardState.pieces.find(p=>p.alive&&p.position.row===row&&p.position.col===col);
        if(occupant?.owner==='white'||done||result||account.busy||submitting.current){
            setSelected(occupant&&occupant.id!==selected?occupant.id:null);setFeedback('');return;
        }
        const move=valid.find(m=>m.target.row===row&&m.target.col===col);
        if(!move){if(occupant)setSelected(occupant.id);return;}
        const next=problemMoveResult(problem.state,move);
        if(!next){setFeedback(t.tryMate);return;}
        // The board responds immediately; progress, the Next button and rewards wait for the server.
        submitting.current=true;setSelected(null);setResult(next);setFeedback('');
        try{await account.submit({kind:'weekly',week:weeklySet!.week,problemId:index+1,moves:[move]});}
        finally{submitting.current=false;}
    }
    const advance=()=>{setIndex(i=>i+1);setSelected(null);setResult(null);setFeedback('');account.clearReceipt();};
    return <div className="weekly-overlay">
        <dialog ref={dialog} className="weekly-problems" lang={lang} aria-label={t.weekly}
            data-weekly-problem={index+1} aria-busy={account.busy||adBusy}
            onCancel={event=>{event.preventDefault();if(!adBusy)onClose();}}>
            <header><div><small>{weeklySet?.week}</small><h2>{t.weekly}</h2></div>
                <button type="button" onClick={onClose} disabled={adBusy} aria-label={t.close}>×</button></header>
            <p>{mixed?copy.mixedDescription:t.weeklyDescription}</p>
            <details className="weekly-about"><summary>{t.schedule}</summary><p>{t.adNotice}</p></details>
            <LearningRewardNotice lang={lang} account={account} userId={userId}/>
            {userId&&account.loading&&!weeklySet&&<p role="status">{t.loading}</p>}
            {userId&&!account.loading&&!weeklySet&&!account.error&&<div role="status"><p>{t.unavailable}</p><button onClick={()=>void account.refresh()}>{t.refresh}</button></div>}
            {weeklySet&&view&&boardState&&<>
                <div className="weekly-progress"><span>{index+1} / 10</span>
                    <progress max={10} value={account.status?.weekly.length??0} aria-label={t.weekly}/>
                    <span>{account.status?.weekly.length??0} / 10 ✓</span></div>
                <p className="weekly-goal">{isQuantumProblem(problem!.state)?copy.quantumGoal:t.ordinary}</p>
                <div className="weekly-board board-render-fallback">
                    <Board2D lang={lang} tokens={view.tokens} candidatesMap={view.pool.piecePossibilities}
                        selectedTokenId={selected} validMoves={valid.map(m=>({r:m.target.row,c:m.target.col}))}
                        moveHistory={[]} onSquareClick={(row,col)=>void clickSquare(row,col)}
                        showMoveHints currentTurn="white"/>
                </div>
                <p className="weekly-candidates" aria-live="polite">{selectedNames&&`${matchText(lang,'駒の候補','Piece candidates')}: ${selectedNames}`}</p>
                <div className="weekly-feedback" role="status" aria-live="polite">{result?(done?t.complete:account.busy?t.saving:t.unavailable):feedback||(!allDone&&done?t.complete:'')}</div>
                {allDone&&<p className="weekly-success">{t.allDone}</p>}
                <footer>
                    <button type="button" onClick={()=>void account.refresh()} disabled={account.busy||adBusy}>{t.refresh}</button>
                    {done&&<button type="button" data-weekly-next disabled={account.busy||adBusy}
                        onClick={index===9?onClose:advance}>{index===9?t.finish:t.next}</button>}
                </footer>
            </>}
        </dialog>
    </div>;
}
