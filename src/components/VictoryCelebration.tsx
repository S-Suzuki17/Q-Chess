'use client';
import { useEffect, useRef, type CSSProperties } from 'react';
import { championshipReward, type ChampionEffect } from '../config/championshipRewards';
import type { VictoryFinish } from '../config/campaign';
import { createVictoryPlan, renderVictoryFrame, startVictoryPlayback, victoryWordBoxes } from './victoryScene';
import { letterAt, SHOT_SECONDS } from './checkmate/timeline';
import { victoryStyle } from '../config/victoryStyles';
import { soundManager } from '../lib/SoundService';
import './victory-celebration.css';
import './checkmate/heading.css';

/** Non-interactive. A changed reward starts a fresh, disposable shot. */
export function VictoryCelebration({ effect, preview = false, contained = false, checkmate = preview }: {
    effect: VictoryFinish; preview?: boolean; contained?: boolean; checkmate?: boolean;
}) {
    const preset = championshipReward(effect);
    return preset?.kind === 'effect' ? <VictoryShot key={`${effect}-${preview}`} preset={preset} preview={preview} contained={contained} checkmate={checkmate}/> : null;
}
function VictoryShot({ preset, preview, contained, checkmate }: { preset: ChampionEffect; preview: boolean; contained: boolean; checkmate: boolean }) {
    const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
    const style = victoryStyle(preset);
    useEffect(() => {
        const node = host.current, surface = canvas.current;
        if (!node || !surface) return;
        const ctx = surface.getContext('2d');
        if (!ctx) return;
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let width = 0, height = 0, current = 0, finished = false;
        const seed = (Math.random()*4294967296) >>> 0;
        let plan = createVictoryPlan(preset, node.clientWidth < 600, seed);
        let words = victoryWordBoxes(width,height);
        const letters = [...node.querySelectorAll<HTMLElement>('[data-letter]')];
        const draw = (time: number, done: boolean) => {
            current = time; finished = done;
            renderVictoryFrame(ctx, plan, width, height, time, true, words, false, motion.matches);
            letters.forEach((letter,index)=>{
                const f=letterAt(index,time,motion.matches);
                letter.style.transform=`translate(${f.x}px,${f.y}px) rotate(${f.rotate}deg) scale(${f.scale})`;
                letter.style.opacity=String(f.opacity);letter.style.filter=f.blur>.01?`blur(${f.blur}px)`:'none';
                letter.style.setProperty('--polish-opacity',String(f.shine));letter.style.setProperty('--polish-position',`${f.shinePosition}%`);
            });
            node.dataset.rendered = 'true'; node.dataset.finished = String(done);
            node.dataset.time = String(time);
        };
        const resize = () => {
            width = node.clientWidth; height = node.clientHeight;
            // Bounds apply only to this overlay, never the board resolution.
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            surface.width = Math.round(width * dpr); surface.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            plan = createVictoryPlan(preset, width < 600, seed);
            const box=surface.getBoundingClientRect();
            words=[...node.querySelectorAll<HTMLElement>('[data-word]')].map(word=>{
                const b=word.getBoundingClientRect();return {x:b.left-box.left,y:b.top-box.top,width:b.width,height:b.height};
            });
            if(!words.length)words=victoryWordBoxes(width,height);
            draw(current, finished);
        };
        resize();
        const observer = new ResizeObserver(resize); observer.observe(node);
        const stopSound = soundManager.playSE('/audio/se_checkmate.wav');
        const stop = startVictoryPlayback({ duration: SHOT_SECONDS, draw,
            request: requestAnimationFrame, cancel: cancelAnimationFrame, now: () => performance.now(),
            hidden: () => document.hidden, reduced: () => motion.matches,
            observeVisibility: listener=>{document.addEventListener('visibilitychange',listener);return()=>document.removeEventListener('visibilitychange',listener);} });
        const preferenceChanged = () => { if (motion.matches) { stop(); stopSound(); draw(SHOT_SECONDS, true); } };
        motion.addEventListener('change', preferenceChanged);
        return () => { stop(); stopSound(); observer.disconnect(); motion.removeEventListener('change', preferenceChanged); };
    }, [preset, checkmate]);
    return <div ref={host} className="victory-fx" data-victory-effect={preset.id} data-effect-motif={preset.motif}
        data-effect-tier={preset.tier} data-effect-preview={preview} data-contained={contained} aria-hidden="true"
        data-finish={style.id} data-effect-stage={preset.requiredWins} data-effect-renderer="checkmate-v4"
        style={{ '--fx-color':style.color,'--letter-highlight':style.highlight,'--letter-mid':style.mid,'--letter-shade':style.shade,'--letter-edge':style.edge,'--letter-depth':style.depth } as CSSProperties}>
        <canvas ref={canvas}/>
        {checkmate && <div className="result-heading" lang="en"><div className="mate-title" aria-label="CHECKMATE">{['CHECK','MATE'].map(word=><span className="mate-word" data-word={word} key={word}>{[...word].map((letter,index)=><span className="mate-letter" data-letter={letter} key={index}>{letter}</span>)}</span>)}</div></div>}
    </div>;
}
