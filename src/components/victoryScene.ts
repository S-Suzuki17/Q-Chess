import type { ChampionEffect } from '../config/championshipRewards';
import { victoryStyle } from '../config/victoryStyles';
import { fragments, shotAt, SHOT_SECONDS } from './checkmate/timeline';
import { atmosphereParticles, type WordBox } from './checkmate/atmosphere';
import { renderSpectacle } from './checkmate/spectacle';
import { victoryIntensity } from './checkmate/intensity';
import { burstTrails } from './checkmate/trails';

export function createVictoryPlan(preset: ChampionEffect, compact = false, shotSeed?: number) {
    let seed = 2166136261;
    for (const c of preset.id) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
    seed = shotSeed ?? seed;
    const intensity = victoryIntensity(preset,compact);
    return { seed, tier: preset.tier, motif: preset.motif, style: victoryStyle(preset), duration: SHOT_SECONDS,
        intensity, trails: burstTrails(seed,intensity),
        particles: fragments(seed, false).slice(0,intensity.chipCount),
        ornaments: atmosphereParticles(seed, compact,intensity) };
}
export type VictoryPlan = ReturnType<typeof createVictoryPlan>;
export function victoryWordBoxes(width: number, height: number): WordBox[] {
    if (width < 600) return [
        {x:width*.15,y:height*.35,width:width*.7,height:Math.min(width*.25,height*.25)},
        {x:width*.15,y:height*.35+Math.min(width*.25,height*.25),width:width*.7,height:Math.min(width*.25,height*.25)},
    ];
    return [{x:width*.07,y:height*.43,width:width*.48,height:height*.2},
        {x:width*.55,y:height*.43,width:width*.38,height:height*.2}];
}
/** Catalogue, preview, and match share this renderer. Live shots use DOM typography. */
export function renderVictoryFrame(ctx: CanvasRenderingContext2D, plan: VictoryPlan, width: number, height: number, seconds: number,
    _hold = false, words = victoryWordBoxes(width,height), headline = true, reduced = false) {
    if (width <= 0 || height <= 0) return;
    renderSpectacle(ctx,plan.particles,shotAt(seconds,reduced),width,height,reduced,words,plan.style,plan.ornaments,plan.trails,plan.intensity);
    if (headline) {
        ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font='900 '+Math.min(width*.125,height*.29)+'px Impact, "Arial Black", sans-serif';
        ctx.lineWidth=Math.max(.5,width/500); ctx.strokeStyle=plan.style.edge;
        ctx.shadowColor=plan.style.depth;ctx.shadowOffsetY=3;ctx.shadowBlur=2;
        const metal=ctx.createLinearGradient(0,height*.3,0,height*.6);
        metal.addColorStop(0,plan.style.highlight);metal.addColorStop(.45,plan.style.mid);metal.addColorStop(.5,plan.style.highlight);metal.addColorStop(1,plan.style.shade);
        ctx.fillStyle=metal;ctx.fillText('CHECKMATE',width/2,height*.46,width*.9);ctx.strokeText('CHECKMATE',width/2,height*.46,width*.9);
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
    let frame = 0, elapsed = 0, last = now(), stopped = false, done = false;
    const unobserve=observeVisibility?.(()=>{last=now();});
    const tick = (timestamp: number) => {
        if (stopped || done) return;
        const delta = Math.max(0, timestamp - last); last = timestamp;
        if (!hidden()) { elapsed += delta / 1000; done = reduced() || elapsed >= duration; draw(reduced() ? duration : Math.min(duration, elapsed), done); }
        if (!done) frame = request(tick);
    };
    frame = request(tick); return () => { stopped = true; cancel(frame); unobserve?.(); };
}
