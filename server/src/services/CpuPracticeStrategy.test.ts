import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CpuPracticeService, hashPracticeState } from './CpuPracticeService';
import { createInitialState } from '../quantum-engine/initialState';
import { CPU_PRACTICE_RULES_VERSION, type CpuPracticeSnapshot } from '../quantum-engine/practice';
import { getAllConcreteMoves } from '../quantum-engine/ai/random';
import { cpuPersonalityForGame } from '../quantum-engine/ai/personalities';
import type { searchCpuPracticeMove } from './CpuPracticeSearch';

afterEach(() => vi.restoreAllMocks());
function fixture(playerSide: 'white' | 'black' = 'white', remainingMs = 10000) {
    const state = createInitialState();
    const session: CpuPracticeSnapshot = { sessionId: randomUUID(), userId: 'StrategyAlice', kind: 'cpu_practice',
        rulesVersion: CPU_PRACTICE_RULES_VERSION, playerSide, level: 5, seconds: 10,
        revision: 0, stateHash: hashPracticeState(state), state, history: [], status: 'active',
        whiteMs: remainingMs, blackMs: remainingMs };
    const search = vi.fn<typeof searchCpuPracticeMove>(async position => getAllConcreteMoves(position)[0] ?? null);
    const names: string[] = [];
    let readLatency: (() => void) | undefined;
    const client = { rpc(name: string, params: Record<string, unknown>) { names.push(name); return { async abortSignal() {
        if (name === 'cpu_practice_read') { readLatency?.(); return { data: session }; }
        if (name === 'cpu_practice_commit_move') return { data: { ...session, state: params.p_next_state,
            stateHash: params.p_next_hash, revision: 1, history: [params.p_move] } };
        if (name === 'buy_cpu_hint') return { data: { receiptId: params.p_request_id, sessionId: session.sessionId,
            revision: 0, rulesVersion: CPU_PRACTICE_RULES_VERSION, stateHash: session.stateHash,
            move: params.p_move, hint: params.p_hint, deliveryState: 'paid_retrievable' } };
        return { data: null };
    } }; } };
    return { session, search, names, latency(callback: () => void) { readLatency = callback; },
        service: () => new CpuPracticeService(client as never, true, search, () => 'buy_cpu_hint') };
}

describe('authoritative practice strategy integration', () => {
    it('keeps the session style after service reconstruction and passes it only to CPU moves', async () => {
        vi.spyOn(performance, 'now').mockReturnValue(0);
        const cpu = fixture('black');
        for (let restored = 0; restored < 2; restored++) await cpu.service().advance(cpu.session.userId, cpu.session.sessionId, 0, randomUUID(), 'cpu');
        expect(cpu.search).toHaveBeenCalledTimes(2);
        for (const call of cpu.search.mock.calls) expect(call.slice(3)).toEqual([false, cpuPersonalityForGame(cpu.session.sessionId), 9000]);
        const human = fixture();
        await human.service().requestHint(randomUUID(), human.session.userId, human.session.sessionId, 0);
        expect(human.search.mock.calls[0].slice(3)).toEqual([true, 'balanced', 9000]);
    });
    it('subtracts snapshot latency and leaves time to play without pausing the clock', async () => {
        let now = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        const f = fixture('white', 6000);
        f.latency(() => { now = 1500; });
        await f.service().requestHint(randomUUID(), f.session.userId, f.session.sessionId, 0);
        expect(f.search.mock.calls[0][5]).toBe(3500);
        expect(f.names.indexOf('cpu_practice_existing_hint')).toBeLessThan(f.names.indexOf('cpu_practice_read'));
        expect(f.session.whiteMs).toBe(6000);
        expect(f.names.filter(name => name === 'buy_cpu_hint')).toHaveLength(1);
    });
    it('does not dispatch analysis or purchase when only the move reserve remains', async () => {
        const f = fixture('white', 900);
        await expect(f.service().requestHint(randomUUID(), f.session.userId, f.session.sessionId, 0)).rejects.toThrow('SEARCH_CLOCK_EXPIRED');
        expect(f.search).not.toHaveBeenCalled();
        expect(f.names).not.toContain('buy_cpu_hint');
    });
    it.each(['stale', 'finished', 'invalid', 'failed'] as const)('never dispatches purchase for a %s hint', async kind => {
        const f = fixture();
        if (kind === 'finished') f.session.status = 'finished';
        if (kind === 'invalid') f.search.mockResolvedValue({ pieceId: 'b_1', target: { row: 4, col: 4 } });
        if (kind === 'failed') f.search.mockRejectedValue(new Error('SEARCH_FAILED'));
        await expect(f.service().requestHint(randomUUID(), f.session.userId, f.session.sessionId, kind === 'stale' ? 1 : 0)).rejects.toThrow();
        expect(f.names).not.toContain('buy_cpu_hint');
    });
    it('rejects promotion types outside the player dialog before any purchase', async () => {
        const f = fixture();
        f.search.mockResolvedValue({ pieceId: 'w_1', target: { row: 0, col: 0 }, chosenType: 1, promotionTarget: 32 });
        await expect(f.service().requestHint(randomUUID(), f.session.userId, f.session.sessionId, 0)).rejects.toThrow('NO_LEGAL_HINT');
        expect(f.names).not.toContain('buy_cpu_hint');
    });
});
