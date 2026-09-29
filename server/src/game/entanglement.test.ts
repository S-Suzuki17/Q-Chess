import { describe, expect, it } from 'vitest';
import { GameEngine, type Piece } from './GameEngine';
import { attemptLegalMove, createInitialBoard, resolveEntanglement, PIECE_TYPES } from './quantumChess';
import { resolveQuantumState } from '../../../src/quantum-engine/quantum/candidateSolver';
import type { QuantumPiece } from '../../../src/quantum-engine/types';
import { replayPieceNumber } from './replayHistory';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuantumPieceUI } from '../../../src/components/QuantumPieceUI';
import type { PieceType } from '../../../src/config/gameConfig';

const bits = (types: string[]) => types.reduce((mask, type) => mask | (1 << PIECE_TYPES.indexOf(type)), 0);
const blackFront = [16, 20, 24];
function reserve(ids = blackFront, types = ['R', 'Q']) {
    return createInitialBoard().pieces.map(p => ids.includes(p.id) ? { ...p, possibilities: [...types] } : p);
}

describe('authoritative full-team candidate propagation', () => {
    it.each([0, 1])('propagates a saturated Rook/Queen group to every unmoved team %s piece', team => {
        const ids = team === 0 ? [1, 5, 9] : blackFront;
        const pieces = reserve(ids);
        const before = JSON.stringify(pieces);
        const resolved = resolveEntanglement(pieces, team);
        for (const p of resolved) {
            expect(p.possibilities).toEqual(p.team === team && !ids.includes(p.id)
                ? ['P', 'N', 'B', 'K'] : pieces.find(old => old.id === p.id)!.possibilities);
        }
        expect(JSON.stringify(pieces)).toBe(before);
        expect(resolveEntanglement(resolved, team)).toEqual(resolved);
    });

    it('does not remove Rook/Queen prematurely when only two pieces reserve three slots', () => {
        const pieces = reserve(blackFront.slice(0, 2));
        expect(resolveEntanglement(pieces, 1)).toEqual(pieces);
    });

    it.each([['P', 8], ['N', 2], ['B', 2], ['R', 2], ['Q', 1], ['K', 1]] as const)(
        'still propagates confirmed %s quotas including captures', (type, count) => {
            const ids = Array.from({ length: count }, (_, i) => 16 + i);
            const pieces = reserve(ids, [type]).map(p => p.id === 16 ? { ...p, captured: true } : p);
            const resolved = resolveEntanglement(pieces, 1);
            for (const p of resolved.filter(p => p.team === 1 && !ids.includes(p.id))) {
                expect(p.possibilities).not.toContain(type);
            }
        });

    it('includes captured superpositions in quotas and updates their own candidates', () => {
        const pieces = reserve().map(p => p.id === 16 || p.id === 18 ? { ...p, captured: true } : p);
        const resolved = resolveEntanglement(pieces, 1);
        expect(resolved.find(p => p.id === 18)!.possibilities).toEqual(['P', 'N', 'B', 'K']);
        expect(resolved.find(p => p.id === 26)!.possibilities).toEqual(['P', 'N', 'B', 'K']);
        expect(resolved.find(p => p.id === 16)!.possibilities).toEqual(['R', 'Q']);
    });

    it('keeps promoted pieces in the Pawn quota while retaining their promoted movement', () => {
        const ids = Array.from({ length: 8 }, (_, i) => 16 + i);
        const pieces: Piece[] = reserve(ids, ['P']).map(p => p.id === 16
            ? { ...p, promoted: true, possibilities: ['Q'], captured: true } : p);
        const resolved = resolveEntanglement(pieces, 1);
        expect(resolved.find(p => p.id === 16)!.possibilities).toEqual(['Q']);
        expect(resolved.find(p => p.id === 24)!.possibilities).toEqual(['N', 'B', 'R', 'Q', 'K']);
    });

    it('rejects an over-capacity move without inventing a Pawn or mutating the position', () => {
        const pieces = reserve([16, 20, 24]).map(p => p.id === 28
            ? { ...p, x: 6, y: 4, possibilities: ['P', 'R', 'Q'], hasMoved: true } : p);
        const board: (number | null)[] = Array(64).fill(null);
        for (const p of pieces) board[p.y * 8 + p.x] = p.id;
        const before = JSON.stringify({ pieces, board });
        // A backwards straight move would create a fourth Rook/Queen identity.
        expect(attemptLegalMove(pieces, board, 28, 6, 5).success).toBe(false);
        expect(JSON.stringify({ pieces, board })).toBe(before);
    });

    it('updates public snapshots and replay deltas after actual alternating opening moves', () => {
        const engine = new GameEngine('candidate-regression', 'human', 'cpu', createInitialBoard());
        engine.setMatchMetadata({ mode: 'ranked', cpu: { side: 'joiner', rating: 1000, level: 3 } });
        for (const x of [0, 2, 4]) for (const backwards of [false, true]) for (const team of [0, 1]) {
            const state = engine.getPublicState('human');
            const id = team === 0 ? x * 2 + 1 : 16 + x * 2;
            const toY = team === 0 ? (backwards ? 2 : 3) : (backwards ? 5 : 4);
            expect(engine.processAction({ actionId: `ply-${state.version}`, version: state.version,
                playerId: team === 0 ? 'human' : 'cpu', action: { type: 'MOVE', payload: { pieceId: id, toX: x, toY } } }).success).toBe(true);
        }
        const state = engine.getPublicState('human');
        expect(state).toMatchObject({ moveCount: 12, gameOver: null });
        const unmoved = state.pieces.filter(p => p.team === 1 && !p.hasMoved);
        expect(unmoved).toHaveLength(13);
        for (const p of unmoved) expect(p.possibilities).toEqual(['P', 'N', 'B', 'K']);
        // The online UI derives probabilities directly from the received snapshot.
        const names: Record<string, PieceType> = { P: 'Pawn', N: 'Knight', B: 'Bishop', R: 'Rook', Q: 'Queen', K: 'King' };
        const probabilities: Record<PieceType, number> = { Pawn: 0, Knight: 0, Bishop: 0, Rook: 0, Queen: 0, King: 0 };
        for (const type of unmoved[0].possibilities) probabilities[names[type]] = 1 / unmoved[0].possibilities.length;
        for (const responsive of [false, true]) {
            const html = renderToStaticMarkup(React.createElement(QuantumPieceUI, { id: 'cpu-unmoved', player: 'black',
                probabilities, responsive, isSelected: false, onClick: () => {} }));
            expect(html).not.toMatch(/[♜♛]/);
            for (const icon of ['♟', '♞', '♝', '♚']) expect(html).toContain(icon);
        }
        const changes = engine.getHistory().at(-1)!.changes as number[][];
        for (const p of unmoved) expect(changes.find(c => c[0] === replayPieceNumber(p.id))?.[2]).toBe(bits(['P', 'N', 'B', 'K']));
        expect(engine.getPublicState('cpu').pieces).toEqual(state.pieces);
    });

    it('matches the practice solver over deterministic valid candidate combinations', () => {
        let seed = 20260929;
        const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
        const identities = ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'N', 'N', 'B', 'B', 'R', 'R', 'Q', 'K'];
        for (let sample = 0; sample < 64; sample++) {
            const pieces: Piece[] = createInitialBoard().pieces.map((p, i) => ({ ...p,
                possibilities: PIECE_TYPES.filter(t => t === identities[i % 16] || random() < 0.35),
                captured: i % 16 !== 15 && random() < 0.2,
            }));
            const local: QuantumPiece[] = pieces.map(p => ({ id: String(p.id), owner: p.team === 0 ? 'white' : 'black',
                origin: { row: 7 - p.y, col: p.x }, position: { row: 7 - p.y, col: p.x }, state: bits(p.possibilities),
                alive: !p.captured, hasMoved: !!p.hasMoved, promoted: false }));
            const expected = resolveQuantumState(local);
            const actual = resolveEntanglement(resolveEntanglement(pieces, 0), 1);
            expect(actual.map(p => bits(p.possibilities)), `sample ${sample}`).toEqual(expected.map(p => p.state));
        }
    });
});
