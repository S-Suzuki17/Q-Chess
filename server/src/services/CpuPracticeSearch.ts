import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { GameState, Move } from '../quantum-engine/types';
import { qubeSearchProfile } from '../quantum-engine/ai/searchProfiles';
import type { CPUPersonality } from '../quantum-engine/ai/personalities';

let activeWorkers = 0;
/** A cancellable worker lets disconnect and ranked-entry guards run during search. */
export function searchCpuPracticeMove(state: GameState, level: number, signal: AbortSignal, hint = false, personality:CPUPersonality = 'balanced', availableMs?: number): Promise<Move | null> {
    signal.throwIfAborted();
    if (activeWorkers >= 2) return Promise.reject(new Error('SEARCH_BUSY'));
    const budget = hint ? qubeSearchProfile(availableMs) :
        level <= 1 ? { timeLimitMs: 1000, maxDepth: 0 }
        : level <= 3 ? { timeLimitMs: 1500, maxDepth: 2 } : { timeLimitMs: 4000, maxDepth: 6 };
    if (!hint && availableMs !== undefined) budget.timeLimitMs = Math.min(budget.timeLimitMs, Math.max(0, availableMs));
    if (budget.timeLimitMs <= 0) return Promise.reject(new Error('SEARCH_CLOCK_EXPIRED'));
    const suffix = existsSync(path.join(__dirname, '../quantum-engine/ai/search.js')) ? '.js' : '.ts';
    const tsx = suffix === '.ts' ? require.resolve('tsx/cjs') : null;
    activeWorkers++;
    return new Promise((resolve, reject) => {
        let worker: Worker;
        try { worker = new Worker(`
            const { parentPort, workerData } = require('node:worker_threads');
            if (workerData.tsx) require(workerData.tsx);
            try {
                const { searchCpuPracticePosition } = require(workerData.search);
                parentPort.postMessage({ move: searchCpuPracticePosition(workerData.state, workerData.budget, workerData.hint, workerData.personality) });
            } catch { parentPort.postMessage({ error: 'SEARCH_FAILED' }); }
        `, { eval: true, execArgv: [], workerData: {
            search: path.join(__dirname, 'CpuPracticeSearchWorker' + suffix),
            tsx, state, budget, hint, personality:hint ? 'balanced' : personality,
        } }); } catch {
            activeWorkers--; reject(new Error('SEARCH_FAILED')); return;
        }
        let ended = false;
        const finish = (error?: unknown, move?: Move | null) => {
            if (ended) return;
            ended = true; activeWorkers--; clearTimeout(timer);
            signal.removeEventListener('abort', abort); void worker.terminate();
            if (error) reject(error); else resolve(move ?? null);
        };
        const abort = () => finish(signal.reason ?? new Error('CANCELLED'));
        const timer = setTimeout(() => finish(new Error('SEARCH_TIMEOUT')), budget.timeLimitMs + 2000);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) { abort(); return; }
        worker.once('message', result => finish(result.error ? new Error(result.error) : undefined, result.move));
        worker.once('error', () => finish(new Error('SEARCH_FAILED')));
        worker.once('exit', () => { if (!ended) finish(new Error('SEARCH_FAILED')); });
    });
}
