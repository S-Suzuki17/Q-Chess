import { cpuDifficulty } from '../config/cpuDifficulty';
import type { GameState } from '../quantum-engine/types';
import type { TacticalSearchResult } from '../quantum-engine/ai/search';

export function requestCPUSearch(state: GameState, signal: AbortSignal, level = 5): Promise<TacticalSearchResult> {
    const { timeLimitMs, maxDepth } = cpuDifficulty(level);
    return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
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
        worker.postMessage({ state, timeLimitMs, maxDepth });
    });
}
