import { createHash, randomUUID } from 'node:crypto';
import { createInitialState } from '../quantum-engine/initialState';
import { applyPracticeMove } from '../quantum-engine/practice';
import { circuitSearchProfile } from '../quantum-engine/ai/searchProfiles';
import type { GameState, Move } from '../quantum-engine/types';
import { isRankedUserId } from './RankedAuth';

export const CROWN_HINT_RULES_VERSION = 'quantum-crown-v1';
export type CrownSide = 'white' | 'black';
export class CrownHintError extends Error {
    constructor(public readonly code: string) { super(code); }
}
export const isCrownId = (value: unknown): value is string => typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const canonical = (value: any): string => value === null || typeof value !== 'object' ? JSON.stringify(value)
    : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).filter(key => value[key] !== undefined).sort()
        .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
export const hashCrownState = (state: GameState) => createHash('sha256')
    .update(CROWN_HINT_RULES_VERSION + ':' + canonical(state)).digest('hex');

/** Input is a move, never a caller supplied board, clock, identity or history. */
export function parseCrownMove(value: unknown): Move {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CrownHintError('INVALID_MOVE');
    const row = value as Record<string, any>, target = row.target;
    if (Object.keys(row).some(key => !['pieceId', 'target', 'chosenType', 'promotionTarget'].includes(key))
        || typeof row.pieceId !== 'string' || !/^[wb]_[1-9][0-9]?$/.test(row.pieceId)
        || !target || typeof target !== 'object' || Array.isArray(target)
        || Object.keys(target).some(key => !['row', 'col'].includes(key))
        || !Number.isInteger(target.row) || !Number.isInteger(target.col)
        || target.row < 0 || target.row > 7 || target.col < 0 || target.col > 7
        || (row.chosenType !== undefined && (!Number.isInteger(row.chosenType) || row.chosenType < 1 || row.chosenType > 63))
        || (row.promotionTarget !== undefined && ![2, 4, 8, 16].includes(row.promotionTarget))) {
        throw new CrownHintError('INVALID_MOVE');
    }
    return { pieceId: row.pieceId, target: { row: target.row, col: target.col },
        ...(row.chosenType !== undefined ? { chosenType: row.chosenType } : {}),
        ...(row.promotionTarget !== undefined ? { promotionTarget: row.promotionTarget } : {}) };
}
export function crownStage(stageId: unknown) {
    if (!Number.isInteger(stageId) || (stageId as number) < 1 || (stageId as number) > 100) {
        throw new CrownHintError('INVALID_REQUEST');
    }
    const strength = Math.floor(((stageId as number) - 1) / 3) + 1;
    const seconds = ([600, 180, 10] as const)[((stageId as number) - 1) % 3];
    return { stageId: stageId as number, strength, seconds, search: circuitSearchProfile(strength) };
}
export interface CrownHintSnapshot {
    kind: 'crown'; runId: string; hintContextId: string; stageId: number; playerSide: CrownSide;
    strength: number; seconds: 10 | 180 | 600; rulesVersion: string;
    revision: number; stateHash: string; state: GameState; history: Move[];
    whiteMs: number; blackMs: number; status: 'active' | 'finished';
    finishReason: 'timeout' | 'closed' | 'game' | null; serverNow: number;
}
interface CrownRun {
    runId: string; hintContextId: string; userId: string; stageId: number; playerSide: CrownSide;
    strength: number; seconds: 10 | 180 | 600; state: GameState; history: Move[];
    whiteMs: number; blackMs: number; lastClockAt: number;
    status: 'active' | 'finished'; finishReason: CrownHintSnapshot['finishReason'];
    operationIds: Set<string>;
}
type Operation = { intent: string; runId: string; userId: string };
export interface CrownHintRegistryOptions {
    now?: () => number;
    maxRuns?: number;
    maxOperations?: number;
}

/** Process-local game authority, like existing online engines. Receipt durability
 * belongs to HintTicketStore. A restart cannot reconstruct a run from a browser
 * board. Locally generated CPU moves are legal-checked, not strength attestation. */
export class CrownHintRegistry {
    private readonly runs = new Map<string, CrownRun>();
    private readonly operations = new Map<string, Operation>();
    private readonly hintLocks = new Map<string, symbol>();
    private readonly now: () => number;
    private readonly maxRuns: number;
    private readonly maxOperations: number;
    constructor(options: CrownHintRegistryOptions = {}) {
        this.now = options.now ?? Date.now;
        this.maxRuns = options.maxRuns ?? 10_000;
        this.maxOperations = options.maxOperations ?? 1_000_000;
        if (!Number.isSafeInteger(this.maxRuns) || this.maxRuns < 1
            || !Number.isSafeInteger(this.maxOperations) || this.maxOperations < 1) throw new RangeError('Invalid Crown capacity');
    }
    private blocked(runId: string) { return this.hintLocks.has(runId); }
    private ids(userId: unknown, runId: unknown) {
        if (!isRankedUserId(userId) || !isCrownId(runId)) throw new CrownHintError('INVALID_REQUEST');
    }
    private run(userId: string, runId: string): CrownRun {
        this.ids(userId, runId);
        const run = this.runs.get(runId.toLowerCase());
        if (!run || run.userId !== userId) throw new CrownHintError('SESSION_NOT_FOUND');
        this.tick(run); return run;
    }
    private tick(run: CrownRun) {
        const now = Math.max(run.lastClockAt, this.now());
        if (run.status === 'active') {
            const elapsed = now - run.lastClockAt, side = run.state.sideToMove;
            if (side === 'white') run.whiteMs = Math.max(0, run.whiteMs - elapsed);
            else run.blackMs = Math.max(0, run.blackMs - elapsed);
            if ((side === 'white' ? run.whiteMs : run.blackMs) === 0) {
                run.status = 'finished'; run.finishReason = 'timeout';
                run.state = { ...run.state, winner: side === 'white' ? 'black' : 'white' };
            }
        }
        run.lastClockAt = now;
    }
    private snapshot(run: CrownRun): CrownHintSnapshot {
        return { kind: 'crown', runId: run.runId, hintContextId: run.hintContextId, stageId: run.stageId, playerSide: run.playerSide,
            strength: run.strength, seconds: run.seconds, rulesVersion: CROWN_HINT_RULES_VERSION,
            revision: run.state.ply, stateHash: hashCrownState(run.state),
            state: structuredClone(run.state), history: structuredClone(run.history),
            whiteMs: run.whiteMs, blackMs: run.blackMs, status: run.status,
            finishReason: run.finishReason, serverNow: run.lastClockAt };
    }
    private reclaimFinished() {
        // Map insertion order is oldest first. Never remove a live run or a
        // context whose dispatched purchase still needs a definitive result.
        for (const [id, run] of this.runs) {
            this.tick(run);
            if (run.status !== 'finished' || this.blocked(id)) continue;
            this.runs.delete(id);
            for (const operationId of run.operationIds) this.operations.delete(operationId);
            if (this.runs.size < this.maxRuns && this.operations.size < this.maxOperations) break;
        }
    }
    /** The router verifies current identity before this method. Same run intent
     * recovers a lost response without restarting the clock or resetting history. */
    open(userId: string, runId: string, stageId: unknown, playerSide: CrownSide): CrownHintSnapshot {
        this.ids(userId, runId); const stage = crownStage(stageId);
        runId = runId.toLowerCase();
        if (!['white', 'black'].includes(playerSide)) throw new CrownHintError('INVALID_REQUEST');
        const existing = this.runs.get(runId);
        if (existing) {
            if (existing.userId !== userId || existing.stageId !== stage.stageId || existing.playerSide !== playerSide) {
                throw new CrownHintError('REQUEST_MISMATCH');
            }
            this.tick(existing); return this.snapshot(existing);
        }
        for (const run of this.runs.values()) {
            if (run.userId !== userId) continue;
            this.tick(run);
            if (run.status === 'active' || this.blocked(run.runId)) throw new CrownHintError('ACCOUNT_BUSY');
        }
        if (this.runs.size >= this.maxRuns || this.operations.size >= this.maxOperations) this.reclaimFinished();
        if (this.runs.size >= this.maxRuns) throw new CrownHintError('SESSION_LIMIT');
        const run: CrownRun = { runId, hintContextId: randomUUID(), userId, ...stage, playerSide, state: createInitialState(), history: [],
            whiteMs: stage.seconds * 1000, blackMs: stage.seconds * 1000, lastClockAt: this.now(),
            status: 'active', finishReason: null, operationIds: new Set() };
        this.runs.set(runId, run); return this.snapshot(run);
    }
    read(userId: string, runId: string) { return this.snapshot(this.run(userId, runId)); }
    advance(userId: string, runId: string, revision: unknown, operationId: unknown,
        actor: unknown, input: unknown): CrownHintSnapshot {
        this.ids(userId, runId);
        if (!Number.isSafeInteger(revision) || (revision as number) < 0 || !isCrownId(operationId)
            || !['human', 'cpu'].includes(actor as string)) throw new CrownHintError('INVALID_REQUEST');
        runId = runId.toLowerCase(); const id = operationId.toLowerCase();
        const move = parseCrownMove(input), intent = digest({ userId, runId, revision, actor, move });
        const prior = this.operations.get(id);
        if (prior) {
            if (prior.intent !== intent) throw new CrownHintError('REQUEST_MISMATCH');
            return this.read(userId, runId);
        }
        const run = this.run(userId, runId);
        if (run.state.ply !== revision) throw new CrownHintError('STALE_REVISION');
        if (run.status !== 'active' || run.state.winner) throw new CrownHintError('SESSION_FINISHED');
        if ((run.state.sideToMove === run.playerSide) !== (actor === 'human')) throw new CrownHintError('NOT_YOUR_TURN');
        if (this.blocked(run.runId)) throw new CrownHintError('HINT_PURCHASE_PENDING');
        if (this.operations.size >= this.maxOperations) this.reclaimFinished();
        if (this.operations.size >= this.maxOperations) throw new CrownHintError('SESSION_LIMIT');
        let next: GameState;
        try { next = applyPracticeMove(run.state, move); }
        catch { throw new CrownHintError('INVALID_MOVE'); }
        // Legal validation is synchronous; its time still belongs to this turn.
        this.tick(run);
        if (run.status !== 'active') throw new CrownHintError('SESSION_FINISHED');
        const side = run.state.sideToMove;
        if (run.seconds === 10) {
            if (side === 'white') run.whiteMs = 10_000;
            else run.blackMs = 10_000;
        }
        run.state = next; run.history.push(structuredClone(next.lastMove!));
        if (next.winner) { run.status = 'finished'; run.finishReason = 'game'; }
        this.operations.set(id, { intent, runId, userId });
        run.operationIds.add(id);
        return this.snapshot(run);
    }
    close(userId: string, runId: string) {
        const run = this.run(userId, runId);
        if (run.status !== 'active') return this.snapshot(run);
        if (this.blocked(run.runId)) throw new CrownHintError('HINT_PURCHASE_PENDING');
        run.status = 'finished'; run.finishReason = 'closed';
        return this.snapshot(run);
    }
    /** Always fresh: stale analysis cannot extend a clock or authorize dispatch. */
    hintSnapshot(userId: string, runId: string, revision: unknown) {
        if (!Number.isSafeInteger(revision) || (revision as number) < 0) throw new CrownHintError('INVALID_REQUEST');
        const run = this.run(userId, runId);
        if (run.state.ply !== revision) throw new CrownHintError('STALE_REVISION');
        if (run.status !== 'active' || run.state.winner) throw new CrownHintError('SESSION_FINISHED');
        if (run.state.sideToMove !== run.playerSide) throw new CrownHintError('NOT_YOUR_TURN');
        const snapshot = this.snapshot(run);
        const remainingMs = run.playerSide === 'white' ? run.whiteMs : run.blackMs;
        return { ...snapshot, userId, remainingMs, validUntilMs: run.lastClockAt + remainingMs };
    }
    /** Only parent purchase/recovery code releases this fence. It does not pause
     * time, block timeout finalization or depend on HTTP socket lifetime. */
    acquireHint(userId: string, runId: string, revision: number, stateHash: string): () => void {
        const current = this.hintSnapshot(userId, runId, revision);
        if (current.stateHash !== stateHash) throw new CrownHintError('STALE_REVISION');
        if (this.blocked(current.runId)) throw new CrownHintError('HINT_PURCHASE_PENDING');
        const lock = Symbol(); this.hintLocks.set(current.runId, lock);
        return () => { if (this.hintLocks.get(current.runId) === lock) this.hintLocks.delete(current.runId); };
    }
    isBusy(userId: string) {
        for (const run of this.runs.values()) if (run.userId === userId) {
            this.tick(run);
            if (this.blocked(run.runId)) return true;
        }
        return false;
    }
    owns(userId: string, runId: string) { this.run(userId, runId); return true; }
}
