'use client';
import { useEffect, useRef, type CSSProperties } from 'react';
import { championshipReward, type ChampionEffect } from '../config/championshipRewards';
import type { VictoryFinish } from '../config/campaign';
import { RewardSigil } from './RewardArtwork';
import { createVictoryPlan, renderVictoryFrame, startVictoryPlayback, VICTORY_PALETTES } from './victoryScene';
import './victory-celebration.css';

/** Non-interactive. A changed reward starts a fresh, disposable shot. */
export function VictoryCelebration({ effect, preview = false, contained = false }: {
    effect: VictoryFinish; preview?: boolean; contained?: boolean;
}) {
    const preset = championshipReward(effect);
    return preset?.kind === 'effect' ? <VictoryShot key={`${effect}-${preview}`} preset={preset} preview={preview} contained={contained}/> : null;
}
function VictoryShot({ preset, preview, contained }: { preset: ChampionEffect; preview: boolean; contained: boolean }) {
    const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const node = host.current, surface = canvas.current;
        if (!node || !surface) return;
        const ctx = surface.getContext('2d');
        if (!ctx) return;
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let width = 0, height = 0, current = 0, finished = false;
        let plan = createVictoryPlan(preset, node.clientWidth < 600);
        const draw = (time: number, done: boolean) => {
            current = time; finished = done;
            renderVictoryFrame(ctx, plan, width, height, time, preview || motion.matches);
            node.dataset.rendered = 'true'; node.dataset.finished = String(done);
        };
        const resize = () => {
            width = node.clientWidth; height = node.clientHeight;
            // Bounds apply only to this overlay, never the board resolution.
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            surface.width = Math.round(width * dpr); surface.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            plan = createVictoryPlan(preset, width < 600); draw(current, finished);
        };
        resize();
        const observer = new ResizeObserver(resize); observer.observe(node);
        const stop = startVictoryPlayback({ duration: preset.duration, draw,
            request: requestAnimationFrame, cancel: cancelAnimationFrame, now: () => performance.now(),
            hidden: () => document.hidden, reduced: () => motion.matches,
            observeVisibility: listener=>{document.addEventListener('visibilitychange',listener);return()=>document.removeEventListener('visibilitychange',listener);} });
        const preferenceChanged = () => { if (motion.matches) { stop(); draw(2.4, true); } };
        motion.addEventListener('change', preferenceChanged);
        return () => { stop(); observer.disconnect(); motion.removeEventListener('change', preferenceChanged); };
    }, [preset, preview]);
    return <div ref={host} className="victory-fx" data-victory-effect={preset.id} data-effect-motif={preset.motif}
        data-effect-tier={preset.tier} data-effect-preview={preview} data-contained={contained} aria-hidden="true"
        style={{ '--fx-color': VICTORY_PALETTES[preset.motif][0] } as CSSProperties}>
        <div className="victory-fx-fallback"><RewardSigil motif={preset.motif} tier={preset.tier}/></div><canvas ref={canvas}/>
    </div>;
}
