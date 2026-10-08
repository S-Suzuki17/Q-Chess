import { cpuSearchProfile, type CPUSearchProfile } from '../config/cpuDifficulty';
import type { GameState } from '../quantum-engine/types';
import type { TacticalSearchResult } from '../quantum-engine/ai/search';
import type { CPUPersonality } from '../config/campaign';
import { qubeSearchProfile } from '../../server/src/quantum-engine/ai/searchProfiles';
import type { TacticalSearchOptions } from '../quantum-engine/ai/search';

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
        const worker = new Worker(new URL('../workers/cpu.worker.ts', import.meta.url), { type: 'module' });
        const cleanup = () => { worker.terminate(); signal.removeEventListener('abort', abort); clearTimeout(timeout); };
        const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
        const timeout = setTimeout(() => { cleanup(); reject(new Error('CPU timed out')); }, timeLimitMs + 10000);
        signal.addEventListener('abort', abort, { once: true });
        worker.onmessage = event => {
            cleanup();
            if (event.data.error) reject(new Error(event.data.error));
            else resolve(event.data.result);
        };
        worker.onerror = event => { cleanup(); reject(new Error(event.message || 'CPU worker failed')); };
        worker.postMessage({ state, timeLimitMs, maxDepth, ...(personality ? {personality} : {}), ...(tieBreakSeed ? {tieBreakSeed} : {}),
            ...(quiescenceDepth !== undefined ? {quiescenceDepth} : {}), ...(transpositionEntries ? {transpositionEntries} : {}),
            ...(playableRoot ? {playableRoot} : {}) });
    });
}
