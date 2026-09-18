'use client';
import dynamic from 'next/dynamic';
import { Component, useCallback, useEffect, useState, type ReactNode } from 'react';
import { PROFILE_BADGES, badgeFromRating, type BadgeDefinition, type BadgeId } from '../config/profileBadges';
import { cosmeticsText, badgeName } from '../locales/profileCosmeticsText';
import { dict, type Language } from '../locales/dict';
import type { TimeControl } from '../types/game';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { RankBadgeArtwork } from './RankBadgeArtwork';
import { AccountAvatar } from './AccountAvatar';
import './profile-cosmetics.css';

const RankBadgeScene=dynamic(()=>import('./RankBadgeScene'),{ssr:false});
class BadgeBoundary extends Component<{children:ReactNode;onFailure:()=>void},{failed:boolean}> {
    state={failed:false};
    static getDerivedStateFromError(){return {failed:true};}
    componentDidCatch(){this.props.onFailure();}
    render(){return this.state.failed?null:this.props.children;}
}

function BadgeViewer({badge,lang,motion}:{badge:BadgeDefinition;lang:Language;motion:boolean}) {
    const [failed,setFailed]=useState(false),[ready,setReady]=useState(false),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[visible,setVisible]=useState(true);
    const active=hovered||focused;
    const reduced=useReducedMotion();
    const onFailure=useCallback(()=>{setFailed(true);setReady(false);},[]),onReady=useCallback(()=>setReady(true),[]);
    useEffect(()=>{
        const change=()=>setVisible(document.visibilityState==='visible');change();
        document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);
    },[]);
    useEffect(()=>{
        if(ready||failed||!visible)return;
        const timeout=setTimeout(onFailure,12000);
        return()=>clearTimeout(timeout);
    },[ready,failed,visible,onFailure]);
    return <div className="profile-badge-viewer" tabIndex={0} role="img" aria-label={badgeName(lang,badge.id)} data-badge-renderer={failed?'fallback':ready?'webgl':'loading'} data-badge-id={badge.id}
        onPointerEnter={()=>setHovered(true)} onPointerLeave={()=>setHovered(false)} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}>
        <div className="profile-badge-fallback" hidden={ready&&!failed}><RankBadgeArtwork badge={badge}/></div>
        {!failed&&<div className="profile-badge-canvas" aria-hidden="true"><BadgeBoundary onFailure={onFailure}><RankBadgeScene badge={badge} animate={motion&&active&&!reduced&&visible} onFailure={onFailure} onReady={onReady}/></BadgeBoundary></div>}
        {failed&&<small>{cosmeticsText(lang,'fallback')}</small>}
    </div>;
}

type Ratings={rating_10s?:number|null;rating_3m?:number|null;rating_10m?:number|null};
export function ProfileCosmetics({lang,name,url,frame,ratings}:{lang:Language;name:string;url?:string;frame?:string;ratings?:Ratings}) {
    const [control,setControl]=useState<TimeControl>('10m'),[preview,setPreview]=useState<BadgeId|null>(null),[motion,setMotion]=useState(true);
    const rating=ratings?.[control==='10s'?'rating_10s':control==='3m'?'rating_3m':'rating_10m'];
    const available=typeof rating==='number'&&Number.isFinite(rating)&&rating>=0;
    const current=badgeFromRating(rating),shown=PROFILE_BADGES.find(b=>b.id===preview)??current;
    const title=current?badgeName(lang,current.id):cosmeticsText(lang,available?'unranked':'unavailable');
    return <section className="profile-cosmetics" aria-label={cosmeticsText(lang,'title')}>
        <header><span>Q / INSIGNIA</span><h4>{cosmeticsText(lang,'title')}</h4></header>
        <label className="profile-badge-control"><span>{dict[lang].ratings}</span><select value={control} onChange={e=>{setControl(e.target.value as TimeControl);setPreview(null);}} aria-label={dict[lang].ratings}>
            {(['10m','3m','10s'] as const).map(tc=><option key={tc} value={tc}>{dict[lang][tc==='10m'?'tc10m':tc==='3m'?'tc3m':'tc10s']}</option>)}
        </select></label>
        <div className="profile-cosmetics-current" data-current-badge={current?.id??'none'}><span>{cosmeticsText(lang,'current')}</span><strong>{title}</strong><b>{available?Math.floor(rating):'—'}</b></div>
        <div className="profile-insignia-stage">
            <div className="profile-insignia-avatar"><AccountAvatar name={name} url={url} frame={frame} size={144}/></div>
            {shown?<BadgeViewer badge={shown} lang={lang} motion={motion}/>:<div className="profile-badge-empty" aria-hidden="true">—</div>}
        </div>
        <div className="profile-insignia-caption" aria-live="polite"><small>{cosmeticsText(lang,preview?'preview':'current')}</small><strong>{shown?badgeName(lang,shown.id):title}</strong>{shown&&<span>{cosmeticsText(lang,'threshold')} · {shown.minimum}+</span>}</div>
        <fieldset className="profile-badge-gallery"><legend>{cosmeticsText(lang,'gallery')}</legend><div>
            {PROFILE_BADGES.map(badge=><button key={badge.id} type="button" aria-pressed={shown?.id===badge.id} aria-label={`${cosmeticsText(lang,'preview')}: ${badgeName(lang,badge.id)} · ${badge.minimum}+`} onClick={()=>setPreview(badge.id)} data-preview-badge={badge.id}>
                <RankBadgeArtwork badge={badge}/><span>{badge.minimum}+</span>
            </button>)}
        </div></fieldset>
        {preview&&<button className="profile-badge-reset" type="button" onClick={()=>setPreview(null)}>{cosmeticsText(lang,'reset')}</button>}
        <label className="profile-badge-motion"><input type="checkbox" checked={motion} onChange={e=>setMotion(e.target.checked)}/>{cosmeticsText(lang,'motion')}</label>
        <p>{cosmeticsText(lang,'rule')}</p>
    </section>;
}
