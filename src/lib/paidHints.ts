'use client';

import { supabase } from './supabaseClient';
import { gameServerUrl, readRankedSession } from './rankedSession';
import { DAILY_LOGIN_REWARD_CHANGED_EVENT } from './dailyLoginRewards';
import { isValidHintMove, type HintMove } from '../components/boardPresentation';
import type { Move } from '../quantum-engine/types';
import { qubeSearchProfile } from '../../server/src/quantum-engine/ai/searchProfiles';

/** Compatibility gate: practice remains free regardless of this build setting. */
export const PAID_HINTS_ENABLED = process.env.NEXT_PUBLIC_QG_CPU_HINT_TICKETS_ENABLED === 'true';
export type MatchHintContext = {
    kind: 'match'; mode: 'ranked' | 'random' | 'private';
    matchId: string; contextId: string; rulesVersion: 'match-hint-v1';
};
export type CrownHintContext = {
    kind: 'crown'; mode: 'crown'; runId: string; contextId: string; rulesVersion: 'quantum-crown-v1';
};
export type PaidHintContext = MatchHintContext | CrownHintContext;
export type HintReceipt = {
    receiptId: string; contextId: string; kind: PaidHintContext['kind']; mode: PaidHintContext['mode'];
    revision: number; stateHash: string; rulesVersion: string; move: Move;
    hint: HintMove; deliveryState: 'paid_retrievable';
};
export type HintAttempt = { contextId: string; revision: number; requestId: string };
export type CrownHintRecovery = { context: CrownHintContext; attempt: HintAttempt };
export type SavedHintRecovery = { context: PaidHintContext; attempt: HintAttempt };
export type HintStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type HintRequest = (userId: string, path: string, body: unknown | undefined, signal?: AbortSignal) => Promise<unknown>;
export class PaidHintError extends Error {
    constructor(public readonly code: string) { super(code); }
}
export const isUuid = (value: unknown): value is string => typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const crownRecoveryKey = (userId: string) => `qg_last_crown_hint_v1:${encodeURIComponent(userId)}`;
const matchRecoveryKey = (userId: string) => `qg_last_match_hint_v1:${encodeURIComponent(userId)}`;
const referenceKey = (userId: string, context: PaidHintContext) => `qg_paid_hint_reference_v1:${encodeURIComponent(userId)}:${context.kind}:${context.mode}:${context.rulesVersion}:${encodeURIComponent(context.kind==='match'?context.matchId:context.runId)}`;

/** The room/mode identifies saved receipts even when no live snapshot exists. */
export function readMatchHintRecovery(userId: string, matchId: string, mode: MatchHintContext['mode'], storage?: HintStorage): SavedHintRecovery | null {
    if (!userId || /^(GUEST-|anon_)/i.test(userId)) return null;
    try {
        const savedStorage = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
        const context: MatchHintContext = { kind:'match',mode,matchId,contextId:'',rulesVersion:'match-hint-v1' };
        const saved = savedStorage?.getItem(referenceKey(userId,context));
        if (!saved) return null;
        const pointer = JSON.parse(saved) as HintAttempt;
        if (!isUuid(pointer.contextId)) throw new Error('invalid recovery');
        context.contextId=pointer.contextId;
        const attempt = new PaidHintClient(userId,context,requestHintApi,savedStorage).latestAttempt();
        if (!attempt) throw new Error('invalid recovery');
        return {context,attempt};
    } catch { throw new PaidHintError('REQUEST_STORAGE_UNAVAILABLE'); }
}
export function readLastMatchHintRecovery(userId: string, storage?: HintStorage): SavedHintRecovery | null {
    if (!userId || /^(GUEST-|anon_)/i.test(userId)) return null;
    try {
        const savedStorage = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
        const saved = savedStorage?.getItem(matchRecoveryKey(userId));
        if (!saved) return null;
        const pointer = JSON.parse(saved) as HintAttempt & {matchId:string;mode:MatchHintContext['mode'];rulesVersion:string};
        if (typeof pointer.matchId !== 'string' || !pointer.matchId || !['ranked','random','private'].includes(pointer.mode)
            || pointer.rulesVersion !== 'match-hint-v1') throw new Error('invalid recovery');
        const recovery = readMatchHintRecovery(userId,pointer.matchId,pointer.mode,savedStorage);
        if (!recovery || recovery.attempt.contextId!==pointer.contextId || recovery.attempt.revision!==pointer.revision
            || recovery.attempt.requestId!==pointer.requestId) throw new Error('invalid recovery');
        return recovery;
    } catch { throw new PaidHintError('REQUEST_STORAGE_UNAVAILABLE'); }
}

/** A reload can retrieve the previous receipt without opening or resuming a stage. */
export function readCrownHintRecovery(userId: string, storage?: HintStorage): CrownHintRecovery | null {
    if (!userId || /^(GUEST-|anon_)/i.test(userId)) return null;
    try {
        const savedStorage = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
        const saved = savedStorage?.getItem(crownRecoveryKey(userId));
        if (!saved) return null;
        const pointer = JSON.parse(saved) as { runId: string; contextId: string; revision: number; requestId: string; rulesVersion: string };
        if (!isUuid(pointer.runId) || !isUuid(pointer.contextId) || !isUuid(pointer.requestId)
            || !Number.isSafeInteger(pointer.revision) || pointer.revision < 0 || pointer.rulesVersion !== 'quantum-crown-v1') throw new Error('invalid recovery');
        const context: CrownHintContext = { kind: 'crown', mode: 'crown', runId: pointer.runId, contextId: pointer.contextId, rulesVersion: 'quantum-crown-v1' };
        const attempt = new PaidHintClient(userId, context, requestHintApi, savedStorage).latestAttempt();
        if (!attempt || attempt.contextId !== pointer.contextId || attempt.revision !== pointer.revision || attempt.requestId !== pointer.requestId) throw new Error('invalid recovery');
        return { context, attempt };
    } catch { throw new PaidHintError('REQUEST_STORAGE_UNAVAILABLE'); }
}

/** Browser storage supplies a credential; the server independently authorizes it. */
export const requestHintApi: HintRequest = async (userId, path, body, signal) => {
    signal?.throwIfAborted();
    let token = readRankedSession(userId)?.token;
    if (!token) {
        const { data, error } = await supabase.auth.getSession();
        const session = data.session;
        if (!error && session?.user.id === userId && !session.user.is_anonymous
            && (!session.expires_at || session.expires_at * 1000 > Date.now())) token = session.access_token;
    }
    if (!token) throw new PaidHintError('AUTH_REQUIRED');
    signal?.throwIfAborted();
    const endpoint = new URL(path, gameServerUrl());
    if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
        throw new PaidHintError('HINT_STORE_UNAVAILABLE');
    }
    const hintPurchase = body !== undefined && (path.startsWith('/match-hints/') || path.endsWith('/hints'));
    const timeout = hintPurchase ? qubeSearchProfile().timeLimitMs + 50000 : 20000;
    const response = await fetch(endpoint, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
        credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
    });
    const value = await response.json();
    if (!response.ok) throw new PaidHintError(typeof value?.code === 'string' ? value.code : 'HINT_STORE_UNAVAILABLE');
    signal?.throwIfAborted();
    return value;
};

/** Persist before POST. GET never creates an ID or requests a new purchase. */
export class PaidHintClient {
    private readonly prefix: string;
    private readonly referenceKey: string;
    private readonly inFlight = new Map<number, Promise<HintReceipt>>();
    private readonly storage?: HintStorage;
    constructor(readonly userId: string, readonly context: PaidHintContext,
        private readonly send: HintRequest = requestHintApi, storage?: HintStorage) {
        if (!userId || /^(GUEST-|anon_)/i.test(userId) || !isUuid(context.contextId)
            || (context.kind === 'match' ? !context.matchId : !isUuid(context.runId))) {
            throw new PaidHintError('AUTH_REQUIRED');
        }
        this.prefix = `qg_paid_hint_v1:${encodeURIComponent(userId)}:${context.contextId}`;
        this.referenceKey = referenceKey(userId,context);
        try { this.storage = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage); }
        catch { /* A purchase cannot start unless its ID can be saved. */ }
    }
    private read(key: string): string | null {
        try { return this.storage?.getItem(key) ?? null; }
        catch { throw new PaidHintError('REQUEST_STORAGE_UNAVAILABLE'); }
    }
    private save(key: string, value: string) {
        try {
            if (!this.storage) throw new Error('missing storage');
            this.storage.setItem(key, value);
            if (this.storage.getItem(key) !== value) throw new Error('write failed');
        } catch { throw new PaidHintError('REQUEST_STORAGE_UNAVAILABLE'); }
    }
    latestAttempt(): HintAttempt | null {
        const saved = this.read(this.referenceKey);
        if (!saved) return null;
        try {
            const attempt = JSON.parse(saved) as HintAttempt;
            if (Number.isSafeInteger(attempt.revision) && attempt.revision >= 0 && isUuid(attempt.requestId) && isUuid(attempt.contextId)
                && this.read(`qg_paid_hint_v1:${encodeURIComponent(this.userId)}:${attempt.contextId}:${attempt.revision}`) === attempt.requestId) return attempt;
        } catch { /* Never replace an unreadable purchase identity. */ }
        throw new PaidHintError('REQUEST_STORAGE_UNAVAILABLE');
    }
    private attempt(revision: number): HintAttempt {
        if (!Number.isSafeInteger(revision) || revision < 0) throw new PaidHintError('INVALID_REQUEST');
        const key = `${this.prefix}:${revision}`, saved = this.read(key);
        if (saved !== null && !isUuid(saved)) throw new PaidHintError('REQUEST_STORAGE_UNAVAILABLE');
        const requestId = saved ?? crypto.randomUUID();
        this.save(key, requestId);
        const attempt = { contextId: this.context.contextId, revision, requestId };
        this.save(this.referenceKey, JSON.stringify(attempt));
        if (this.context.kind === 'crown') this.save(crownRecoveryKey(this.userId),
            JSON.stringify({ ...attempt, runId: this.context.runId, rulesVersion: this.context.rulesVersion }));
        else this.save(matchRecoveryKey(this.userId),JSON.stringify({...attempt,matchId:this.context.matchId,mode:this.context.mode,rulesVersion:this.context.rulesVersion}));
        return attempt;
    }
    private receipt(value: unknown, revision: number, contextId = this.context.contextId): HintReceipt {
        const receipt = value as HintReceipt, move = receipt?.move;
        if (!isUuid(receipt?.receiptId) || receipt.contextId !== contextId
            || receipt.kind !== this.context.kind || receipt.mode !== this.context.mode || receipt.revision !== revision
            || receipt.rulesVersion !== this.context.rulesVersion || !receipt.stateHash || typeof receipt.stateHash !== 'string'
            || receipt.deliveryState !== 'paid_retrievable' || !isValidHintMove(receipt.hint)
            || !move || typeof move.pieceId !== 'string' || !move.pieceId || !move.target
            || move.target.row !== receipt.hint.toRow || move.target.col !== receipt.hint.toCol
            || (move.chosenType !== undefined && (!Number.isInteger(move.chosenType) || move.chosenType < 1 || move.chosenType > 63))
            || (move.promotionTarget !== undefined && move.promotionTarget !== receipt.hint.promotionTarget)) {
            throw new PaidHintError('HINT_RESPONSE_INVALID');
        }
        return receipt;
    }
    buy(revision: number, signal?: AbortSignal): Promise<HintReceipt> {
        const pending = this.inFlight.get(revision);
        if (pending) return pending;
        signal?.throwIfAborted();
        const attempt = this.attempt(revision);
        const path = this.context.kind === 'match' ? `/match-hints/${encodeURIComponent(this.context.matchId)}`
            : `/crown-hints/runs/${this.context.runId}/hints`;
        const promise = this.send(this.userId, path, {requestId:attempt.requestId,revision}, signal).then(value => {
            signal?.throwIfAborted();
            const receipt = this.receipt(value, revision);
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(DAILY_LOGIN_REWARD_CHANGED_EVENT,
                { detail: { userId: this.userId } }));
            return receipt;
        }).finally(() => { this.inFlight.delete(revision); });
        this.inFlight.set(revision, promise);
        return promise;
    }
    async recover(revision: number, signal?: AbortSignal, contextId = this.context.contextId): Promise<HintReceipt | null> {
        signal?.throwIfAborted();
        if (!isUuid(contextId) || !Number.isSafeInteger(revision) || revision < 0) throw new PaidHintError('INVALID_REQUEST');
        const requestId = this.read(`qg_paid_hint_v1:${encodeURIComponent(this.userId)}:${contextId}:${revision}`);
        if (requestId === null) return null;
        if (!isUuid(requestId)) throw new PaidHintError('REQUEST_STORAGE_UNAVAILABLE');
        const path = this.context.kind === 'match' ? `/match-hints/${contextId}/${revision}/${requestId}`
            : `/crown-hints/receipts/${contextId}/${revision}/${requestId}`;
        const value = await this.send(this.userId, path, undefined, signal);
        signal?.throwIfAborted();
        return value === null ? null : this.receipt(value, revision, contextId);
    }
}
