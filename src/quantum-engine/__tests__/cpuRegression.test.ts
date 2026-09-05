import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuantumPieceUI } from '../../components/QuantumPieceUI';
import { resolveQuantumState } from '../quantum/candidateSolver';
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../initialState';
import { applyMove } from '../stateTransition';
import { getAllConcreteMoves } from '../ai/random';
import { applyLocalMove, positionForDisplay } from '../../lib/localGame';
import { legacyToQuantumState, quantumToLegacyMove } from '../adapter';
import { PIECE_QUEEN as Q, PIECE_ROOK as R, PIECE_KING as K, PIECE_PAWN as P } from '../constants';
import { searchBestMove } from '../ai/search';
import { EvalQoppelia } from '../ai/evalQoppelia';
import type { GameState, QuantumPiece } from '../types';
import type { MoveRecord } from '../../lib/gameRecordService';

const piece = (id: string, owner: 'white' | 'black', state: number, row: number, col: number): QuantumPiece => ({
    id, owner, state, origin: { row, col }, position: { row, col }, alive: true, hasMoved: true, promoted: false
});
const position = (pieces: QuantumPiece[]): GameState => ({ pieces, sideToMove: 'white', ply: 10, winner: null, hash: '', captured: { white: 0, black: 0 } });

describe('CPU search and full-board candidate propagation', () => {
    it('removes exhausted Rook/Queen icons from unmoved CPU pieces even with stale probabilities', () => {
        const initial = createInitialState();
        const cpu = initial.pieces.filter(p => p.owner === 'black');
        const reservedIds = new Set(cpu.slice(0, 3).map(p => p.id));
        const stale = positionForDisplay(initial);
        const resolved = resolveQuantumState(initial.pieces.map(p =>
            reservedIds.has(p.id) ? { ...p, state: R | Q, hasMoved: true } : p));
        const display = positionForDisplay({ ...initial, pieces: resolved });
        for (const token of stale.tokens.filter(p => p.player === 'black' && !reservedIds.has(p.id))) {
            const candidates = display.pool.piecePossibilities.get(token.id)!;
            expect(candidates.has('Rook')).toBe(false);
            expect(candidates.has('Queen')).toBe(false);
            expect(token.hasMoved).toBe(false);
            const html = renderToStaticMarkup(React.createElement(QuantumPieceUI, {
                id: token.id, player: token.player, probabilities: token.probabilities,
                candidates, isSelected: false, onClick: () => {}
            }));
            expect(html).not.toContain('♜');
            expect(html).not.toContain('♛');
            expect(html).toContain('♞');
        }
        const oneReserved = resolveQuantumState(initial.pieces.map(p =>
            p.id === cpu[0].id ? { ...p, state: R | Q, hasMoved: true } : p));
        expect(oneReserved.find(p => p.id === cpu[3].id)!.state & (R | Q)).toBe(R | Q);
    });

    it('updates unmoved CPU pieces after Queen confirmation and preserves the captured quota', () => {
        let state = createInitialState();
        let history: MoveRecord[] = [];
        for (const turn of [
            { white: ['c2', 'e4'], black: ['b7', 'd5'] },
            { white: ['e4', 'e5'], black: ['d5', 'd4'] },
            { white: ['e5', 'd4'], black: ['g8', 'f6'] }
        ]) for (const color of ['white', 'black'] as const) {
            const [from, to] = turn[color];
            const square = (r: number, c: number) => `${'abcdefgh'[c]}${8-r}`;
            const source = state.pieces.find(p => p.alive && square(p.position.row, p.position.col) === from)!;
            const move = getAllConcreteMoves(state).find(m => m.pieceId === source.id && square(m.target.row, m.target.col) === to)!;
            expect(move, `${from}-${to}`).toBeDefined();
            const before = positionForDisplay(state);
            const unchangedPool = [...before.pool.piecePossibilities].map(([id, types]) => [id, [...types]]);
            const result = applyLocalMove(before.tokens, before.pool, quantumToLegacyMove(move, state), color, history);
            const expected = applyMove(state, move);
            expect(result.state.pieces).toEqual(expected.pieces);
            expect([...before.pool.piecePossibilities].map(([id, types]) => [id, [...types]])).toEqual(unchangedPool);
            expect(result.pool).not.toBe(before.pool);
            if (from === 'd5') {
                const cpuQueen = result.tokens.find(p => p.row === 4 && p.col === 3)!;
                expect(cpuQueen.probabilities.Queen).toBe(1);
                expect(result.tokens.filter(p => p.player === 'black' && p.id !== cpuQueen.id).every(p => p.probabilities.Queen === 0)).toBe(true);
                expect(result.changedIds.length).toBeGreaterThan(1);
            }
            if (from === 'e5') expect(result.tokens.filter(p => p.player === 'black' && !p.isCaptured).every(p => p.probabilities.Queen === 0)).toBe(true);
            const old = state.pieces.find(p => p.id === move.pieceId)!;
            history = [...history, { turn: history.length + 1, player: color, tokenId: move.pieceId,
                from: [old.position.row, old.position.col], to: [move.target.row, move.target.col], possibleTypes: quantumToLegacyMove(move, state).possibleTypes }];
            state = result.state;
            expect(state.winner).toBe(null);
        }
        expect(state.ply).toBe(6);
    });

    it('preserves exact move history, including coordinate zero', () => {
        const board = positionForDisplay(createInitialState());
        const record: MoveRecord = { tokenId: 'b_9', player: 'black', turn: 2, from: [1, 0], to: [3, 0], possibleTypes: ['Pawn', 'Rook', 'Queen'] };
        const state = legacyToQuantumState(board.tokens, board.pool, 'white', 2, record);
        expect(state.lastMove).toMatchObject({ pieceId: 'b_9', from: { row: 1, col: 0 }, target: { row: 3, col: 0 } });
        expect(state.ply).toBe(2);
    });

    it('rejects voluntarily removing your last King and masks with extraneous types', () => {
        const state = position([piece('w', 'white', K | R, 4, 4), piece('b', 'black', K, 0, 7)]);
        expect(() => applyMove(state, { pieceId: 'w', target: { row: 4, col: 1 }, chosenType: R })).toThrow();
        expect(() => applyMove(state, { pieceId: 'w', target: { row: 4, col: 1 }, chosenType: R | Q })).toThrow();
    });

    it('selects an immediate King capture using the real terminal transition', () => {
        const state = position([piece('wk', 'white', K, 7, 7), piece('wr', 'white', R, 3, 0), piece('bk', 'black', K, 3, 7)]);
        const result = searchBestMove(state, new EvalQoppelia(), { timeLimitMs: 1000, maxDepth: 3 });
        const next = applyMove(state, result.move!);
        expect(next.winner).toBe('white');
        expect(next.sideToMove).toBe('black');
    });

    it('avoids a poisoned pawn and preserves the Queen against recapture', () => {
        const state = position([piece('wk', 'white', K, 7, 7), piece('wq', 'white', Q, 4, 4),
            piece('bk', 'black', K, 0, 7), piece('br', 'black', R, 0, 3), piece('bp', 'black', P, 3, 3)]);
        const result = searchBestMove(state, new EvalQoppelia(), { timeLimitMs: 1200, maxDepth: 2 });
        expect(result.move).not.toBeNull();
        expect(result.move?.target).not.toEqual({ row: 3, col: 3 });
        expect(result.depth).toBeGreaterThanOrEqual(1);
    });
});
