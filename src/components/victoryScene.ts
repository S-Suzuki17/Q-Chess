import type { ChampionEffect } from '../config/championshipRewards';
import { victoryStyle } from '../config/victoryStyles';
import { fragments, shotAt, SHOT_SECONDS } from './checkmate/timeline';
import { atmosphereParticles, type WordBox } from './checkmate/atmosphere';
import { renderSpectacle } from './checkmate/spectacle';
import { victoryIntensity } from './checkmate/intensity';
import { burstTrails } from './checkmate/trails';
import { createCoronationGeometry } from './checkmate/coronation';

export function createVictoryPlan(preset: ChampionEffect, compact = false, shotSeed?: number) {
    let seed = 2166136261;
    for (const c of preset.id) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
    seed = shotSeed ?? seed;
    const intensity = victoryIntensity(preset,compact);
    return { seed, tier: preset.tier, motif: preset.motif, style: victoryStyle(preset), duration: SHOT_SECONDS,
        intensity, coronation: createCoronationGeometry(preset.motif, intensity), trails: burstTrails(seed,intensity),
        particles: fragments(seed, false).slice(0,intensity.chipCount),
        ornaments: atmosphereParticles(seed, compact,intensity,preset.motif) };
}
export type VictoryPlan = ReturnType<typeof createVictoryPlan>;
export function victoryWordBoxes(width: number, height: number): WordBox[] {
    return [{ x: width * .07, y: height * .65, width: width * .86, height: height * .17 }];
}
/** Catalogue, preview, and match share this renderer. Live shots use DOM typography. */
export function renderVictoryFrame(ctx: CanvasRenderingContext2D, plan: VictoryPlan, width: number, height: number, seconds: number,
    _hold = false, words = victoryWordBoxes(width,height), headline = true, reduced = false, cinematic = false) {
    if (width <= 0 || height <= 0) return;
    renderSpectacle(ctx,plan.particles,shotAt(seconds,reduced),width,height,reduced||cinematic,words,plan.style,plan.ornaments,plan.trails,plan.intensity,cinematic?undefined:plan.coronation);
    if (headline) {
        ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font='900 '+Math.min(width*.125,height*.17)+'px Impact, "Arial Black", sans-serif';
        ctx.lineWidth=Math.max(.5,width/500); ctx.strokeStyle=plan.style.edge;
        ctx.shadowColor=plan.style.depth;ctx.shadowOffsetY=3;ctx.shadowBlur=2;
        const metal=ctx.createLinearGradient(0,height*.61,0,height*.8);
        metal.addColorStop(0,plan.style.highlight);metal.addColorStop(.45,plan.style.mid);metal.addColorStop(.5,plan.style.highlight);metal.addColorStop(1,plan.style.shade);
        ctx.fillStyle=metal;ctx.fillText('CHECKMATE',width/2,height*.73,width*.9);ctx.strokeText('CHECKMATE',width/2,height*.73,width*.9);
        ctx.restore();
    }
}
/** Visibility pauses elapsed time. One shot, with an injectable clock for lifecycle tests. */
export function startVictoryPlayback({ duration, draw, request, cancel, now, hidden, reduced, observeVisibility }: {
    duration: number; draw: (time: number, done: boolean) => void;
    request: (callback: (time: number) => void) => number; cancel: (id: number) => void;
    now: () => number; hidden: () => boolean; reduced: () => boolean;
    observeVisibility?: (callback:()=>void)=>()=>void;
}) {
    let frame: number | null = null, elapsed = 0, last = now(), stopped = false, done = false;
    let unobserve: (() => void) | undefined;
    const detach = () => { unobserve?.(); unobserve = undefined; };
    const schedule = () => {
        if (!stopped && !done && !hidden() && frame === null) frame = request(tick);
    };
    const tick = (timestamp: number) => {
        frame = null;
        if (stopped || done) return;
        const delta = Math.max(0, timestamp - last); last = timestamp;
        if (!hidden()) {
            elapsed += delta / 1000;
            const staticMotion = reduced();
            done = staticMotion || elapsed >= duration;
            draw(staticMotion ? duration : Math.min(duration, elapsed), done);
        }
        if (done) detach();
        else schedule();
    };
    unobserve = observeVisibility?.(() => {
        if (stopped || done) return;
        last = now();
        if (hidden() && frame !== null) { cancel(frame); frame = null; }
        else schedule();
    });
    schedule();
    return () => {
        stopped = true;
        if (frame !== null) { cancel(frame); frame = null; }
        detach();
    };
}
