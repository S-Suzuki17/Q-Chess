import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { createInitialState } from '../quantum-engine/initialState';
import { applyPracticeMove, CPU_PRACTICE_RULES_VERSION, type CpuPracticeSnapshot } from '../quantum-engine/practice';
import type { GameState, Move } from '../quantum-engine/types';
import { searchCpuPracticeMove } from './CpuPracticeSearch';
import { cpuHintPurchaseRpc, type CpuHintPurchaseRpc } from './CpuHintOriginProtocol';

export type PracticeContext = { signal: AbortSignal; check(): Promise<void> | void };
export type PaidHint = { receiptId: string; sessionId: string; revision: number; stateHash: string; rulesVersion: string;
    hint: { fromRow: number; fromCol: number; toRow: number; toCol: number }; move: Move; deliveryState: 'paid_retrievable' };
export class CpuPracticeError extends Error {
    constructor(public readonly code: string) { super(code); }
}
export const isPracticeId = (v: unknown): v is string =>
    typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const canonical = (value: any): string => value === null || typeof value !== 'object' ? JSON.stringify(value)
    : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).filter(key => value[key] !== undefined).sort()
        .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
export const hashPracticeState = (state: GameState) =>
    createHash('sha256').update(CPU_PRACTICE_RULES_VERSION + ':' + canonical(state)).digest('hex');
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const defaultContext = (): PracticeContext => ({ signal: new AbortController().signal, check() {} });
const allowedErrors = new Set(['ACCOUNT_UNAVAILABLE','AUTH_REQUIRED','SESSION_NOT_FOUND','REQUEST_MISMATCH',
    'STALE_REVISION','SESSION_FINISHED','NOT_YOUR_TURN','INSUFFICIENT_FUNDS','NO_LEGAL_HINT','SESSION_LIMIT','INVALID_MOVE','INVALID_REQUEST',
    'HINT_UNAVAILABLE_IN_MATCH']);

export function parsePracticeMove(value: unknown): Move {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CpuPracticeError('INVALID_MOVE');
    const row = value as Record<string, any>, target = row.target;
    if (Object.keys(row).some(key => !['pieceId','target','chosenType','promotionTarget'].includes(key))
        || typeof row.pieceId !== 'string' || !/^[wb]_[1-9][0-9]?$/.test(row.pieceId)
        || !target || Object.keys(target).some(key => !['row','col'].includes(key))
        || !Number.isInteger(target.row) || !Number.isInteger(target.col)
        || target.row < 0 || target.row > 7 || target.col < 0 || target.col > 7
        || (row.chosenType !== undefined && (!Number.isInteger(row.chosenType) || row.chosenType < 1 || row.chosenType > 63))
        || (row.promotionTarget !== undefined && ![2,4,8,16].includes(row.promotionTarget))) {
        throw new CpuPracticeError('INVALID_MOVE');
    }
    return { pieceId: row.pieceId, target: { row: target.row, col: target.col },
        ...(row.chosenType !== undefined ? { chosenType: row.chosenType } : {}),
        ...(row.promotionTarget !== undefined ? { promotionTarget: row.promotionTarget } : {}) };
}

export class CpuPracticeService {
    private busy = new Map<string, number>();
    constructor(private client: SupabaseClient, private enabled: boolean | (() => boolean) = false,
        private search = searchCpuPracticeMove,
        private purchaseRpc: () => CpuHintPurchaseRpc = cpuHintPurchaseRpc) {}
    isBusy(userId: string) { return (this.busy.get(userId) ?? 0) > 0; }
    private ready() {
        if (!(typeof this.enabled === 'function' ? this.enabled() : this.enabled)) throw new CpuPracticeError('FEATURE_DISABLED');
    }
    private async checked(context: PracticeContext) {
        this.ready(); context.signal.throwIfAborted(); await context.check(); context.signal.throwIfAborted();
    }
    private ids(sessionId: string, revision?: number, requestId?: string) {
        if (!isPracticeId(sessionId) || (requestId !== undefined && !isPracticeId(requestId))
            || (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 0))) throw new CpuPracticeError('INVALID_REQUEST');
    }
    private async rpc(name: string, parameters: Record<string, unknown>) {
        const { data, error } = await this.client.rpc(name, parameters).abortSignal(AbortSignal.timeout(10000));
        if (error) throw new CpuPracticeError(allowedErrors.has(error.message) ? error.message : 'CPU_PRACTICE_UNAVAILABLE');
        if (data?.error && allowedErrors.has(data.error)) throw new CpuPracticeError(data.error);
        return data;
    }
    private snapshot(value: any, userId: string): CpuPracticeSnapshot {
        if (!value || value.userId !== userId || !isPracticeId(value.sessionId) || value.kind !== 'cpu_practice'
            || value.rulesVersion !== CPU_PRACTICE_RULES_VERSION || !value.state || !Array.isArray(value.history)
            || value.revision !== value.history.length || value.state.ply !== value.revision
            || !['active','finished'].includes(value.status) || hashPracticeState(value.state) !== value.stateHash) {
            throw new CpuPracticeError('CPU_PRACTICE_UNAVAILABLE');
        }
        return value;
    }
    private hint(value: any, sessionId: string, revision: number): PaidHint {
        const h = value?.hint;
        if (value?.sessionId !== sessionId || value?.revision !== revision || value?.rulesVersion !== CPU_PRACTICE_RULES_VERSION
            || value?.deliveryState !== 'paid_retrievable' || !isPracticeId(value.receiptId) || !h
            || ![h.fromRow,h.fromCol,h.toRow,h.toCol].every(n => Number.isInteger(n) && n >= 0 && n < 8)
            || (h.fromRow === h.toRow && h.fromCol === h.toCol)) throw new CpuPracticeError('CPU_PRACTICE_UNAVAILABLE');
        return value;
    }
    private playable(session: CpuPracticeSnapshot, revision: number, actor: 'human' | 'cpu') {
        if (session.revision !== revision) throw new CpuPracticeError('STALE_REVISION');
        if (session.status !== 'active' || session.state.winner) throw new CpuPracticeError('SESSION_FINISHED');
        if ((session.state.sideToMove === session.playerSide) !== (actor === 'human')) throw new CpuPracticeError('NOT_YOUR_TURN');
    }
    private async holding<T>(userId: string, run: () => Promise<T>) {
        this.busy.set(userId, (this.busy.get(userId) ?? 0) + 1);
        try { return await run(); }
        finally { const remaining = this.busy.get(userId)! - 1;
            if (remaining) this.busy.set(userId, remaining); else this.busy.delete(userId); }
    }
    async open(userId: string, sessionId: string, side: 'white' | 'black', level: 1 | 3 | 5,
        seconds: 10 | 180 | 600, context = defaultContext()) {
        await this.checked(context); this.ids(sessionId);
        if (!['white','black'].includes(side) || ![1,3,5].includes(level) || ![10,180,600].includes(seconds)) {
            throw new CpuPracticeError('INVALID_REQUEST');
        }
        const state = createInitialState();
        return this.snapshot(await this.rpc('cpu_practice_open', { p_session_id: sessionId, p_user_id: userId,
            p_player_side: side, p_level: level, p_seconds: seconds, p_rules_version: CPU_PRACTICE_RULES_VERSION,
            p_state: state, p_state_hash: hashPracticeState(state) }), userId);
    }
    async read(userId: string, sessionId: string, context = defaultContext()) {
        await this.checked(context); this.ids(sessionId);
        return this.snapshot(await this.rpc('cpu_practice_read', { p_session_id: sessionId, p_user_id: userId }), userId);
    }
    async close(userId: string, sessionId: string, context = defaultContext()) {
        await this.checked(context); this.ids(sessionId);
        return this.snapshot(await this.rpc('cpu_practice_close', { p_session_id: sessionId, p_user_id: userId }), userId);
    }
    async advance(userId: string, sessionId: string, revision: number, operationId: string,
        actor: 'human' | 'cpu', input?: unknown, context = defaultContext()) {
        return this.holding(userId, async () => {
            await this.checked(context); this.ids(sessionId, revision, operationId);
            if (!['human','cpu'].includes(actor) || (actor === 'cpu' && input !== undefined)) throw new CpuPracticeError('INVALID_REQUEST');
            const humanMove = actor === 'human' ? parsePracticeMove(input) : undefined;
            const intentHash = digest({ actor, move: humanMove ?? null });
            const parameters = { p_operation_id: operationId, p_session_id: sessionId, p_user_id: userId,
                p_revision: revision, p_intent_hash: intentHash };
            const existing = await this.rpc('cpu_practice_operation', parameters);
            if (existing) return this.read(userId,sessionId,context);
            const session = await this.read(userId, sessionId, context);
            this.playable(session, revision, actor);
            const move = humanMove ?? await this.search(session.state, session.level, context.signal, false);
            if (!move) throw new CpuPracticeError('NO_LEGAL_HINT');
            let next: GameState;
            try { next = applyPracticeMove(session.state, move); }
            catch { throw new CpuPracticeError('INVALID_MOVE'); }
            await this.checked(context);
            return this.snapshot(await this.rpc('cpu_practice_commit_move', { ...parameters, p_actor: actor,
                p_state_hash: session.stateHash, p_next_state: next, p_next_hash: hashPracticeState(next),
                p_move: next.lastMove }), userId);
        });
    }
    async receipt(userId: string, sessionId: string, revision: number, requestId: string, context = defaultContext()) {
        await this.checked(context); this.ids(sessionId, revision, requestId);
        const value = await this.rpc('read_cpu_hint_receipt', { p_request_id: requestId, p_user_id: userId,
            p_session_id: sessionId, p_revision: revision });
        return value ? this.hint(value, sessionId, revision) : null;
    }
    async requestHint(requestId: string, userId: string, sessionId: string, revision: number, context = defaultContext()) {
        return this.holding(userId, async () => {
            const existing = await this.receipt(userId, sessionId, revision, requestId, context);
            if (existing) return existing;
            const session = await this.read(userId, sessionId, context);
            this.playable(session, revision, 'human');
            const paidValue = await this.rpc('cpu_practice_existing_hint', {
                p_session_id: sessionId, p_user_id: userId, p_revision: revision });
            const paid = paidValue ? this.hint(paidValue, sessionId, revision) : null;
            if (paid && paid.stateHash !== session.stateHash) throw new CpuPracticeError('CPU_PRACTICE_UNAVAILABLE');
            const move = paid?.move ?? await this.search(session.state, 5, context.signal, true);
            if (!move) throw new CpuPracticeError('NO_LEGAL_HINT');
            const piece = session.state.pieces.find(p => p.id === move.pieceId && p.alive && p.owner === session.playerSide);
            try { if (!piece) throw new Error(); applyPracticeMove(session.state, move); }
            catch { throw new CpuPracticeError('NO_LEGAL_HINT'); }
            const hint = { fromRow: piece!.position.row, fromCol: piece!.position.col,
                toRow: move.target.row, toCol: move.target.col };
            // Cancellation still prevents dispatch at this final check. Once the
            // purchase RPC is dispatched, its commit may outlive the request;
            // recover the immutable receipt after cancellation/response loss.
            // The database atomically rechecks revision, debits and saves it.
            await this.checked(context);
            return this.hint(await this.rpc(this.purchaseRpc(), { p_request_id: requestId, p_user_id: userId,
                p_session_id: sessionId, p_revision: revision, p_state_hash: session.stateHash, p_move: move, p_hint: hint }),
                sessionId, revision);
        });
    }
}
