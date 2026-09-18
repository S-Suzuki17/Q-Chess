import type { Piece } from './GameEngine';

/** Same version-2 compact replay wire format as src/lib/replayHistory.ts. */
type ReplayChange = [number, number, number, 0 | 1, number];
const BITS: Record<string, number> = { P: 1, N: 2, B: 4, R: 8, Q: 16, K: 32 };
export const replayPieceNumber = (id: number) => id < 16
    ? (id % 2 === 0 ? 25 : 17) + Math.floor(id / 2)
    : (id % 2 === 0 ? 9 : 1) + Math.floor((id - 16) / 2);
export const replayPieceId = (id: number) => `token_${replayPieceNumber(id)}`;
const packed = (piece: Piece): ReplayChange => [replayPieceNumber(piece.id), piece.captured ? -1 : (7 - piece.y) * 8 + piece.x,
    piece.promoted ? BITS.P : piece.possibilities.reduce((mask, type) => mask | BITS[type], 0),
    piece.hasMoved ? 1 : 0, piece.promoted ? BITS[piece.possibilities[0]] : 0];

export function recordReplayChanges(before: readonly Piece[], after: readonly Piece[]): ReplayChange[] {
    const old = new Map(before.map(piece => [piece.id, packed(piece)]));
    return after.flatMap(piece => {
        const current = packed(piece), previous = old.get(piece.id);
        return !previous || current.some((value, index) => value !== previous[index]) ? [current] : [];
    });
}
