import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicGameState } from './GameEngine';
import { runCpuWorker } from './RankedRuntime';

const workers = vi.hoisted(() => ({ instances: [] as any[] }));
vi.mock('node:worker_threads', async () => {
    const { EventEmitter } = await import('node:events');
    return { Worker: class extends EventEmitter {
        terminate = vi.fn(async () => 0);
        constructor(public file: string, public options: any) { super(); workers.instances.push(this); }
    } };
});

const state = { version: 7 } as PublicGameState;
const profile = { rating: 1200, level: 4, thinkMs: 210, maxDepth: 2 };
const fallback = { version: 7, move: { pieceId: 1, toX: 0, toY: 2 } };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000); workers.instances.length = 0; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('ranked CPU worker deadline', () => {
    it('uses a reported legal fallback at the hard deadline without stopping search early', async () => {
        const result = runCpuWorker(state, profile);
        const worker = workers.instances[0];
        expect(worker.options.workerData).toMatchObject({ deadline: 3_900, reportProgress: true });
        worker.emit('message', { ...fallback, partial: true });
        await vi.advanceTimersByTimeAsync(2_999);
        expect(worker.terminate).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await expect(result).resolves.toEqual(fallback);
        expect(worker.terminate).toHaveBeenCalledTimes(1);
        worker.emit('message', { version: 7, move: null });
        worker.emit('exit', 1);
        expect(worker.terminate).toHaveBeenCalledTimes(1);
    });

    it('prefers the finished search and cancels its deadline timer', async () => {
        const result = runCpuWorker(state, profile);
        const worker = workers.instances[0];
        worker.emit('message', { ...fallback, partial: true });
        const best = { version: 7, move: { pieceId: 3, toX: 1, toY: 3 } };
        worker.emit('message', best);
        await expect(result).resolves.toEqual(best);
        expect(vi.getTimerCount()).toBe(0);
        expect(worker.terminate).toHaveBeenCalledTimes(1);
    });

    it.each(['none', 'stale', 'empty', 'error'])('rejects a deadline with %s fallback', async kind => {
        const result = runCpuWorker(state, profile);
        const rejection = expect(result).rejects.toMatchObject({ reason: 'deadline' });
        if (kind !== 'none') workers.instances[0].emit('message', {
            ...fallback, partial: true, ...(kind === 'stale' ? { version: 6 } : {}),
            ...(kind === 'empty' ? { move: null } : {}), ...(kind === 'error' ? { error: 'failed' } : {}),
        });
        await vi.advanceTimersByTimeAsync(3_000);
        await rejection;
        expect(workers.instances[0].terminate).toHaveBeenCalledTimes(1);
    });

    it.each(['error', 'exit'])('does not mask a worker %s with a partial result', async event => {
        const result = runCpuWorker(state, profile);
        const worker = workers.instances[0];
        worker.emit('message', { ...fallback, partial: true });
        worker.emit(event, event === 'error' ? new Error('private worker details') : 1);
        await expect(result).rejects.toMatchObject({ reason: event === 'error' ? 'worker_error' : 'no_result' });
        expect(vi.getTimerCount()).toBe(0);
    });
});
