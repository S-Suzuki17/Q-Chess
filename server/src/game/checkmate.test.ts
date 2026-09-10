import { describe, expect, it } from 'vitest';
import { attemptLegalMove, isCheckmate, createInitialBoard } from './quantumChess';
import { GameEngine } from './GameEngine';

const piece = (id: number, team: number, x: number, y: number, possibilities: string[]) => ({ id, team, x, y, possibilities, captured: false, hasMoved: true });
function position(pieces: ReturnType<typeof piece>[]) {
    const board = Array(64).fill(null);
    for (const p of pieces) board[p.y * 8 + p.x] = p.id;
    return { board, pieces };
}
describe('authoritative online checkmate', () => {
    it('recognizes mate but not an escapable check or a superposed king', () => {
        const state = position([piece(0, 1, 0, 0, ['K']), piece(1, 0, 2, 2, ['K']), piece(2, 0, 1, 1, ['Q'])]);
        expect(isCheckmate(state.board, state.pieces, 1)).toBe(true);
        state.pieces[2].x = 3; state.pieces[2].y = 3;
        const escape = position(state.pieces);
        expect(isCheckmate(escape.board, escape.pieces, 1)).toBe(false);
        state.pieces[0].possibilities = ['K', 'N'];
        expect(isCheckmate(escape.board, escape.pieces, 1)).toBe(false);
    });
    it('allows a defending capture and does not mutate the original board', () => {
        const state = position([piece(0, 1, 0, 0, ['K']), piece(1, 0, 2, 2, ['K']), piece(2, 0, 1, 1, ['Q']), piece(3, 1, 1, 7, ['R'])]);
        const before = JSON.stringify(state);
        expect(isCheckmate(state.board, state.pieces, 1)).toBe(false);
        expect(JSON.stringify(state)).toBe(before);
    });
    it('broadcasts the finish reason and rejects subsequent moves', () => {
        const state = position([piece(0, 1, 0, 0, ['K']), piece(1, 0, 2, 2, ['K']), piece(2, 0, 3, 1, ['Q'])]);
        const engine = new GameEngine('m', 'w', 'b', state);
        expect(engine.processAction({ actionId: 'a', version: 0, playerId: 'w', action: { type: 'MOVE', payload: { pieceId: 2, toX: 1, toY: 1 } } }).success).toBe(true);
        expect(engine.getPublicState('b')).toMatchObject({ gameOver: 'WHITE', gameOverReason: 'checkmate', turn: 1 });
        expect(engine.processAction({ actionId: 'b', version: 1, playerId: 'b', action: { type: 'MOVE', payload: { pieceId: 0, toX: 0, toY: 1 } } }).success).toBe(false);
    });
    it('keeps resignation and timeout separate from checkmate', () => {
        const resign = new GameEngine('r', 'w', 'b', createInitialBoard());
        resign.processAction({ actionId: 'a', version: 0, playerId: 'b', action: { type: 'RESIGN', payload: {} } });
        expect(resign.getPublicState('w').gameOverReason).toBe('resignation');
        const timeout = new GameEngine('t', 'w', 'b', createInitialBoard(), 0);
        expect(timeout.checkTimeout()).toBe(true);
        expect(timeout.getPublicState('w').gameOverReason).toBe('timeout');
    });
    it('rejects out-of-bounds moves and king moves into attack', () => {
        const state = position([piece(0, 1, 0, 0, ['K']), piece(1, 0, 2, 2, ['K']), piece(2, 0, 1, 1, ['Q'])]);
        expect(attemptLegalMove(state.pieces, state.board, 0, -1, 0).success).toBe(false);
        expect(attemptLegalMove(state.pieces, state.board, 0, 0, 1).success).toBe(false);
    });
});
