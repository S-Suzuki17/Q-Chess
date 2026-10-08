import { describe, expect, it, vi } from 'vitest';
import { getAllConcreteMoves } from '../ai/random';
import { searchBestMove } from '../ai/search';
import { applyMove } from '../stateTransition';
import { adviceForMove } from '../../../server/src/quantum-engine/ai/hintAdvice';
import { hintTimeAvailable, qubeSearchProfile } from '../../../server/src/quantum-engine/ai/searchProfiles';
import { PIECE_KING as K, PIECE_ROOK as R, PIECE_PAWN as P, PIECE_BISHOP as B, PIECE_QUEEN as Q, PIECE_KNIGHT as N } from '../constants';
import { positionForDisplay, applyLocalMove } from '../../lib/localGame';
import { quantumToLegacyMove } from '../adapter';
import { deduceMoveTypes } from '../../lib/GameEngine';
import type { GameState, QuantumPiece } from '../types';

const piece = (id: string, owner: 'white' | 'black', state: number, row: number, col: number): QuantumPiece =>
    ({ id, owner, state, origin: { row, col }, position: { row, col }, alive: true, hasMoved: true, promoted: false });
const position = (pieces: QuantumPiece[]): GameState =>
    ({ pieces, sideToMove: 'white', ply: 2, winner: null, hash: '', captured: { white: 0, black: 0 } });
function replay(state: GameState, move: ReturnType<typeof getAllConcreteMoves>[number]) {
    const view = positionForDisplay(state), legacy = quantumToLegacyMove(move, state);
    const previous = state.lastMove;
    const history = previous?.from ? [{ turn: state.ply,
        player: state.pieces.find(p => p.id === previous.pieceId)!.owner,
        tokenId: previous.pieceId, from: [previous.from.row, previous.from.col] as [number, number],
        to: [previous.target.row, previous.target.col] as [number, number],
        possibleTypes: quantumToLegacyMove(previous, state).possibleTypes }] : [];
    const actual = applyLocalMove(view.tokens, view.pool, legacy, state.sideToMove, history);
    expect(actual.state.pieces).toEqual(applyMove(state, move).pieces);
}

describe('reproducible high-precision advice', () => {
    it('explores and displays all four legal promotion choices through the actual local rules', () => {
        const state = position([piece('w_1', 'white', K, 7, 0), piece('w_2', 'white', P, 1, 4), piece('b_1', 'black', K, 0, 7)]);
        const promotions = getAllConcreteMoves(state, { allPromotions: true, playable: true }).filter(m => m.pieceId === 'w_2');
        expect(promotions.map(m => m.promotionTarget)).toEqual([Q, R, B, N]);
        for (const move of promotions) { expect(adviceForMove(state, move).promotionTarget).toBe(move.promotionTarget); replay(state, move); }
        const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
        try {
            const result = searchBestMove(state, { evaluate(s, player) {
                const value = s.pieces.find(p => p.id === 'w_2')?.promotedType === N ? 100 : 0;
                return player === 'white' ? value : -value;
            } }, { maxDepth: 1, quiescenceDepth: 0, playableRoot: true });
            expect(result.move?.promotionTarget).toBe(N);
        } finally { clock.mockRestore(); }
    });
    it('uses the same ordinary en-passant mask that the player interface applies', () => {
        const state = { ...position([piece('w_1', 'white', K, 7, 0), piece('w_2', 'white', P | B | Q, 3, 4),
            piece('b_1', 'black', K, 0, 7), piece('b_2', 'black', P, 3, 5)]),
            lastMove: { pieceId: 'b_2', from: { row: 1, col: 5 }, target: { row: 3, col: 5 }, chosenType: P } };
        const moves = getAllConcreteMoves(state, { allPromotions: true, playable: true })
            .filter(m => m.pieceId === 'w_2' && m.target.row === 2 && m.target.col === 5);
        expect(moves).toHaveLength(1); expect(moves[0].chosenType).toBe(P | B | Q);
        const view = positionForDisplay(state), mover = view.tokens.find(p => p.id === 'w_2')!;
        expect(deduceMoveTypes(mover, 2, 5, view.tokens, { tokenId: 'b_2', fromRow: 1, fromCol: 5, toRow: 3, toCol: 5 }))
            .toEqual(expect.arrayContaining(['Pawn', 'Bishop', 'Queen']));
        replay(state, moves[0]);
        expect(applyMove(state, moves[0]).pieces.find(p => p.id === 'b_2')!.alive).toBe(false);
    });
    it('distinguishes castling, a normal two-square move and declining promotion', () => {
        const state = position([{ ...piece('w_1', 'white', K | R, 7, 4), hasMoved: false },
            piece('w_2', 'white', K | R, 6, 0), { ...piece('w_3', 'white', R, 7, 7), hasMoved: false }, piece('b_1', 'black', K, 0, 7)]);
        const moves = getAllConcreteMoves(state, { allPromotions: true, playable: true })
            .filter(m => m.pieceId === 'w_1' && m.target.row === 7 && m.target.col === 6);
        expect(moves).toHaveLength(2);
        expect(moves.map(m => adviceForMove(state, m).intention)).toEqual(['castle', 'normal']);
        moves.forEach(m => replay(state, m));
        const promotion = position([piece('w_1', 'white', K, 7, 0), piece('w_2', 'white', P | R, 1, 4), piece('b_1', 'black', K, 0, 7)]);
        const normal = getAllConcreteMoves(promotion, { allPromotions: true, playable: true })
            .find(m => m.pieceId === 'w_2' && m.target.row === 0 && m.target.col === 4 && !m.promotionTarget)!;
        expect(adviceForMove(promotion, normal).declinePromotion).toBe(true); replay(promotion, normal);
    });
    it('caps analysis at 15 seconds, subtracts elapsed time and refuses invalid clock values', () => {
        expect(qubeSearchProfile().timeLimitMs).toBe(15000);
        expect(qubeSearchProfile(hintTimeAvailable(10000, 2200)).timeLimitMs).toBe(6800);
        expect(qubeSearchProfile(hintTimeAvailable(600000)).timeLimitMs).toBe(15000);
        for (const value of [NaN, Infinity, -1, 900]) expect(hintTimeAvailable(value)).toBe(0);
        expect(qubeSearchProfile(NaN).timeLimitMs).toBe(0);
    });
});
