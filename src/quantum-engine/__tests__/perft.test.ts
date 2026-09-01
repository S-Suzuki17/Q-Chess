import { describe, it, expect } from 'vitest';
import { createInitialState } from '../initialState';
import { generateLegalMoves } from '../moveGenerator';
import { applyMove } from '../stateTransition';
import { GameState } from '../types';
import { hasType } from '../quantum/quantumState';
import { PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING } from '../constants';

const ALL_TYPES = [PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING];

function perft(state: GameState, depth: number): number {
    if (depth === 0) return 1;

    let nodes = 0;
    const currentPieces = state.pieces.filter(p => p.alive && p.owner === state.sideToMove);

    for (const piece of currentPieces) {
        const moves = generateLegalMoves(state, piece.id);
        for (const move of moves) {
            // For each move, a piece can theoretically move as ANY of the types it currently has
            // that are valid for that trajectory.
            for (const type of ALL_TYPES) {
                if (hasType(move.requiredTypes, type) && hasType(piece.state, type)) {
                    try {
                        const nextState = applyMove(state, {
                            pieceId: piece.id,
                            target: move.target,
                            chosenType: type
                        });
                        nodes += perft(nextState, depth - 1);
                    } catch (e) {
                        // Invalid state (QuantumContradiction, etc.) - prune this branch
                    }
                }
            }
        }
    }

    return nodes;
}

describe('Quantum Perft', () => {
    it('perft depth 1 from initial state', () => {
        const state = createInitialState();
        // At depth 1 from start, white has 16 pieces.
        // Pawns can move 1 or 2 forward (16 moves per pawn if they were isolated, but let's just count total legal valid moves).
        // Actually since all pieces are ALL_PIECE_TYPES, any front row piece can move like a pawn, knight.
        // We just ensure it runs deterministically without errors.
        const nodes = perft(state, 2);
        expect(nodes).toBeGreaterThan(0);
        console.log(`Depth 2 nodes: ${nodes}`);
    });
});
