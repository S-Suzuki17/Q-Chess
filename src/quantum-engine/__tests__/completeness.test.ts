import { describe, it, expect } from 'vitest';
import { GameState, QuantumPiece } from '../types';
import { ALL_PIECE_TYPES, PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING } from '../constants';
import { generateLegalMoves } from '../moveGenerator';
import { applyMove } from '../stateTransition';
import { resolveQuantumState } from '../quantum/candidateSolver';
import { isPlayerInCheck, isCheckmate, getWinner } from '../terminal';
import { hasType } from '../quantum/quantumState';

function createCustomState(piecesInit: Partial<QuantumPiece>[], sideToMove: 'white' | 'black' = 'white', lastMove?: any): GameState {
    const pieces: QuantumPiece[] = piecesInit.map((p, i) => ({
        id: p.id || `p_${i}`,
        owner: p.owner || 'white',
        origin: p.origin || { row: p.owner === 'white' ? 7 : 0, col: 0 },
        position: p.position || { row: 0, col: 0 },
        state: p.state !== undefined ? p.state : ALL_PIECE_TYPES,
        promoted: p.promoted || false,
        promotedType: p.promotedType,
        alive: p.alive !== undefined ? p.alive : true,
        hasMoved: p.hasMoved || false
    }));
    
    if (!pieces.some(p => p.owner === 'white' && hasType(p.state, PIECE_KING))) {
        pieces.push({ id: 'wK', owner: 'white', origin: {row:7,col:4}, position: {row:7,col:4}, state: PIECE_KING, promoted: false, alive: true, hasMoved: false });
    }
    if (!pieces.some(p => p.owner === 'black' && hasType(p.state, PIECE_KING))) {
        pieces.push({ id: 'bK', owner: 'black', origin: {row:0,col:4}, position: {row:0,col:4}, state: PIECE_KING, promoted: false, alive: true, hasMoved: false });
    }

    return {
        pieces,
        sideToMove,
        ply: 0,
        captured: { white: 0, black: 0 },
        winner: null,
        lastMove,
        hash: ''
    };
}

describe('Phase 1-C Rule Completeness Tests', () => {

    it('1. Castling logic and side-effects', () => {
        // Setup White King at 7,4 and Rook at 7,7. Both haven't moved.
        const state = createCustomState([
            { id: 'wK', owner: 'white', position: { row: 7, col: 4 }, state: ALL_PIECE_TYPES, hasMoved: false },
            { id: 'wR', owner: 'white', position: { row: 7, col: 7 }, state: ALL_PIECE_TYPES, hasMoved: false }
        ]);
        
        // Remove default kings
        state.pieces = state.pieces.filter(p => p.id !== 'wK' || (p.id === 'wK' && p.state === ALL_PIECE_TYPES));

        const moves = generateLegalMoves(state, 'wK');
        const castlingMove = moves.find(m => m.target.row === 7 && m.target.col === 6);
        expect(castlingMove).toBeDefined();
        expect(hasType(castlingMove!.requiredTypes, PIECE_KING)).toBe(true);

        const nextState = applyMove(state, { pieceId: 'wK', target: { row: 7, col: 6 }, chosenType: PIECE_KING });
        
        // Check rook moved
        const movedRook = nextState.pieces.find(p => p.id === 'wR')!;
        expect(movedRook.position.col).toBe(5);
        expect(movedRook.hasMoved).toBe(true);
        expect(hasType(movedRook.state, PIECE_ROOK)).toBe(true); // Must retain Rook ability
    });

    it('2. En Passant logic and side-effects', () => {
        // Setup: White pawn on row 3, col 4. Black pawn moved 2 steps to row 3, col 3.
        const state = createCustomState([
            { id: 'wP', owner: 'white', position: { row: 3, col: 4 }, state: ALL_PIECE_TYPES },
            { id: 'bP', owner: 'black', position: { row: 3, col: 3 }, origin: { row: 1, col: 3 }, state: ALL_PIECE_TYPES }
        ], 'white', { pieceId: 'bP', target: { row: 3, col: 3 } });

        const moves = generateLegalMoves(state, 'wP');
        const epMove = moves.find(m => m.target.row === 2 && m.target.col === 3);
        
        expect(epMove).toBeDefined();
        expect(hasType(epMove!.requiredTypes, PIECE_PAWN)).toBe(true);

        const nextState = applyMove(state, { pieceId: 'wP', target: { row: 2, col: 3 }, chosenType: PIECE_PAWN });
        
        const capturedBlack = nextState.pieces.find(p => p.id === 'bP')!;
        expect(capturedBlack.alive).toBe(false);
        // Ensure captured piece is restricted to Pawn
        expect(hasType(capturedBlack.state, PIECE_PAWN)).toBe(true);
        expect(hasType(capturedBlack.state, PIECE_KING)).toBe(false);
    });

    it('3. Stalemate returns draw', () => {
        // Setup: Black king trapped at 0,0. White Queen at 2,1. White's turn? No, Black's turn.
        const state = createCustomState([
            { id: 'bK', owner: 'black', position: { row: 0, col: 0 }, state: PIECE_KING },
            { id: 'wQ', owner: 'white', position: { row: 2, col: 1 }, state: PIECE_QUEEN },
            { id: 'wK', owner: 'white', position: { row: 7, col: 7 }, state: PIECE_KING }
        ], 'black');
        
        // Remove auto bK 
        state.pieces = state.pieces.filter(p => !(p.id === 'bK' && p.position.col === 4));
        
        expect(isPlayerInCheck('black', state)).toBe(false); // 0,0 is not attacked by 2,1 Queen (Queen attacks row 2, col 1, diags)
        // Wait, Queen at 2,1 attacks 0,0? dr=2, dc=1. Not an attack!
        
        // But what squares CAN Black King move to? (0,1), (1,0), (1,1).
        // Queen at 2,1 attacks:
        // (0,1): dr=2, dc=0 -> attacked!
        // (1,0): dr=1, dc=1 -> attacked!
        // (1,1): dr=1, dc=0 -> attacked!
        // (1,2): dr=1, dc=1 -> attacked!
        
        // Black has no legal moves. Not in check. This is standard stalemate.
        const winner = getWinner(state);
        expect(winner).toBe('draw');
    });

    it('8. Hall Constraint Independent Test (Solver Subset verification)', () => {
        // Create 3 pieces that can ONLY be Queen or Rook (limit 1 + 2 = 3).
        // 4th piece is ALL_TYPES.
        // It must NOT be able to be Queen or Rook.
        const p1State = PIECE_QUEEN | PIECE_ROOK;
        
        const pieces = [
            { id: 'w1', owner: 'white' as const, position: {row:1, col:1}, state: p1State },
            { id: 'w2', owner: 'white' as const, position: {row:1, col:2}, state: p1State },
            { id: 'w3', owner: 'white' as const, position: {row:1, col:3}, state: p1State },
            { id: 'w4', owner: 'white' as const, position: {row:1, col:4}, state: ALL_PIECE_TYPES }
        ];
        
        const state = createCustomState(pieces);
        const resolved = resolveQuantumState(state.pieces);
        
        const w4 = resolved.find(p => p.id === 'w4')!;
        expect(hasType(w4.state, PIECE_QUEEN)).toBe(false);
        expect(hasType(w4.state, PIECE_ROOK)).toBe(false);
        expect(hasType(w4.state, PIECE_KNIGHT)).toBe(true);
    });

    it('9. Complex Composite Test: Promotion + Candidate Solver + King Constraint', () => {
        // White Pawn about to promote. 
        // White already has a Queen.
        // The solver should NOT crash when it promotes to Queen.
        // And the promoted piece should act as Queen but count as Pawn.
        const state = createCustomState([
            { id: 'wP', owner: 'white', position: { row: 1, col: 0 }, state: PIECE_PAWN },
            { id: 'wQ', owner: 'white', position: { row: 7, col: 0 }, state: PIECE_QUEEN }
        ], 'white');

        const nextState = applyMove(state, { pieceId: 'wP', target: { row: 0, col: 0 }, chosenType: PIECE_PAWN, promotionTarget: PIECE_QUEEN });
        
        const wP = nextState.pieces.find(p => p.id === 'wP')!;
        expect(wP.state).toBe(PIECE_PAWN); // Underlying limit counts as pawn
        expect(wP.promotedType).toBe(PIECE_QUEEN); // Moves as Queen

        // Check if solver throws if we had 8 pawns + 1 promoted pawn?
        // Wait, promoted pawn IS one of the 8 pawns.
        // What if we try to create a 2nd Queen? The solver sees 1 real Queen and 1 promoted pawn (which is a Pawn).
        // Max Queen limit is 1. Real Queen takes it. Promoted Pawn takes Pawn limit.
        // So no contradiction!
        expect(nextState.winner).toBe(null); // No contradiction!
    });
});
