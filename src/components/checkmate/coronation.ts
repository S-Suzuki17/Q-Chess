import type { EffectMotif } from '../../config/championshipRewards';
import type { VictoryIntensity } from './intensity';
import { unit } from './timeline';

// Original, parameterized heraldry. No textures, downloaded art, or runtime randomness.
const TAU = Math.PI * 2;
const GOLD = '#c5ab72';
const IVORY = '#f1ead5';
const EMERALD = '#5da98b';
type Point = readonly [number, number];
const ease = (value: number) => 1 - (1 - unit(value)) ** 3;
export const CORONATION_CUES = { gather: .35, reveal: 1.2, hold: 2.3, end: 3 } as const;

export function coronationAt(seconds: number, reduced = false) {
    const t = reduced ? 1.6 : Math.max(0, Math.min(3, Number.isFinite(seconds) ? seconds : 0));
    const gather = ease(t / CORONATION_CUES.gather);
    const reveal = ease((t - .35) / .85);
    const settle = ease((t - 2.3) / .7);
    return {
        t, gather, reveal, settle,
        opacity: reduced ? 1 : ease(t / .18) * (1 - settle),
        // Motion has stopped before the readable hold; one restrained reveal pulse.
        orbit: reduced || t >= 1.2 ? 0 : (1 - reveal) * .48,
        pulse: reduced || t < .65 || t >= 1.2 ? 0 : Math.sin((t - .65) / .55 * Math.PI) * .12,
        phase: t < .35 ? 'gather' : t < 1.2 ? 'reveal' : t < 2.3 ? 'hold' : 'settle',
    };
}
export type CoronationFrame = ReturnType<typeof coronationAt>;

export function createCoronationGeometry(motif: EffectMotif, intensity: VictoryIntensity) {
    const grade = intensity.grade;
    const facets = Array.from({ length: 4 + grade * 2 }, (_, index) => {
        const count = 4 + grade * 2;
        const left = -1 + 2 * index / count, right = -1 + 2 * (index + 1) / count;
        const tip = (left + right) / 2;
        const high = index === Math.floor(count / 2) || index === Math.floor(count / 2) - 1;
        return { points: [[left * .87, .42], [left, -.32], [tip, high ? -.88 : -.65], [right, -.32], [right * .87, .42]] as Point[],
            angle: (index / count - .5) * Math.PI, delay: (index % 3) * .055 };
    });
    return { motif, grade, orbitCount: 2 + grade, tickCount: 8 + grade * 4,
        cometCount: 3 + grade, fanCount: 5 + grade * 2, facets };
}
export type CoronationGeometry = ReturnType<typeof createCoronationGeometry>;

function polygon(ctx: CanvasRenderingContext2D, points: readonly Point[]) {
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
}
function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    polygon(ctx, [[x, y - size], [x + size * .55, y], [x, y + size], [x - size * .55, y]]);
    ctx.fill();
}
/** A small split crown is the shared Q-Gambit seal; each motif supplies its own silhouette. */
function seal(ctx: CanvasRenderingContext2D, grade: number, reveal: number, scale = 1) {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.globalAlpha *= reveal;
    const metal = ctx.createLinearGradient(-.5, -.7, .55, .7);
    metal.addColorStop(0, IVORY); metal.addColorStop(.4, GOLD); metal.addColorStop(1, '#786440');
    ctx.fillStyle = metal; ctx.strokeStyle = IVORY; ctx.lineWidth = .018;
    polygon(ctx, [[-.5, -.27], [-.22, -.08], [0, -.62], [.22, -.08], [.5, -.27], [.38, .38], [-.38, .38]]);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#102b23';
    polygon(ctx, [[0, -.25], [.11, .11], [0, .24], [-.11, .11]]); ctx.fill();
    ctx.strokeStyle = GOLD; ctx.lineWidth = .04;
    ctx.beginPath(); ctx.moveTo(-.4, .53); ctx.lineTo(.4, .53); ctx.stroke();
    if (grade >= 3) {
        ctx.lineWidth = .012;
        ctx.beginPath(); ctx.moveTo(-.29, .65); ctx.lineTo(.29, .65); ctx.stroke();
    }
    ctx.restore();
}
function rings(ctx: CanvasRenderingContext2D, geometry: CoronationGeometry, frame: CoronationFrame) {
    const { orbitCount, tickCount, grade } = geometry;
    for (let index = 0; index < orbitCount; index++) {
        const rest = 1 - frame.reveal, angle = index * Math.PI / orbitCount;
        const radius = .78 + index * .12;
        ctx.save();
        ctx.translate(Math.cos(angle) * rest * .62, Math.sin(angle) * rest * .32);
        ctx.rotate(angle * rest + frame.orbit * (index % 2 ? -1 : 1));
        ctx.strokeStyle = index % 2 ? EMERALD : GOLD;
        ctx.lineWidth = index === 0 ? .027 : .012;
        ctx.globalAlpha *= .88 - index * .075;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius * (.46 + .54 * frame.reveal), 0, -.4 + index * .4, Math.PI * 1.54 + index * .4);
        ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.globalAlpha *= frame.reveal; ctx.strokeStyle = GOLD; ctx.lineWidth = .013;
    for (let index = 0; index < tickCount; index++) {
        const angle = index / tickCount * TAU, radius = 1.18 + grade * .06;
        const length = index % 4 === 0 ? .095 : .035;
        ctx.beginPath(); ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        ctx.lineTo(Math.cos(angle) * (radius + length), Math.sin(angle) * (radius + length)); ctx.stroke();
    }
    ctx.restore(); seal(ctx, grade, frame.gather);
}
function shards(ctx: CanvasRenderingContext2D, geometry: CoronationGeometry, frame: CoronationFrame) {
    const dissolve = frame.settle;
    for (let index = 0; index < geometry.facets.length; index++) {
        const facet = geometry.facets[index];
        const gather = ease((frame.t - facet.delay) / .95), rest = 1 - gather;
        ctx.save();
        ctx.translate(Math.sin(facet.angle) * (rest * 1.1 + dissolve * .45), -rest * .5 - dissolve * .4);
        ctx.rotate(rest * facet.angle * .5 + dissolve * facet.angle * .2);
        ctx.globalAlpha *= .5 + .5 * gather;
        const metal = ctx.createLinearGradient(-1, -.8, 1, .6);
        metal.addColorStop(0, index % 2 ? '#86b39c' : IVORY);
        metal.addColorStop(.5, index % 2 ? '#34644f' : GOLD);
        metal.addColorStop(1, '#183d31');
        ctx.fillStyle = metal; ctx.strokeStyle = index % 2 ? '#8cbaa280' : '#f1ead5aa'; ctx.lineWidth = .015;
        polygon(ctx, facet.points); ctx.fill(); ctx.stroke();
        ctx.restore();
    }
    ctx.save(); ctx.globalAlpha *= frame.reveal; ctx.strokeStyle = GOLD; ctx.lineWidth = .035;
    ctx.beginPath(); ctx.moveTo(-.84, .52); ctx.lineTo(.84, .52); ctx.stroke();
    ctx.lineWidth = .012;
    ctx.beginPath(); ctx.moveTo(-.72, .63); ctx.lineTo(.72, .63); ctx.stroke();
    ctx.fillStyle = IVORY; diamond(ctx, 0, .06, .16);
    if (geometry.grade >= 3) {
        ctx.fillStyle = GOLD; diamond(ctx, -.48, .15, .055); diamond(ctx, .48, .15, .055);
    }
    ctx.restore();
}
function starPath(ctx: CanvasRenderingContext2D, radius: number, points = 4) {
    ctx.beginPath();
    for (let index = 0; index < points * 2; index++) {
        const angle = index * Math.PI / points - Math.PI / 2;
        const r = index % 2 ? radius * .2 : radius;
        const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
        if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
}
function starfall(ctx: CanvasRenderingContext2D, geometry: CoronationGeometry, frame: CoronationFrame, reduced: boolean) {
    if (!reduced && frame.t < 1.25) {
        for (let index = 0; index < geometry.cometCount; index++) {
            const progress = unit((frame.t - index * .07) / .62);
            if (progress <= 0 || progress >= 1) continue;
            const side = index % 2 ? -1 : 1, rest = 1 - ease(progress);
            const x = -side * rest * 2, y = -rest * 1.7;
            const gradient = ctx.createLinearGradient(x - side * .7, y - .6, x, y);
            gradient.addColorStop(0, '#c5ab7200'); gradient.addColorStop(1, IVORY);
            ctx.strokeStyle = gradient; ctx.lineWidth = .014 + (index % 3) * .008;
            ctx.beginPath(); ctx.moveTo(x - side * .75, y - .65); ctx.lineTo(x, y); ctx.stroke();
            ctx.fillStyle = IVORY; diamond(ctx, x, y, .035);
        }
    }
    ctx.save(); ctx.globalAlpha *= frame.reveal;
    const light = ctx.createLinearGradient(-.6, -1, .8, 1);
    light.addColorStop(0, IVORY); light.addColorStop(.45, '#e3d1a3'); light.addColorStop(1, '#467e65');
    ctx.fillStyle = light; ctx.strokeStyle = GOLD; ctx.lineWidth = .014;
    starPath(ctx, 1 + frame.pulse, 4); ctx.fill(); ctx.stroke();
    ctx.rotate(Math.PI / 4); ctx.globalAlpha *= .6;
    starPath(ctx, .64, 4); ctx.stroke(); ctx.restore();
    // Sparse suspended remnants drift only outside the readable hold.
    ctx.save(); ctx.globalAlpha *= frame.reveal * .7; ctx.fillStyle = GOLD;
    for (let index = 0; index < geometry.grade + 2; index++) {
        const angle = index * 2.4 + .3, drift = reduced ? 0 : frame.settle * .16;
        diamond(ctx, Math.cos(angle) * (1.13 + drift), Math.sin(angle) * .9 + drift, .028);
    }
    ctx.restore();
}
function corona(ctx: CanvasRenderingContext2D, geometry: CoronationGeometry, frame: CoronationFrame) {
    const count = geometry.fanCount;
    for (let index = 0; index < count; index++) {
        const fraction = index / (count - 1), spread = .18 + .82 * frame.reveal;
        const angle = -Math.PI / 2 + (fraction - .5) * Math.PI * 1.28 * spread;
        const length = .98 + Math.sin(fraction * Math.PI) * .38;
        ctx.save(); ctx.rotate(angle); ctx.globalAlpha *= .72;
        const light = ctx.createLinearGradient(.35, 0, length, 0);
        light.addColorStop(0, '#123c2a00'); light.addColorStop(.45, '#5da98b70'); light.addColorStop(1, '#c5ab72a6');
        ctx.fillStyle = light; ctx.strokeStyle = '#c5ab7277'; ctx.lineWidth = .009;
        polygon(ctx, [[.37, -.015], [length, -.075], [length + .06, 0], [length, .075], [.37, .015]]);
        ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.globalAlpha *= frame.reveal; ctx.strokeStyle = GOLD; ctx.lineWidth = .018;
    for (let index = 0; index < Math.ceil(geometry.grade / 2); index++) {
        const radius = 1.08 + index * .15;
        ctx.beginPath(); ctx.arc(0, 0, radius, Math.PI * 1.06, Math.PI * 1.94); ctx.stroke();
    }
    ctx.fillStyle = IVORY; diamond(ctx, 0, -1.49, .04); ctx.restore();
    seal(ctx, geometry.grade, frame.gather, .86 + frame.pulse);
}

export function renderCoronation(ctx: CanvasRenderingContext2D, geometry: CoronationGeometry, width: number, height: number, seconds: number, reduced = false) {
    const frame = coronationAt(seconds, reduced);
    if (frame.opacity <= 0 || width <= 0 || height <= 0) return;
    const radius = Math.min(width * .21, height * .205);
    ctx.save(); ctx.translate(width / 2, height * .335); ctx.scale(radius, radius);
    ctx.globalAlpha = frame.opacity;
    if (geometry.motif === 'rings') rings(ctx, geometry, frame);
    else if (geometry.motif === 'shards') shards(ctx, geometry, frame);
    else if (geometry.motif === 'starfall') starfall(ctx, geometry, frame, reduced);
    else corona(ctx, geometry, frame);
    // Fine engraving beneath the emblem connects its silhouette to the result.
    ctx.globalAlpha = frame.opacity * frame.reveal * .5; ctx.strokeStyle = GOLD; ctx.lineWidth = .01;
    ctx.beginPath(); ctx.moveTo(-.62, 1.66); ctx.lineTo(-.1, 1.66); ctx.moveTo(.1, 1.66); ctx.lineTo(.62, 1.66); ctx.stroke();
    ctx.fillStyle = IVORY; diamond(ctx, 0, 1.66, .03);
    ctx.restore();
}
