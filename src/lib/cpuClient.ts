import { cpuSearchProfile, type CPUSearchProfile } from '../config/cpuDifficulty';
import type { GameState } from '../quantum-engine/types';
import type { TacticalSearchResult } from '../quantum-engine/ai/search';
import type { CPUPersonality } from '../config/campaign';
import { qubeSearchProfile } from '../../server/src/quantum-engine/ai/searchProfiles';
import type { TacticalSearchOptions } from '../quantum-engine/ai/search';

// Keep one initialized worker between turns without retaining a pool on mobile.
// Busy workers are never shared: hints and opponent searches can run independently.
const IDLE_WORKER_MS = 30_000;
let idleWorker: Worker | undefined;
let idleTimeout: ReturnType<typeof setTimeout> | undefined;
let requestSequence = 0;

function takeIdleWorker(): Worker | undefined {
    const worker = idleWorker;
    idleWorker = undefined;
    clearTimeout(idleTimeout);
    idleTimeout = undefined;
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', discardIdleWorker);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', discardHiddenWorker);
    return worker;
}

function discardIdleWorker() { takeIdleWorker()?.terminate(); }
function discardHiddenWorker() { if (document.hidden) discardIdleWorker(); }

function releaseWorker(worker: Worker) {
    if (idleWorker || (typeof document !== 'undefined' && document.hidden)) { worker.terminate(); return; }
    idleWorker = worker;
    idleTimeout = setTimeout(discardIdleWorker, IDLE_WORKER_MS);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', discardIdleWorker);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', discardHiddenWorker);
}

export function requestCPUSearch(state: GameState, signal: AbortSignal, level = 5, personality?: CPUPersonality, profile?:CPUSearchProfile): Promise<TacticalSearchResult> {
    return requestWorkerSearch(state, signal, cpuSearchProfile(level,profile), personality);
}

/** Hints have their own maximum analysis budget; never inherit opponent style. */
export function requestQubeSearch(state:GameState, signal:AbortSignal, availableMs?: number):Promise<TacticalSearchResult> {
    return requestWorkerSearch(state, signal, qubeSearchProfile(availableMs), 'balanced');
}

function requestWorkerSearch(state:GameState, signal:AbortSignal, profile:TacticalSearchOptions & {timeLimitMs:number;maxDepth:number}, personality?:CPUPersonality):Promise<TacticalSearchResult> {
    const { timeLimitMs, maxDepth, tieBreakSeed, quiescenceDepth, transpositionEntries, playableRoot } = profile;
    return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
        if (timeLimitMs <= 0) { reject(new Error('SEARCH_CLOCK_EXPIRED')); return; }
        const worker = takeIdleWorker() ?? new Worker(new URL('../workers/cpu.worker.ts', import.meta.url), { type: 'module' });
        const requestId = ++requestSequence;
        let settled = false;
        const finish = (error?: Error, result?: TacticalSearchResult) => {
            if (settled) return;
            settled = true;
            worker.onmessage = null;
            worker.onerror = null;
            worker.onmessageerror = null;
            signal.removeEventListener('abort', abort);
            clearTimeout(timeout);
            if (error) { worker.terminate(); reject(error); }
            else { releaseWorker(worker); resolve(result!); }
        };
        const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
        const timeout = setTimeout(() => finish(new Error('CPU timed out')), timeLimitMs + 10000);
        signal.addEventListener('abort', abort, { once: true });
        worker.onmessage = event => {
            const data = event.data;
            if (!data || typeof data.requestId !== 'number') { finish(new Error('Invalid CPU response')); return; }
            if (data.requestId !== requestId) return;
            if (typeof data.error === 'string') finish(new Error(data.error));
            else if (!data.result || typeof data.result !== 'object' || !('move' in data.result)) finish(new Error('Invalid CPU result'));
            else finish(undefined, data.result);
        };
        worker.onerror = event => finish(new Error(event.message || 'CPU worker failed'));
        worker.onmessageerror = () => finish(new Error('CPU response could not be read'));
        try {
            worker.postMessage({ requestId, state, timeLimitMs, maxDepth, ...(personality ? {personality} : {}), ...(tieBreakSeed ? {tieBreakSeed} : {}),
                ...(quiescenceDepth !== undefined ? {quiescenceDepth} : {}), ...(transpositionEntries ? {transpositionEntries} : {}),
                ...(playableRoot ? {playableRoot} : {}) });
        } catch (error) { finish(error instanceof Error ? error : new Error('CPU request could not be sent')); }
    });
}
