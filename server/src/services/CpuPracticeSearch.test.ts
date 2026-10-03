import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../quantum-engine/initialState';
const fake = vi.hoisted(() => ({ workers: [] as any[], failStart: false }));
vi.mock('node:worker_threads', async () => {
    const { EventEmitter } = await import('node:events');
    return { Worker: class extends EventEmitter {
        terminate = vi.fn(async () => 0);
        constructor(..._args: unknown[]) {
            super(); if (fake.failStart) throw new Error('worker startup failed');
            fake.workers.push(this);
        }
    } };
});
vi.mock('node:fs', () => ({ existsSync: () => true }));
import { searchCpuPracticeMove } from './CpuPracticeSearch';
const start = (signal = new AbortController().signal) => searchCpuPracticeMove(createInitialState(), 5, signal, true);
describe('practice search worker capacity and hard failures', () => {
    beforeEach(() => { fake.workers.length = 0; fake.failStart = false; });
    afterEach(() => vi.useRealTimers());

    it('allows two workers and releases capacity after completion', async () => {
        const first = start(), second = start();
        await expect(start()).rejects.toThrow('SEARCH_BUSY');
        expect(fake.workers).toHaveLength(2);
        fake.workers[0].emit('message', { move: null }); await expect(first).resolves.toBeNull();
        const third = start(); expect(fake.workers).toHaveLength(3);
        fake.workers[1].emit('message', { move: null }); fake.workers[2].emit('message', { move: null });
        await expect(second).resolves.toBeNull(); await expect(third).resolves.toBeNull();
        expect(fake.workers.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true);
    });

    it('hard watchdog failure does not manufacture a fallback', async () => {
        vi.useFakeTimers(); const pending = start();
        const rejected = expect(pending).rejects.toThrow('SEARCH_TIMEOUT');
        await vi.advanceTimersByTimeAsync(6000); await rejected;
        expect(fake.workers[0].terminate).toHaveBeenCalledOnce();
        // A late worker result cannot turn the rejected operation into a purchase.
        fake.workers[0].emit('message', { move: { pieceId: 'late' } });
        const next = start(); fake.workers[1].emit('message', { move: null }); await expect(next).resolves.toBeNull();
    });

    it('cancellation terminates work and releases its slot exactly once', async () => {
        const controller = new AbortController(), pending = start(controller.signal);
        const rejected = expect(pending).rejects.toThrow('CANCELLED');
        controller.abort(new Error('CANCELLED')); await rejected;
        fake.workers[0].emit('exit', 1);
        expect(fake.workers[0].terminate).toHaveBeenCalledOnce();
        expect(() => start(controller.signal)).toThrow('CANCELLED');
        expect(fake.workers).toHaveLength(1);
    });

    it('worker crashes remain failures and release capacity', async () => {
        const pending = start(); const rejected = expect(pending).rejects.toThrow('SEARCH_FAILED');
        fake.workers[0].emit('error', new Error('crash')); await rejected;
        const next = start(); fake.workers[1].emit('exit', 1); await expect(next).rejects.toThrow('SEARCH_FAILED');
    });

    it('startup exceptions do not leak either worker slot', async () => {
        fake.failStart = true;
        for (let attempt = 0; attempt < 3; attempt++) await expect(start()).rejects.toThrow('SEARCH_FAILED');
        fake.failStart = false; const pending = start();
        fake.workers[0].emit('message', { move: null }); await expect(pending).resolves.toBeNull();
    });
});
