'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { championshipReward } from '../config/championshipRewards';
import type { VictoryFinish } from '../config/campaign';
import { RewardSigil } from './RewardArtwork';
import './victory-celebration.css';

/** Short, non-interactive celebration. Never changes the board camera or move input. */
export function VictoryCelebration({effect,preview=false}:{effect:VictoryFinish;preview?:boolean}) {
    const preset=championshipReward(effect);
    const [visible,setVisible]=useState(true);
    const duration=preset?.kind==='effect' ? preset.duration : 0;
    useEffect(()=>{
        if (preview) return;
        const timer=setTimeout(()=>setVisible(false),duration*1000+250);
        return ()=>clearTimeout(timer);
    },[duration,preview]);
    if (!visible || preset?.kind!=='effect') return null;
    return <div className={`victory-fx victory-fx-${preset.motif}`} data-victory-effect={preset.id} data-effect-preview={preview} aria-hidden="true" style={{'--fx-color':preset.color,'--fx-accent':preset.accent,'--fx-duration':`${duration}s`} as CSSProperties}>
        <div className="victory-fx-light"/>
        <div className="victory-fx-seal"><RewardSigil motif={preset.motif} tier={preset.tier}/></div>
        {Array.from({length:preset.layers},(_,index)=><span className="victory-fx-ring" key={`ring-${index}`} style={{'--ring':index} as CSSProperties}/>)}
        {Array.from({length:preset.count},(_,index)=><i key={index} style={{
            '--angle':`${index*360/preset.count}deg`,'--distance':`${30+(index%3)*7}cqw`,
            '--delay':`${.18+(index%4)*.06}s`,'--drift':`${-12-(index%5)*3}cqw`,
            '--origin':`${12+(index*61)%76}%`,'--size':`${2+preset.tier*.2+(index%3)}px`,
        } as CSSProperties}/>)}
    </div>;
}
