import { describe, it, expect } from 'vitest';
import { IdentityPool } from '../../lib/IdentityPool';
import { PieceType } from '../../config/gameConfig';
import { Token, deduceMoveTypes } from '../../lib/GameEngine';
import { createInitialState } from '../initialState';
import { applyMove } from '../stateTransition';
import { hasType } from '../quantum/quantumState';
import { PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING } from '../constants';

const TYPE_MAP: Record<PieceType, number> = {
    'Pawn': PIECE_PAWN,
    'Knight': PIECE_KNIGHT,
    'Bishop': PIECE_BISHOP,
    'Rook': PIECE_ROOK,
    'Queen': PIECE_QUEEN,
    'King': PIECE_KING
};

describe('Legacy vs Quantum Comparison', () => {
    it('produces identical possibilities after a complex move', () => {
        // 1. Setup Legacy State
        const pool = new IdentityPool();
        const legacyTokens: Token[] = [
            { id: 'w1', player: 'white', row: 6, col: 2, probabilities: {} as any },
            { id: 'w2', player: 'white', row: 7, col: 4, probabilities: {} as any },
            { id: 'bK', player: 'black', row: 0, col: 4, probabilities: {} as any }
        ];
        pool.registerPiece('w1');
        pool.registerPiece('w2');
        pool.registerPiece('bK');
        pool.restrictIdentity('w2', ['King']);
        pool.restrictIdentity('bK', ['King']);

        // Legacy Move: w1 diagonal to (5, 3)
        const possibleTypes = deduceMoveTypes(legacyTokens[0], 5, 3, legacyTokens);
        pool.restrictIdentity('w1', possibleTypes);
        legacyTokens[0].row = 5;
        legacyTokens[0].col = 3;
        const legacyValid = pool.resolveGlobalConstraints(legacyTokens);

        // 2. Setup Quantum State
        let state = createInitialState();
        state = { ...state, pieces: [
            { id: 'w1', owner: 'white', origin: {row:6,col:2}, position: {row:6,col:2}, state: 63, promoted: false, alive: true, hasMoved: false, promotedType: undefined },
            { id: 'w2', owner: 'white', origin: {row:7,col:4}, position: {row:7,col:4}, state: PIECE_KING, promoted: false, alive: true, hasMoved: false, promotedType: undefined },
            { id: 'bK', owner: 'black', origin: {row:0,col:4}, position: {row:0,col:4}, state: PIECE_KING, promoted: false, alive: true, hasMoved: false, promotedType: undefined }
        ] };

        // Quantum Move
        const nextState = applyMove(state, { pieceId: 'w1', target: { row: 5, col: 3 } });

        // 3. Compare
        expect(legacyValid).toBe(true);

        const legacyW1Poss = pool.piecePossibilities.get('w1')!;
        let legacyMask = 0;
        legacyW1Poss.forEach(p => { legacyMask |= TYPE_MAP[p]; });

        const quantumW1 = nextState.pieces.find(p => p.id === 'w1')!;

        // The bitmasks MUST match exactly!
        expect(quantumW1.state).toBe(legacyMask);
    });
});
