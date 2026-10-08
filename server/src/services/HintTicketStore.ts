import type { SupabaseClient } from '@supabase/supabase-js';
import type { HintAdvice } from '../quantum-engine/ai/hintAdvice';
import type { Move } from '../quantum-engine/types';
import { isRankedUserId } from './RankedAuth';

export type HintTicketErrorCode = 'INSUFFICIENT_FUNDS' | 'REQUEST_MISMATCH' | 'HINT_CONTEXT_EXPIRED'
    | 'ACCOUNT_UNAVAILABLE' | 'TERMS_REQUIRED' | 'INVALID_REQUEST' | 'NO_LEGAL_HINT' | 'HINT_STORE_UNAVAILABLE';
export class HintTicketError extends Error {
    constructor(public readonly code: HintTicketErrorCode) { super(code); this.name = 'HintTicketError'; }
}
export type HintContextKind = 'match' | 'crown';
export type HintContextMode = 'ranked' | 'random' | 'private' | 'crown';
export interface HintTicketContext {
    userId: string;
    contextId: string;
    revision: number;
}
export interface HintTicketRequest extends HintTicketContext { requestId: string }
export interface HintTicketPurchase extends HintTicketRequest {
    kind: HintContextKind;
    mode: HintContextMode;
    side: 'white' | 'black';
    stateHash: string;
    rulesVersion: string;
    validUntil: string;
    move: Move;
    hint: HintAdvice;
}
export interface MatchHintReceipt {
    receiptId: string;
    contextId: string;
    kind: HintContextKind;
    mode: HintContextMode;
    revision: number;
    stateHash: string;
    rulesVersion: string;
    move: Move;
    hint: HintAdvice;
    deliveryState: 'paid_retrievable';
}

const errors = new Set<HintTicketErrorCode>(['INSUFFICIENT_FUNDS', 'REQUEST_MISMATCH', 'HINT_CONTEXT_EXPIRED',
    'ACCOUNT_UNAVAILABLE', 'TERMS_REQUIRED', 'INVALID_REQUEST', 'NO_LEGAL_HINT', 'HINT_STORE_UNAVAILABLE']);
const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const stateHash = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const rulesVersion = (value: unknown): value is string => typeof value === 'string'
    && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
const coordinate = (value: unknown): value is number => typeof value === 'number'
    && Number.isInteger(value) && value >= 0 && value < 8;
const promotion = (value: unknown): value is number => typeof value === 'number' && [2, 4, 8, 16].includes(value);
const keysOnly = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const contextMode = (kind: unknown, mode: unknown) => kind === 'crown' ? mode === 'crown'
    : kind === 'match' && (mode === 'ranked' || mode === 'random' || mode === 'private');
const position = (value: unknown): value is { row: number; col: number } => object(value)
    && keysOnly(value, ['row', 'col']) && coordinate(value.row) && coordinate(value.col);

function validTimestamp(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!parts || !Number.isFinite(Date.parse(value))) return false;
    // Date.parse normalizes impossible dates such as February 30; reject those.
    const date = new Date(`${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== value.slice(0, 19)) return false;
    return parts[8] === 'Z' || (Number(parts[8].slice(1, 3)) <= 23 && Number(parts[8].slice(4)) <= 59);
}

function validMove(value: unknown): value is Move {
    return object(value) && keysOnly(value, ['pieceId', 'from', 'target', 'chosenType', 'promotionTarget'])
        && typeof value.pieceId === 'string' && /^[wb]_[1-9][0-9]?$/.test(value.pieceId)
        && position(value.target) && (value.from === undefined || position(value.from))
        && (value.chosenType === undefined || (typeof value.chosenType === 'number'
            && Number.isInteger(value.chosenType) && value.chosenType >= 1 && value.chosenType <= 63))
        && (value.promotionTarget === undefined || promotion(value.promotionTarget));
}

function validHint(value: unknown, move: Move): value is HintAdvice {
    if (!object(value) || !keysOnly(value, ['fromRow', 'fromCol', 'toRow', 'toCol', 'promotionTarget', 'intention', 'declinePromotion'])
        || ![value.fromRow, value.fromCol, value.toRow, value.toCol].every(coordinate)
        || (value.fromRow === value.toRow && value.fromCol === value.toCol)
        || value.toRow !== move.target.row || value.toCol !== move.target.col
        || (move.from && (move.from.row !== value.fromRow || move.from.col !== value.fromCol))
        || value.promotionTarget !== move.promotionTarget
        || (value.intention !== undefined && value.intention !== 'castle' && value.intention !== 'normal')
        || (value.declinePromotion !== undefined && typeof value.declinePromotion !== 'boolean')
        || (value.declinePromotion === true && value.promotionTarget !== undefined)) return false;
    return true;
}

function checkedContext(input: HintTicketContext): HintTicketContext {
    if (!object(input) || !isRankedUserId(input.userId) || !uuid(input.contextId)
        || !Number.isSafeInteger(input.revision) || input.revision < 0 || input.revision > 2147483647) {
        throw new HintTicketError('INVALID_REQUEST');
    }
    return { userId: input.userId, contextId: input.contextId.toLowerCase(), revision: input.revision };
}

function checkedRequest(input: HintTicketRequest): HintTicketRequest {
    const context = checkedContext(input);
    if (!uuid(input.requestId)) throw new HintTicketError('INVALID_REQUEST');
    return { ...context, requestId: input.requestId.toLowerCase() };
}

function errorCode(value: unknown): HintTicketErrorCode {
    return typeof value === 'string' && errors.has(value as HintTicketErrorCode)
        ? value as HintTicketErrorCode : 'HINT_STORE_UNAVAILABLE';
}

function parseReceipt(value: unknown, expected: HintTicketContext & Partial<HintTicketPurchase>): MatchHintReceipt {
    if (!object(value) || !uuid(value.receiptId) || !uuid(value.contextId)
        || value.contextId.toLowerCase() !== expected.contextId || value.revision !== expected.revision
        || !contextMode(value.kind, value.mode) || !stateHash(value.stateHash) || !rulesVersion(value.rulesVersion)
        || value.deliveryState !== 'paid_retrievable' || !validMove(value.move) || !validHint(value.hint, value.move)
        || (value.userId !== undefined && value.userId !== expected.userId)
        || (expected.kind !== undefined && value.kind !== expected.kind)
        || (expected.mode !== undefined && value.mode !== expected.mode)
        || (expected.stateHash !== undefined && value.stateHash !== expected.stateHash)
        || (expected.rulesVersion !== undefined && value.rulesVersion !== expected.rulesVersion)
        || (expected.side !== undefined && !value.move.pieceId.startsWith(expected.side === 'white' ? 'w_' : 'b_'))) {
        throw new HintTicketError('HINT_STORE_UNAVAILABLE');
    }
    // Project only the documented receipt, never arbitrary RPC fields.
    return { receiptId: value.receiptId.toLowerCase(), contextId: value.contextId.toLowerCase(),
        kind: value.kind as HintContextKind, mode: value.mode as HintContextMode, revision: expected.revision,
        stateHash: value.stateHash, rulesVersion: value.rulesVersion,
        move: structuredClone(value.move), hint: structuredClone(value.hint), deliveryState: 'paid_retrievable' };
}

/** Trusted server adapter. The caller must authorize the user, turn and active
 * canonical position immediately before buy. SQL atomically debits and records
 * the receipt; transport failure is ambiguous and must be recovered by reading
 * that receipt. It must never cause an automatic refund or a new request ID. */
export class HintTicketStore {
    constructor(private readonly client: SupabaseClient) {}

    private async rpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
        let result: { data: unknown; error: { message?: string; code?: string } | null };
        try {
            result = await this.client.rpc(name, parameters).abortSignal(AbortSignal.timeout(10000));
        } catch { throw new HintTicketError('HINT_STORE_UNAVAILABLE'); }
        if (!object(result)) throw new HintTicketError('HINT_STORE_UNAVAILABLE');
        if (result.error) {
            throw new HintTicketError(errorCode(result.error.message));
        }
        if (object(result.data) && Object.hasOwn(result.data, 'error')) throw new HintTicketError(errorCode(result.data.error));
        return result.data;
    }

    async readReceipt(input: HintTicketRequest): Promise<MatchHintReceipt | null> {
        const expected = checkedRequest(input);
        const data = await this.rpc('read_match_hint_receipt', { p_request_id: expected.requestId,
            p_user_id: expected.userId, p_context_id: expected.contextId, p_revision: expected.revision });
        return data === null ? null : parseReceipt(data, expected);
    }

    async readExisting(input: HintTicketContext): Promise<MatchHintReceipt | null> {
        const expected = checkedContext(input);
        const data = await this.rpc('read_existing_match_hint', { p_user_id: expected.userId,
            p_context_id: expected.contextId, p_revision: expected.revision });
        return data === null ? null : parseReceipt(data, expected);
    }

    async buy(input: HintTicketPurchase): Promise<MatchHintReceipt> {
        const identity = checkedRequest(input);
        if (!contextMode(input.kind, input.mode) || (input.side !== 'white' && input.side !== 'black')
            || !stateHash(input.stateHash) || !rulesVersion(input.rulesVersion) || !validTimestamp(input.validUntil)) {
            throw new HintTicketError('INVALID_REQUEST');
        }
        if (!validMove(input.move) || !validHint(input.hint, input.move)
            || !input.move.pieceId.startsWith(input.side === 'white' ? 'w_' : 'b_')) {
            throw new HintTicketError('NO_LEGAL_HINT');
        }
        const expected: HintTicketPurchase = { ...identity, kind: input.kind, mode: input.mode, side: input.side,
            stateHash: input.stateHash, rulesVersion: input.rulesVersion, validUntil: input.validUntil,
            move: structuredClone(input.move), hint: structuredClone(input.hint) };
        const data = await this.rpc('buy_match_hint', { p_request_id: expected.requestId, p_user_id: expected.userId,
            p_context_id: expected.contextId, p_kind: expected.kind, p_mode: expected.mode, p_side: expected.side,
            p_revision: expected.revision, p_state_hash: expected.stateHash, p_rules_version: expected.rulesVersion,
            p_valid_until: expected.validUntil, p_move: expected.move, p_hint: expected.hint });
        // A concurrent request may already have committed a different legal
        // hint for this position. Return that immutable receipt, not our input.
        return parseReceipt(data, expected);
    }

    /** Operations-only remediation for a proven unrecoverable delivery.
     * The normal HTTP request/recovery path must not call this method. */
    async restore(input: { receiptId: string; userId: string; reason: 'unrecoverable_delivery' }): Promise<0 | 1> {
        if (!object(input) || !uuid(input.receiptId) || !isRankedUserId(input.userId) || input.reason !== 'unrecoverable_delivery') {
            throw new HintTicketError('INVALID_REQUEST');
        }
        const data = await this.rpc('restore_match_hint_credit', { p_receipt_id: input.receiptId.toLowerCase(),
            p_user_id: input.userId, p_reason: input.reason });
        if (data !== 0 && data !== 1) throw new HintTicketError('HINT_STORE_UNAVAILABLE');
        return data;
    }
}
