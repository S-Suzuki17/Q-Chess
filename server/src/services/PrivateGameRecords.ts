import { isRankedUserId } from './RankedAuth';

export const PRIVATE_RECORD_LIMIT = 10;
export const MAX_LOCAL_RECORD_BYTES = 2 * 1024 * 1024;
export const MAX_LOCAL_MOVES = 5000;
export const RECORD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PrivateGameRecord {
    id: string;
    white_id?: string | null;
    black_id?: string | null;
    replay_expired?: boolean;
    [key: string]: unknown;
}
export interface PrivateGameStats {
    totalGames: number; wins: number; losses: number; draws: number;
    whiteGames: number; whiteWins: number; blackGames: number; blackWins: number;
}
export interface LocalGameRecord {
    id: string;
    white_id: string | null;
    black_id: string | null;
    white_player: string;
    black_player: string;
    winner: 'white_wins' | 'black_wins' | 'draw';
    mode: 'cpu' | 'private';
    cpu_level: number | null;
    time_control: '10m' | '3m' | '10s';
    moves: Record<string, unknown>[];
    total_moves: number;
}

const TYPES = new Set(['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn']);
const PROMOTIONS = new Set(['Queen', 'Rook', 'Bishop', 'Knight']);
const tokenId = (value: unknown) => typeof value === 'string'
    && /^(?:token_(?:[1-9]|[12]\d|3[0-2])|b_(?:[1-9]|1[0-6])|w_(?:1[7-9]|2\d|3[0-2]))$/.test(value);
const square = (value: unknown) => Array.isArray(value) && value.length === 2 && value.every(n => Number.isInteger(n) && n >= 0 && n <= 7);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

// Preserve additional JSON move metadata, including versioned replay deltas,
// while rejecting pathological nesting before later JSON serialization.
function boundedJson(value: unknown): boolean {
    const pending = [{ value, depth: 0 }];
    let count = 0;
    while (pending.length) {
        const next = pending.pop()!;
        if (++count > 1_000_000 || next.depth > 20) return false;
        if (typeof next.value === 'number' && !Number.isFinite(next.value)) return false;
        if (next.value && typeof next.value === 'object') {
            for (const item of Object.values(next.value)) pending.push({ value: item, depth: next.depth + 1 });
        } else if (!['string', 'number', 'boolean'].includes(typeof next.value) && next.value !== null) return false;
    }
    return true;
}

function validMove(move: unknown, index: number): move is Record<string, unknown> {
    if (!object(move) || move.turn !== index + 1 || move.player !== (index % 2 === 0 ? 'white' : 'black')
        || !tokenId(move.tokenId) || !square(move.from) || !square(move.to)
        || !Array.isArray(move.possibleTypes) || move.possibleTypes.length < 1 || move.possibleTypes.length > 6
        || !move.possibleTypes.every(type => TYPES.has(type)) || new Set(move.possibleTypes).size !== move.possibleTypes.length
        || (move.capturedTokenId !== undefined && !tokenId(move.capturedTokenId))
        || (move.promotedTo !== undefined && !PROMOTIONS.has(move.promotedTo as string))) return false;
    if (move.replayVersion !== undefined || move.changes !== undefined) {
        if (move.replayVersion !== 2 || !Array.isArray(move.changes) || move.changes.length > 32) return false;
        const ids = new Set<number>();
        for (const change of move.changes) {
            if (!Array.isArray(change) || change.length !== 5 || !change.every(Number.isInteger)) return false;
            const [id, position, mask, moved, promotion] = change as number[];
            if (id < 1 || id > 32 || ids.has(id) || position < -1 || position > 63
                || mask < 0 || mask > 63 || ![0, 1].includes(moved) || ![0, 2, 4, 8, 16].includes(promotion)) return false;
            ids.add(id);
        }
    }
    return true;
}

/** Local saves are untrusted, self-only unrated history, never a settlement instruction. */
export function parseLocalGameRecord(value: unknown, userId: string): LocalGameRecord | null {
    if (!isRankedUserId(userId) || !object(value) || !['cpu','private'].includes(value.mode as string)
        || typeof value.id !== 'string' || !RECORD_ID_PATTERN.test(value.id)
        || !['white_wins', 'black_wins', 'draw'].includes(value.winner as string)
        || !['10m', '3m', '10s'].includes(value.time_control as string)
        || !Array.isArray(value.moves) || value.moves.length > MAX_LOCAL_MOVES
        || value.total_moves !== value.moves.length
        || !boundedJson(value.moves) || !value.moves.every(validMove)) return null;
    const opponentId = value.mode === 'cpu' ? 'ai' : null;
    if (!((value.white_id === userId && value.black_id === opponentId) || (value.black_id === userId && value.white_id === opponentId))) return null;
    if (value.mode === 'cpu') {
        if (!Number.isInteger(value.cpu_level) || (value.cpu_level as number) < 1 || (value.cpu_level as number) > 100) return null;
    } else if (value.cpu_level !== null && value.cpu_level !== undefined) return null;
    try { if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_LOCAL_RECORD_BYTES) return null; }
    catch { return null; }
    // Display names are replaced by the server's actual profile / CPU labels.
    return {
        id: value.id.toLowerCase(), white_id: value.white_id as string | null, black_id: value.black_id as string | null,
        white_player: '', black_player: '', winner: value.winner as LocalGameRecord['winner'], mode: value.mode as LocalGameRecord['mode'],
        cpu_level: value.mode === 'cpu' ? value.cpu_level as number : null, time_control: value.time_control as LocalGameRecord['time_control'],
        moves: value.moves as Record<string, unknown>[], total_moves: value.moves.length,
    };
}
