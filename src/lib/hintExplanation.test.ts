import { describe, expect, it } from 'vitest';
import { explainHint } from './hintExplanation';
import { positionForDisplay } from './localGame';
import { tutorialCourse, tutorialReferenceMove } from './tutorialCourse';
import { createInitialState } from '../quantum-engine/initialState';
import { applyMove } from '../quantum-engine/stateTransition';
import { quantumToLegacyMove } from '../quantum-engine/adapter';
import { adviceForMove } from '../../server/src/quantum-engine/ai/hintAdvice';
import type { MoveRecord } from './gameRecordService';

function exercise(id: string, index = 0) {
    const lesson = tutorialCourse.find(item => item.id === id)!;
    let state = lesson.create();
    const history: MoveRecord[] = [];
    for (const task of lesson.tasks.slice(0, index)) {
        const move = tutorialReferenceMove(state, task);
        const mover = state.pieces.find(piece => piece.id === move.pieceId)!;
        history.push({ turn: state.ply + 1, player: state.sideToMove, tokenId: mover.id,
            from: [mover.position.row, mover.position.col], to: [move.target.row, move.target.col],
            possibleTypes: quantumToLegacyMove(move, state).possibleTypes });
        state = applyMove(state, move);
    }
    const view = positionForDisplay(state);
    const hint = adviceForMove(state, tutorialReferenceMove(state, lesson.tasks[index]));
    return { state, view, hint, history, explain: () => explainHint(hint, view.tokens, view.pool.piecePossibilities, state.sideToMove, history) };
}

describe('immediate hint explanations', () => {
    it('explains e2 to f4 with the real engine and does not change the board or candidate sets', () => {
        const view = positionForDisplay(createInitialState());
        const snapshot = structuredClone(view);
        const hint = { fromRow: 6, fromCol: 4, toRow: 4, toCol: 5 };
        const result = explainHint(hint, view.tokens, view.pool.piecePossibilities, 'white');
        expect(result).toMatchObject({ remaining: ['Knight'], capturedSquares: [], givesCheck: false, escapesCheck: false });
        expect(result!.excluded.sort()).toEqual(['Bishop', 'King', 'Pawn', 'Queen', 'Rook']);
        expect(view.tokens).toEqual(snapshot.tokens);
        expect(view.pool.piecePossibilities).toEqual(snapshot.pool.piecePossibilities);
    });
    it('explains the Queen constraint propagating to a different, unmoved piece', () => {
        const result = exercise('deduction-chain', 2).explain();
        expect(result).toMatchObject({ remaining: ['Queen'], excluded: ['Bishop'],
            otherChanges: [{ square: 'd2', remaining: ['Rook'] }] });
    });
    it('distinguishes capturing a possible King from a win', () => {
        const result = exercise('king-candidates').explain();
        expect(result?.capturedSquares).toEqual(['a4']);
        expect(result?.givesCheck).toBe(false);
    });
    it('identifies the captured square for en passant using the actual preceding move', () => {
        const result = exercise('en-passant', 1).explain();
        expect(result?.capturedSquares).toEqual(['f5']);
        expect(result?.remaining).toEqual(['Pawn']);
    });
    it('handles both castling interpretations without silently choosing one', () => {
        const { view, hint } = exercise('castle');
        const explain = (intention?: 'normal' | 'castle') =>
            explainHint({ ...hint, intention }, view.tokens, view.pool.piecePossibilities, 'white');
        expect(explain('castle')).toMatchObject({ remaining: ['King'],
            otherChanges: expect.arrayContaining([{ fromSquare: 'h1', square: 'f1', remaining: ['Rook'] }]) });
        expect(explain('normal')?.remaining).toEqual(['Rook']);
        expect(explain('normal')?.otherChanges.some(change => change.fromSquare)).toBe(false);
        expect(explain()).toBeNull();
    });
    it('reports the confirmed rook relocation in classical castling', () => {
        expect(exercise('chess-castle').explain()).toMatchObject({
            remaining: ['King'], otherChanges: [{ fromSquare: 'h1', square: 'f1', remaining: ['Rook'] }],
        });
    });
    it('handles all promotion choices without calling the Pawn identity an excluded candidate', () => {
        const { view, hint } = exercise('promotion');
        for (const [promotionTarget, name] of [[2, 'Knight'], [4, 'Bishop'], [8, 'Rook'], [16, 'Queen']] as const) {
            expect(explainHint({ ...hint, promotionTarget }, view.tokens, view.pool.piecePossibilities, 'white'))
                .toMatchObject({ remaining: [name], excluded: [] });
        }
        expect(exercise('decline-promotion').explain()?.remaining).toEqual(['Rook']);
    });
    it('explains check and escaping check only when the rules confirm them', () => {
        expect(exercise('checkmate').explain()?.givesCheck).toBe(true);
        expect(exercise('check-block').explain()?.escapesCheck).toBe(true);
    });
    it('does not explain illegal, stale, incomplete or contradictory hints', () => {
        const view = positionForDisplay(createInitialState());
        const hint = { fromRow: 6, fromCol: 4, toRow: 4, toCol: 5 };
        expect(explainHint(hint, view.tokens, view.pool.piecePossibilities, 'black')).toBeNull();
        expect(explainHint({ ...hint, toRow: -1 }, view.tokens, view.pool.piecePossibilities, 'white')).toBeNull();
        expect(explainHint({ ...hint, promotionTarget: 16 }, view.tokens, view.pool.piecePossibilities, 'white')).toBeNull();
        expect(explainHint({ ...hint, toRow: 7, toCol: 4 }, view.tokens, view.pool.piecePossibilities, 'white')).toBeNull();
        expect(explainHint(hint, view.tokens.filter(token => token.player === 'white'), view.pool.piecePossibilities, 'white')).toBeNull();
    });
});
