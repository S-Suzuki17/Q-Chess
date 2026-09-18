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
    return <div className={`victory-fx victory-fx-${preset.motif}`} data-victory-effect={preset.id} data-effect-tier={preset.tier} data-effect-preview={preview} aria-hidden="true" style={{'--fx-color':preset.color,'--fx-accent':preset.accent,'--fx-duration':`${duration}s`,'--fx-tier':preset.tier} as CSSProperties}>
        <div className="victory-fx-light"/>
        <div className="victory-fx-stage">
            <div className="victory-fx-halo"/>
            {preset.motif==='shards'&&<div className="victory-fx-heart"/>}
            {preset.motif==='rings'&&Array.from({length:2+Math.floor(preset.tier/3)},(_,n)=><div key={n} className="victory-fx-orbit" style={{'--n':n} as CSSProperties}><b/></div>)}
            {preset.motif==='shards'&&Array.from({length:5+Math.floor(preset.tier/2)},(_,n)=><div key={n} className="victory-fx-crystal" style={{'--angle':`${n*360/(5+Math.floor(preset.tier/2))}deg`,'--n':n} as CSSProperties}/>)}
            {preset.motif==='starfall'&&<div className="victory-fx-constellation"><svg viewBox="0 0 400 400" fill="none"><path d="M45 250 95 95 190 45 310 115 355 270 225 340 45 250 190 45 225 340 310 115 95 95" stroke="currentColor"/>{[[45,250],[95,95],[190,45],[310,115],[355,270],[225,340]].map(([x,y])=><path key={x} d={`M${x} ${y-12}l3 9 9 3-9 3-3 9-3-9-9-3 9-3Z`} fill="var(--fx-accent)"/>)}</svg></div>}
            {preset.motif==='corona'&&<><div className="victory-fx-crown"><svg viewBox="0 0 300 220"><path d="M45 60 96 105 150 30 204 105 255 60 230 165H70Z" fill="var(--fx-color)"/><path d="m45 60 51 45 54-75v135H70Z" fill="var(--fx-accent)" opacity=".7"/><path d="M70 165h160v22H70Z" fill="var(--fx-accent)"/><path d="m150 90 13 25-13 25-13-25Z" fill="#283337"/>{[45,150,255].map((x,n)=><circle key={x} cx={x} cy={n===1?24:54} r="9" fill="var(--fx-accent)"/>)}</svg></div><div className="victory-fx-laurel"/></>}
            {preset.tier>=5&&<div className="victory-fx-dais"/>}
            {preset.tier>=8&&<div className="victory-fx-rays"/>}
        </div>
        <div className="victory-fx-seal"><RewardSigil motif={preset.motif} tier={preset.tier}/></div>
        {Array.from({length:preset.layers},(_,index)=><span className="victory-fx-ring" key={`ring-${index}`} style={{'--ring':index} as CSSProperties}/>)}
        {Array.from({length:preset.count},(_,index)=><i key={index} style={{
            '--angle':`${index*360/preset.count}deg`,'--distance':`${30+(index%3)*7}cqw`,
            '--delay':`${.18+(index%4)*.06}s`,'--drift':`${-12-(index%5)*3}cqw`,
            '--origin':`${12+(index*61)%76}%`,'--size':`${2+preset.tier*.2+(index%3)}px`,
        } as CSSProperties}/>)}
    </div>;
}
