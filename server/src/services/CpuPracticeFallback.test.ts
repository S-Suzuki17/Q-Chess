import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createCpuPracticeFixture } from '../../../scripts/qa/cpu-practice-fixture.mjs';
import { createInitialState } from '../quantum-engine/initialState';
import { applyPracticeMove } from '../quantum-engine/practice';
import * as search from '../quantum-engine/ai/search';
import { CpuPracticeService } from './CpuPracticeService';
import { searchCpuPracticePosition } from './CpuPracticeSearchWorker';

const budget = { timeLimitMs: 4000, maxDepth: 6 };
// Deterministically expire the real search after several root evaluations. No
// sleeps, fabricated moves, synthetic board identities or hardware speed assumptions.
function shallowHint(state: ReturnType<typeof createInitialState>) {
    let ticks = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => ++ticks < 8 ? 0 : 4001);
    try { return searchCpuPracticePosition(state, budget, true); }
    finally { clock.mockRestore(); }
}

describe('paid practice hint shallow fallback', () => {
    let fixture: Awaited<ReturnType<typeof createCpuPracticeFixture>>;
    beforeAll(async () => { fixture = await createCpuPracticeFixture(); }, 15000);
    afterAll(async () => { await fixture.db.close(); });
    afterEach(() => vi.restoreAllMocks());

    it('retains a real evaluated legal opening move when no deeper iteration finishes', () => {
        const state = createInitialState(), before = JSON.stringify(state);
        const observed = vi.spyOn(search, 'searchBestMove');
        const move = shallowHint(state);
        expect(observed.mock.results[0].value).toMatchObject({ depth: 0, timeMs: 4001 });
        expect(move).not.toBeNull();
        expect(applyPracticeMove(state, move!).ply).toBe(1);
        expect(JSON.stringify(state)).toBe(before);
    });

    it('purchases the shallow hint once and replays the same receipt after response loss', async () => {
        let calls = 0;
        const run = async (state: ReturnType<typeof createInitialState>) => { calls++; return shallowHint(state); };
        const real = new CpuPracticeService(fixture.client as never, true, run, () => 'buy_cpu_hint');
        const session = await real.open('Alice', randomUUID(), 'white', 1, 600), id = randomUUID();
        const before = (await fixture.wallet('Alice')).hint_tickets;
        // The actual SQL transaction commits before the transport loses its result.
        const lost = { rpc(name: string, params: Record<string, unknown>) { return { async abortSignal() {
            const result = await fixture.client.rpc(name, params).abortSignal();
            return name === 'buy_cpu_hint' && !result.error ? { data: null, error: { message: 'lost response' } } : result;
        } }; } };
        await expect(new CpuPracticeService(lost as never, true, run, () => 'buy_cpu_hint')
            .requestHint(id, 'Alice', session.sessionId, 0)).rejects.toThrow('CPU_PRACTICE_UNAVAILABLE');
        expect((await fixture.wallet('Alice')).hint_tickets).toBe(before - 1);
        const receipt = await real.requestHint(id, 'Alice', session.sessionId, 0);
        const parallel = await Promise.all(Array.from({ length: 6 }, () => real.requestHint(randomUUID(), 'Alice', session.sessionId, 0)));
        for (const replay of parallel) expect(replay).toEqual(receipt);
        expect(applyPracticeMove(session.state, receipt.move).ply).toBe(1);
        expect(calls).toBe(1);
        expect((await fixture.wallet('Alice')).hint_tickets).toBe(before - 1);
        await real.close('Alice', session.sessionId);
    });

    it('concurrent first requests for a shallow hint consume one ticket', async () => {
        const service = new CpuPracticeService(fixture.client as never, true, async state => shallowHint(state), () => 'buy_cpu_hint');
        const session = await service.open('Alice', randomUUID(), 'white', 1, 600);
        const before = (await fixture.wallet('Alice')).hint_tickets;
        const ids = [randomUUID(), randomUUID()];
        const receipts = await Promise.all(ids.map(id => service.requestHint(id, 'Alice', session.sessionId, 0)));
        expect(receipts[0]).toEqual(receipts[1]);
        expect((await fixture.wallet('Alice')).hint_tickets).toBe(before - 1);
        for (const id of ids) expect(await service.receipt('Alice', session.sessionId, 0, id)).toEqual(receipts[0]);
        await service.close('Alice', session.sessionId);
    });

    it.each(['SEARCH_TIMEOUT', 'SEARCH_FAILED', 'SEARCH_BUSY'])('does not buy on %s', async code => {
        const run = async () => { throw new Error(code); };
        const service = new CpuPracticeService(fixture.client as never, true, run, () => 'buy_cpu_hint');
        const session = await service.open('Alice', randomUUID(), 'white', 1, 600), id = randomUUID();
        const before = await fixture.wallet('Alice');
        await expect(service.requestHint(id, 'Alice', session.sessionId, 0)).rejects.toThrow(code);
        expect(await fixture.wallet('Alice')).toEqual(before);
        expect(await service.receipt('Alice', session.sessionId, 0, id)).toBeNull();
        await service.close('Alice', session.sessionId);
    });

    it('refuses an illegal search result before any debit', async () => {
        const state = createInitialState();
        vi.spyOn(search, 'searchBestMove').mockReturnValue({ move: { pieceId: 'b_1', target: { row: 4, col: 4 } },
            depth: 0, nodes: 0, timeMs: 4001, score: 0 });
        expect(() => searchCpuPracticePosition(state, budget, true)).toThrow();
        const service = new CpuPracticeService(fixture.client as never, true, async position => searchCpuPracticePosition(position, budget, true), () => 'buy_cpu_hint');
        const session = await service.open('Alice', randomUUID(), 'white', 1, 600), id = randomUUID();
        const before = await fixture.wallet('Alice');
        await expect(service.requestHint(id, 'Alice', session.sessionId, 0)).rejects.toThrow();
        expect(await fixture.wallet('Alice')).toEqual(before);
        expect(await service.receipt('Alice', session.sessionId, 0, id)).toBeNull();
        await service.close('Alice', session.sessionId);
    });

    it('does not invent a move on null results or hide search exceptions', () => {
        const actual = vi.spyOn(search, 'searchBestMove');
        actual.mockReturnValue({ move: null, depth: 0, nodes: 0, timeMs: 4001, score: 0 });
        expect(searchCpuPracticePosition(createInitialState(), budget, true)).toBeNull();
        actual.mockImplementation(() => { throw new Error('SEARCH_TIMEOUT'); });
        expect(() => searchCpuPracticePosition(createInitialState(), budget, true)).toThrow('SEARCH_TIMEOUT');
    });
});
