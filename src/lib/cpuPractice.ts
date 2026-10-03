'use client';

import { supabase } from './supabaseClient';
import { gameServerUrl, readRankedSession } from './rankedSession';
import { DAILY_LOGIN_REWARD_CHANGED_EVENT } from './dailyLoginRewards';
import { CPU_PRACTICE_RULES_VERSION, type CpuPracticeSnapshot } from '../quantum-engine/practice';
import { createInitialState } from '../quantum-engine/initialState';
import { quantumToLegacyMove } from '../quantum-engine/adapter';
import { applyLocalMove, positionForDisplay } from './localGame';
import { recordReplayMove } from './replayHistory';
import type { Move } from '../quantum-engine/types';
import type { MoveRecord } from './gameRecordService';
import type { HintMove } from '../components/boardPresentation';

/** Explicit public build opt-in; server enforcement is independent. */
export const CPU_HINT_TICKETS_ENABLED = process.env.NEXT_PUBLIC_QG_CPU_HINT_TICKETS_ENABLED === 'true';
export type PracticeSettings = { playerSide: 'white' | 'black'; level: 1 | 3 | 5; seconds: 10 | 180 | 600 };
export type CpuHintReceipt = { receiptId: string; sessionId: string; revision: number; stateHash: string;
    rulesVersion: string; hint: HintMove; move: Move; deliveryState: 'paid_retrievable' };
export class CpuPracticeClientError extends Error {
    constructor(public readonly code: string) { super(code); }
}
export function officialCpuPractice(props: { roomId?: string; matchMode?: string; campaignLabel?: string;
    cpuPersonality?: unknown; cpuSearchProfile?: unknown; onComplete?: unknown; onlineRole?: string }) {
    return !props.roomId && !props.matchMode && !props.campaignLabel && !props.cpuPersonality
        && !props.cpuSearchProfile && !props.onComplete && props.onlineRole !== 'spectator';
}
export type PracticeRequest = (userId: string, path: string, body: unknown | undefined, signal?: AbortSignal) => Promise<unknown>;
async function request(userId: string, path: string, body: unknown | undefined, signal?: AbortSignal) {
    signal?.throwIfAborted();
    let token = readRankedSession(userId)?.token;
    if (!token) {
        const { data, error } = await supabase.auth.getSession();
        const session = data.session;
        if (!error && session?.user.id === userId && !session.user.is_anonymous &&
            (!session.expires_at || session.expires_at * 1000 > Date.now())) token = session.access_token;
    }
    if (!token) throw new CpuPracticeClientError('AUTH_REQUIRED');
    signal?.throwIfAborted();
    const endpoint = new URL(path, gameServerUrl());
    if (endpoint.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)) {
        throw new CpuPracticeClientError('CPU_PRACTICE_UNAVAILABLE');
    }
    const response = await fetch(endpoint, { method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
        credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
    const value = await response.json();
    if (!response.ok) throw new CpuPracticeClientError(typeof value?.code === 'string' ? value.code : 'CPU_PRACTICE_UNAVAILABLE');
    signal?.throwIfAborted(); return value;
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);

/** IDs are persisted before dispatch so an ambiguous response can be retried. */
export class CpuPracticeClient {
    readonly sessionId: string;
    private key: string;
    constructor(readonly userId: string, readonly settings: PracticeSettings,
        private send: PracticeRequest = request, private storage?: Pick<Storage,'getItem'|'setItem'|'removeItem'>) {
        this.storage ??= typeof window === 'undefined' ? undefined : window.sessionStorage;
        this.key = `qg_cpu_practice_v1:${userId}:${settings.playerSide}:${settings.level}:${settings.seconds}`;
        const saved = this.storage?.getItem(this.key);
        this.sessionId = uuid(saved) ? saved : crypto.randomUUID();
        this.storage?.setItem(this.key, this.sessionId);
    }
    private id(key: string) {
        const storageKey = `qg_cpu_practice_request_v1:${this.userId}:${this.sessionId}:${key}`;
        const saved = this.storage?.getItem(storageKey);
        if (uuid(saved)) return saved;
        const id = crypto.randomUUID(); this.storage?.setItem(storageKey,id); return id;
    }
    private snapshot(value: unknown): CpuPracticeSnapshot {
        const session = value as CpuPracticeSnapshot;
        if (session?.sessionId !== this.sessionId || session.userId !== this.userId || session.kind !== 'cpu_practice'
            || session.rulesVersion !== CPU_PRACTICE_RULES_VERSION || !session.state || !Array.isArray(session.history)
            || session.revision !== session.history.length || session.state.ply !== session.revision) {
            throw new CpuPracticeClientError('CPU_PRACTICE_UNAVAILABLE');
        }
        return session;
    }
    async open(signal?: AbortSignal) {
        return this.snapshot(await this.send(this.userId,'/cpu-practice/sessions',{sessionId:this.sessionId,...this.settings},signal));
    }
    async read(signal?: AbortSignal) {
        return this.snapshot(await this.send(this.userId,`/cpu-practice/sessions/${this.sessionId}`,undefined,signal));
    }
    async advance(revision: number, actor: 'human' | 'cpu', move?: Move, signal?: AbortSignal) {
        // The server accepts only a single human move, never a board or history.
        const body = {revision,actor,operationId:this.id(`move:${revision}:${actor}:${JSON.stringify(move ?? null)}`),
            ...(move ? {move} : {})};
        return this.snapshot(await this.send(this.userId,`/cpu-practice/sessions/${this.sessionId}/moves`,body,signal));
    }
    async hint(revision: number, signal?: AbortSignal): Promise<HintMove> {
        const requestId = this.id(`hint:${revision}`);
        const receipt = await this.send(this.userId,`/cpu-practice/sessions/${this.sessionId}/hints`,{requestId,revision},signal) as CpuHintReceipt;
        if (receipt?.sessionId !== this.sessionId || receipt.revision !== revision || receipt.rulesVersion !== CPU_PRACTICE_RULES_VERSION
            || receipt.deliveryState !== 'paid_retrievable') throw new CpuPracticeClientError('CPU_PRACTICE_UNAVAILABLE');
        if(typeof window!=='undefined')window.dispatchEvent(new Event(DAILY_LOGIN_REWARD_CHANGED_EVENT));
        return receipt.hint;
    }
    async recover(revision: number, signal?: AbortSignal): Promise<HintMove|null> {
        const requestId=this.id(`hint:${revision}`);
        const receipt=await this.send(this.userId,`/cpu-practice/sessions/${this.sessionId}/hints/${revision}/${requestId}`,undefined,signal) as CpuHintReceipt|null;
        if(!receipt)return null;
        if(receipt.sessionId!==this.sessionId||receipt.revision!==revision||receipt.rulesVersion!==CPU_PRACTICE_RULES_VERSION
            ||receipt.deliveryState!=='paid_retrievable')throw new CpuPracticeClientError('CPU_PRACTICE_UNAVAILABLE');
        return receipt.hint;
    }
    async close() {
        const value = await this.send(this.userId,`/cpu-practice/sessions/${this.sessionId}/close`,{});
        this.forget(); return this.snapshot(value);
    }
    forget() { this.storage?.removeItem(this.key); }
}

/** Rebuild display history from server-accepted moves after reconnect/restart. */
export function displayCpuPractice(session: CpuPracticeSnapshot) {
    let state = createInitialState(), position = positionForDisplay(state);
    const history: MoveRecord[] = [];
    for (const accepted of session.history) {
        const move = quantumToLegacyMove(accepted,state);
        const piece = state.pieces.find(p => p.id === accepted.pieceId)!;
        const result = applyLocalMove(position.tokens,position.pool,move,state.sideToMove,history);
        history.push(recordReplayMove({turn:history.length+1,player:state.sideToMove,tokenId:piece.id,
            from:[piece.position.row,piece.position.col],to:[accepted.target.row,accepted.target.col],
            possibleTypes:move.possibleTypes,capturedTokenId:result.capturedId,promotedTo:move.promotedTo},position,result));
        state = result.state; position = result;
    }
    // Server owns the snapshot; the replay reconstructs only presentation metadata.
    return {...positionForDisplay(session.state),history};
}
