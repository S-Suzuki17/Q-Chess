import { describe, it, expect } from 'vitest';
import { createInitialState } from '../initialState';
import { generateLegalMoves } from '../moveGenerator';
import { applyMove } from '../stateTransition';
import { ALL_PIECE_TYPES, PIECE_PAWN } from '../constants';
import { posEquals } from '../board';

describe('Quantum Engine', () => {
    it('creates initial state correctly', () => {
        const state = createInitialState();
        expect(state.pieces.length).toBe(32);
        expect(state.sideToMove).toBe('white');
        expect(state.pieces[0].state).toBe(ALL_PIECE_TYPES);
    });

    it('generates pawn forward moves', () => {
        const state = createInitialState();
        // White pieces start at row 6,7
        const piece = state.pieces.find(p => p.owner === 'white' && p.position.row === 6 && p.position.col === 0)!;
        const moves = generateLegalMoves(state, piece.id);
        
        // At least 1 step forward should be valid for pawn, and other types
        expect(moves.length).toBeGreaterThan(0);
    });

    it('applies move and reduces candidate state', () => {
        const state = createInitialState();
        const piece = state.pieces.find(p => p.owner === 'white' && p.position.row === 6 && p.position.col === 0)!;
        
        // move 1 step forward
        const target = { row: 5, col: 0 };
        const nextState = applyMove(state, { pieceId: piece.id, target });

        const movedPiece = nextState.pieces.find(p => p.id === piece.id)!;
        expect(movedPiece.position.row).toBe(5);
        expect(movedPiece.position.col).toBe(0);

        // State shouldn't be ALL_PIECE_TYPES because a Bishop can't move straight forward.
        // It should be Pawn, Rook, Queen, King.
        expect(movedPiece.state).not.toBe(ALL_PIECE_TYPES);
    });
});
