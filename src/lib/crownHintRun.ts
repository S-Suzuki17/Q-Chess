'use client';

import { isUuid, PaidHintError, requestHintApi, type HintRequest, type HintStorage } from './paidHints';
import type { GameState, Move } from '../quantum-engine/types';
import { createInitialState } from '../quantum-engine/initialState';
import { quantumToLegacyMove } from '../quantum-engine/adapter';
import { applyLocalMove, positionForDisplay } from './localGame';
import { recordReplayMove } from './replayHistory';
import type { MoveRecord } from './gameRecordService';

export type CrownRunSettings = { runId: string; stageId: number; playerSide: 'white' | 'black' };
export type CrownRunSnapshot = CrownRunSettings & {
    hintContextId: string;
    kind: 'crown'; strength: number; seconds: 10 | 180 | 600; rulesVersion: 'quantum-crown-v1';
    revision: number; stateHash: string; state: GameState; history: Move[];
    whiteMs: number; blackMs: number; status: 'active' | 'finished' | 'closed'; serverNow: number;
};

const receiptClocks = new WeakMap<CrownRunSnapshot, { receivedAt: number; serverNowAtReceipt: number }>();
export function crownRunClocks(run: CrownRunSnapshot, now = performance.now()) {
    const received = receiptClocks.get(run);
    const serverNow = received ? received.serverNowAtReceipt + Math.max(0, now - received.receivedAt) : run.serverNow;
    const elapsed = run.status === 'active' ? Math.max(0, serverNow - run.serverNow) : 0;
    return { whiteMs: Math.max(0,run.whiteMs-(run.state.sideToMove==='white'?elapsed:0)),
        blackMs: Math.max(0,run.blackMs-(run.state.sideToMove==='black'?elapsed:0)) };
}

/** The registry validates actual moves from the existing Crown CPU worker. */
export class CrownHintRunClient {
    private readonly storage?: HintStorage;
    constructor(readonly userId: string, readonly settings: CrownRunSettings,
        private readonly send: HintRequest = requestHintApi, storage?: HintStorage) {
        if (!isUuid(settings.runId) || !Number.isInteger(settings.stageId) || settings.stageId < 1 || settings.stageId > 100
            || !['white', 'black'].includes(settings.playerSide)) throw new PaidHintError('INVALID_REQUEST');
        try { this.storage = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage); } catch {}
    }
    private save(key: string, value: string) {
        try {
            if (!this.storage) throw new Error('missing storage');
            this.storage.setItem(key, value);
            if (this.storage.getItem(key) !== value) throw new Error('write failed');
        } catch { throw new PaidHintError('REQUEST_STORAGE_UNAVAILABLE'); }
    }
    private operation(revision: number, actor: 'human' | 'cpu', move: Move) {
        const key = `qg_crown_move_v1:${this.userId}:${this.settings.runId}:${revision}:${actor}:${JSON.stringify(move)}`;
        let saved: string | null;
        try { saved = this.storage?.getItem(key) ?? null; } catch { throw new PaidHintError('REQUEST_STORAGE_UNAVAILABLE'); }
        if (saved !== null && !isUuid(saved)) throw new PaidHintError('REQUEST_STORAGE_UNAVAILABLE');
        const id = saved ?? crypto.randomUUID(); this.save(key, id); return id;
    }
    private snapshot(value: unknown): CrownRunSnapshot {
        const run = value as CrownRunSnapshot, { runId, stageId, playerSide } = this.settings;
        if (run?.kind !== 'crown' || !isUuid(run.hintContextId) || run.runId !== runId || run.stageId !== stageId || run.playerSide !== playerSide
            || run.rulesVersion !== 'quantum-crown-v1' || run.strength !== Math.floor((stageId - 1) / 3) + 1
            || run.seconds !== [600, 180, 10][(stageId - 1) % 3] || typeof run.stateHash !== 'string' || !run.stateHash
            || !run.state || !Array.isArray(run.state.pieces) || !['white', 'black'].includes(run.state.sideToMove)
            || !Array.isArray(run.history) || run.revision !== run.history.length || run.state.ply !== run.revision
            || !['active', 'finished', 'closed'].includes(run.status)
            || ![run.whiteMs, run.blackMs, run.serverNow].every(value => Number.isFinite(value) && value >= 0)) {
            throw new PaidHintError('HINT_RESPONSE_INVALID');
        }
        return run;
    }
    private async load(path: string, body: unknown | undefined, signal?: AbortSignal) {
        const start=performance.now(), value=await this.send(this.userId,path,body,signal), receivedAt=performance.now();
        const run=this.snapshot(value);
        // Estimate server time at the request midpoint, independently of device clock skew.
        receiptClocks.set(run,{receivedAt,serverNowAtReceipt:run.serverNow+Math.max(0,receivedAt-start)/2});
        return run;
    }
    async open(signal?: AbortSignal) {
        this.save(`qg_crown_run_v1:${this.userId}:${this.settings.runId}`, JSON.stringify(this.settings));
        return this.load('/crown-hints/runs', this.settings, signal);
    }
    async read(signal?: AbortSignal) {
        return this.load(`/crown-hints/runs/${this.settings.runId}`, undefined, signal);
    }
    async advance(revision: number, actor: 'human' | 'cpu', move: Move, signal?: AbortSignal) {
        const body = { operationId: this.operation(revision, actor, move), revision, actor, move };
        return this.load(`/crown-hints/runs/${this.settings.runId}/moves`, body, signal);
    }
    async close() {
        return this.load(`/crown-hints/runs/${this.settings.runId}/close`, {});
    }
}

export function displayCrownRun(run: CrownRunSnapshot) {
    let state = createInitialState(), position = positionForDisplay(state);
    const history: MoveRecord[] = [];
    for (const accepted of run.history) {
        const move = quantumToLegacyMove(accepted, state), piece = state.pieces.find(value => value.id === accepted.pieceId);
        if (!piece) throw new PaidHintError('HINT_RESPONSE_INVALID');
        const result = applyLocalMove(position.tokens, position.pool, move, state.sideToMove, history);
        history.push(recordReplayMove({ turn: history.length + 1, player: state.sideToMove, tokenId: piece.id,
            from: [piece.position.row, piece.position.col], to: [accepted.target.row, accepted.target.col],
            possibleTypes: move.possibleTypes, capturedTokenId: result.capturedId, promotedTo: move.promotedTo }, position, result));
        state = result.state; position = result;
    }
    if (JSON.stringify(state.pieces) !== JSON.stringify(run.state.pieces) || state.sideToMove !== run.state.sideToMove
        || JSON.stringify(state.lastMove) !== JSON.stringify(run.state.lastMove)) throw new PaidHintError('HINT_RESPONSE_INVALID');
    return { ...positionForDisplay(run.state), history };
}
