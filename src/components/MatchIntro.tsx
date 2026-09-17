'use client';
import { useEffect, useRef } from 'react';
import { AccountAvatar } from './AccountAvatar';
import { stageText } from '../locales/stageText';
import { dict, type Language } from '../locales/dict';
import './match-intro.css';

export type IntroPlayer={name:string;avatar?:string;frame?:string;rating?:number|null;detail?:string};
/** Only block input when the owning engine has paused its clock. */
export function MatchIntro({lang,white,black,label,onDone,duration=3200,blocking=true}:{lang:Language;white:IntroPlayer;black:IntroPlayer;label:string;onDone:()=>void;duration?:number;blocking?:boolean}) {
    const dialog=useRef<HTMLDialogElement>(null),done=useRef(onDone);
    useEffect(()=>{done.current=onDone;},[onDone]);
    useEffect(()=>{
        if(blocking)dialog.current?.showModal();
        const timeout=setTimeout(()=>done.current(),duration);
        return()=>{clearTimeout(timeout);dialog.current?.close();};
    },[blocking,duration]);
    const content=<>
        <p className="intro-eyebrow">{label}</p><h2 id="match-intro-title">{stageText(lang,'ready')}</h2>
        <div className="intro-lineup">{[white,black].map((player,index)=><section key={index} className="intro-player" data-side={index?'black':'white'}>
            <AccountAvatar name={player.name} url={player.avatar} frame={player.frame} size={88}/>
            <strong title={player.name}>{player.name}</strong>
            <small>{player.detail??`${dict[lang].ratingLabel} · ${Number.isFinite(player.rating)?Math.floor(player.rating!):'—'}`}</small>
        </section>)}<span className="intro-vs" aria-label={stageText(lang,'versus')}>VS</span></div>
        <div className="intro-rule" aria-hidden="true"/>
        <button autoFocus={blocking} onClick={onDone}>{stageText(lang,'skip')}</button>
    </>;
    return blocking?<dialog ref={dialog} className="match-intro" aria-labelledby="match-intro-title" onCancel={event=>{event.preventDefault();onDone();}}>{content}</dialog>
        :<aside className="match-intro match-intro-inline" aria-labelledby="match-intro-title">{content}</aside>;
}
