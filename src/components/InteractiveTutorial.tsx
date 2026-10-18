import React, {useEffect, useMemo, useRef, useState} from 'react';
import type {Language} from '../locales/dict';
import {tutorialDict} from '../locales/rulesDict';
import {tutorialCourseText} from '../locales/tutorialCourseText';
import {rulesVisualDict} from '../locales/rulesVisualDict';
import {Board3D} from './Board3D';
import {Board2D} from './Board2D';
import {QubeTeacher} from './QubeTeacher';
import {TutorialCopy} from './TutorialCopy';
import {NaturalText} from './NaturalText';
import {useReducedMotion} from '../hooks/useReducedMotion';
import {recordTutorialCompleted, recordTutorialStarted} from '../lib/engagementMetrics';
import {positionForDisplay} from '../lib/localGame';
import {tutorialCourse, tutorialPosition, tutorialSquare, tutorialMoves, tutorialReferenceMove,
    attemptTutorialMove, TUTORIAL_PROGRESS_KEY, TUTORIAL_COURSE_VERSION} from '../lib/tutorialCourse';
import type {TutorialAttempt} from '../lib/tutorialCourse';
import type {GameState, Move} from '../quantum-engine/types';
import {generateLegalMoves} from '../quantum-engine/moveGenerator';
import {PIECE_KING as K, PIECE_QUEEN as Q, PIECE_ROOK as R,
    PIECE_BISHOP as B, PIECE_KNIGHT as N, PIECE_PAWN as P} from '../quantum-engine/constants';
import './interactive-tutorial.css';

function savedProgress(): {index:number; completed:string[]} {
    try {
        const saved=JSON.parse(localStorage.getItem(TUTORIAL_PROGRESS_KEY)??'null');
        if(saved?.version!==TUTORIAL_COURSE_VERSION) return {index:0,completed:[]};
        const completed=Array.isArray(saved.completed)?saved.completed.filter((id:unknown)=>
            typeof id==='string'&&tutorialCourse.some(lesson=>lesson.id===id)):[];
        const index=Number.isInteger(saved.index)&&saved.index>=0&&saved.index<tutorialCourse.length?saved.index:0;
        return {index,completed:Array.from(new Set<string>(completed))};
    } catch {return {index:0,completed:[]};}
}
function saveProgress(index:number,completed:string[]) {
    try {localStorage.setItem(TUTORIAL_PROGRESS_KEY,JSON.stringify({version:TUTORIAL_COURSE_VERSION,index,completed}));}
    catch { /* Lessons remain playable when local storage is blocked. */ }
}
function pieceNames(mask:number,lang:Language) {
    return [K,Q,R,B,N,P].flatMap((bit,index)=>mask&bit?[rulesVisualDict[lang].names[index]]:[]).join(' / ');
}

function MoveChoice({moves,state,lang,onChoose,onCancel}:{moves:Move[];state:GameState;lang:Language;onChoose:(move:Move)=>void;onCancel:()=>void}) {
    const ref=useRef<HTMLDialogElement>(null),copy=tutorialCourseText[lang];
    useEffect(()=>{
        const previous=document.activeElement as HTMLElement|null,modal=ref.current;
        modal?.showModal();
        return()=>{modal?.close();previous?.focus({preventScroll:true});};
    },[]);
    return <dialog ref={ref} lang={lang} className="tutorial-choice" aria-label={copy.choose}
        onCancel={event=>{event.stopPropagation();event.preventDefault();onCancel();}}>
        <h3>{copy.choose}</h3>
        <div className="tutorial-choice-grid">{moves.map((move,index)=>{
            const piece=state.pieces.find(piece=>piece.id===move.pieceId)!;
            const castling=move.chosenType===K&&Math.abs(piece.position.col-move.target.col)===2;
            const hasPromotion=moves.some(candidate=>candidate.promotionTarget!==undefined);
            const label=castling?copy.castle:move.promotionTarget?
                copy.promote+' · '+pieceNames(move.promotionTarget,lang):hasPromotion?copy.decline:copy.normal;
            return <button type="button" key={index} data-tutorial-choice={castling?'castle':move.promotionTarget??'normal'}
                onClick={()=>onChoose(move)}>{label}</button>;
        })}</div>
        <button type="button" className="tutorial-choice-cancel" onClick={onCancel}>{tutorialDict[lang].close}</button>
    </dialog>;
}

export function InteractiveTutorial({lang,onClose}:{lang:Language;onClose:()=>void}) {
    const [saved]=useState(savedProgress);
    const [lessonIndex,setLessonIndex]=useState(saved.index);
    const [completed,setCompleted]=useState(saved.completed);
    const [state,setState]=useState(()=>tutorialCourse[saved.index].create());
    const [taskIndex,setTaskIndex]=useState(0);
    const [selected,setSelected]=useState<string|null>(null);
    const [feedback,setFeedback]=useState<TutorialAttempt['feedback']|'demoDone'|null>(null);
    const [changes,setChanges]=useState('');
    const [choices,setChoices]=useState<Move[]>([]);
    const [flatBoard,setFlatBoard]=useState(true);
    const [showHint,setShowHint]=useState(false);
    const [demo,setDemo]=useState(false);
    const dialog=useRef<HTMLDialogElement>(null),nextButton=useRef<HTMLButtonElement>(null);
    const demoTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
    const demoActive=useRef(false);
    const reducedMotion=useReducedMotion();
    const lesson=tutorialCourse[lessonIndex],task=lesson.tasks[Math.min(taskIndex,lesson.tasks.length-1)];
    const done=taskIndex>=lesson.tasks.length;
    const copy=tutorialCourseText[lang],labels=tutorialDict[lang];
    const view=useMemo(()=>positionForDisplay(state),[state]);
    const valid=useMemo(()=>selected?tutorialMoves(state,selected):[],[state,selected]);
    const TutorialBoard=flatBoard?Board2D:Board3D;
    const guided=task.kind!=='mate'||showHint;

    useEffect(()=>{
        const previous=document.activeElement as HTMLElement|null,modal=dialog.current;
        modal?.showModal();recordTutorialStarted();
        return()=>{
            if(demoTimer.current)clearTimeout(demoTimer.current);
            demoActive.current=false;modal?.close();previous?.focus({preventScroll:true});
        };
    },[]);
    useEffect(()=>{if(done&&!demo)nextButton.current?.focus({preventScroll:true});},[done,demo]);
    useEffect(()=>{
        const hide=()=>{
            if(document.hidden&&demoActive.current){
                if(demoTimer.current)clearTimeout(demoTimer.current);
                demoActive.current=false;setDemo(false);setState(lesson.create());setTaskIndex(0);setSelected(null);setFeedback(null);
            }
        };
        document.addEventListener('visibilitychange',hide);
        return()=>document.removeEventListener('visibilitychange',hide);
    },[lesson]);

    function reset(index=lessonIndex) {
        if(demoTimer.current)clearTimeout(demoTimer.current);
        demoActive.current=false;setDemo(false);setLessonIndex(index);setTaskIndex(0);
        setState(tutorialCourse[index].create());setSelected(null);setFeedback(null);
        setChoices([]);setChanges('');setShowHint(false);saveProgress(index,completed);
    }
    function submit(move:Move) {
        const result=attemptTutorialMove(state,task,move);
        setChoices([]);setSelected(null);setFeedback(result.feedback);
        if(!result.accepted)return;
        const changed=result.state.pieces.filter(piece=>
            piece.state!==state.pieces.find(previous=>previous.id===piece.id)?.state ||
            piece.promotedType!==state.pieces.find(previous=>previous.id===piece.id)?.promotedType);
        setChanges(changed.map(piece=>tutorialSquare(piece.alive?piece.position:piece.origin)+': '+
            pieceNames(piece.promotedType??piece.state,lang)).join(' · '));
        setState(result.state);setTaskIndex(current=>current+1);setShowHint(false);
        if(taskIndex===lesson.tasks.length-1) {
            const next=Array.from(new Set([...completed,lesson.id]));
            setCompleted(next);saveProgress(lessonIndex,next);
        }
    }
    function clickSquare(row:number,col:number) {
        if(done||demo||choices.length)return;
        const occupant=state.pieces.find(piece=>piece.alive&&piece.position.row===row&&piece.position.col===col);
        if(occupant?.owner===state.sideToMove) {
            setSelected(occupant.id);setFeedback(null);return;
        }
        if(!selected) {setFeedback('illegal');return;}
        const options=valid.filter(move=>move.target.row===row&&move.target.col===col);
        if(options.length>1){setChoices(options);return;}
        if(options.length===1){submit(options[0]);return;}
        const candidate=generateLegalMoves(state,selected).find(move=>move.target.row===row&&move.target.col===col);
        submit({pieceId:selected,target:{row,col},chosenType:candidate?.requiredTypes??0});
    }
    function showExample() {
        reset();setDemo(true);demoActive.current=true;
        let demoState=lesson.create(),index=0;
        const play=()=>{
            if(!demoActive.current)return;
            const exercise=lesson.tasks[index];
            const result=attemptTutorialMove(demoState,exercise,tutorialReferenceMove(demoState,exercise));
            demoState=result.state;setState(demoState);setTaskIndex(index+1);setSelected(null);
            index++;
            demoTimer.current=setTimeout(()=>{
                if(index<lesson.tasks.length)play();
                else {demoActive.current=false;setDemo(false);setState(lesson.create());setTaskIndex(0);setFeedback('demoDone');}
            },reducedMotion?250:1000);
        };
        demoTimer.current=setTimeout(play,reducedMotion?200:700);
    }
    const targetPiece=state.pieces.find(piece=>piece.alive&&tutorialSquare(piece.position)===task.from);
    const selectedPiece=state.pieces.find(piece=>piece.id===selected);
    const focusPiece=selectedPiece??(!done?targetPiece:state.pieces.find(piece=>piece.id===state.lastMove?.pieceId));
    const candidateDescription=focusPiece?
        copy.candidates+' · '+tutorialSquare(focusPiece.position)+': '+pieceNames(focusPiece.promotedType??focusPiece.state,lang):'';
    const detail=[
        feedback?copy[feedback]:'',
        changes,
        done&&!demo?copy.completed:'',
        copy.lessons[lessonIndex],
        !done?candidateDescription:'',
        lessonIndex===0?copy.practice:'',
    ].filter(Boolean).join('\n\n');
    const command=demo?copy.demo:done?copy.completed:task.kind==='mate'&&!showHint?copy.challenge:
        (task.kind==='reject'?copy.test:selected?copy.move:copy.select)+' · '+task.from+' → '+task.to;
    const target=tutorialPosition(task.to),from=tutorialPosition(task.from);
    const hintMove=!done&&guided?{fromRow:from.row,fromCol:from.col,toRow:target.row,toCol:target.col}:null;
    return <div className="interactive-tutorial">
        <dialog ref={dialog} lang={lang} className="tutorial-shell" aria-label={copy.title}
            data-tutorial-lesson={lesson.id} data-tutorial-task={taskIndex} data-tutorial-complete={done&&!demo} aria-busy={demo}
            onCancel={event=>{if(event.target!==event.currentTarget)return;event.preventDefault();onClose();}}>
            <header className="tutorial-heading">
                <div><h2><NaturalText text={copy.title} lang={lang}/></h2><span>{copy.chapters[lesson.chapter]}</span></div>
                <div className="tutorial-view-switch" role="group" aria-label={lang==='ja'?'盤面の表示':'Board view'}>
                    <button type="button" aria-pressed={flatBoard} onClick={()=>setFlatBoard(true)}>2D</button>
                    <button type="button" aria-pressed={!flatBoard} onClick={()=>setFlatBoard(false)}>3D</button>
                </div>
                <button type="button" onClick={onClose} aria-label={labels.close}>×</button>
            </header>
            <div className="tutorial-course-picker">
                <label className="sr-only" htmlFor="tutorial-lesson-picker">{copy.chooseLesson}</label>
                <select id="tutorial-lesson-picker" value={lessonIndex} disabled={demo}
                    onChange={event=>reset(Number(event.target.value))}>
                    {tutorialCourse.map((item,index)=><option key={item.id} value={index}>
                        {completed.includes(item.id)?'✓ ':''}{index+1}. {copy.titles[index]}
                    </option>)}
                </select>
                <output aria-label={copy.progress}>{completed.length} / {tutorialCourse.length}</output>
            </div>
            <div className="tutorial-board">
                <div className={flatBoard?'tutorial-board-surface tutorial-flat-board board-render-fallback':'tutorial-board-surface tutorial-spatial-board'}>
                    <TutorialBoard lang={lang} tokens={view.tokens} candidatesMap={view.pool.piecePossibilities}
                        selectedTokenId={selected} validMoves={valid.map(move=>({r:move.target.row,c:move.target.col}))}
                        moveHistory={[]} onSquareClick={clickSquare} showMoveHints currentTurn={state.sideToMove}
                        hintMove={hintMove}/>
                </div>
            </div>
            <div className="tutorial-explanation">
                <div className="tutorial-command" data-tutorial-status role="status">
                    <small>{!done?(state.sideToMove==='white'?copy.white:copy.black)+' · ':''}{Math.min(taskIndex+1,lesson.tasks.length)} / {lesson.tasks.length}</small>
                    <strong>{command}</strong>
                </div>
                <QubeTeacher lang={lang} variant="compact">
                    <TutorialCopy key={lessonIndex+':'+taskIndex+':'+feedback+':'+lang} text={detail} lang={lang} step={lessonIndex*10+taskIndex}/>
                </QubeTeacher>
            </div>
            <footer className="tutorial-actions">
                <div>
                    <button type="button" data-tutorial-review-demo onClick={showExample} disabled={demo||done}>▶ {copy.demo}</button>
                    <button type="button" data-tutorial-reset onClick={()=>reset()}>↺ {labels.resetStep}</button>
                    {!done&&task.kind==='mate'&&<button type="button" data-tutorial-hint onClick={()=>setShowHint(value=>!value)}>{showHint?copy.hideHint:copy.hint}</button>}
                </div>
                {done&&!demo&&<button type="button" data-tutorial-next ref={nextButton} onClick={()=>{
                    if(lessonIndex===tutorialCourse.length-1){recordTutorialCompleted();onClose();}
                    else reset(lessonIndex+1);
                }}>{lessonIndex===tutorialCourse.length-1?copy.finish:labels.next}</button>}
            </footer>
            {choices.length>0&&<MoveChoice moves={choices} state={state} lang={lang}
                onChoose={submit} onCancel={()=>setChoices([])}/>}
        </dialog>
    </div>;
}
