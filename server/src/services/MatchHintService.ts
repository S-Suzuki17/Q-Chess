import { searchCpuPracticeMove } from './CpuPracticeSearch';
import { hintTimeAvailable } from '../quantum-engine/ai/searchProfiles';
import type { Move } from '../quantum-engine/types';
import type { HintTicketPurchase, MatchHintReceipt } from './HintTicketStore';
import { isRankedUserId } from './RankedAuth';
import { cpuHintTicketsEnabled } from './TicketFeatureGates';
import { MatchHintError, isHintUuid, isHintRevision, type HintLedger, type HintPositionRegistry,
    type HintRequestContext, type TrustedHintPosition } from './MatchHintTypes';

export type MatchHintSearch = (position: TrustedHintPosition, signal: AbortSignal, availableMs: number) => Promise<Move | null>;
interface HintJob {
    userId: string; contextId: string; revision: number; requestId: string; connectionId?: string;
    controller: AbortController; phase: 'analysis' | 'commit' | 'pending' | 'done';
    deadline?: number; notBefore?: string; release?: () => void; timer?: ReturnType<typeof setTimeout>; retryMs: number;
    result: Promise<MatchHintReceipt>;
}
const errorCode = (error: unknown): string => typeof (error as { code?: unknown })?.code === 'string'
    ? (error as { code: string }).code : error instanceof Error ? error.message : 'HINT_STORE_UNAVAILABLE';
const definitivePurchaseFailures = new Set(['INSUFFICIENT_FUNDS', 'REQUEST_MISMATCH', 'HINT_CONTEXT_EXPIRED',
    'ACCOUNT_UNAVAILABLE', 'TERMS_REQUIRED', 'INVALID_REQUEST', 'NO_LEGAL_HINT']);

/** The server position owns the move and the ledger owns the debit. A dispatched
 * purchase is never cancelled/refunded automatically. Its mutation fence stays
 * until a receipt, a definitive rollback, or a DB-confirmed expired null. */
export class MatchHintService {
    private jobs = new Map<string, HintJob>();
    constructor(private readonly ledger: HintLedger, private readonly registry: HintPositionRegistry,
        private readonly enabled = cpuHintTicketsEnabled,
        private readonly search: MatchHintSearch = (p, signal, ms) => searchCpuPracticeMove(p.state, 5, signal, true, 'balanced', ms, p.online),
        private readonly now = Date.now) {}

    isBusy(userId: string) { return this.jobs.has(userId); }
    cancelAnalysis(userId: string, connectionId?: string) {
        const job = this.jobs.get(userId);
        if (job?.phase === 'analysis' && (connectionId === undefined || job.connectionId === connectionId)) {
            job.controller.abort(new MatchHintError('CANCELLED'));
        }
    }
    private ids(userId: string, contextId: string, revision: number, requestId: string) {
        if (!isRankedUserId(userId) || !isHintUuid(contextId) || !isHintRevision(revision) || !isHintUuid(requestId)) {
            throw new MatchHintError('INVALID_REQUEST');
        }
        return { userId, contextId: contextId.toLowerCase(), revision, requestId: requestId.toLowerCase() };
    }
    private async checked(context: HintRequestContext, signal = context.signal) {
        if (!this.enabled()) throw new MatchHintError('FEATURE_DISABLED');
        signal.throwIfAborted(); await context.check(); signal.throwIfAborted();
    }
    async requestHint(userId: string, referenceId: string, revision: number, requestId: string, context: HintRequestContext) {
        await this.checked(context);
        const identity = this.ids(userId, this.registry.contextId(userId, referenceId), revision, requestId);
        const existing = this.jobs.get(userId);
        if (existing) {
            if (existing.contextId === identity.contextId && existing.revision === revision && existing.requestId === identity.requestId) {
                if (existing.phase === 'pending') throw new MatchHintError('HINT_RECOVERY_PENDING');
                return existing.result;
            }
            throw new MatchHintError('HINT_PURCHASE_PENDING');
        }
        if (this.jobs.size >= 10000) throw new MatchHintError('SEARCH_BUSY');
        const job: HintJob = { ...identity, connectionId: context.connectionId, controller: new AbortController(),
            phase: 'analysis', retryMs: 1000, result: undefined! };
        this.jobs.set(userId, job);
        job.result = this.execute(job, referenceId, context);
        return job.result;
    }
    private async execute(job: HintJob, referenceId: string, context: HintRequestContext): Promise<MatchHintReceipt> {
        const signal = AbortSignal.any([job.controller.signal, context.signal]);
        try {
            const receipt = await this.ledger.readReceipt(this.identity(job));
            await this.checked(context, signal);
            if (receipt) return receipt;
            const paid = await this.ledger.readExisting(this.identity(job));
            await this.checked(context, signal);
            const position = this.registry.position(job.userId, referenceId, job.revision);
            if (position.contextId !== job.contextId) throw new MatchHintError('STALE_REVISION');
            if (paid && (paid.stateHash !== position.stateHash || paid.rulesVersion !== position.rulesVersion
                || paid.kind !== position.kind || paid.mode !== position.mode)) throw new MatchHintError('REQUEST_MISMATCH');
            const availableMs = hintTimeAvailable(Math.min(position.remainingMs, position.validUntilMs - this.now()));
            if (!paid && availableMs <= 0) throw new MatchHintError('SEARCH_CLOCK_EXPIRED');
            const move = paid?.move ?? await this.search(position, signal, availableMs);
            if (!move) throw new MatchHintError('NO_LEGAL_HINT');
            // Search has no side effects. The last asynchronous identity check is
            // followed by a fresh synchronous position check and acquire.
            const databaseNow = await this.ledger.readClock();
            if (!Number.isFinite(databaseNow)) throw new MatchHintError('HINT_STORE_UNAVAILABLE');
            await this.checked(context, signal);
            const current = this.registry.position(job.userId, referenceId, job.revision);
            if (current.contextId !== job.contextId || current.stateHash !== position.stateHash
                || current.rulesVersion !== position.rulesVersion) throw new MatchHintError('STALE_REVISION');
            const hint = current.validateMove(move);
            const budget = Math.floor(Math.min(current.remainingMs, current.validUntilMs - this.now(), 5000));
            if (budget <= 0) throw new MatchHintError('SEARCH_CLOCK_EXPIRED');
            // DB time was observed before the response and final auth check;
            // adding the remaining host duration makes expiry conservative.
            const validUntil = new Date(databaseNow + budget).toISOString();
            job.release = current.acquire();
            job.deadline = this.now() + budget; job.notBefore = validUntil; job.phase = 'commit';
            const input: HintTicketPurchase = { ...this.identity(job), kind: current.kind, mode: current.mode,
                side: current.side, stateHash: current.stateHash, rulesVersion: current.rulesVersion,
                validUntil, move, hint };
            try { return await this.ledger.buy(input); }
            catch (error) {
                if (definitivePurchaseFailures.has(errorCode(error))) throw error;
                job.phase = 'pending';
                try {
                    const recovered = await this.lookupPending(job);
                    if (recovered) return recovered;
                    if (!this.jobs.has(job.userId)) throw new MatchHintError('HINT_CONTEXT_EXPIRED');
                } catch (recoveryError) {
                    if (errorCode(recoveryError) === 'HINT_CONTEXT_EXPIRED') throw recoveryError;
                }
                this.schedule(job); throw new MatchHintError('HINT_RECOVERY_PENDING');
            }
        } finally { if (job.phase !== 'pending') this.finish(job); }
    }
    private identity(job: HintJob) {
        return { userId: job.userId, contextId: job.contextId, revision: job.revision, requestId: job.requestId };
    }
    private finish(job: HintJob) {
        if (job.timer) clearTimeout(job.timer);
        job.release?.(); job.phase = 'done';
        if (this.jobs.get(job.userId) === job) this.jobs.delete(job.userId);
    }
    private async lookupPending(job: HintJob) {
        // notBefore is verified by DB time AFTER its profile lock. A local
        // deadline or a pre-expiry read returning null is not settlement proof.
        const receipt = await this.ledger.readReceipt({ ...this.identity(job), notBefore: job.notBefore! });
        this.finish(job); return receipt;
    }
    private schedule(job: HintJob) {
        if (this.jobs.get(job.userId) !== job || job.timer) return;
        const delay = Math.max(job.retryMs, (job.deadline ?? 0) - this.now());
        job.timer = setTimeout(async () => {
            job.timer = undefined;
            if (this.jobs.get(job.userId) !== job) return;
            try { await this.lookupPending(job); }
            catch { job.retryMs = Math.min(30000, job.retryMs * 2); this.schedule(job); }
        }, delay);
        job.timer.unref?.();
    }
    /** No new purchase; works after a move, terminal state, registry eviction or
     * server restart, and even when the new-purchase feature gate is off. */
    async receipt(userId: string, contextId: string, revision: number, requestId: string, context: HintRequestContext) {
        context.signal.throwIfAborted(); await context.check(); context.signal.throwIfAborted();
        const identity = this.ids(userId, contextId, revision, requestId);
        const job = this.jobs.get(userId);
        if (job && ['pending','commit'].includes(job.phase) && job.contextId === identity.contextId && job.revision === revision && job.requestId === identity.requestId) {
            try { return await this.lookupPending(job); }
            catch { this.schedule(job); throw new MatchHintError('HINT_RECOVERY_PENDING'); }
        }
        return this.ledger.readReceipt(identity);
    }
}
