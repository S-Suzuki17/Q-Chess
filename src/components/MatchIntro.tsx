'use client';
import { useEffect, useRef } from 'react';
import { AccountAvatar } from './AccountAvatar';
import { stageText } from '../locales/stageText';
import { dict, type Language } from '../locales/dict';
import { badgeFromRating } from '../config/profileBadges';
import { badgeName, cosmeticsText } from '../locales/profileCosmeticsText';
import { RankBadgeArtwork } from './RankBadgeArtwork';
import './match-intro.css';
import { soundManager } from '../lib/SoundService';

export type IntroPlayer={name:string;avatar?:string;frame?:string;rating?:number|null;detail?:string};
/** Only block input when the owning engine has paused its clock. */
export function MatchIntro({lang,white,black,label,onDone,duration=3200,blocking=true}:{lang:Language;white:IntroPlayer;black:IntroPlayer;label:string;onDone:()=>void;duration?:number;blocking?:boolean}) {
    const dialog=useRef<HTMLDialogElement>(null),done=useRef(onDone);
    useEffect(()=>{done.current=onDone;},[onDone]);
    useEffect(()=>{
        if(blocking){dialog.current?.showModal();dialog.current?.focus({preventScroll:true});}
        let stopSound=()=>{};
        // A cancelled StrictMode effect must not double-trigger the entrance sound.
        const soundFrame=requestAnimationFrame(()=>{stopSound=soundManager.playSE('/audio/se_match_intro.wav');});
        const timeout=setTimeout(()=>done.current(),duration);
        return()=>{cancelAnimationFrame(soundFrame);stopSound();clearTimeout(timeout);dialog.current?.close();};
    },[blocking,duration]);
    const content=<>
        <p className="intro-eyebrow">{label}</p><h2 id="match-intro-title">{stageText(lang,'ready')}</h2>
        <div className="intro-lineup">{[white,black].map((player,index)=>{
            const badge=badgeFromRating(player.rating);
            const rated=typeof player.rating==='number'&&Number.isFinite(player.rating)&&player.rating>=0;
            return <section key={index} className="intro-player" data-side={index?'black':'white'}>
            <AccountAvatar name={player.name} url={player.avatar} frame={player.frame} size={88} lang={lang}/>
            <strong title={player.name}>{player.name}</strong>
            <small>{player.detail??`${dict[lang].ratingLabel} · ${Number.isFinite(player.rating)?Math.floor(player.rating!):'—'}`}</small>
            {!player.detail&&<div className="intro-rank" data-intro-badge={badge?.id??'none'}>
                {badge&&<RankBadgeArtwork badge={badge}/>}
                <span>{badge?badgeName(lang,badge.id):cosmeticsText(lang,rated?'unranked':'unavailable')}</span>
            </div>}
        </section>;})}<span className="intro-vs" aria-label={stageText(lang,'versus')}>VS</span></div>
        <div className="intro-rule" aria-hidden="true"/>
    </>;
    return blocking?<dialog ref={dialog} tabIndex={-1} className="match-intro" aria-labelledby="match-intro-title" onCancel={event=>{event.preventDefault();}}>{content}</dialog>
        :<aside className="match-intro match-intro-inline" aria-labelledby="match-intro-title">{content}</aside>;
}
