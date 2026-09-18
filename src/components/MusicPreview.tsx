'use client';
import { useEffect, useRef, useState } from 'react';
import { battleMusicUrl, type MusicReward } from '../config/circuitMusic';
import { soundManager } from '../lib/SoundService';
import type { Language } from '../locales/dict';
import { circuitText } from '../locales/circuitText';
import { MusicRewardArtwork } from './RewardArtwork';

const errors:Record<Language,string>={en:'Audio could not be loaded. Please try again.',ja:'音楽を読み込めませんでした。もう一度お試しください。',zh:'无法加载音频，请重试。',ru:'Не удалось загрузить музыку. Повторите попытку.',fr:'Impossible de charger la musique. Réessayez.',de:'Musik konnte nicht geladen werden. Bitte erneut versuchen.',es:'No se pudo cargar el audio. Inténtalo de nuevo.',tr:'Ses yüklenemedi. Lütfen tekrar deneyin.',pl:'Nie udało się wczytać muzyki. Spróbuj ponownie.',hi:'संगीत लोड नहीं हुआ। फिर से कोशिश करें।',pt:'Não foi possível carregar a música. Tente novamente.',ta:'இசையை ஏற்ற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.'};

/** Native controls keep play, pause, seeking and volume accessible on mobile.
 * No autoplay, progression writes, or modification of the selected match track. */
export function MusicPreview({id,lang}:{id:string;lang:Language}) {
    const audio=useRef<HTMLAudioElement>(null);
    const [failed,setFailed]=useState(false);
    useEffect(()=>{
        const node=audio.current;
        if(!node) return;
        node.src=battleMusicUrl(id as MusicReward);
        const sync=()=>{const config=soundManager.getConfig();node.volume=config.bgmVolume;node.muted=config.masterMute;};
        sync();
        const unsubscribe=soundManager.subscribe(sync);
        const hide=()=>{if(document.hidden) node.pause();};
        document.addEventListener('visibilitychange',hide);
        return ()=>{unsubscribe();document.removeEventListener('visibilitychange',hide);node.pause();node.removeAttribute('src');node.load();};
    },[id]);
    return <div className="music-reward-preview">
        <MusicRewardArtwork tier={7}/>
        <audio ref={audio} src={battleMusicUrl(id as MusicReward)} controls preload="none" aria-label={circuitText(lang,'preview')} onError={()=>setFailed(true)} onCanPlay={()=>setFailed(false)}/>
        {failed&&<p role="alert">{errors[lang]}</p>}
    </div>;
}
