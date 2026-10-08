import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { GameEngine } from '../game/GameEngine';
import { createInitialBoard } from '../game/quantumChess';
import { getConcreteMoveChildren } from '../quantum-engine/ai/random';
import { AccountWriteGate } from './AccountDeletion';
import { MatchHintService, type MatchHintSearch } from './MatchHintService';
import { MatchHintError, type HintLedger, type HintRequestContext, type TrustedHintPosition } from './MatchHintTypes';
import type { HintTicketPurchase, MatchHintReceipt } from './HintTicketStore';

const context = (controller = new AbortController()): HintRequestContext => ({ signal: controller.signal, check: vi.fn(async () => {}), connectionId: 'socket-1' });
const legal = (p: TrustedHintPosition) => getConcreteMoveChildren(p.state, { playable: true, allPromotions: true })
    .find(child => { try { p.validateMove(child.move); return true; } catch { return false; } })!.move;
function setup(search?: MatchHintSearch, seconds = 600) {
    const engine = new GameEngine('room', 'Alice', 'Bob', createInitialBoard(), seconds);
    let enabled = true, dbOffset = 0, unavailable = false;
    const receipts = new Map<string, MatchHintReceipt>(), aliases = new Map<string, MatchHintReceipt>();
    let debits = 0;
    const ledger: HintLedger = {
        readClock: vi.fn(async () => Date.now() + dbOffset),
        readReceipt: vi.fn(async input => {
            if (unavailable) throw new MatchHintError('HINT_STORE_UNAVAILABLE');
            const receipt = aliases.get(input.requestId);
            if (receipt) {
                if (receipt.contextId !== input.contextId || receipt.revision !== input.revision) throw new MatchHintError('REQUEST_MISMATCH');
                return receipt;
            }
            if (input.notBefore && Date.now() + dbOffset < Date.parse(input.notBefore)) throw new MatchHintError('HINT_STORE_UNAVAILABLE');
            return null;
        }),
        readExisting: vi.fn(async input => receipts.get(`${input.userId}:${input.contextId}:${input.revision}`) ?? null),
        buy: vi.fn(async input => {
            const key = `${input.userId}:${input.contextId}:${input.revision}`;
            let receipt = receipts.get(key);
            if (!receipt) {
                if (Date.now() + dbOffset >= Date.parse(input.validUntil)) throw new MatchHintError('HINT_CONTEXT_EXPIRED');
                debits++;
                receipt = { receiptId: randomUUID(), contextId: input.contextId, kind: input.kind, mode: input.mode,
                    revision: input.revision, stateHash: input.stateHash, rulesVersion: input.rulesVersion,
                    move: input.move, hint: input.hint, deliveryState: 'paid_retrievable' };
                receipts.set(key, receipt);
            }
            aliases.set(input.requestId, receipt); return receipt;
        }),
    };
    const registry = { contextId: vi.fn((u: string) => engine.hintContextFor(u)),
        position: vi.fn((u: string, _r: string, v: number) => engine.hintPosition(u, v)) };
    const chosenSearch = vi.fn(search ?? (async p => legal(p)));
    const service = new MatchHintService(ledger, registry, () => enabled, chosenSearch);
    return { engine, ledger, service, registry, search: chosenSearch, receipts, aliases,
        enabled: (v: boolean) => { enabled = v; }, offset: (v: number) => { dbOffset = v; },
        unavailable: (v: boolean) => { unavailable = v; }, debits: () => debits };
}
afterEach(() => vi.useRealTimers());
describe('match/Crown hint purchase orchestration', () => {
    it('debits once; same request and another request alias return one immutable hint', async () => {
        const x = setup(), q = randomUUID(), c = context();
        const first = await x.service.requestHint('Alice', 'room', 0, q, c);
        expect(await x.service.requestHint('Alice', 'room', 0, q, c)).toEqual(first);
        const alias = randomUUID();
        expect(await x.service.requestHint('Alice', 'room', 0, alias, c)).toEqual(first);
        expect(await x.service.receipt('Alice', first.contextId, 0, alias, c)).toEqual(first);
        expect(x.search).toHaveBeenCalledTimes(1); expect(x.debits()).toBe(1); expect(x.service.isBusy('Alice')).toBe(false);
    });
    it('coalesces an in-flight identical request and fences another request', async () => {
        let ready!: () => void, finish!: () => void;
        const started = new Promise<void>(r => { ready = r; });
        const x = setup(p => new Promise(r => { ready(); finish = () => r(legal(p)); }));
        const q = randomUUID(), first = x.service.requestHint('Alice', 'room', 0, q, context());
        await started;
        const second = x.service.requestHint('Alice', 'room', 0, q, context());
        await expect(x.service.requestHint('Alice', 'room', 0, randomUUID(), context())).rejects.toThrow('HINT_PURCHASE_PENDING');
        finish(); expect(await second).toEqual(await first); expect(x.debits()).toBe(1);
    });
    it('permits moves during analysis but refuses stale results with zero debit', async () => {
        const x = setup(async p => {
            const move = legal(p), hint = p.validateMove(move);
            const id = Number(move.pieceId.split('_')[1]) - 1;
            expect(x.engine.processAction({ actionId: 'actual-move', version: 0, playerId: 'Alice', action: { type: 'MOVE',
                payload: { pieceId: id, toX: hint.toCol, toY: 7 - hint.toRow, intention: hint.intention } } }).success).toBe(true);
            return move;
        });
        await expect(x.service.requestHint('Alice', 'room', 0, randomUUID(), context())).rejects.toThrow('STALE_REVISION');
        expect(x.ledger.buy).not.toHaveBeenCalled(); expect(x.service.isBusy('Alice')).toBe(false);
    });
    it('rechecks identity after search and never purchases an invalid/missing move', async () => {
        const c = context(), x = setup(async p => { c.check = async () => { throw new MatchHintError('AUTH_REQUIRED'); }; return legal(p); });
        await expect(x.service.requestHint('Alice', 'room', 0, randomUUID(), c)).rejects.toThrow('AUTH_REQUIRED');
        expect(x.debits()).toBe(0);
        const invalid = setup(async () => ({ pieceId: 'b_1', target: { row: 0, col: 0 } }));
        await expect(invalid.service.requestHint('Alice', 'room', 0, randomUUID(), context())).rejects.toThrow('NO_LEGAL_HINT');
        expect(invalid.ledger.buy).not.toHaveBeenCalled();
        const none = setup(async () => null);
        await expect(none.service.requestHint('Alice', 'room', 0, randomUUID(), context())).rejects.toThrow('NO_LEGAL_HINT');
    });
    it('cancels disconnected/replaced connection analysis before dispatch, without cancelling a newer socket', async () => {
        let ready!: () => void; const started = new Promise<void>(r => { ready = r; });
        const x = setup((p, signal) => new Promise((resolve, reject) => {
            ready(); signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }));
        const pending = x.service.requestHint('Alice', 'room', 0, randomUUID(), context());
        const failure = expect(pending).rejects.toThrow('CANCELLED');
        await started; x.service.cancelAnalysis('Alice', 'old-socket'); expect(x.service.isBusy('Alice')).toBe(true);
        x.service.cancelAnalysis('Alice', 'socket-1'); await failure;
        expect(x.ledger.buy).not.toHaveBeenCalled(); expect(x.service.isBusy('Alice')).toBe(false);
    });
    it('uses DB clock plus fresh remaining duration across large host/DB clock offsets', async () => {
        vi.useFakeTimers(); vi.setSystemTime(1000000);
        const x = setup(); x.offset(-120000);
        await x.service.requestHint('Alice', 'room', 0, randomUUID(), context());
        const input = vi.mocked(x.ledger.buy).mock.calls[0][0];
        expect(Date.parse(input.validUntil)).toBe(885000);
        const lease = setup(); lease.offset(120000);
        lease.engine.setAuthority({ canAdvance: () => Date.now() < 1001300, safeUntil: () => 1001300 });
        await lease.service.requestHint('Alice', 'room', 0, randomUUID(), context());
        expect(Date.parse(vi.mocked(lease.ledger.buy).mock.calls[0][0].validUntil)).toBe(1121300);
    });
    it('calculates the final budget after DB-clock and authentication latency', async () => {
        vi.useFakeTimers(); vi.setSystemTime(100000);
        const x = setup(undefined, 10);
        vi.mocked(x.ledger.readClock).mockImplementation(async () => { const observed = Date.now() - 50000; vi.setSystemTime(Date.now() + 7500); return observed; });
        await expect(x.service.requestHint('Alice', 'room', 0, randomUUID(), context())).rejects.toThrow('HINT_CONTEXT_EXPIRED');
        // Remaining host time is 2.5s, added to the earlier DB observation.
        expect(Date.parse(vi.mocked(x.ledger.buy).mock.calls[0][0].validUntil)).toBe(52500);
        expect(x.debits()).toBe(0);
    });
    it('does not dispatch when the real clock or owner lease expires after analysis', async () => {
        vi.useFakeTimers(); vi.setSystemTime(100000);
        const x = setup(async p => { vi.setSystemTime(102001); return legal(p); });
        x.engine.setAuthority({ canAdvance: () => Date.now() < 102000, safeUntil: () => 102000 });
        await expect(x.service.requestHint('Alice', 'room', 0, randomUUID(), context())).rejects.toThrow('MATCH_AUTHORITY_UNAVAILABLE');
        expect(x.ledger.buy).not.toHaveBeenCalled();
    });
    it.each(['INSUFFICIENT_FUNDS', 'TERMS_REQUIRED', 'HINT_CONTEXT_EXPIRED', 'ACCOUNT_UNAVAILABLE'])(
        'releases the fence for a definitive %s rollback', async code => {
            const x = setup(); vi.mocked(x.ledger.buy).mockRejectedValue(new MatchHintError(code));
            await expect(x.service.requestHint('Alice', 'room', 0, randomUUID(), context())).rejects.toThrow(code);
            expect(x.service.isBusy('Alice')).toBe(false);
            expect(x.engine.processAction({ actionId: 'resign', playerId: 'Alice', version: 0, action: { type: 'RESIGN', payload: {} } }).success).toBe(true);
        });
    it('recovers a committed response loss immediately and never refunds or buys again', async () => {
        const x = setup(), buy = vi.mocked(x.ledger.buy).getMockImplementation()!, q = randomUUID();
        vi.mocked(x.ledger.buy).mockImplementation(async input => { await buy(input); throw new MatchHintError('HINT_STORE_UNAVAILABLE'); });
        const receipt = await x.service.requestHint('Alice', 'room', 0, q, context());
        expect(x.debits()).toBe(1); expect(x.service.isBusy('Alice')).toBe(false);
        expect(await x.service.receipt('Alice', receipt.contextId, 0, q, context())).toEqual(receipt);
        expect(x.ledger.buy).toHaveBeenCalledTimes(1);
    });
    it('treats an unclassified transport exception as ambiguous rather than releasing a purchase fence', async () => {
        vi.useFakeTimers(); vi.setSystemTime(100000);
        const x = setup(), q = randomUUID();
        vi.mocked(x.ledger.buy).mockRejectedValue(new Error('ECONNRESET'));
        await expect(x.service.requestHint('Alice', 'room', 0, q, context())).rejects.toThrow('HINT_RECOVERY_PENDING');
        expect(x.service.isBusy('Alice')).toBe(true);
        vi.setSystemTime(105001);
        expect(await x.service.receipt('Alice', x.engine.hintContextId, 0, q, context())).toBeNull();
        expect(x.service.isBusy('Alice')).toBe(false);
    });
    it('a recovered old HTTP job cannot release or delete a newer purchase job', async () => {
        const x = setup(), originalBuy = vi.mocked(x.ledger.buy).getMockImplementation()!;
        let firstEntered!: () => void, secondEntered!: () => void, releaseFirst!: () => void, releaseSecond!: () => void, calls = 0;
        const firstReady = new Promise<void>(r => { firstEntered = r; }), secondReady = new Promise<void>(r => { secondEntered = r; });
        vi.mocked(x.ledger.buy).mockImplementation(async input => {
            const receipt = await originalBuy(input);
            if (++calls === 1) { firstEntered(); await new Promise<void>(r => { releaseFirst = r; }); throw new Error('response lost'); }
            secondEntered(); await new Promise<void>(r => { releaseSecond = r; }); return receipt;
        });
        const q = randomUUID(), first = x.service.requestHint('Alice', 'room', 0, q, context());
        await firstReady;
        const recovered = await x.service.receipt('Alice', x.engine.hintContextId, 0, q, context());
        expect(recovered).not.toBeNull(); expect(x.service.isBusy('Alice')).toBe(false);
        const second = x.service.requestHint('Alice', 'room', 0, randomUUID(), context()); await secondReady;
        releaseFirst(); expect(await first).toEqual(recovered);
        expect(x.service.isBusy('Alice')).toBe(true);
        expect(x.engine.processAction({ actionId: 'resign', version: 0, playerId: 'Alice', action: { type: 'RESIGN', payload: {} } }).message).toBe('HINT_PURCHASE_PENDING');
        releaseSecond(); expect(await second).toEqual(recovered); expect(x.service.isBusy('Alice')).toBe(false); expect(x.debits()).toBe(1);
    });
    it('keeps an unknown purchase fenced until DB-confirmed expired null; deletion remains busy and clocks continue', async () => {
        vi.useFakeTimers(); vi.setSystemTime(100000);
        const x = setup(undefined, 10), q = randomUUID(); x.offset(-50000);
        vi.mocked(x.ledger.buy).mockRejectedValue(new MatchHintError('HINT_STORE_UNAVAILABLE'));
        await expect(x.service.requestHint('Alice', 'room', 0, q, context())).rejects.toThrow('HINT_RECOVERY_PENDING');
        expect(x.service.isBusy('Alice')).toBe(true);
        expect(() => new AccountWriteGate().reserve('Alice', x.service.isBusy('Alice'))).toThrow('ACCOUNT_BUSY');
        expect(x.engine.processAction({ actionId: 'resign', playerId: 'Alice', version: 0, action: { type: 'RESIGN', payload: {} } }).message).toBe('HINT_PURCHASE_PENDING');
        vi.setSystemTime(104000);
        await expect(x.service.receipt('Alice', x.engine.hintContextId, 0, q, context())).rejects.toThrow('HINT_RECOVERY_PENDING');
        expect(x.engine.getPublicState('Alice').clock!.white).toBe(6000);
        vi.setSystemTime(105001);
        expect(await x.service.receipt('Alice', x.engine.hintContextId, 0, q, context())).toBeNull();
        expect(x.service.isBusy('Alice')).toBe(false);
        expect(vi.mocked(x.ledger.readReceipt).mock.calls.at(-1)![0].notBefore).toBe(new Date(55000).toISOString());
    });
    it('does not unlock on recovery transport failure or extend a natural timeout', async () => {
        vi.useFakeTimers(); vi.setSystemTime(100000);
        const x = setup(undefined, 10), q = randomUUID();
        vi.mocked(x.ledger.buy).mockRejectedValue(new MatchHintError('HINT_STORE_UNAVAILABLE'));
        await expect(x.service.requestHint('Alice', 'room', 0, q, context())).rejects.toThrow('HINT_RECOVERY_PENDING');
        x.unavailable(true); vi.setSystemTime(110001);
        await expect(x.service.receipt('Alice', x.engine.hintContextId, 0, q, context())).rejects.toThrow('HINT_RECOVERY_PENDING');
        expect(x.service.isBusy('Alice')).toBe(true); expect(x.engine.checkTimeout()).toBe(true);
        expect(x.engine.getPublicState('Alice').gameOverReason).toBe('timeout');
        x.unavailable(false); expect(await x.service.receipt('Alice', x.engine.hintContextId, 0, q, context())).toBeNull();
        expect(x.service.isBusy('Alice')).toBe(false);
    });
    it('retrieves the original receipt after terminal state and gate-OFF without a position lookup', async () => {
        const x = setup(), q = randomUUID(), receipt = await x.service.requestHint('Alice', 'room', 0, q, context());
        x.engine.forfeit('Bob'); x.enabled(false); x.registry.position.mockImplementation(() => { throw new Error('registry unavailable'); });
        expect(await x.service.receipt('Alice', receipt.contextId, 0, q, context())).toEqual(receipt);
        expect(x.debits()).toBe(1);
        await expect(x.service.requestHint('Alice', 'room', 1, randomUUID(), context())).rejects.toThrow('FEATURE_DISABLED');
    });
});
