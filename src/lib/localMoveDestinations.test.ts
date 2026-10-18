import { describe, expect, it } from 'vitest';
import type { GameState, QuantumPiece } from '../quantum-engine/types';
import { createInitialState } from '../quantum-engine/initialState';
import { PIECE_KING, PIECE_KNIGHT, PIECE_PAWN, PIECE_QUEEN, PIECE_ROOK, PIECE_BISHOP } from '../quantum-engine/constants';
import { getAllConcreteMoves } from '../quantum-engine/ai/random';
import { applyMove } from '../quantum-engine/stateTransition';
import { positionForDisplay, applyLocalMove } from './localGame';
import { localMoveDestinations } from './localMoveDestinations';
import type { MoveRecord } from './gameRecordService';

function piece(id: string, owner: 'white' | 'black', row: number, col: number, mask: number,
    extra: Partial<QuantumPiece> = {}): QuantumPiece {
    return { id, owner, origin: { row, col }, position: { row, col }, state: mask,
        promoted: false, alive: true, hasMoved: true, ...extra };
}
function state(pieces: QuantumPiece[], extra: Partial<GameState> = {}): GameState {
    return { pieces, sideToMove: 'white', ply: 0, captured: { white: 0, black: 0 },
        hash: '', winner: null, ...extra };
}
const kings = () => [piece('wk', 'white', 7, 7, PIECE_KING), piece('bk', 'black', 0, 7, PIECE_KING)];
function destinations(position: GameState, id: string, history: MoveRecord[] = []) {
    const display = positionForDisplay(position);
    return localMoveDestinations(display.tokens, display.pool, id, history);
}
const keys = (moves: { r: number; c: number }[]) => moves.map(move => move.r + ',' + move.c).sort();

describe('local move destinations use the submitted UI choices', () => {
    it('removes a pinned rook escape but retains moves on the pin and capturing its attacker', () => {
        const position = state([piece('wk', 'white', 7, 4, PIECE_KING), piece('wr', 'white', 6, 4, PIECE_ROOK),
            piece('br', 'black', 0, 4, PIECE_ROOK), piece('bk', 'black', 0, 7, PIECE_KING)]);
        expect(keys(destinations(position, 'wr'))).toEqual(['0,4', '1,4', '2,4', '3,4', '4,4', '5,4']);
        const display = positionForDisplay(position);
        expect(() => applyLocalMove(display.tokens, display.pool,
            { tokenId: 'wr', targetRow: 6, targetCol: 5, possibleTypes: ['Rook'] }, 'white', [])).toThrow(/King in check/);
    });

    it.each(['white', 'black'] as const)('retains all playable ambiguous initial destinations for %s', side => {
        const initial = { ...createInitialState(), sideToMove: side };
        const legal = getAllConcreteMoves(initial, { playable: true, allPromotions: true });
        for (const token of initial.pieces.filter(value => value.owner === side)) {
            const expected = [...new Set(legal.filter(move => move.pieceId === token.id)
                .map(move => move.target.row + ',' + move.target.col))].sort();
            expect(keys(destinations(initial, token.id))).toEqual(expected);
        }
        const token = initial.pieces.find(value => value.owner === side && value.position.col === 4
            && value.position.row === (side === 'white' ? 6 : 1))!;
        const display = positionForDisplay(initial), targetRow = side === 'white' ? 4 : 3;
        const next = applyLocalMove(display.tokens, display.pool, { tokenId: token.id,
            targetRow, targetCol: 4, possibleTypes: ['Pawn', 'Rook', 'Queen'] }, side, []);
        expect(next.pool.piecePossibilities.get(token.id)).toEqual(new Set(['Pawn', 'Rook', 'Queen']));
    });

    it('keeps castling and normal-move choices without selecting an identity', () => {
        const position = state([piece('mover', 'white', 7, 4, PIECE_KING | PIECE_QUEEN, { hasMoved: false }),
            piece('other', 'white', 7, 0, PIECE_KING | PIECE_BISHOP),
            piece('rook', 'white', 7, 7, PIECE_ROOK, { hasMoved: false }), piece('bk', 'black', 0, 0, PIECE_KING)]);
        expect(destinations(position, 'mover')).toContainEqual({ r: 7, c: 6 });
        const castle = applyMove(position, { pieceId: 'mover', target: { row: 7, col: 6 }, chosenType: PIECE_KING });
        const normal = applyMove(position, { pieceId: 'mover', target: { row: 7, col: 6 }, chosenType: PIECE_QUEEN });
        expect(castle.pieces.find(value => value.id === 'rook')?.position.col).toBe(5);
        expect(normal.pieces.find(value => value.id === 'rook')?.position.col).toBe(7);
        const attacked = { ...position, pieces: [...position.pieces, piece('br', 'black', 0, 6, PIECE_ROOK)] };
        expect(() => applyMove(attacked, { pieceId: 'mover', target: { row: 7, col: 6 }, chosenType: PIECE_KING })).toThrow();
        expect(destinations(attacked, 'mover')).toContainEqual({ r: 7, c: 6 }); // Normal branch still works.
    });

    it('retains all four promotions and the existing non-Pawn branch', () => {
        const position = state([...kings(), piece('promoting', 'white', 1, 0, PIECE_PAWN | PIECE_ROOK)]);
        expect(destinations(position, 'promoting')).toContainEqual({ r: 0, c: 0 });
        for (const promotionTarget of [PIECE_QUEEN, PIECE_ROOK, PIECE_BISHOP, PIECE_KNIGHT]) {
            const next = applyMove(position, { pieceId: 'promoting', target: { row: 0, col: 0 },
                chosenType: PIECE_PAWN | PIECE_ROOK, promotionTarget });
            expect(next.pieces.find(value => value.id === 'promoting')?.promotedType).toBe(promotionTarget);
        }
        const normal = applyMove(position, { pieceId: 'promoting', target: { row: 0, col: 0 }, chosenType: PIECE_ROOK });
        expect(normal.pieces.find(value => value.id === 'promoting')?.promoted).toBe(false);
    });

    it('keeps promoted movement without inventing another promotion', () => {
        const position = state([...kings(), piece('promoted', 'white', 2, 2, PIECE_PAWN,
            { promoted: true, promotedType: PIECE_KNIGHT })]);
        expect(destinations(position, 'promoted')).toContainEqual({ r: 0, c: 3 });
    });

    it('uses the immediately preceding two-step pawn move for en passant', () => {
        const position = state([...kings(), piece('wp', 'white', 3, 4, PIECE_PAWN),
            piece('bp', 'black', 3, 3, PIECE_PAWN)]);
        const history: MoveRecord[] = [{ turn: 1, player: 'black', tokenId: 'bp',
            from: [1, 3], to: [3, 3], possibleTypes: ['Pawn'] }];
        expect(destinations(position, 'wp', history)).toContainEqual({ r: 2, c: 3 });
        expect(destinations(position, 'wp')).not.toContainEqual({ r: 2, c: 3 });
        const display = positionForDisplay(position);
        const next = applyLocalMove(display.tokens, display.pool,
            { tokenId: 'wp', targetRow: 2, targetCol: 3, possibleTypes: ['Pawn'] }, 'white', history);
        expect(next.capturedId).toBe('bp');
    });

    it('does not mutate input tokens, candidate sets, history or reuse a simulated next state', () => {
        const display = positionForDisplay(createInitialState()), history: MoveRecord[] = [];
        const before = JSON.stringify({ tokens: display.tokens, masks: [...display.pool.piecePossibilities]
            .map(([id, types]) => [id, [...types]]), history });
        for (const token of display.tokens) Object.freeze(token);
        Object.freeze(display.tokens);
        Object.freeze(history);
        const token = display.tokens.find(value => value.row === 6 && value.col === 4)!;
        const result = localMoveDestinations(display.tokens, display.pool, token.id, history);
        expect(result.length).toBeGreaterThan(0);
        expect(result.every(value => Object.keys(value).sort().join(',') === 'c,r')).toBe(true);
        expect(JSON.stringify({ tokens: display.tokens, masks: [...display.pool.piecePossibilities]
            .map(([id, types]) => [id, [...types]]), history })).toBe(before);
    });

    it('returns no destinations for a missing or captured selection', () => {
        const initial = createInitialState(), token = initial.pieces[0];
        expect(destinations(initial, 'missing')).toEqual([]);
        expect(destinations({ ...initial, pieces: initial.pieces.map(value => value.id === token.id
            ? { ...value, alive: false, position: { row: -1, col: -1 } } : value) }, token.id)).toEqual([]);
    });
});
