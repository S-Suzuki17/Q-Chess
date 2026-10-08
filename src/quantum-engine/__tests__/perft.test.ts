import { describe, it, expect } from 'vitest';
import { createInitialState } from '../initialState';
import { generateLegalMoves } from '../moveGenerator';
import { applyMove } from '../stateTransition';
import type { GameState, Move } from '../types';
import { hasType } from '../quantum/quantumState';
import { PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING } from '../constants';

const ALL_TYPES = [PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING];

type IdentityMove = Move & { chosenType: number };

/** Count one ply of identity choices, not combined UI masks. The canonical
 * transition rejects contradictory allocations and exposed King branches. */
function onePly(state: GameState): IdentityMove[] {
    const branches: IdentityMove[] = [];
    for (const piece of state.pieces.filter(p => p.alive && p.owner === state.sideToMove)) {
        for (const candidate of generateLegalMoves(state, piece.id)) {
            for (const type of ALL_TYPES) {
                if (!hasType(candidate.requiredTypes, type) || !hasType(piece.state, type)) continue;
                const move = { pieceId: piece.id, target: candidate.target, chosenType: type };
                try { applyMove(state, move); }
                catch { continue; }
                branches.push(move);
            }
        }
    }

    return branches;
}

describe('Quantum finite one-ply Perft', () => {
    it('counts exact initial identity branches on both sides without changing the position', () => {
        // Independently derived geometry: front Pawns 8*2; Knights 26 front
        // and 14 back; Bishop diagonals 14+12+10+8+6; Rooks 8*5; Queens
        // combine the 50 diagonals and 40 files. Every revealed King square
        // is exposed to an enemy file. Total: 16+40+50+40+90+0 = 236.
        const expected: Record<number, number> = {
            [PIECE_PAWN]: 16, [PIECE_KNIGHT]: 40, [PIECE_BISHOP]: 50,
            [PIECE_ROOK]: 40, [PIECE_QUEEN]: 90, [PIECE_KING]: 0,
        };
        const signatures = (['white', 'black'] as const).map(side => {
            const state: GameState = { ...createInitialState(), sideToMove: side };
            const before = structuredClone(state);
            const moves = onePly(state);
            expect(moves).toHaveLength(236);
            for (const type of ALL_TYPES) expect(moves.filter(move => move.chosenType === type)).toHaveLength(expected[type]);
            expect(state).toEqual(before);
            return moves.map(move => {
                const from = state.pieces.find(piece => piece.id === move.pieceId)!.position;
                const rotate = (value: number) => side === 'white' ? 7 - value : value;
                return [move.chosenType, rotate(from.row), rotate(from.col), rotate(move.target.row), rotate(move.target.col)].join(':');
            }).sort();
        });
        expect(signatures[0]).toEqual(signatures[1]);
    });
});
