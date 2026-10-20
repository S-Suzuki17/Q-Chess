'use client';
// Copied temporarily to a local Next route by learning-browser.mjs, then removed.
// No fixture route is included in a release.
import React,{useEffect,useMemo,useState} from 'react';
import {InteractiveTutorial} from '@/components/InteractiveTutorial';
import {WeeklyProblems} from '@/components/WeeklyProblems';
import {MatchLayout} from '@/components/MatchLayout';
import {Board2D} from '@/components/Board2D';
import {createInitialState} from '@/quantum-engine/initialState';
import {applyMove} from '@/quantum-engine/stateTransition';
import {positionForDisplay} from '@/lib/localGame';
import {tutorialMoves} from '@/lib/tutorialCourse';
import type {Language} from '@/locales/dict';
import type {AdResult} from '@/lib/nativeAds';
const noop=()=>{};
function HintReview({lang}:{lang:Language}){
    const [state,setState]=useState(createInitialState),[selected,setSelected]=useState<string|null>(null);
    const [showHint,setShowHint]=useState(false);
    const view=useMemo(()=>positionForDisplay(state),[state]);
    const moves=useMemo(()=>selected?tutorialMoves(state,selected):[],[state,selected]);
    const hint=showHint?{fromRow:6,fromCol:4,toRow:4,toCol:5}:null;
    function click(row:number,col:number){
        const piece=state.pieces.find(p=>p.alive&&p.position.row===row&&p.position.col===col);
        if(piece?.owner===state.sideToMove){setSelected(piece.id);return;}
        const move=moves.find(m=>m.target.row===row&&m.target.col===col);
        if(move){setState(applyMove(state,move));setSelected(null);setShowHint(false);}
    }
    return <MatchLayout lang={lang} mode="CPU" white={{name:'Guest',clock:'10:00'}} black={{name:'CPU',clock:'10:00'}}
        bottomSide="white" currentTurn={state.sideToMove} finished={false} tokens={view.tokens}
        candidatesMap={view.pool.piecePossibilities} selectedTokenId={selected} history={[]}
        validMoveCount={moves.length} onClearSelection={()=>setSelected(null)} is2D onViewChange={noop}
        onResetView={noop} onHome={noop} onRules={noop} onResign={noop} showMoveHints onHintsChange={noop}
        onHint={()=>setShowHint(true)} hintAccess="free" hintMove={hint} onClearHint={()=>setShowHint(false)}
        board={<div className="board-render-fallback" style={{width:'100%',height:'100%'}}>
            <Board2D lang={lang} tokens={view.tokens} candidatesMap={view.pool.piecePossibilities}
                selectedTokenId={selected} validMoves={moves.map(m=>({r:m.target.row,c:m.target.col}))}
                moveHistory={[]} currentTurn={state.sideToMove} showMoveHints hintMove={hint} onSquareClick={click}/>
        </div>}/>;
}
const ad=async(key:string):Promise<AdResult>=>{
    const target=window as Window&{learningAds?:string[]};
    (target.learningAds??=[]).push(key);
    return 'unavailable';
};
export default function LearningReview(){
    const [settings,setSettings]=useState<{weekly:boolean;hint:boolean;lang:Language;userId?:string}|null>(null);
    const [closed,setClosed]=useState(false);
    useEffect(()=>{
        const params=new URLSearchParams(location.search);
        setSettings({weekly:params.get('mode')==='weekly',hint:params.get('mode')==='hint',lang:(params.get('lang')??'ja') as Language,
            userId:params.get('guest')==='1'?undefined:'LearningQA'});
    },[]);
    if(!settings)return null;
    if(settings.hint)return <HintReview lang={settings.lang}/>;
    return <main>{closed?<button onClick={()=>setClosed(false)}>Open learning</button>:settings.weekly?
        <WeeklyProblems lang={settings.lang} userId={settings.userId} onClose={()=>setClosed(true)} requestAd={ad}/>:
        <InteractiveTutorial lang={settings.lang} userId={settings.userId} onClose={()=>setClosed(true)}/>}</main>;
}
