import { EFFECT_PALETTES, type ChampionEffect, type EffectMotif } from '../config/championshipRewards';

// One bounded Canvas2D theatre. Never allocate a second WebGL context beside the board.
export const VICTORY_PALETTES = EFFECT_PALETTES;
const TAU = Math.PI * 2;
export const clamp = (n: number) => Math.max(0, Math.min(1, n));
const out = (n: number) => 1 - Math.pow(1 - clamp(n), 3);
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
type Particle = { angle: number; speed: number; depth: number; delay: number; life: number; size: number; fast: boolean };
export type VictoryPlan = { motif: EffectMotif; tier: number; duration: number; seed: number; satellites: number; particles: readonly Particle[] };
export function createVictoryPlan(preset: ChampionEffect, compact = false): VictoryPlan {
    let seed = 2166136261;
    for (const c of preset.id) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
    const initial = seed;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    return { motif: preset.motif, tier: preset.tier, duration: preset.duration, seed: initial,
        satellites: 3 + Math.floor(preset.tier / 2),
        particles: Array.from({ length: Math.min(compact ? 76 : 112, 36 + preset.tier * 7) }, (_, i) => ({
            angle: random() * TAU, speed: 95 + random() * 180, depth: .45 + random() * .8,
            delay: .36 + random() * .28, life: i % 3 === 0 ? .28 + random() * .38 : 1.1 + random() * 1.25,
            size: .5 + random() * 1.6, fast: i % 3 === 0,
        })),
    };
}
export function particleAt(p: Particle, time: number, motif: EffectMotif) {
    const age = time - p.delay, progress = clamp(age / p.life);
    const travel = (p.fast ? out(progress) : 1 - Math.exp(-progress * 2)) * p.speed;
    const y = Math.sin(p.angle) * travel * p.depth;
    return { x: Math.cos(p.angle) * travel,
        y: motif === 'corona' ? -Math.abs(y) - age * 28 + 60 : y + age * age * 15,
        alpha: age < 0 || age > p.life ? 0 : Math.sin(Math.PI * progress) * (p.fast ? .85 : .55) };
}
type Point = readonly [number, number];
function line(ctx: CanvasRenderingContext2D, points: readonly Point[], color: string, width = 1, close = false, fill?: string) {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    if (close) ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha: number) {
    if (alpha <= 0 || radius <= 0) return;
    ctx.save(); ctx.globalAlpha *= clamp(alpha);
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color); g.addColorStop(.15, `${color}80`); g.addColorStop(1, `${color}00`);
    ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2); ctx.restore();
}
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
    line(ctx, [[x, y - r], [x + r * .18, y - r * .18], [x + r, y], [x + r * .18, y + r * .18], [x, y + r], [x - r * .18, y + r * .18], [x - r, y], [x - r * .18, y - r * .18]], color, .6, true, color);
}
function crystal(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, turn: number, colors: readonly string[]) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(turn);
    const top: Point = [0, -size], bottom: Point = [0, size * .85];
    const left: Point = [-size * .37, -size * .2], right: Point = [size * .37, -size * .2], middle: Point = [size * .08, size * .12];
    line(ctx, [top, left, middle], colors[0], .7, true, colors[2]);
    line(ctx, [top, right, middle], colors[1], .8, true, `${colors[0]}b0`);
    line(ctx, [left, bottom, middle], colors[0], .7, true, '#172237');
    line(ctx, [right, bottom, middle], colors[0], .7, true, `${colors[2]}e0`);
    line(ctx, [top, middle, bottom], colors[1], 1.3); ctx.restore();
}
function orbit(ctx: CanvasRenderingContext2D, r: number, tilt: number, turn: number, color: string, time: number, tier: number) {
    ctx.save(); ctx.rotate(turn); ctx.strokeStyle = color; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * tilt, 0, 0, TAU); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * tilt, 0, time * .5, time * .5 + .72); ctx.stroke();
    ctx.lineWidth = .5;
    ctx.beginPath(); ctx.ellipse(0, 0, r + 6, (r + 6) * tilt, 0, 2.3, 4.6); ctx.stroke();
    for (let i = 0; i < 8 + tier * 2; i++) {
        const a = i * TAU / (8 + tier * 2);
        line(ctx, [[Math.cos(a) * (r + 10), Math.sin(a) * (r + 10) * tilt], [Math.cos(a) * (r + 13), Math.sin(a) * (r + 13) * tilt]], color, .65);
    }
    const a = time * .7 + turn;
    star(ctx, Math.cos(a) * r, Math.sin(a) * r * tilt, 6, '#edfaff'); ctx.restore();
}
function horizon(ctx: CanvasRenderingContext2D, plan: VictoryPlan, time: number, reveal: number) {
    const c = VICTORY_PALETTES.rings, r = 94 * (.2 + .8 * reveal);
    glow(ctx, 0, 0, 150, c[0], .2);
    ctx.fillStyle = '#050c18'; ctx.beginPath(); ctx.arc(0, 0, r * .64, 0, TAU); ctx.fill();
    orbit(ctx, r, .4, -.36, c[0], time, plan.tier);
    orbit(ctx, r * 1.3, .38, .83, c[2], -time, plan.tier);
    if (plan.tier >= 4) orbit(ctx, r * 1.52, .6, -.7, c[0], -time * .7, plan.tier);
    if (plan.tier >= 8) orbit(ctx, r * 1.78, .7, .4, '#577d9c', time, plan.tier);
    ctx.strokeStyle = c[1]; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r * .64, -.8, 2.2); ctx.stroke();
    glow(ctx, -r * .44, -r * .44, 34, c[0], .7);
    line(ctx, [[-210 * reveal, 5], [-r * .65, 0]], c[0], .6);
    line(ctx, [[r * .65, 0], [210 * reveal, -5]], c[0], .6);
}
function prism(ctx: CanvasRenderingContext2D, plan: VictoryPlan, time: number, reveal: number) {
    const c = VICTORY_PALETTES.shards;
    const spread = out((time - .35) / .65) * (1 - .35 * smooth((time - 1.1) / 1.1));
    for (let i = 0; i < plan.satellites; i++) {
        const a = i * TAU / plan.satellites + .23, x = Math.cos(a) * 146 * spread, y = Math.sin(a) * 115 * spread;
        ctx.save(); ctx.globalAlpha *= .55;
        line(ctx, [[0, 0], [x, y]], c[0], .55);
        crystal(ctx, x, y, (20 + i % 3 * 9) * reveal, a + time * .035, c); ctx.restore();
    }
    glow(ctx, 0, 0, 100, c[0], .24); crystal(ctx, 0, 0, 91 * reveal, -.12 + .09 * reveal, c);
    for (let i = 0; i < 3 + Math.floor(plan.tier / 3); i++) {
        const y = -45 + i * 25;
        ctx.save(); ctx.globalAlpha *= .24;
        line(ctx, [[-160 * reveal, y + 22], [0, y], [156 * reveal, y - 26]], i % 2 ? c[0] : '#f0cbbd', .8); ctx.restore();
    }
    star(ctx, -9, -83 * reveal, 11, c[1]);
}
function astral(ctx: CanvasRenderingContext2D, plan: VictoryPlan, time: number, reveal: number) {
    const c = VICTORY_PALETTES.starfall, count = 3 + Math.floor(plan.tier / 2), points: Point[] = [];
    for (let i = 0; i < count; i++) {
        const a = i * 2.399 + (plan.seed % 50) * .01, r = 45 + i * 15;
        const target: Point = [Math.cos(a) * r, Math.sin(a) * r * .7]; points.push(target);
        const arrival = out((time - .16 - i * .07) / .78);
        const x = target[0] + (1 - arrival) * 200, y = target[1] - (1 - arrival) * 290;
        ctx.save(); ctx.globalAlpha *= clamp(time * 3) * (.5 + .5 * reveal);
        const g = ctx.createLinearGradient(x + 110, y - 140, x, y);
        g.addColorStop(0, '#719bff00'); g.addColorStop(1, c[0]); ctx.strokeStyle = g; ctx.lineWidth = 1 + i % 3;
        ctx.beginPath(); ctx.moveTo(x + 110, y - 140); ctx.quadraticCurveTo(x + 30, y - 15, x, y); ctx.stroke();
        star(ctx, x, y, i === 0 ? 17 : 5 + i % 3, c[1]); if (i === 0) glow(ctx, x, y, 60, c[0], .45); ctx.restore();
    }
    ctx.save(); ctx.globalAlpha *= smooth((time - .9) / .7) * .45;
    line(ctx, points, c[0], .65);
    if (plan.tier >= 6) orbit(ctx, 161, .7, -.5, c[2], time * .3, plan.tier); ctx.restore();
}
function crown(ctx: CanvasRenderingContext2D, plan: VictoryPlan, time: number, reveal: number) {
    const [gold, ivory, bronze] = VICTORY_PALETTES.corona;
    const forge=Math.sin(clamp((time-.15)/1.2)*Math.PI);
    if(forge>0)for(const x of [-65,0,65]){
        ctx.save();ctx.globalAlpha*=forge*.35;
        const g=ctx.createLinearGradient(x,110,x,-120);g.addColorStop(0,gold);g.addColorStop(1,'#efbd6500');
        ctx.fillStyle=g;ctx.fillRect(x-2,-120,4,230);ctx.restore();
    }
    ctx.save(); ctx.translate(0, (1 - reveal) * 60 - 5); ctx.scale(.65 + reveal * .35, .65 + reveal * .35);
    ctx.beginPath();ctx.rect(-110,100-210*reveal,220,220*reveal);ctx.clip();
    const shape: Point[] = [[-88, -41], [-45, -12], [0, -76], [45, -12], [88, -41], [66, 58], [-66, 58]];
    const metal = ctx.createLinearGradient(-85, -30, 85, 70);
    metal.addColorStop(0, bronze); metal.addColorStop(.25, ivory); metal.addColorStop(.4, gold); metal.addColorStop(.65, '#78502d'); metal.addColorStop(.85, gold); metal.addColorStop(1, ivory);
    ctx.fillStyle = metal; ctx.beginPath(); shape.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
    line(ctx, shape, gold, 1.4, true);
    line(ctx, [[0, -76], [-18, 37], [0, 47], [18, 37]], ivory, .5, true, '#fff0c93b');
    line(ctx, [[-88, -41], [-49, 38], [-66, 58]], bronze, .8, true, '#422e23');
    line(ctx, [[88, -41], [49, 38], [66, 58]], ivory, .8, true, '#f7d794');
    line(ctx, [[-67, 49], [0, 61], [67, 49], [64, 66], [0, 79], [-64, 66]], gold, 1, true, '#30241f');
    line(ctx, [[-64, 66], [0, 79], [64, 66]], ivory, 2);
    crystal(ctx, 0, 18, 18, 0, ['#edb774', ivory, '#9a511d']);
    [-88, 0, 88].forEach((x, i) => star(ctx, x, i === 1 ? -76 : -41, 7, ivory)); ctx.restore();
    if (plan.tier >= 3) for (const side of [-1, 1]) {
        ctx.save(); ctx.scale(side, 1); ctx.globalAlpha *= reveal;
        ctx.beginPath(); ctx.moveTo(35, 118); ctx.quadraticCurveTo(158, 67, 127, -69); ctx.strokeStyle = bronze; ctx.lineWidth = 1.5; ctx.stroke();
        for (let i = 0; i < 5 + Math.floor(plan.tier / 2); i++) {
            const a = -.52 + i * .15, x = 122 * Math.cos(a), y = 106 * Math.sin(a) + 8;
            line(ctx, [[x, y], [x + 16, y - 23], [x + 21, y - 3], [x, y + 6]], gold, .65, true, i % 2 ? '#896333' : '#c49349');
        }
        ctx.restore();
    }
    if (plan.tier >= 7) { ctx.save(); ctx.globalAlpha *= .35; orbit(ctx, 182, .75, -.1, gold, time * .15, plan.tier); ctx.restore(); }
}
/** Deterministic at any time: static art, reduced motion and animation share composition. */
export function renderVictoryFrame(ctx: CanvasRenderingContext2D, plan: VictoryPlan, width: number, height: number, seconds: number, hold = false) {
    ctx.clearRect(0, 0, width, height); if (width <= 0 || height <= 0) return;
    const time = Math.max(0, seconds), scale = Math.min(width / 560, height / 440);
    const [color, accent] = VICTORY_PALETTES[plan.motif], reveal = out((time - .24) / .88);
    const fade = hold ? 1 : 1 - smooth((time - plan.duration + .65) / .65); if (fade <= 0) return;
    ctx.save(); ctx.translate(width / 2, height * .48); ctx.scale(scale, scale); ctx.globalAlpha = fade;
    ctx.save(); ctx.scale(1, .19); glow(ctx, 0, 800, 220, color, reveal * .21); ctx.restore();
    glow(ctx, 0, 0, 225, color, .08 * reveal);
    if (time < .45) {
        ctx.save(); ctx.globalAlpha *= Math.sin(clamp(time / .45) * Math.PI) * .6;
        for (let i = 0; i < 12; i++) {
            const a = i * TAU / 12, r = 190 * (1 - out(time / .45)) + 15;
            line(ctx, [[Math.cos(a) * r, Math.sin(a) * r], [Math.cos(a) * (r + 23), Math.sin(a) * (r + 23)]], color, .8);
        }
        ctx.restore();
    }
    for (let i = 0; i < 2 + Math.floor(plan.tier / 4); i++) {
        const age = time - .36 - i * .105; if (age <= 0 || age > .85) continue;
        ctx.save(); ctx.globalAlpha *= (1 - age / .85) * .36; ctx.strokeStyle = i % 2 ? accent : color; ctx.lineWidth = 1.6 - age;
        ctx.beginPath(); ctx.ellipse(0, 24, 20 + out(age / .85) * 265, 10 + out(age / .85) * 119, -.15, 0, TAU); ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.globalAlpha *= smooth(time / .25);
    ({ rings: horizon, shards: prism, starfall: astral, corona: crown })[plan.motif](ctx, plan, time, reveal); ctx.restore();
    for (const p of plan.particles) {
        const at = particleAt(p, time, plan.motif); if (!at.alpha) continue;
        ctx.save(); ctx.globalAlpha *= at.alpha; ctx.fillStyle = accent;
        if (p.fast) line(ctx, [[at.x, at.y], [at.x - Math.cos(p.angle) * 13, at.y - Math.sin(p.angle) * 13]], color, .85);
        else ctx.fillRect(at.x, at.y, p.size, p.size); ctx.restore();
    }
    glow(ctx, 0, 0, 68, accent, Math.max(0, 1 - Math.abs(time - .41) / .14) * .32); ctx.restore();
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
        if (!hidden()) { elapsed += delta / 1000; done = reduced() || elapsed >= duration; draw(reduced() ? 2.4 : Math.min(duration, elapsed), done); }
        if (!done) frame = request(tick);
    };
    frame = request(tick); return () => { stopped = true; cancel(frame); unobserve?.(); };
}
