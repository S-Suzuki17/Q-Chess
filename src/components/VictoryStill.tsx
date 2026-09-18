'use client';
import {useEffect,useRef} from 'react';
import type {ChampionEffect} from '../config/championshipRewards';
import {createVictoryPlan,renderVictoryFrame} from './victoryScene';
/** A still of the real composition, not an unrelated catalogue glyph. No RAF. */
export function VictoryStill({preset}:{preset:ChampionEffect}) {
    const canvas=useRef<HTMLCanvasElement>(null);
    useEffect(()=>{
        const node=canvas.current,ctx=node?.getContext('2d');if(!node||!ctx)return;
        const draw=()=>{
            const width=node.clientWidth,height=node.clientHeight,dpr=Math.min(window.devicePixelRatio||1,2);
            node.width=Math.round(width*dpr);node.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
            renderVictoryFrame(ctx,createVictoryPlan(preset,true),width,height,1.8,true);
        };
        draw();const observer=new ResizeObserver(draw);observer.observe(node);return()=>observer.disconnect();
    },[preset]);
    return <canvas ref={canvas} aria-hidden="true" style={{width:'100%',height:'100%',display:'block'}}/>;
}
