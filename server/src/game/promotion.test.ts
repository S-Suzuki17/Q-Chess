import { describe, expect, it } from 'vitest';
import { GameEngine, type Piece } from './GameEngine';
import { attemptLegalMove, countCapturedPieces, countConfirmedPieces, isCheckmate, isKingInCheck } from './quantumChess';

const piece = (id: number, team: number, x: number, y: number, possibilities: string[]): Piece =>
    ({ id, team, x, y, possibilities, captured: false, hasMoved: true });
function position(pieces: Piece[]) {
    const board: (number | null)[] = Array(64).fill(null);
    for (const p of pieces) if (!p.captured) board[p.y * 8 + p.x] = p.id;
    return { board, pieces };
}

describe('authoritative promotion', () => {
    it.each(['Q', 'R', 'B', 'N'])('promotes a white pawn to %s and keeps the input immutable', target => {
        const state = position([piece(0, 0, 0, 0, ['K']), piece(1, 0, 2, 6, ['P', 'Q']), piece(2, 1, 7, 7, ['K'])]);
        const before = JSON.stringify(state);
        const next = attemptLegalMove(state.pieces, state.board, 1, 2, 7, undefined, target);
        expect(next.success).toBe(true);
        expect(next.pieces.find(p => p.id === 1)).toMatchObject({ promoted: true, possibilities: [target] });
        expect(JSON.stringify(state)).toBe(before);
    });

    it('promotes Black in its own forward direction and defaults missing choices to Queen', () => {
        const state = position([piece(0, 0, 7, 0, ['K']), piece(1, 1, 2, 1, ['P']), piece(2, 1, 0, 7, ['K'])]);
        const next = attemptLegalMove(state.pieces, state.board, 1, 2, 0);
        expect(next.success).toBe(true);
        expect(next.pieces.find(p => p.id === 1)).toMatchObject({ promoted: true, possibilities: ['Q'] });
    });

    it('rejects invalid choices and requests whose move is not a pawn promotion', () => {
        const state = position([piece(0, 0, 0, 0, ['K']), piece(1, 0, 2, 6, ['P', 'Q']), piece(2, 1, 7, 7, ['K'])]);
        for (const invalid of ['K', 'P', 'Queen', '', '__proto__']) {
            expect(attemptLegalMove(state.pieces, state.board, 1, 2, 7, undefined, invalid).success).toBe(false);
        }
        expect(attemptLegalMove(state.pieces, state.board, 1, 3, 7, undefined, 'Q').success).toBe(false);
        expect(attemptLegalMove(state.pieces, state.board, 1, 2, 5, undefined, 'Q').success).toBe(false);
    });

    it('retains Pawn quota identity without consuming the original Queen identity', () => {
        const state = position([piece(0, 0, 0, 0, ['K']), piece(1, 0, 4, 6, ['P']), piece(2, 1, 7, 7, ['K']), piece(3, 0, 0, 1, ['Q', 'R'])]);
        const next = attemptLegalMove(state.pieces, state.board, 1, 4, 7, undefined, 'Q');
        expect(next.success).toBe(true);
        expect(next.pieces.find(p => p.id === 3).possibilities).toEqual(['Q', 'R']);
        expect(countConfirmedPieces(next.pieces, 0)).toMatchObject({ P: 1, Q: 0 });
        const captured = next.pieces.map(p => p.id === 1 ? { ...p, captured: true } : p);
        expect(countCapturedPieces(captured, 0)).toMatchObject({ P: 1, Q: 0 });
    });

    it('uses promoted attacks when checking king safety and later queen moves', () => {
        const state = position([piece(0, 0, 3, 0, ['K']), piece(1, 0, 0, 6, ['P']), piece(2, 1, 7, 6, ['K'])]);
        const promoted = attemptLegalMove(state.pieces, state.board, 1, 0, 7, undefined, 'Q');
        expect(attemptLegalMove(promoted.pieces, promoted.board, 2, 7, 7).success).toBe(false);
        const moved = attemptLegalMove(promoted.pieces, promoted.board, 1, 0, 2);
        expect(moved.success).toBe(true);
        expect(moved.pieces.find(p => p.id === 1)).toMatchObject({ promoted: true, possibilities: ['Q'] });
    });

    it('recognizes knight underpromotion attacks', () => {
        const state = position([piece(0, 0, 7, 0, ['K']), piece(1, 0, 2, 6, ['P']), piece(2, 1, 3, 5, ['K'])]);
        const next = attemptLegalMove(state.pieces, state.board, 1, 2, 7, undefined, 'N');
        expect(next.success).toBe(true);
        expect(isKingInCheck(next.board, next.pieces, 1)).toBe(true);
    });

    it('ends a real GameEngine match when promotion delivers checkmate', () => {
        const state = position([piece(0, 0, 6, 5, ['K']), piece(1, 0, 5, 6, ['P']), piece(2, 1, 7, 7, ['K'])]);
        expect(isKingInCheck(state.board, state.pieces, 1)).toBe(false);
        const engine = new GameEngine('promotion-mate', 'white', 'black', state);
        const result = engine.processAction({ actionId: 'promote', version: 0, playerId: 'white', action: { type: 'MOVE', payload: { pieceId: 1, toX: 5, toY: 7, promotedTo: 'Q' } } });
        expect(result.success).toBe(true);
        const after = engine.getPublicState('white');
        expect(isCheckmate(after.board, after.pieces, 1)).toBe(true);
        expect(after).toMatchObject({ gameOver: 'WHITE', gameOverReason: 'checkmate' });
    });
});
