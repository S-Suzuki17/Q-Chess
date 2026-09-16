'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { championshipReward } from '../config/championshipRewards';
import type { VictoryFinish } from '../config/campaign';
import './victory-celebration.css';

/** Short, non-interactive celebration. Never changes the board camera or move input. */
export function VictoryCelebration({effect}:{effect:VictoryFinish}) {
    const preset=championshipReward(effect);
    const [visible,setVisible]=useState(true);
    const duration=preset?.kind==='effect' ? preset.duration : 0;
    useEffect(()=>{
        const timer=setTimeout(()=>setVisible(false),duration*1000+250);
        return ()=>clearTimeout(timer);
    },[duration]);
    if (!visible || preset?.kind!=='effect') return null;
    return <div className={`victory-fx victory-fx-${preset.motif}`} data-victory-effect={preset.id} aria-hidden="true" style={{'--fx-color':preset.color,'--fx-accent':preset.accent,'--fx-duration':`${duration}s`} as CSSProperties}>
        {Array.from({length:preset.layers},(_,index)=><span className="victory-fx-ring" key={`ring-${index}`} style={{'--ring':index} as CSSProperties}/>)}
        {Array.from({length:preset.count},(_,index)=><i key={index} style={{
            '--angle':`${index*360/preset.count}deg`,'--distance':`${25+(index*17)%30}vmin`,
            '--delay':`${(index%7)*.045}s`,'--drift':`${((index*37)%100)-50}vw`,
            '--origin':`${(index*61)%100}%`,'--size':`${3+preset.tier*.35+(index%3)*2}px`,
        } as CSSProperties}/>)}
        {preset.tier>=7 && <b className="victory-fx-crown">♛</b>}
    </div>;
}
