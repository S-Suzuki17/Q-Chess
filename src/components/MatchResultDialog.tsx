'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { dict, type Language } from '../locales/dict';

export function matchResultTitle(lang:Language,winner:'white_wins'|'black_wins'|'draw',side:'white'|'black'|'spectator') {
    const t=dict[lang];
    if(winner==='draw') return t.draw;
    if(side==='spectator') return winner==='white_wins'?t.whiteWon:t.blackWon;
    return winner===`${side}_wins`?t.whiteWins:t.blackWins;
}
/** One opaque, top-layer result surface; the board celebration ends before it opens. */
export function MatchResultDialog({lang,winner,side,children}:{
    lang:Language;winner:'white_wins'|'black_wins'|'draw';side:'white'|'black'|'spectator';children:ReactNode;
}) {
    const dialog=useRef<HTMLDialogElement>(null);
    useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
    return <dialog ref={dialog} className="match-result-dialog" data-result={winner==='draw'?'draw':side==='spectator'||winner===`${side}_wins`?'win':'loss'} aria-labelledby="match-result-title" onCancel={event=>event.preventDefault()}>
        <div className="match-result-rule" aria-hidden="true"><span/></div>
        <h2 id="match-result-title">{matchResultTitle(lang,winner,side)}</h2>
        {children}
    </dialog>;
}
