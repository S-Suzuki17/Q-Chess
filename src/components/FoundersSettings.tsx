'use client';
import './founders.css';
import {useId,useState} from 'react';
import dynamic from 'next/dynamic';
import {Crown,Diamond,Grid2X2} from 'lucide-react';
import {FOUNDERS_ITEMS} from '../config/founders';
import type {CampaignProgress} from '../config/campaign';
import type {Language} from '../locales/dict';
import {foundersText,foundersRewardName} from '../locales/foundersText';
import type {useFoundersRewards} from '../hooks/useFoundersRewards';
import type {VisualReward} from './RewardPreview';
const Preview=dynamic(()=>import('./RewardPreview').then(module=>module.RewardPreview),{ssr:false});
const icons={avatar:Crown,board:Grid2X2,piece:Diamond};
export function FoundersSettings({lang,accountName,progress,rewards,locked}:{lang:Language;accountName?:string;progress:CampaignProgress;rewards:ReturnType<typeof useFoundersRewards>;locked:boolean}){
    const id=useId(),[preview,setPreview]=useState<VisualReward|null>(null),t=(key:Parameters<typeof foundersText>[1])=>foundersText(lang,key);
    if(locked)return null;
    const errorKey=rewards.error?({AUTH_REQUIRED:'login',NOT_ELIGIBLE:'ineligible',ALREADY_LINKED:'linked',UNAVAILABLE:'unavailable',PENDING:'pending',ANDROID_ONLY:'web'} as const)[rewards.error]:null;
    return <section className="founders-collection" aria-labelledby={id+'-title'} aria-busy={rewards.busy}>
        <header><Crown size={24} aria-hidden="true"/><div><small>Q–GAMBIT · FOUNDERS</small><h3 id={id+'-title'}>{t('title')}</h3></div></header>
        <p>{t('description')}</p>
        <div className="founders-items">{FOUNDERS_ITEMS.map(item=>{const Icon=icons[item.kind];return <button type="button" key={item.id} onClick={()=>setPreview(item)}>
            <Icon size={26} strokeWidth={1.2} aria-hidden="true"/><strong>{foundersRewardName(lang,item.id)}</strong><span>{t('preview')} →</span>
        </button>;})}</div>
        {rewards.signedIn?<>
            <p className="founders-account">{t('account')} <strong>{accountName}</strong></p>
            {rewards.status?.owned&&<p className="founders-acquired">✓ {t('acquired')}</p>}
            {!rewards.native&&<p>{t('web')}</p>}
            {rewards.status&&!rewards.status.enabled&&!rewards.status.owned&&<p>{t('preparing')}</p>}
            <div className="founders-actions">
                {rewards.native&&<button type="button" disabled={rewards.busy||!rewards.status?.enabled} onClick={()=>void rewards.claim()}>{rewards.busy?t('busy'):t('claim')}</button>}
                <button type="button" disabled={rewards.busy} onClick={()=>void rewards.refresh()}>{t('refresh')}</button>
            </div>
        </>:<p>{t('login')}</p>}
        <p role="status" aria-live="polite">{errorKey?t(errorKey):rewards.status?.deliveryPending?t('delivery'):rewards.busy?t('busy'):''}</p>
        {preview&&<Preview lang={lang} reward={preview} progress={progress} onClose={()=>setPreview(null)}/>}
    </section>;
}
