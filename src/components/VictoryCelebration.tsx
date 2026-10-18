'use client';
import { useEffect, useRef, type CSSProperties } from 'react';
import { championshipReward, type ChampionEffect } from '../config/championshipRewards';
import type { VictoryFinish } from '../config/campaign';
import { createVictoryPlan, renderVictoryFrame, startVictoryPlayback, victoryWordBoxes } from './victoryScene';
import { shotAt, SHOT_SECONDS } from './checkmate/timeline';
import { victoryStyle } from '../config/victoryStyles';
import { soundManager } from '../lib/SoundService';
import type { VictoryCinematic } from './checkmate/cinematic';
import type { VictoryEncounter } from './checkmate/encounter';
export type { VictoryEncounter } from './checkmate/encounter';
import './victory-celebration.css';
import './checkmate/heading.css';

// A built-in ceremony, not an earned reward or a change to equipped ownership.
const STANDARD_VICTORY: ChampionEffect = {
    id: 'champion-effect-standard', kind: 'effect', motif: 'rings', requiredWins: 0,
    tier: 1, familyIndex: 0, color: '#d7ac65', accent: '#fff0d2', count: 0, layers: 1, duration: SHOT_SECONDS,
};

/** Non-interactive. A changed reward starts a fresh, disposable shot. */
export function VictoryCelebration({ effect, preview = false, contained = false, checkmate = preview, encounter }: {
    effect: VictoryFinish; preview?: boolean; contained?: boolean; checkmate?: boolean; encounter?: VictoryEncounter;
}) {
    const preset = effect === 'standard' ? STANDARD_VICTORY : championshipReward(effect);
    return preset?.kind === 'effect' ? <VictoryShot key={`${effect}-${preview}-${encounter?.stageId ?? 'cosmetic'}`} preset={preset} preview={preview} contained={contained} checkmate={checkmate} encounter={encounter}/> : null;
}
function VictoryShot({ preset, preview, contained, checkmate, encounter }: { preset: ChampionEffect; preview: boolean; contained: boolean; checkmate: boolean; encounter?: VictoryEncounter }) {
    const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), cinematicCanvas = useRef<HTMLCanvasElement>(null);
    const style = victoryStyle(preset);
    useEffect(() => {
        const node = host.current, surface = canvas.current;
        if (!node || !surface) return;
        const ctx = surface.getContext('2d');
        if (!ctx) return;
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let width = 0, height = 0, current = 0, finished = false, disposed = false, dismissed = false;
        let staticHold: ReturnType<typeof setTimeout> | undefined;
        let staticHoldMs = SHOT_SECONDS * 1000;
        let cinematic: VictoryCinematic | undefined;
        let loadingCinematic = false;
        let stopSound = () => {};
        const seed = (Math.random()*4294967296) >>> 0;
        let plan = createVictoryPlan(preset, node.clientWidth < 600, seed);
        let words = victoryWordBoxes(width,height);
        const draw = (time: number, done: boolean) => {
            current = time; finished = done;
            node.dataset.reducedMotion = String(motion.matches);
            // Preview stops on the finished artwork; a live shot releases the view.
            const artTime = done && preview && !motion.matches ? 1.6 : time;
            if (cinematic) {
                try { cinematic.draw(artTime); }
                catch { cinematic.dispose(); cinematic = undefined; node.dataset.cinematic = 'fallback'; }
            }
            renderVictoryFrame(ctx, plan, width, height, artTime, true, words, false, motion.matches, !!cinematic);
            const cue = shotAt(time, motion.matches), glint = motion.matches ? 0 : Math.sin(cue.sweep * Math.PI);
            node.style.setProperty('--victory-glint', String(Math.max(0, glint)));
            node.style.setProperty('--victory-sweep', `${160 - cue.sweep * 320}%`);
            if (done && !motion.matches) {
                stopSound();
                if (!preview) dismissed = true;
            }
            // Reduced motion has no animation loop but retains a readable, finite hold.
            if (done && motion.matches && staticHold === undefined && !dismissed) {
                staticHold = setTimeout(() => {
                    stopSound();
                    if (!preview) { dismissed = true; node.dataset.dismissed = 'true'; }
                }, staticHoldMs);
            }
            node.dataset.dismissed = String(dismissed);
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
            cinematic?.resize(width, height, dpr);
            draw(current, finished);
        };
        const loadCinematic = () => {
            if (disposed || finished || current >= SHOT_SECONDS || motion.matches || document.hidden || loadingCinematic || cinematic) return;
            loadingCinematic = true;
            import('./checkmate/cinematic').then(({createVictoryCinematic}) => {
                if (disposed || finished || current >= SHOT_SECONDS || motion.matches || document.hidden || !cinematicCanvas.current) { loadingCinematic = false; return; }
                try {
                    cinematic = createVictoryCinematic(cinematicCanvas.current, plan, width < 600, encounter);
                    cinematic.resize(width, height, window.devicePixelRatio || 1);
                    node.dataset.cinematic = 'ready';
                    draw(current, finished);
                } catch { node.dataset.cinematic = 'fallback'; }
            }).catch(() => { node.dataset.cinematic = 'fallback'; });
        };
        const contextLost = (event: Event) => {
            event.preventDefault();
            if (disposed) return;
            const failed=cinematic;cinematic=undefined;failed?.dispose(); node.dataset.cinematic = 'fallback';
            draw(current, finished);
        };
        const cinematicSurface = cinematicCanvas.current;
        cinematicSurface?.addEventListener('webglcontextlost', contextLost);
        resize();
        loadCinematic();
        const observer = new ResizeObserver(resize); observer.observe(node);
        stopSound = document.hidden ? () => {} : soundManager.playSE('/assets/victory-cinematic/crown-reveal.mp3');
        const stop = startVictoryPlayback({ duration: SHOT_SECONDS, draw,
            request: requestAnimationFrame, cancel: cancelAnimationFrame, now: () => performance.now(),
            hidden: () => document.hidden, reduced: () => motion.matches,
            observeVisibility: listener=>{const visibility=()=>{listener();if(document.hidden)stopSound();else loadCinematic();};document.addEventListener('visibilitychange',visibility);return()=>document.removeEventListener('visibilitychange',visibility);} });
        const preferenceChanged = () => { if (motion.matches) { staticHoldMs=Math.max(0,SHOT_SECONDS-current)*1000;stop(); stopSound(); cinematic?.dispose(); cinematic=undefined;node.dataset.cinematic='static';draw(SHOT_SECONDS, true); } };
        motion.addEventListener('change', preferenceChanged);
        return () => { disposed=true; clearTimeout(staticHold); stop(); stopSound(); cinematicSurface?.removeEventListener('webglcontextlost', contextLost);cinematic?.dispose(); observer.disconnect(); motion.removeEventListener('change', preferenceChanged); };
    }, [preset, preview, encounter?.stageId, encounter?.foe, encounter?.finalBoss, encounter?.pieceFinish, encounter?.foeWhite]);
    return <div ref={host} className="victory-fx" data-victory-effect={preset.id} data-effect-motif={preset.motif}
        data-encounter-stage={encounter?.stageId} data-encounter-foe={encounter?.foe} data-final-boss={encounter?.finalBoss && encounter.stageId===100} data-effect-tier={preset.tier} data-effect-preview={preview} data-contained={contained} aria-hidden="true"
        data-finish={style.id} data-effect-stage={preset.requiredWins} data-effect-renderer="quantum-coronation-v6" data-checkmate-confirmed={checkmate}
        style={{ '--fx-color':style.color,'--letter-highlight':style.highlight,'--letter-mid':style.mid,'--letter-shade':style.shade,'--letter-edge':style.edge,'--letter-depth':style.depth } as CSSProperties}>
        <canvas ref={canvas} data-victory-layer="fallback"/><canvas ref={cinematicCanvas} data-victory-layer="cinematic"/>
        {/* Decorative victory branding. The caller's actual result/reason remains authoritative. */}
        <div className="result-heading" lang="en">
            <div className="victory-heading-rule"><i/><span/><i/></div>
            <div className="mate-title" data-word="CHECK MATE"><span className="mate-title-text" data-victory-headline="CHECK MATE">CHECK MATE</span><span className="mate-title-polish" aria-hidden="true">CHECK MATE</span></div>
            <div className="victory-heading-rule victory-heading-rule-bottom"><i/><span/><i/></div>
        </div>
    </div>;
}
