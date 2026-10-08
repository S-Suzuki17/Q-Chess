import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CrownHintRegistry, crownStage, hashCrownState, parseCrownMove } from './CrownHintRegistry';
import { createInitialState } from '../quantum-engine/initialState';
import { applyPracticeMove } from '../quantum-engine/practice';
import { getAllConcreteMoves } from '../quantum-engine/ai/random';

const legal = (state: Parameters<typeof getAllConcreteMoves>[0]) => getAllConcreteMoves(state, { playable: true })[0];
function fixture(stageId = 1, side: 'white' | 'black' = 'white') {
    let now = 1_000_000;
    const registry = new CrownHintRegistry({ now: () => now });
    const runId = randomUUID();
    const initial = registry.open('Alice', runId, stageId, side);
    let release: (() => void) | undefined;
    return { registry, runId, initial, elapse(ms: number) { now += ms; }, block(value = true) {
        if (value) { const current = registry.read('Alice', runId); release = registry.acquireHint('Alice', runId, current.revision, current.stateHash); }
        else release?.();
    } };
}
describe('server-owned Crown run authority', () => {
    it('derives every stage clock/strength and fixed initial state on the server', () => {
        for (let id = 1; id <= 100; id++) {
            const stage = crownStage(id);
            expect(stage.strength).toBe(Math.floor((id - 1) / 3) + 1);
            expect(stage.seconds).toBe([600, 180, 10][(id - 1) % 3]);
        }
        const { initial } = fixture(100, 'black');
        expect(initial).toMatchObject({ kind: 'crown', stageId: 100, strength: 34, seconds: 600,
            playerSide: 'black', revision: 0, history: [], status: 'active' });
        expect(initial.state).toEqual(createInitialState());
        expect(initial.stateHash).toBe(hashCrownState(initial.state));
        for (const value of [0, 101, '1', 1.5, null, NaN]) expect(() => crownStage(value)).toThrow('INVALID_REQUEST');
    });
    it('applies canonical moves independently and returns cloned state/history', () => {
        const { registry, initial, runId } = fixture(), move = legal(initial.state);
        const expected = applyPracticeMove(initial.state, move);
        const next = registry.advance('Alice', runId, 0, randomUUID(), 'human', move);
        expect(next.state).toEqual(expected);
        expect(next.revision).toBe(1); expect(next.history).toEqual([expected.lastMove]);
        expect(next.stateHash).toBe(hashCrownState(expected));
        (next.state.pieces[0].position as any).row = 99; next.history[0].target.row = 99;
        expect(registry.read('Alice', runId).state).toEqual(expected);
        expect(registry.read('Alice', runId).history).toEqual([expected.lastMove]);
    });
    it('binds a run to its owner and immutable stage/side intent', () => {
        const { registry, initial, runId } = fixture();
        expect(() => registry.read('Bob', runId)).toThrow('SESSION_NOT_FOUND');
        expect(() => registry.open('Bob', runId, 1, 'white')).toThrow('REQUEST_MISMATCH');
        expect(() => registry.open('Alice', runId, 2, 'white')).toThrow('REQUEST_MISMATCH');
        expect(() => registry.open('Alice', runId, 1, 'black')).toThrow('REQUEST_MISMATCH');
        expect(() => registry.advance('Bob', runId, 0, randomUUID(), 'human', legal(initial.state))).toThrow('SESSION_NOT_FOUND');
        expect(() => registry.hintSnapshot('Bob', runId, 0)).toThrow('SESSION_NOT_FOUND');
    });
    it('replays the same operation once and rejects any changed intent, including UUID case aliases', () => {
        const { registry, initial, runId, elapse } = fixture(), id = randomUUID(), move = legal(initial.state);
        registry.advance('Alice', runId, 0, id, 'human', move); elapse(1000);
        const replay = registry.advance('Alice', runId.toUpperCase(), 0, id.toUpperCase(), 'human', move);
        expect(replay.revision).toBe(1); expect(replay.blackMs).toBe(599000); expect(replay.history).toHaveLength(1);
        expect(() => registry.advance('Alice', runId, 1, id, 'cpu', legal(replay.state))).toThrow('REQUEST_MISMATCH');
        expect(() => registry.advance('Alice', runId, 0, id, 'cpu', move)).toThrow('REQUEST_MISMATCH');
        expect(() => registry.advance('Alice', runId, 0, randomUUID(), 'human', move)).toThrow('STALE_REVISION');
    });
    it('open response recovery cannot reset clocks or erase accepted moves', () => {
        const { registry, initial, runId, elapse } = fixture(); elapse(1000);
        const replay = registry.open('Alice', runId.toUpperCase(), 1, 'white');
        expect(replay.whiteMs).toBe(599000);
        registry.advance('Alice', runId, 0, randomUUID(), 'human', legal(initial.state));
        expect(registry.open('Alice', runId, 1, 'white').revision).toBe(1);
    });
    it('accepts only the correct human/CPU actor for the current turn', () => {
        const { registry, initial, runId } = fixture(1, 'black'), move = legal(initial.state);
        expect(() => registry.advance('Alice', runId, 0, randomUUID(), 'human', move)).toThrow('NOT_YOUR_TURN');
        expect(() => registry.hintSnapshot('Alice', runId, 0)).toThrow('NOT_YOUR_TURN');
        const next = registry.advance('Alice', runId, 0, randomUUID(), 'cpu', move);
        expect(next.state.sideToMove).toBe('black');
        expect(registry.hintSnapshot('Alice', runId, 1).playerSide).toBe('black');
    });
    it('charges elapsed time to the mover for whole-game clocks and resets only completed 10s turns', () => {
        const long = fixture(2); long.elapse(2500);
        const longNext = long.registry.advance('Alice', long.runId, 0, randomUUID(), 'human', legal(long.initial.state));
        expect(longNext.whiteMs).toBe(177500); expect(longNext.blackMs).toBe(180000);
        long.elapse(3000); expect(long.registry.read('Alice', long.runId).blackMs).toBe(177000);
        const short = fixture(3); short.elapse(9500);
        const shortNext = short.registry.advance('Alice', short.runId, 0, randomUUID(), 'human', legal(short.initial.state));
        expect(shortNext.whiteMs).toBe(10000); expect(shortNext.blackMs).toBe(10000);
        short.elapse(10000);
        const expired = short.registry.read('Alice', short.runId);
        expect(expired).toMatchObject({ status: 'finished', finishReason: 'timeout', blackMs: 0, revision: 1 });
        expect(expired.state.winner).toBe('white');
    });
    it('continues natural timeouts during uncertain hint commits while blocking moves and explicit close', () => {
        const f = fixture(3), move = legal(f.initial.state); f.block(); f.elapse(4000);
        expect(() => f.registry.advance('Alice', f.runId, 0, randomUUID(), 'human', move)).toThrow('HINT_PURCHASE_PENDING');
        expect(() => f.registry.close('Alice', f.runId)).toThrow('HINT_PURCHASE_PENDING');
        expect(f.registry.hintSnapshot('Alice', f.runId, 0)).toMatchObject({ remainingMs: 6000, validUntilMs: 1010000 });
        f.elapse(6000);
        expect(f.registry.read('Alice', f.runId)).toMatchObject({ status: 'finished', finishReason: 'timeout', whiteMs: 0 });
        expect(() => f.registry.hintSnapshot('Alice', f.runId, 0)).toThrow('SESSION_FINISHED');
        expect(f.registry.isBusy('Alice')).toBe(true); // unresolved durable purchase still blocks deletion
        f.block(false); expect(f.registry.isBusy('Alice')).toBe(false);
        expect(() => f.registry.advance('Alice', f.runId, 0, randomUUID(), 'human', move)).toThrow('SESSION_FINISHED');
    });
    it('acquires only the current owner/turn/hash and makes stale releases harmless', () => {
        const f = fixture(), current = f.registry.hintSnapshot('Alice', f.runId, 0);
        expect(() => f.registry.acquireHint('Alice', f.runId, 0, 'f'.repeat(64))).toThrow('STALE_REVISION');
        expect(() => f.registry.acquireHint('Bob', f.runId, 0, current.stateHash)).toThrow('SESSION_NOT_FOUND');
        const first = f.registry.acquireHint('Alice', f.runId, 0, current.stateHash);
        expect(() => f.registry.acquireHint('Alice', f.runId, 0, current.stateHash)).toThrow('HINT_PURCHASE_PENDING');
        first(); const second = f.registry.acquireHint('Alice', f.runId, 0, current.stateHash); first();
        expect(f.registry.isBusy('Alice')).toBe(true);
        second(); second(); expect(f.registry.isBusy('Alice')).toBe(false);
        f.registry.advance('Alice', f.runId, 0, randomUUID(), 'human', legal(current.state));
        expect(() => f.registry.acquireHint('Alice', f.runId, 0, current.stateHash)).toThrow('STALE_REVISION');
    });
    it('rejects arbitrary identities, board data, impossible moves and malformed coordinates', () => {
        const { registry, initial, runId } = fixture(), move = legal(initial.state);
        for (const value of [null, [], { ...move, state: initial.state }, { ...move, trueType: 32 },
            { ...move, target: { ...move.target, hidden: true } }, { ...move, chosenType: 64 },
            { ...move, target: { row: 8, col: 0 } }, { ...move, target: [0, 1] }]) {
            expect(() => parseCrownMove(value)).toThrow('INVALID_MOVE');
        }
        expect(() => registry.open('guest_fake', randomUUID(), 1, 'white')).toThrow('INVALID_REQUEST');
        expect(() => registry.open('Alice', 'client-run', 1, 'white')).toThrow('INVALID_REQUEST');
        expect(() => registry.advance('Alice', runId, 0, randomUUID(), 'human', { pieceId: 'w_17', target: { row: 7, col: 7 } })).toThrow('INVALID_MOVE');
        expect(registry.read('Alice', runId).revision).toBe(0);
    });
    it('has bounded capacity, one active run per owner and idempotent terminal close', () => {
        const f = fixture(); expect(f.registry.isBusy('Alice')).toBe(false);
        expect(() => f.registry.open('Alice', randomUUID(), 2, 'white')).toThrow('ACCOUNT_BUSY');
        const closed = f.registry.close('Alice', f.runId);
        expect(closed).toMatchObject({ status: 'finished', finishReason: 'closed', revision: 0 });
        expect(f.registry.close('Alice', f.runId)).toEqual(closed);
        expect(f.registry.isBusy('Alice')).toBe(false);
        expect(() => f.registry.hintSnapshot('Alice', f.runId, 0)).toThrow('SESSION_FINISHED');
        expect(f.registry.open('Alice', randomUUID(), 2, 'black').stageId).toBe(2);
        const limited = new CrownHintRegistry({ maxRuns: 1 }); limited.open('Alice', randomUUID(), 1, 'white');
        expect(() => limited.open('Bob', randomUUID(), 1, 'white')).toThrow('SESSION_LIMIT');
    });
    it('reclaims the oldest finished run and its operation intents at small capacity', () => {
        const registry = new CrownHintRegistry({ maxRuns: 1 }), runId = randomUUID(), operationId = randomUUID();
        const first = registry.open('Alice', runId, 1, 'white'), move = legal(first.state);
        registry.advance('Alice', runId, 0, operationId, 'human', move); registry.close('Alice', runId);
        const second = registry.open('Bob', randomUUID(), 1, 'white');
        expect(() => registry.read('Alice', runId)).toThrow('SESSION_NOT_FOUND');
        registry.close('Bob', second.runId);
        const reused = registry.open('Alice', runId, 1, 'white');
        expect(reused.hintContextId).not.toBe(first.hintContextId);
        expect(registry.advance('Alice', runId, 0, operationId, 'human', move).revision).toBe(1);
    });
    it('keeps active and unresolved-purchase runs when reclaiming and recovers after release', () => {
        let now = 100000;
        const registry = new CrownHintRegistry({ maxRuns: 2, now: () => now });
        const pending = registry.open('Alice', randomUUID(), 3, 'white');
        const release = registry.acquireHint('Alice', pending.runId, 0, pending.stateHash);
        const live = registry.open('Bob', randomUUID(), 1, 'white');
        now += 10000;
        expect(registry.read('Alice', pending.runId).status).toBe('finished');
        expect(() => registry.open('Carol', randomUUID(), 1, 'white')).toThrow('SESSION_LIMIT');
        expect(registry.read('Bob', live.runId).status).toBe('active');
        expect(registry.isBusy('Alice')).toBe(true);
        release(); registry.open('Carol', randomUUID(), 1, 'white');
        expect(() => registry.read('Alice', pending.runId)).toThrow('SESSION_NOT_FOUND');
        expect(registry.read('Bob', live.runId).status).toBe('active');
    });
    it('reclaims only the oldest eligible run when one slot is needed', () => {
        const registry = new CrownHintRegistry({ maxRuns: 2 });
        const oldest = registry.open('Alice', randomUUID(), 1, 'white'); registry.close('Alice', oldest.runId);
        const newer = registry.open('Bob', randomUUID(), 1, 'white'); registry.close('Bob', newer.runId);
        const live = registry.open('Carol', randomUUID(), 1, 'white');
        expect(() => registry.read('Alice', oldest.runId)).toThrow('SESSION_NOT_FOUND');
        expect(registry.read('Bob', newer.runId).status).toBe('finished');
        expect(registry.read('Carol', live.runId).status).toBe('active');
    });
    it('gives each newly opened run a fresh durable context, including after process restart', () => {
        const runId = randomUUID(), firstRegistry = new CrownHintRegistry();
        const original = firstRegistry.open('Alice', runId, 1, 'white');
        expect(firstRegistry.open('Alice', runId, 1, 'white').hintContextId).toBe(original.hintContextId);
        const restarted = new CrownHintRegistry().open('Alice', runId, 1, 'white');
        expect(restarted.hintContextId).not.toBe(original.hintContextId);
        expect(firstRegistry.hintSnapshot('Alice', runId, 0).hintContextId).toBe(original.hintContextId);
    });
});
