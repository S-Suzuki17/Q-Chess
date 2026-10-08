import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HintTicketError, HintTicketStore, type HintTicketPurchase, type MatchHintReceipt } from './HintTicketStore';

const requestId = '12345678-1234-4123-8123-123456789abc';
const contextId = 'abcdefab-1234-4123-8123-123456789abc';
const receiptId = '12345678-1234-4123-8123-123456789def';
const identity = { userId: 'Alice', contextId, revision: 0 };
const request = { ...identity, requestId };
const purchase = (): HintTicketPurchase => ({ ...request, kind: 'match', mode: 'ranked', side: 'white',
    stateHash: 'a'.repeat(64), rulesVersion: 'qube:2026-10-08.1', validUntil: '2026-10-08T12:30:00.000Z',
    move: { pieceId: 'w_17', target: { row: 5, col: 0 } },
    hint: { fromRow: 6, fromCol: 0, toRow: 5, toCol: 0 } });
const receipt = (overrides: Partial<MatchHintReceipt> = {}): MatchHintReceipt => {
    const input = purchase();
    return { receiptId, contextId, revision: input.revision, kind: input.kind, mode: input.mode,
        stateHash: input.stateHash, rulesVersion: input.rulesVersion, move: input.move, hint: input.hint,
        deliveryState: 'paid_retrievable', ...overrides };
};
type RpcReply = { data: unknown; error: null | { code?: string; message?: string } };
function fixture(reply: RpcReply | (() => Promise<RpcReply>) = { data: receipt(), error: null }) {
    const calls: { name: string; parameters: Record<string, unknown>; signal?: AbortSignal }[] = [];
    const client = { rpc(name: string, parameters: Record<string, unknown>) {
        const call = { name, parameters, signal: undefined as AbortSignal | undefined }; calls.push(call);
        return { async abortSignal(signal: AbortSignal) {
            call.signal = signal;
            return typeof reply === 'function' ? reply() : reply;
        } };
    } } as unknown as SupabaseClient;
    return { store: new HintTicketStore(client), calls };
}
async function rejectsCode(operation: Promise<unknown>, code: string) {
    await assert.rejects(operation, error => error instanceof HintTicketError && error.code === code && error.message === code);
}

describe('HintTicketStore', () => {
    it('dispatches trusted purchase fields once and returns the stored receipt projection', async () => {
        const input = purchase();
        const { store, calls } = fixture({ data: { ...receipt(), secret: 'not part of receipt', userId: 'Alice' }, error: null });
        assert.deepEqual(await store.buy(input), receipt());
        assert.equal(calls.length, 1);
        assert.equal(calls[0].name, 'buy_match_hint');
        assert.deepEqual(calls[0].parameters, { p_request_id: requestId, p_user_id: 'Alice', p_context_id: contextId,
            p_kind: 'match', p_mode: 'ranked', p_side: 'white', p_revision: 0, p_state_hash: input.stateHash,
            p_rules_version: input.rulesVersion, p_valid_until: input.validUntil, p_move: input.move, p_hint: input.hint });
        assert.ok(calls[0].signal instanceof AbortSignal);
    });

    it('reads by request identity or existing position without debiting', async () => {
        const { store, calls } = fixture();
        assert.deepEqual(await store.readReceipt(request), receipt());
        assert.deepEqual(await store.readExisting(identity), receipt());
        assert.deepEqual(calls.map(({ name, parameters }) => ({ name, parameters })), [
            { name: 'read_match_hint_receipt', parameters: { p_request_id: requestId, p_user_id: 'Alice', p_context_id: contextId, p_revision: 0 } },
            { name: 'read_existing_match_hint', parameters: { p_user_id: 'Alice', p_context_id: contextId, p_revision: 0 } },
        ]);
    });

    it('treats only explicit null as a missing receipt, never an incomplete transport response', async () => {
        const missing = fixture({ data: null, error: null });
        assert.equal(await missing.store.readReceipt(request), null);
        assert.equal(await missing.store.readExisting(identity), null);
        await rejectsCode(missing.store.buy(purchase()), 'HINT_STORE_UNAVAILABLE');
        for (const data of [undefined, false, 0, '', [], {}]) {
            await rejectsCode(fixture({ data, error: null }).store.readReceipt(request), 'HINT_STORE_UNAVAILABLE');
        }
    });

    it('normalizes UUID casing without changing case-sensitive legacy account IDs', async () => {
        const { store, calls } = fixture({ data: { ...receipt(), contextId: contextId.toUpperCase(), receiptId: receiptId.toUpperCase() }, error: null });
        assert.deepEqual(await store.readReceipt({ ...request, contextId: contextId.toUpperCase(), requestId: requestId.toUpperCase() }), receipt());
        assert.equal(calls[0].parameters.p_context_id, contextId);
        assert.equal(calls[0].parameters.p_request_id, requestId);
        assert.equal(calls[0].parameters.p_user_id, 'Alice');
    });

    it('rejects invalid identity or revisions before any RPC', async () => {
        const { store, calls } = fixture();
        const changes = [{ userId: '' }, { userId: ' Alice' }, { userId: 'GUEST-Alice' }, { userId: 'x\u0000y' },
            { userId: 'あ'.repeat(86) }, { contextId: 'not-a-uuid' }, { requestId: 'bad' }, { revision: -1 },
            { revision: 1.5 }, { revision: NaN }, { revision: Infinity }, { revision: 2147483648 }];
        for (const change of changes) await rejectsCode(store.readReceipt({ ...request, ...change }), 'INVALID_REQUEST');
        await rejectsCode(store.readExisting(null as never), 'INVALID_REQUEST');
        await rejectsCode(store.buy(undefined as never), 'INVALID_REQUEST');
        assert.equal(calls.length, 0);
    });

    it('rejects practice and incoherent context kinds, hashes, rules or deadlines before dispatch', async () => {
        const { store, calls } = fixture();
        const changes: Record<string, unknown>[] = [{ kind: 'cpu_practice' }, { mode: 'practice' }, { kind: 'match', mode: 'crown' },
            { kind: 'crown', mode: 'ranked' }, { side: 'spectator' }, { stateHash: 'A'.repeat(64) }, { stateHash: 'a'.repeat(63) },
            { rulesVersion: '' }, { rulesVersion: 'a'.repeat(129) }, { rulesVersion: 'bad\nrule' }, { validUntil: 'tomorrow' },
            { validUntil: '2026-02-30T12:00:00Z' }, { validUntil: '2026-10-08T24:00:00Z' },
            { validUntil: '2026-10-08T12:00:00+99:00' }, { validUntil: Infinity }, { validUntil: null }];
        for (const change of changes) await rejectsCode(store.buy({ ...purchase(), ...change } as HintTicketPurchase), 'INVALID_REQUEST');
        assert.equal(calls.length, 0);
    });

    it('supports Crown and accepts finite ISO offsets without a local-clock expiry decision', async () => {
        const { store, calls } = fixture({ data: receipt({ kind: 'crown', mode: 'crown' }), error: null });
        assert.equal((await store.buy({ ...purchase(), kind: 'crown', mode: 'crown', validUntil: '2020-01-01T01:30:00+01:30' })).kind, 'crown');
        assert.equal(calls[0].parameters.p_valid_until, '2020-01-01T01:30:00+01:30');
    });

    it('rejects malformed or inconsistent hints and opposing-side moves before purchase', async () => {
        const { store, calls } = fixture();
        const changes: Record<string, unknown>[] = [
            { move: null }, { move: { ...purchase().move, pieceId: 'b_1' } },
            { move: { ...purchase().move, target: { row: 8, col: 0 } } },
            { move: { ...purchase().move, chosenType: 64 } }, { move: { ...purchase().move, promotionTarget: 32 } },
            { move: { ...purchase().move, from: { row: 7, col: 0 } } },
            { move: { ...purchase().move, unexpected: true } }, { hint: null },
            { hint: { ...purchase().hint, toCol: 1 } }, { hint: { ...purchase().hint, fromRow: 5 } },
            { hint: { ...purchase().hint, fromRow: NaN } }, { hint: { ...purchase().hint, intention: 'observe' } },
            { hint: { ...purchase().hint, declinePromotion: 'yes' } }, { hint: { ...purchase().hint, promotionTarget: 2 } },
            { hint: { ...purchase().hint, secretPieceState: 32 } },
            { move: { ...purchase().move, promotionTarget: 2 }, hint: { ...purchase().hint, promotionTarget: 2, declinePromotion: true } },
        ];
        for (const change of changes) await rejectsCode(store.buy({ ...purchase(), ...change } as HintTicketPurchase), 'NO_LEGAL_HINT');
        assert.equal(calls.length, 0);
    });

    it('accepts consistent promotion and optional source coordinates', async () => {
        const input = purchase();
        input.move = { pieceId: 'w_17', from: { row: 1, col: 0 }, target: { row: 0, col: 0 }, promotionTarget: 2 };
        input.hint = { fromRow: 1, fromCol: 0, toRow: 0, toCol: 0, promotionTarget: 2 };
        const value = receipt({ move: input.move, hint: input.hint });
        assert.deepEqual(await fixture({ data: value, error: null }).store.buy(input), value);
    });

    it('rejects malformed receipt identity, hint and move on either read path', async () => {
        const changes: Record<string, unknown>[] = [{ receiptId: 'bad' }, { contextId: requestId }, { revision: 1 },
            { userId: 'Bob' }, { stateHash: 'bad' }, { rulesVersion: '' }, { kind: 'crown', mode: 'private' },
            { deliveryState: 'restored' }, { move: null }, { hint: null },
            { hint: { ...purchase().hint, toCol: 4 } }, { move: { ...purchase().move, chosenType: Infinity } }];
        for (const change of changes) {
            const { store } = fixture({ data: { ...receipt(), ...change }, error: null });
            await rejectsCode(store.readReceipt(request), 'HINT_STORE_UNAVAILABLE');
            await rejectsCode(store.readExisting(identity), 'HINT_STORE_UNAVAILABLE');
        }
    });

    it('binds a purchase response to its exact context, rules, hash, mode and side', async () => {
        for (const change of [{ stateHash: 'b'.repeat(64) }, { rulesVersion: 'other-rules' }, { mode: 'private' },
            { kind: 'crown', mode: 'crown' }, { move: { ...purchase().move, pieceId: 'b_1' } }]) {
            await rejectsCode(fixture({ data: { ...receipt(), ...change }, error: null }).store.buy(purchase()), 'HINT_STORE_UNAVAILABLE');
        }
    });

    it('returns a prior immutable legal hint when a concurrent request won for this position', async () => {
        const value = receipt({ move: { pieceId: 'w_18', target: { row: 5, col: 1 } },
            hint: { fromRow: 6, fromCol: 1, toRow: 5, toCol: 1 } });
        assert.deepEqual(await fixture({ data: value, error: null }).store.buy(purchase()), value);
    });

    it('does not let caller mutation after dispatch change response checks or the sent hint', async () => {
        let finish!: (value: RpcReply) => void;
        const { store, calls } = fixture(() => new Promise(resolve => { finish = resolve; }));
        const input = purchase();
        const result = store.buy(input);
        input.contextId = requestId; input.stateHash = 'b'.repeat(64); input.hint.toRow = 0;
        (input.move.target as { row: number }).row = 0;
        finish({ data: receipt(), error: null });
        assert.deepEqual(await result, receipt());
        assert.deepEqual(calls[0].parameters.p_move, purchase().move);
        assert.deepEqual(calls[0].parameters.p_hint, purchase().hint);
    });

    it('maps only allowlisted database errors and hides arbitrary provider details', async () => {
        const codes = ['INSUFFICIENT_FUNDS', 'REQUEST_MISMATCH', 'HINT_CONTEXT_EXPIRED', 'ACCOUNT_UNAVAILABLE',
            'TERMS_REQUIRED', 'INVALID_REQUEST', 'NO_LEGAL_HINT', 'HINT_STORE_UNAVAILABLE'];
        for (const code of codes) {
            await rejectsCode(fixture({ data: null, error: { code: 'P0001', message: code } }).store.buy(purchase()), code);
            await rejectsCode(fixture({ data: { error: code }, error: null }).store.buy(purchase()), code);
        }
        await rejectsCode(fixture({ data: null, error: { code: '42501', message: 'permission denied' } }).store.buy(purchase()), 'HINT_STORE_UNAVAILABLE');
        await rejectsCode(fixture({ data: null, error: { message: 'private database details' } }).store.buy(purchase()), 'HINT_STORE_UNAVAILABLE');
        await rejectsCode(fixture({ data: { error: 'private database details' }, error: null }).store.buy(purchase()), 'HINT_STORE_UNAVAILABLE');
    });

    it('leaves lost or cancelled purchase responses recoverable without retrying or restoring', async () => {
        for (const failure of [new Error('network lost after commit'), new DOMException('Aborted', 'AbortError')]) {
            const { store, calls } = fixture(async () => { throw failure; });
            await rejectsCode(store.buy(purchase()), 'HINT_STORE_UNAVAILABLE');
            assert.deepEqual(calls.map(call => call.name), ['buy_match_hint']);
        }
    });

    it('restricts operations-only restoration to its reason and exact integer result', async () => {
        const input = { receiptId, userId: 'Alice', reason: 'unrecoverable_delivery' as const };
        for (const data of [0, 1] as const) {
            const { store, calls } = fixture({ data, error: null });
            assert.equal(await store.restore(input), data);
            assert.deepEqual(calls[0].parameters, { p_receipt_id: receiptId, p_user_id: 'Alice', p_reason: 'unrecoverable_delivery' });
            assert.equal(calls[0].name, 'restore_match_hint_credit');
        }
        for (const data of [null, true, '1', 2, -1, { restored: 1 }]) {
            await rejectsCode(fixture({ data, error: null }).store.restore(input), 'HINT_STORE_UNAVAILABLE');
        }
        const { store, calls } = fixture();
        await rejectsCode(store.restore({ ...input, reason: 'request_cancelled' as never }), 'INVALID_REQUEST');
        await rejectsCode(store.restore({ ...input, receiptId: 'bad' }), 'INVALID_REQUEST');
        await rejectsCode(store.restore({ ...input, userId: 'guest-1' }), 'INVALID_REQUEST');
        assert.equal(calls.length, 0);
    });
});
