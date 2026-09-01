import { describe, it, expect } from 'vitest';
import { GameState, QuantumPiece } from '../types';
import { ALL_PIECE_TYPES, PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING } from '../constants';
import { generateLegalMoves } from '../moveGenerator';
import { applyMove } from '../stateTransition';
import { resolveQuantumState } from '../quantum/candidateSolver';
import { isPlayerInCheck, isCheckmate } from '../terminal';
import { hasType } from '../quantum/quantumState';

function createCustomState(piecesInit: Partial<QuantumPiece>[]): GameState {
    const pieces: QuantumPiece[] = piecesInit.map((p, i) => ({
        id: p.id || `p_${i}`,
        owner: p.owner || 'white',
        origin: p.origin || { row: 0, col: 0 },
        position: p.position || { row: 0, col: 0 },
        state: p.state !== undefined ? p.state : ALL_PIECE_TYPES,
        promoted: p.promoted || false,
        promotedType: p.promotedType,
        alive: p.alive !== undefined ? p.alive : true,
        hasMoved: false
    }));
    
    if (!pieces.some(p => p.owner === 'white' && hasType(p.state, PIECE_KING))) {
        pieces.push({ id: 'wK', owner: 'white', origin: {row:7,col:4}, position: {row:7,col:4}, state: PIECE_KING, promoted: false, alive: true, hasMoved: false });
    }
    if (!pieces.some(p => p.owner === 'black' && hasType(p.state, PIECE_KING))) {
        pieces.push({ id: 'bK', owner: 'black', origin: {row:0,col:4}, position: {row:0,col:4}, state: PIECE_KING, promoted: false, alive: true, hasMoved: false });
    }

    return {
        pieces,
        sideToMove: 'white',
        ply: 0,
        captured: { white: 0, black: 0 },
        winner: null,
        hash: ''
    };
}

describe('Phase 1-B Rule Fidelity Audit Tests', () => {

    it('1. Knight unique move -> Knight collapse test', () => {
        const state = createCustomState([
            { id: 'w1', position: { row: 5, col: 2 } },
            { id: 'wK', owner: 'white', position: { row: 7, col: 4 }, state: PIECE_KING },
            { id: 'bK', owner: 'black', position: { row: 0, col: 4 }, state: PIECE_KING }
        ]);
        
        const nextState = applyMove(state, { pieceId: 'w1', target: { row: 3, col: 3 } });
        const movedPiece = nextState.pieces.find(p => p.id === 'w1')!;
        expect(movedPiece.state).toBe(PIECE_KNIGHT);
    });

    it('2. Multiple candidates move -> Candidate maintenance test', () => {
        // We ensure we don't have a fully collapsed wK, otherwise it would prevent w1 from being King.
        // But the helper adds wK if no King exists. 
        // So we just provide w1 and w2 as ALL_TYPES. They both have King potential.
        // Helper won't add wK.
        const state = createCustomState([
            { id: 'w1', owner: 'white', position: { row: 5, col: 2 }, state: ALL_PIECE_TYPES },
            { id: 'w2', owner: 'white', position: { row: 7, col: 4 }, state: ALL_PIECE_TYPES }
        ]);
        
        const nextState = applyMove(state, { pieceId: 'w1', target: { row: 4, col: 3 } });
        const movedPiece = nextState.pieces.find(p => p.id === 'w1')!;
        
        expect(movedPiece.state).toBe(PIECE_BISHOP | PIECE_QUEEN | PIECE_KING);
    });

    it('3. Promotion before/after constraint test', () => {
        const state = createCustomState([
            { id: 'wP', position: { row: 1, col: 0 }, state: PIECE_PAWN },
            { id: 'wQ', position: { row: 7, col: 0 }, state: PIECE_QUEEN }
        ]);
        
        const nextState = applyMove(state, { 
            pieceId: 'wP', 
            target: { row: 0, col: 0 },
            chosenType: PIECE_PAWN,
            promotionTarget: PIECE_QUEEN
        });
        
        const promotedPiece = nextState.pieces.find(p => p.id === 'wP')!;
        expect(promotedPiece.state).toBe(PIECE_PAWN);
        expect(promotedPiece.promotedType).toBe(PIECE_QUEEN);
    });

    it('4. Candidate exhaustion test (63-subset logic)', () => {
        const pieces = Array.from({ length: 8 }).map((_, i) => ({
            id: `p${i}`, owner: 'white' as const, position: { row: 6, col: i }, state: PIECE_PAWN
        }));
        pieces.push({ id: 'mystery', owner: 'white' as const, position: { row: 5, col: 0 }, state: ALL_PIECE_TYPES });
        
        const state = createCustomState(pieces);
        const resolvedPieces = resolveQuantumState(state.pieces);
        
        const mystery = resolvedPieces.find(p => p.id === 'mystery')!;
        expect(hasType(mystery.state, PIECE_PAWN)).toBe(false);
        expect(hasType(mystery.state, PIECE_KNIGHT)).toBe(true);
    });

    it('5. King existence test', () => {
        const state = createCustomState([
            { id: 'w1', owner: 'white', state: PIECE_PAWN }
        ]);
        // Remove the auto-added kings
        const noKingState = { ...state, pieces: state.pieces.filter(p => p.owner !== 'white' || p.id === 'w1') };
        
        expect(() => {
            resolveQuantumState(noKingState.pieces);
        }).toThrow(/White has no potential Kings/);
    });

    it('6. Check / non-Check test (Multiple King Candidates)', () => {
        const state1 = createCustomState([
            { id: 'w1', owner: 'white', position: { row: 4, col: 4 }, state: ALL_PIECE_TYPES },
            { id: 'w2', owner: 'white', position: { row: 7, col: 4 }, state: ALL_PIECE_TYPES },
            { id: 'bR', owner: 'black', position: { row: 4, col: 0 }, state: PIECE_ROOK }
        ]);
        
        expect(isPlayerInCheck('white', state1)).toBe(false);
        
        const singleKingState = { ...state1, pieces: state1.pieces.filter(p => p.id !== 'w2') };
        expect(isPlayerInCheck('white', singleKingState)).toBe(true);
    });
});

    it('7. Checkmate test', () => {
        // Construct a classic Fool's Mate scenario
        // White King is trapped. Black Queen attacks it.
        // We will make sure there is ONLY ONE white king candidate, 
        // and no white piece can block or capture.
        const state = createCustomState([
            { id: 'wK', owner: 'white', position: { row: 0, col: 4 }, state: PIECE_KING },
            { id: 'bQ', owner: 'black', position: { row: 0, col: 7 }, state: PIECE_QUEEN }, // Attacks wK
            // Add a blocker that can't actually move
            { id: 'wP', owner: 'white', position: { row: 1, col: 4 }, state: PIECE_PAWN }
        ]);
        
        // Remove bK to avoid interference if any, but let's keep bK for existence
        // createCustomState auto-adds bK at 0,4, but we manually placed wK at 0,4.
        // Let's place pieces explicitly.
        const cleanState = createCustomState([
            { id: 'wK', owner: 'white', position: { row: 7, col: 4 }, state: PIECE_KING },
            { id: 'bQ', owner: 'black', position: { row: 7, col: 7 }, state: PIECE_QUEEN }, // Attacks wK horizontally
            { id: 'bK', owner: 'black', position: { row: 0, col: 4 }, state: PIECE_KING },
            // White pawns blocking the king from moving forward
            { id: 'wP1', owner: 'white', position: { row: 6, col: 3 }, state: PIECE_PAWN },
            { id: 'wP2', owner: 'white', position: { row: 6, col: 4 }, state: PIECE_PAWN },
            { id: 'wP3', owner: 'white', position: { row: 6, col: 5 }, state: PIECE_PAWN },
        ]);
        
        // The White King is at 7,4. Black Queen at 7,7 attacks it.
        // King can move to 7,3 or 7,5 (if empty), but wait, Black Queen controls the entire 7th row!
        // So King cannot move to 7,3 or 7,5 because it would still be in check.
        // Can any pawn capture the Queen? No.
        // So this is Checkmate!
        expect(isPlayerInCheck('white', cleanState)).toBe(true);
        expect(isCheckmate('white', cleanState)).toBe(true);
    });
