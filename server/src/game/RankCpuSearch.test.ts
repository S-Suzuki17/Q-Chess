import { describe, expect, it, vi } from 'vitest';
import { GameEngine, type Piece, type PublicGameState } from './GameEngine';
import { attemptLegalMove, createInitialBoard, isCheckmate, isKingInCheck } from './quantumChess';
import * as rules from './quantumChess';
import { chooseCpuMove, cpuProfileForRating, evaluateCpuPosition, type CpuProfile } from './RankCpuSearch';
import { CPU_PERSONALITIES } from '../quantum-engine/ai/personalities';
import { PERSONALITY_WEIGHTS } from '../quantum-engine/ai/personalities';
import { EvalQoppelia } from '../quantum-engine/ai/evalQoppelia';
import { rankedEvaluationState } from './RankCpuEvaluation';

const strong: CpuProfile = { rating: 2200, level: 9, thinkMs: 500, maxDepth: 2 };
const piece = (id: number, team: number, x: number, y: number, possibilities: string[], hasMoved = true): Piece =>
    ({ id, team, x, y, possibilities, hasMoved, captured: false });
function position(pieces: Piece[], turn = 0): PublicGameState {
    const board: (number | null)[] = Array(64).fill(null);
    for (const p of pieces) if (!p.captured) board[p.y * 8 + p.x] = p.id;
    return { board, pieces, turn, version: 7, matchId: 'cpu-test', moveCount: 4, gameOver: null, lastAction: null };
}

describe('ranked server CPU', () => {
    it('matches canonical candidate evaluation after coordinate, capture and promotion conversion', () => {
        const promoted = { ...piece(1, 0, 2, 7, ['Q']), promoted: true };
        const captured = { ...piece(2, 0, 5, 4, ['Q']), captured: true };
        const state = position([piece(0, 0, 0, 0, ['K']), promoted, captured,
            piece(3, 0, 4, 3, ['R', 'Q']), piece(4, 1, 7, 7, ['K']), piece(5, 1, 3, 5, ['N', 'B'])]);
        const canonical = rankedEvaluationState(state);
        expect(canonical.pieces[1]).toMatchObject({ state: 1, promotedType: 16, position: { row: 0, col: 2 } });
        expect(canonical.pieces[2].alive).toBe(false);
        const values = new EvalQoppelia({ originValue: 0, mobility: 0, candidateAllocation: 0, kingCandidate: 0, safety: 0, center: 0 });
        expect(values.evaluate(canonical, 'white')).toBe(11); // effective Q9 + forced R5 - minor3
        for (const personality of CPU_PERSONALITIES) {
            const evaluator = new EvalQoppelia(PERSONALITY_WEIGHTS[personality]);
            expect(evaluateCpuPosition(state, personality)).toBeCloseTo(100 * evaluator.evaluate(canonical, 'white'), 10);
            expect(evaluateCpuPosition({ ...state, turn: 1 }, personality)).toBeCloseTo(-evaluateCpuPosition(state, personality), 10);
        }
    });
    it('holds strength and clock budgets constant across all six styles', () => {
        for (const rating of [600,1000,1600,2200]) {
            const profiles=CPU_PERSONALITIES.map(style => cpuProfileForRating(rating,600,style));
            expect(new Set(profiles.map(({personality,...budget}) => JSON.stringify(budget))).size).toBe(1);
        }
    });
    it.each(CPU_PERSONALITIES)('uses authoritative ranked legality for %s', style => {
        const engine = new GameEngine('style-check','human','cpu',createInitialBoard());
        const state = engine.getPublicState('human'), original = JSON.stringify(state);
        const move = chooseCpuMove(state,{...cpuProfileForRating(1600,600,style),thinkMs:500,maxDepth:1});
        expect(move).not.toBeNull();
        expect(attemptLegalMove(state.pieces,state.board,move!.pieceId,move!.toX,move!.toY,move!.intention,move!.promotedTo).success).toBe(true);
        expect(JSON.stringify(state)).toBe(original);
    });
    it('changes ranked evaluation, not just the style label', () => {
        const engine=new GameEngine('style-evaluation','human','cpu',createInitialBoard());
        const state=engine.getPublicState('human');
        const advanced=state.pieces.find(p=>p.team===0 && p.y===1)!;
        state.board[advanced.y*8+advanced.x]=null; advanced.y=3;
        state.board[advanced.y*8+advanced.x]=advanced.id;
        const scores=CPU_PERSONALITIES.map(style=>evaluateCpuPosition(state,style));
        expect(scores.every(Number.isFinite)).toBe(true);
        expect(new Set(scores).size).toBe(6);
    });
    it('uses bounded approximate ratings and shorter budgets for fast clocks', () => {
        expect(cpuProfileForRating(NaN, 600).rating).toBe(1000);
        expect(cpuProfileForRating(-20, 600)).toMatchObject({ rating: 600, level: 1, maxDepth: 1 });
        expect(cpuProfileForRating(5000, 600)).toMatchObject({ rating: 2200, level: 9, maxDepth: 4 });
        expect(cpuProfileForRating(1249, 600).rating).toBe(1200);
        expect(cpuProfileForRating(1250, 600).rating).toBe(1300);
        expect(cpuProfileForRating(2200, 10).thinkMs).toBeLessThan(cpuProfileForRating(2200, 600).thinkMs);
    });

    it('returns an authoritative legal move accepted by GameEngine and preserves its snapshot', () => {
        const engine = new GameEngine('opening', 'human', 'cpu', createInitialBoard());
        const state = engine.getPublicState('human');
        const before = JSON.stringify(state);
        const move = chooseCpuMove(state, cpuProfileForRating(1200, 600));
        expect(move).not.toBeNull();
        expect(JSON.stringify(state)).toBe(before);
        expect(engine.processAction({ actionId: 'cpu', version: state.version, playerId: 'human', action: { type: 'MOVE', payload: move! } }).success).toBe(true);
    });

    it('captures the last possible enemy king', () => {
        const state = position([piece(0, 0, 0, 0, ['K']), piece(1, 0, 3, 3, ['R']), piece(2, 1, 3, 7, ['K'])]);
        expect(chooseCpuMove(state, strong)).toMatchObject({ pieceId: 1, toX: 3, toY: 7 });
    });

    it('finds checkmate through the same terminal rule as the server', () => {
        const state = position([piece(0, 1, 0, 0, ['K']), piece(1, 0, 2, 2, ['K']), piece(2, 0, 3, 1, ['Q'])]);
        const move = chooseCpuMove(state, strong)!;
        const next = attemptLegalMove(state.pieces, state.board, move.pieceId, move.toX, move.toY, move.intention, move.promotedTo);
        expect(next.success).toBe(true);
        expect(isCheckmate(next.board, next.pieces, 1)).toBe(true);
    });

    it('escapes check instead of taking an unrelated free queen', () => {
        const state = position([piece(0, 0, 4, 0, ['K']), piece(1, 0, 0, 1, ['R']), piece(2, 1, 7, 7, ['K']), piece(3, 1, 4, 7, ['R']), piece(4, 1, 0, 5, ['Q'])]);
        const move = chooseCpuMove(state, strong)!;
        expect(move).not.toBeNull();
        const next = attemptLegalMove(state.pieces, state.board, move.pieceId, move.toX, move.toY, move.intention, move.promotedTo);
        expect(next.success).toBe(true);
        expect(isKingInCheck(next.board, next.pieces, 0)).toBe(false);
    });

    it('includes castling missing from the destination helper and rejects castling through check', () => {
        const state = position([piece(0, 0, 4, 0, ['K'], false), piece(1, 0, 7, 0, ['R'], false), piece(2, 1, 0, 7, ['K'])]);
        const simulate = vi.spyOn(rules, 'attemptLegalMove');
        try {
            chooseCpuMove(state, { ...strong, maxDepth: 1 });
            expect(simulate).toHaveBeenCalledWith(state.pieces, state.board, 0, 6, 0, 'castle', undefined);
            expect(simulate).toHaveBeenCalledWith(state.pieces, state.board, 0, 6, 0, 'normal', undefined);
        } finally {
            simulate.mockRestore();
        }
        const attacked = position([...state.pieces, piece(3, 1, 5, 7, ['R'])]);
        const safeMove = chooseCpuMove(attacked, strong)!;
        expect(safeMove.pieceId === 0 && safeMove.toX === 6 && safeMove.toY === 0).toBe(false);
    });

    it('looks ahead to avoid losing its queen for a defended pawn', () => {
        const state = position([piece(0, 0, 0, 0, ['K']), piece(1, 0, 4, 4, ['Q']), piece(2, 1, 7, 7, ['K']), piece(3, 1, 4, 5, ['P']), piece(4, 1, 4, 7, ['R'])]);
        const move = chooseCpuMove(state, strong)!;
        expect(move.pieceId === 1 && move.toX === 4 && move.toY === 5).toBe(false);
        expect(attemptLegalMove(state.pieces, state.board, move.pieceId, move.toX, move.toY, move.intention).success).toBe(true);
    });

    it('supplies queen promotion without inventing rules outside the server', () => {
        const state = position([piece(0, 0, 0, 0, ['K']), piece(1, 0, 6, 6, ['P']), piece(2, 1, 7, 7, ['K'])]);
        expect(chooseCpuMove(state, strong)).toMatchObject({ pieceId: 1, toX: 7, toY: 7, promotedTo: 'Q' });
    });

    it('does not request promotion when a move eliminates its pawn possibility', () => {
        const state = position([piece(0, 0, 0, 0, ['K']), piece(1, 0, 3, 3, ['P', 'Q']), piece(2, 1, 3, 7, ['K'])]);
        const move = chooseCpuMove(state, strong)!;
        expect(move).toMatchObject({ pieceId: 1, toX: 3, toY: 7 });
        expect(move.promotedTo).toBeUndefined();
    });

    it('returns null for finished games, checkmate, pending intros and expired deadlines', () => {
        const state = position([piece(0, 1, 0, 0, ['K']), piece(1, 0, 2, 2, ['K']), piece(2, 0, 1, 1, ['Q'])], 1);
        expect(chooseCpuMove(state, strong)).toBeNull();
        expect(chooseCpuMove({ ...state, gameOver: 'WHITE' }, strong)).toBeNull();
        expect(chooseCpuMove({ ...state, introPending: true }, strong)).toBeNull();
        expect(chooseCpuMove(state, strong, Date.now() - 1)).toBeNull();
    });
});
