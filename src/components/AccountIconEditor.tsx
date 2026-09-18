'use client';
import { useEffect, useRef, useState } from 'react';
import type { Language } from '../locales/dict';
import { CIRCUIT_ICONS, circuitIconUnlocked } from '../config/circuitIcons';
import { AvatarError, prepareAvatarPhoto, saveProfileAvatar } from '../lib/profileAvatar';
import { iconEditorText, type IconEditorTextKey } from '../locales/iconEditorText';
import { SettingsDialog } from './SettingsDialog';
import './account-icon-editor.css';

type Draft = { url: string; iconId: string } | { url: string; photo: Blob };
export function AccountIconEditor({lang,userId,currentUrl,clears,onClose,onSaved}:{lang:Language;userId:string;currentUrl?:string;clears:number;onClose:()=>void;onSaved:(url:string)=>void}) {
    const t=(key:IconEditorTextKey,n?:number)=>iconEditorText(lang,key,n);
    const [source,setSource]=useState<'photo'|'earned'>('photo');
    const [draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<IconEditorTextKey|null>(null);
    const request=useRef<AbortController|null>(null),revision=useRef(0),mounted=useRef(false),objectUrl=useRef<string|null>(null),working=useRef(false);
    // The caller keys this editor by userId: identity changes discard the draft.
    useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;revision.current++;request.current?.abort();if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);objectUrl.current=null;};},[userId]);
    const replaceDraft=(next:Draft)=>{if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);objectUrl.current='photo' in next?next.url:null;setDraft(next);};
    const choosePhoto=async(file?:File)=>{
        if(!file||working.current)return;
        working.current=true;
        const attempt=++revision.current,controller=new AbortController();request.current?.abort();request.current=controller;
        setError(null);setBusy(true);
        try {
            const photo=await prepareAvatarPhoto(file,controller.signal);
            if(mounted.current&&attempt===revision.current)replaceDraft({photo,url:URL.createObjectURL(photo)});
        } catch(error) { if(mounted.current&&attempt===revision.current&&!controller.signal.aborted)setError(error instanceof AvatarError&&error.code==='TOO_LARGE'?'large':'invalid'); }
        finally {if(mounted.current&&attempt===revision.current){working.current=false;setBusy(false);}}
    };
    const save=async()=>{
        if(!draft||working.current)return;
        working.current=true;
        const attempt=++revision.current,controller=new AbortController();request.current?.abort();request.current=controller;setBusy(true);setError(null);
        try {
            const url=await saveProfileAvatar(userId,'iconId'in draft?{iconId:draft.iconId}:{photo:draft.photo},controller.signal);
            if(mounted.current&&attempt===revision.current){onSaved(url);onClose();}
        } catch(error) { if(mounted.current&&attempt===revision.current&&!controller.signal.aborted)setError(error instanceof AvatarError&&error.code==='AUTH_REQUIRED'?'auth':error instanceof AvatarError&&error.code==='TOO_LARGE'?'large':'failed'); }
        finally {if(mounted.current&&attempt===revision.current){working.current=false;setBusy(false);}}
    };
    return <SettingsDialog label={t('change')} onClose={onClose}><section className="account-icon-editor" aria-busy={busy}>
        <header><h2>{t('change')}</h2><button type="button" aria-label={t('cancel')} onClick={onClose}>×</button></header>
        <div className="icon-source-choice" role="group" aria-label={t('change')}>
            <button type="button" disabled={busy} aria-pressed={source==='photo'} onClick={()=>setSource('photo')}>{t('photo')}</button>
            <button type="button" disabled={busy} aria-pressed={source==='earned'} onClick={()=>setSource('earned')}>{t('earned')}</button>
        </div>
        <figure className="icon-editor-preview"><div>{draft?.url||currentUrl?<img key={draft?.url||currentUrl} src={draft?.url||currentUrl} alt={t('preview')} referrerPolicy="no-referrer"/>:<span aria-hidden="true">{userId.slice(0,1)}</span>}</div><figcaption>{t('preview')}</figcaption></figure>
        {source==='photo'?<div className="icon-photo-choice"><label>{t('choose')}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event=>{void choosePhoto(event.target.files?.[0]);event.target.value='';}}/></label><p>{t('rule')}</p></div>:<>
            <div className="earned-icon-grid" role="group" aria-label={t('earned')}>{CIRCUIT_ICONS.map(icon=>{
                const unlocked=circuitIconUnlocked(icon.id,clears),selected=!!draft&&'iconId'in draft&&draft.iconId===icon.id;
                return <button type="button" key={icon.id} disabled={busy||!unlocked} aria-pressed={selected} aria-label={`${t('portrait',icon.number)}${unlocked?'':` — ${t('locked',icon.requiredWins)}`}`} onClick={()=>{replaceDraft({iconId:icon.id,url:icon.url});setError(null);}}>
                    <img src={icon.url} alt="" loading="lazy"/><span>{unlocked?String(icon.number).padStart(2,'0'):t('locked',icon.requiredWins)}</span>
                </button>;
            })}</div><p className="icon-progress-note">{t('localProgress')}</p>
        </>}
        {error&&<p role="alert" className="icon-editor-error">{t(error)}</p>}
        <footer><button type="button" onClick={onClose}>{t('cancel')}</button><button type="button" className="icon-editor-confirm" disabled={busy||!draft} onClick={()=>void save()}>{busy?t('saving'):t('save')}</button></footer>
    </section></SettingsDialog>;
}
