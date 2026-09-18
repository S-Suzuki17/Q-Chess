import type { PieceType } from '../config/gameConfig';
import type { Token } from './GameEngine';
import { calculateProbabilities } from './GameEngine';
import { IdentityPool } from './IdentityPool';
import type { GameRecord, MoveRecord } from './gameRecordService';
import { createLocalPosition, applyLocalMove } from './localGame';
import { TYPE_TO_BIT } from '../quantum-engine/adapter';

/** Version 2 wire format: piece number, square (-1 captured), candidates, moved, promotion. */
export type ReplayChange = [number, number, number, 0 | 1, number];
export interface ReplayMoveRecord extends MoveRecord {
    replayVersion: 2;
    changes: ReplayChange[];
}
export interface ReplayPosition { tokens: Token[]; pool: IdentityPool }
export interface ReplayTimeline { positions: ReplayPosition[]; moves: MoveRecord[]; error: 'invalid' | 'missing' | null }
const TYPES = Object.keys(TYPE_TO_BIT) as PieceType[];
const PROMOTIONS = new Set<PieceType>(['Knight', 'Bishop', 'Rook', 'Queen']);
const LIMITS: Record<PieceType, number> = { Pawn: 8, Knight: 2, Bishop: 2, Rook: 2, Queen: 1, King: 1 };

function pieceNumber(id: unknown): number {
    if (typeof id !== 'string') throw new Error('Invalid replay piece');
    const match = /^(token_|b_|w_)([1-9]\d?)$/.exec(id);
    const n = Number(match?.[2]);
    if (!match || n > 32 || (match[1] === 'b_' && n > 16) || (match[1] === 'w_' && n <= 16)) throw new Error('Invalid replay piece');
    return n;
}
const canonicalId = (id: unknown) => `token_${pieceNumber(id)}`;
const candidates = (mask: number) => TYPES.filter(type => (mask & TYPE_TO_BIT[type]) !== 0);
const maskFor = (pool: IdentityPool, id: string) => [...(pool.piecePossibilities.get(id) ?? [])].reduce((mask, type) => mask | TYPE_TO_BIT[type], 0);

function packed(token: Token, pool: IdentityPool): ReplayChange {
    return [pieceNumber(token.id), token.isCaptured ? -1 : token.row * 8 + token.col,
        maskFor(pool, token.id), token.hasMoved ? 1 : 0, token.promotedTo ? TYPE_TO_BIT[token.promotedTo] : 0];
}

/** Capture the state that actually happened, not a second execution of chess rules. */
export function recordReplayMove(move: MoveRecord, before: ReplayPosition, after: ReplayPosition): ReplayMoveRecord {
    const previous = new Map(before.tokens.map(token => [pieceNumber(token.id), packed(token, before.pool)]));
    const changes = after.tokens.map(token => packed(token, after.pool)).filter(change => {
        const old = previous.get(change[0]);
        return !old || change.some((value, i) => old[i] !== value);
    });
    return { ...move, replayVersion: 2, changes };
}

function initialPosition(): ReplayPosition {
    const initial = createLocalPosition();
    const pool = new IdentityPool();
    const tokens = initial.tokens.map(token => {
        const id = canonicalId(token.id);
        pool.piecePossibilities.set(id, new Set(initial.pool.piecePossibilities.get(token.id)));
        return { ...token, id };
    });
    return { tokens, pool };
}

function square(value: unknown): [number, number] {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(n => Number.isInteger(n) && n >= 0 && n < 8)) throw new Error('Invalid replay square');
    return [value[0], value[1]];
}

function readMove(value: unknown, index: number): MoveRecord & { replayVersion?: unknown; changes?: unknown } {
    if (!value || typeof value !== 'object') throw new Error('Invalid replay move');
    const m = value as Record<string, unknown>;
    if (m.turn !== index + 1 || m.player !== (index % 2 === 0 ? 'white' : 'black') ||
        !Array.isArray(m.possibleTypes) || !m.possibleTypes.length || m.possibleTypes.length > 6 ||
        !m.possibleTypes.every(type => TYPES.includes(type as PieceType)) || new Set(m.possibleTypes).size !== m.possibleTypes.length ||
        (m.promotedTo !== undefined && !PROMOTIONS.has(m.promotedTo as PieceType))) throw new Error('Invalid replay move');
    const move = { ...m, from: square(m.from), to: square(m.to), tokenId: canonicalId(m.tokenId),
        ...(m.capturedTokenId === undefined ? {} : { capturedTokenId: canonicalId(m.capturedTokenId) }) } as unknown as MoveRecord & { replayVersion?: unknown; changes?: unknown };
    if (move.from[0] === move.to[0] && move.from[1] === move.to[1]) throw new Error('Invalid replay move');
    return move;
}

function checkSource(position: ReplayPosition, move: MoveRecord): Token {
    const source = position.tokens.find(token => token.id === move.tokenId);
    if (!source || source.isCaptured || source.player !== move.player || source.row !== move.from[0] || source.col !== move.from[1]) throw new Error('Replay source mismatch');
    const target = position.tokens.find(token => !token.isCaptured && token.row === move.to[0] && token.col === move.to[1]);
    if (target && (target.player === move.player || target.id !== move.capturedTokenId)) throw new Error('Replay capture mismatch');
    if (move.capturedTokenId) {
        const captured = position.tokens.find(token => token.id === move.capturedTokenId);
        if (!captured || captured.isCaptured || captured.player === move.player) throw new Error('Replay capture mismatch');
    }
    return source;
}

function withProbabilities(tokens: Token[], pool: IdentityPool): ReplayPosition {
    return { pool, tokens: tokens.map(token => ({ ...token, probabilities: calculateProbabilities(pool, token.id) })) };
}

function applyRecordedChanges(position: ReplayPosition, move: MoveRecord, value: unknown): ReplayPosition {
    if (!Array.isArray(value) || value.length < 1 || value.length > 32) throw new Error('Invalid replay changes');
    const changes = new Map<number, ReplayChange>();
    for (const tuple of value) {
        if (!Array.isArray(tuple) || tuple.length !== 5 || !tuple.every(Number.isInteger) || tuple[0] < 1 || tuple[0] > 32 ||
            tuple[1] < -1 || tuple[1] > 63 || tuple[2] < 0 || tuple[2] > 63 || ![0, 1].includes(tuple[3]) ||
            ![0, 2, 4, 8, 16].includes(tuple[4]) || changes.has(tuple[0])) throw new Error('Invalid replay change');
        changes.set(tuple[0], tuple as ReplayChange);
    }
    const moving = changes.get(pieceNumber(move.tokenId));
    if (!moving || moving[1] !== move.to[0] * 8 + move.to[1] || !moving[3]) throw new Error('Replay target mismatch');
    if (move.promotedTo && moving[4] !== TYPE_TO_BIT[move.promotedTo]) throw new Error('Replay promotion mismatch');
    const pool = position.pool.clone();
    const tokens = position.tokens.map(token => {
        const change = changes.get(pieceNumber(token.id));
        if (!change) return { ...token };
        const [, target, mask, moved, promoted] = change;
        if (token.isCaptured && target !== -1) throw new Error('Replay resurrects a piece');
        if (token.hasMoved && !moved) throw new Error('Replay resets a piece');
        if (token.promotedTo && promoted !== TYPE_TO_BIT[token.promotedTo]) throw new Error('Replay reverses promotion');
        pool.piecePossibilities.set(token.id, new Set(candidates(mask)));
        return { ...token, row: target < 0 ? -1 : Math.floor(target / 8), col: target < 0 ? -1 : target % 8,
            isCaptured: target < 0, hasMoved: !!moved, promotedTo: TYPES.find(type => TYPE_TO_BIT[type] === promoted) };
    });
    if (move.capturedTokenId && !tokens.find(token => token.id === move.capturedTokenId)?.isCaptured) throw new Error('Replay capture missing');
    const occupied = tokens.filter(token => !token.isCaptured).map(token => token.row * 8 + token.col);
    if (new Set(occupied).size !== occupied.length) throw new Error('Replay overlaps pieces');
    return withProbabilities(tokens, pool);
}

/** Legacy server logs use confirmed-count propagation, not the local subset solver. */
function applyLegacyOnline(position: ReplayPosition, move: MoveRecord): ReplayPosition {
    const pool = position.pool.clone();
    let tokens = position.tokens.map(token => ({ ...token }));
    const source = tokens.find(token => token.id === move.tokenId)!;
    pool.piecePossibilities.set(source.id, new Set(move.promotedTo || source.promotedTo ? ['Pawn'] : move.possibleTypes));
    if (move.capturedTokenId) {
        const captured = tokens.find(token => token.id === move.capturedTokenId)!;
        captured.isCaptured = true; captured.row = -1; captured.col = -1;
        // Online rules preserve the captured token's candidates. Do not apply local elimination here.
    }
    if (move.possibleTypes.includes('King') && Math.abs(move.to[1] - move.from[1]) === 2) {
        const rookCol = move.to[1] > move.from[1] ? 7 : 0;
        const rook = tokens.find(token => !token.isCaptured && token.player === move.player && token.row === move.from[0] && token.col === rookCol);
        if (!rook) throw new Error('Replay castle missing rook');
        rook.col = move.to[1] + (rookCol === 7 ? -1 : 1); rook.hasMoved = true;
        pool.piecePossibilities.set(rook.id, new Set(['Rook']));
    }
    source.row = move.to[0]; source.col = move.to[1]; source.hasMoved = true;
    source.promotedTo = move.promotedTo ?? source.promotedTo;
    // Use server piece order, since the historical server resolves newly confirmed counts sequentially.
    const serverOrder = (token: Token) => {
        const id = pieceNumber(token.id);
        return id > 16 ? (id > 24 ? 2 * (id - 25) : 2 * (id - 17) + 1)
            : (id > 8 ? 16 + 2 * (id - 9) : 17 + 2 * (id - 1));
    };
    for (const player of ['white', 'black'] as const) {
        for (let iteration = 0; iteration < 100; iteration++) {
            const counts: Record<PieceType, number> = { Pawn: 0, Knight: 0, Bishop: 0, Rook: 0, Queen: 0, King: 0 };
            for (const token of tokens.filter(t => t.player === player)) {
                const types = [...pool.piecePossibilities.get(token.id)!];
                if (types.length === 1) counts[token.promotedTo ? 'Pawn' : types[0]]++;
            }
            let changed = false;
            for (const token of [...tokens].sort((a, b) => serverOrder(a) - serverOrder(b))) {
                const types = [...pool.piecePossibilities.get(token.id)!];
                if (token.player !== player || token.isCaptured || types.length <= 1) continue;
                const remaining = types.filter(type => counts[type] < LIMITS[type]);
                if (remaining.length === types.length) continue;
                changed = true;
                if (remaining.length === 1) counts[remaining[0]]++;
                pool.piecePossibilities.set(token.id, new Set(remaining.length ? remaining : ['Pawn']));
            }
            if (!changed) break;
        }
    }
    tokens = withProbabilities(tokens, pool).tokens;
    return { tokens, pool };
}

/** Validate once and precompute frames; seeking never changes identities or reruns a live CPU. */
export function buildReplayTimeline(record: Pick<GameRecord, 'moves' | 'total_moves' | 'mode'>): ReplayTimeline {
    const empty = (): ReplayTimeline => ({ positions: [], moves: [], error: 'invalid' });
    if (!['cpu', 'private', 'random', 'ranked', 'ranked_cpu'].includes(record.mode)) return empty();
    if (!Array.isArray(record.moves) || record.moves.length > 5000 || !Number.isInteger(record.total_moves) || record.total_moves < 0) return empty();
    if (!record.moves.length && record.total_moves > 0) return { positions: [], moves: [], error: 'missing' };
    if (record.moves.length !== record.total_moves) return empty();
    const positions = [initialPosition()];
    const moves: MoveRecord[] = [];
    try {
        for (let index = 0; index < record.moves.length; index++) {
            const raw = record.moves[index];
            const move = readMove(raw, index);
            const current = positions.at(-1)!;
            checkSource(current, move);
            let next: ReplayPosition;
            if (move.replayVersion === 2) next = applyRecordedChanges(current, move, move.changes);
            else if (move.replayVersion !== undefined || move.changes !== undefined) throw new Error('Unsupported replay version');
            else if (/^[bw]_/.test(raw.tokenId) || record.mode === 'cpu') {
                const result = applyLocalMove(current.tokens, current.pool, {
                    tokenId: move.tokenId, targetRow: move.to[0], targetCol: move.to[1], possibleTypes: move.possibleTypes, promotedTo: move.promotedTo
                }, move.player, moves);
                if (result.capturedId !== move.capturedTokenId) throw new Error('Replay capture mismatch');
                next = { tokens: result.tokens, pool: result.pool };
            } else next = applyLegacyOnline(current, move);
            positions.push(next); moves.push(move);
        }
        return { positions, moves, error: null };
    } catch { return empty(); }
}
