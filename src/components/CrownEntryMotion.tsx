'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Language } from '../locales/dict';
import { stageText } from '../locales/stageText';
import { crownEnemyForStage, crownEnemyName } from '../config/crownEnemies';
import { soundManager } from '../lib/SoundService';
import {castleQuestText} from '../locales/castleQuestText';
import {campaignText} from '../locales/campaignText';
import {CastleQuestScene} from './CastleQuestScene';
import './crown-motion.css';
import './castle-quest-journey.css';

const LIGHT = '/assets/crown-entry/chamber-light.webm';
const CUE = '/assets/crown-entry/chamber-entry.wav';
type Finish = (notify?: boolean) => void;

/** Timers/media belong to this mount and selection. They never authorize a stage or save a result. */
function useFiniteMotion<T extends HTMLElement>({ duration, motionKey, paused = false, onEnd, cue = false, deferHiddenEnd = false }: {
    duration: number; motionKey: string; paused?: boolean; onEnd?: () => void; cue?: boolean; deferHiddenEnd?: boolean;
}) {
    const host = useRef<T>(null), finish = useRef<Finish>(() => {}), callback = useRef(onEnd), videoOwner = useRef<symbol | null>(null);
    useEffect(() => { callback.current = onEnd; }, [onEnd]);
    useEffect(() => {
        const node = host.current;
        if (!node) return;
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        const video = node.querySelector<HTMLVideoElement>('[data-crown-light]');
        const owner = Symbol('crown-motion'); videoOwner.current = owner;
        const connection = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
        const compact = innerWidth < 380 || navigator.hardwareConcurrency <= 2 || (connection.deviceMemory ?? 8) <= 2 || connection.connection?.saveData;
        let disposed = false, ended = false, deferred = false, frame = 0, timer: ReturnType<typeof setTimeout> | undefined;
        let stopSound = () => {};
        const stopMedia = () => {
            cancelAnimationFrame(frame); clearTimeout(timer); stopSound();
            if (video && videoOwner.current === owner) { video.pause(); video.removeAttribute('src'); video.load(); }
        };
        const settle: Finish = (notify = true) => {
            if (disposed || ended) return;
            const focusReturn=node.querySelector('[data-castle-travel-skip],[data-castle-defeat-skip]')===document.activeElement;
            ended = true; stopMedia(); node.dataset.crownMotion = 'settled';
            if (notify) callback.current?.();
            if(focusReturn&&!document.hidden){const next=node.querySelector<HTMLButtonElement>('.crown-launch .campaign-primary')??node.closest('dialog')?.querySelector<HTMLButtonElement>('.campaign-result-actions button');next?.focus({preventScroll:true});}
        };
        finish.current = settle;
        const hidden = () => {
            if (document.hidden) {
                stopMedia(); node.dataset.crownMotion = 'settled';
                if (deferHiddenEnd && !ended) deferred = true;
                else settle();
            } else if (deferred) { deferred = false; settle(); }
        };
        const reduce = () => { if (media.matches) { if (document.hidden && deferHiddenEnd) hidden(); else settle(); } };
        const videoFailed = () => { if (disposed || ended || videoOwner.current !== owner) return; if (video) { video.pause(); video.removeAttribute('src'); } node.dataset.crownVideo = 'fallback'; };
        const videoReady = () => { if (!disposed && !ended && !document.hidden && !media.matches) node.dataset.crownVideo = 'ready'; };
        document.addEventListener('visibilitychange', hidden); media.addEventListener('change', reduce);
        video?.addEventListener('error', videoFailed); video?.addEventListener('playing', videoReady);
        node.dataset.crownVideo = 'fallback'; node.dataset.crownMotion = 'still';
        if (paused) settle(false);
        else if (document.hidden) hidden();
        else if (media.matches) { node.dataset.crownMotion = 'settled'; timer = setTimeout(settle, 180); }
        else {
            timer = setTimeout(settle, duration);
            frame = requestAnimationFrame(() => {
                if (disposed || ended || document.hidden || media.matches) return;
                node.dataset.crownMotion = 'active';
                if (cue) stopSound = soundManager.playSE(CUE);
                if (video && !compact) {
                    video.src = LIGHT;
                    void video.play().then(() => { if (videoOwner.current === owner && (disposed || ended || document.hidden || media.matches)) video.pause(); }).catch(videoFailed);
                }
            });
        }
        return () => {
            disposed = true; stopMedia(); finish.current = () => {}; node.dataset.crownMotion = 'settled';
            if (videoOwner.current === owner) videoOwner.current = null;
            document.removeEventListener('visibilitychange', hidden); media.removeEventListener('change', reduce);
            video?.removeEventListener('error', videoFailed); video?.removeEventListener('playing', videoReady);
        };
    }, [duration, motionKey, paused, cue, deferHiddenEnd]);
    return { host, finish };
}

function ChamberLight() {
    return <div className="crown-chamber-light" aria-hidden="true"><i className="crown-light-shaft"/><video data-crown-light muted playsInline preload="none" tabIndex={-1} disablePictureInPicture aria-hidden="true"/></div>;
}

export function CrownEncounterMotion({ stageId, side, paused, unlocked, children, lang='en',journey,onJourneyEnd }: { stageId: number; side: 'white' | 'black'; paused: boolean; unlocked: boolean; children: ReactNode;lang?:Language;journey?:{from:number;to:number;token:string;finished:boolean};onJourneyEnd?:(token:string)=>void }) {
    const { host,finish } = useFiniteMotion<HTMLElement>({ duration: journey?2600:1400, motionKey: `${stageId}:${side}:${journey?.token??''}`, paused:paused||!!journey?.finished,cue:!!journey,onEnd:()=>{if(journey)onJourneyEnd?.(journey.token);} });
    return <article ref={host} className="crown-encounter crown-room-motion" data-stage-unlocked={unlocked} data-crown-motion="still" data-castle-journey={journey&&!journey.finished?`${journey.from}:${journey.to}`:undefined}>
        <ChamberLight/>{children}
        {journey&&!journey.finished&&<div className="castle-travel-controls"><span role="status">{castleQuestText(lang,'travel')}</span><button type="button" data-castle-travel-skip onClick={()=>finish.current()}>{castleQuestText(lang,'skip')}</button></div>}
    </article>;
}

export function CrownMatchIntro({ lang, stageId, side, label, onDone, onCancel }: {
    lang: Language; stageId: number; side: 'white' | 'black'; label: string; onDone: () => void; onCancel: () => void;
}) {
    const closed = useRef(false), callbacks = useRef({ onDone, onCancel });
    useEffect(() => { callbacks.current = { onDone, onCancel }; }, [onDone, onCancel]);
    const complete = () => {
        if (closed.current) return;
        closed.current = true; host.current?.close(); callbacks.current.onDone();
    };
    const { host, finish } = useFiniteMotion<HTMLDialogElement>({ duration: 1800, motionKey: `${stageId}:${side}`, onEnd: complete, cue: true, deferHiddenEnd: true });
    const cancel = () => {
        if (closed.current) return;
        closed.current = true; finish.current(false); host.current?.close(); callbacks.current.onCancel();
    };
    useEffect(() => {
        const dialog = host.current; dialog?.showModal();
        dialog?.querySelector<HTMLButtonElement>('[data-crown-skip]')?.focus({ preventScroll: true });
        const back = () => cancel(); window.addEventListener('popstate', back);
        return () => { window.removeEventListener('popstate', back); dialog?.close(); };
    // The mounted intro owns this listener; callbacks are updated separately.
    }, []);
    const enemy = crownEnemyForStage(stageId), ja = lang === 'ja';
    return <dialog ref={host} className="match-intro crown-match-intro" data-crown-motion="still" data-crown-intro-enemy={enemy.id} data-final-boss={enemy.finalBoss} aria-labelledby="crown-intro-title" onCancel={event => { event.preventDefault(); cancel(); }}>
        <ChamberLight/>
        <header className="crown-intro-heading"><span>{castleQuestText(lang,'title')}</span><p>{label}</p><h2 id="crown-intro-title">{stageText(lang, 'ready')}</h2></header>
        <div className="crown-intro-stage"><CastleQuestScene stageId={stageId}/></div>
        <div className="crown-intro-identity"><strong>{crownEnemyName(lang, enemy)}</strong><span>{ja ? side === 'white' ? '白・先手で挑戦' : '黒・後手で挑戦' : side === 'white' ? 'You play White' : 'You play Black'}</span></div>
        <footer className="crown-intro-actions"><button type="button" onClick={cancel} data-crown-entry-cancel><ArrowLeft size={16}/>{campaignText(lang,'back')}</button><button type="button" onClick={() => finish.current()} data-crown-skip>{ja ? 'すぐ開始' : 'Start now'}<ArrowRight size={16}/></button></footer>
    </dialog>;
}

export function CrownBoardArrival({ stageId }: { stageId: number }) {
    const { host } = useFiniteMotion<HTMLDivElement>({ duration: 560, motionKey: String(stageId) });
    useEffect(() => {
        const board = host.current?.closest<HTMLElement>('[data-testid="match-board"]');
        if (document.activeElement === document.body && board) {
            const focus = board.querySelector<HTMLElement>('button');
            if (focus) focus.focus({ preventScroll: true });
        }
    }, [host]);
    return <div ref={host} className="crown-board-arrival" aria-hidden="true" data-crown-motion="still" data-crown-board-arrival={stageId}><i/><i/></div>;
}

export function CastleQuestVictoryScene({stageId,lang,saved}:{stageId:number;lang:Language;saved:boolean}){
    const {host,finish}=useFiniteMotion<HTMLDivElement>({duration:1200,motionKey:`victory:${stageId}`,paused:!saved});
    return <div ref={host} className="castle-victory-scene" data-castle-defeated={saved||undefined} data-crown-motion="still">
        <CastleQuestScene stageId={stageId} victory={saved}/>
        {saved&&<button type="button" className="castle-defeat-skip" data-castle-defeat-skip onClick={()=>finish.current()}>{castleQuestText(lang,'skip')}</button>}
    </div>;
}
