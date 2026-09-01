import { describe, it, expect } from 'vitest';
import { IdentityPool } from '../IdentityPool';
import { Token } from '../GameEngine';
import { quantumToLegacyMove, legacyToQuantumState } from '../../quantum-engine/adapter';

describe('Adapter & IdentityPool Propagation', () => {
    it('properly restricts unmoved pieces when CPU plays a constraint-forcing move', () => {
        const pool = new IdentityPool();
        
        const tokens: Token[] = [
            { id: 'T1', player: 'black', row: 1, col: 0, isCaptured: false, probabilities: {} as any }, // Moving piece
            { id: 'T2', player: 'black', row: 1, col: 1, isCaptured: false, probabilities: {} as any }, // Unmoved piece
            { id: 'T3', player: 'black', row: 1, col: 2, isCaptured: false, probabilities: {} as any }, // Unmoved piece
            { id: 'T_K', player: 'black', row: 0, col: 4, isCaptured: false, probabilities: {} as any } // King
        ];

        pool.piecePossibilities.set('T1', new Set(['Pawn', 'Knight']));
        pool.piecePossibilities.set('T2', new Set(['Pawn', 'Knight']));
        pool.piecePossibilities.set('T3', new Set(['Knight'])); // T3 is strictly a Knight.
        pool.piecePossibilities.set('T_K', new Set(['King']));

        const qState = legacyToQuantumState(tokens, pool, 'black');

        // T1 makes an L-shape move from (1,0) to (3,1), forcing it to be a Knight.
        // In the legacy UI, MCTS outputs a move without chosenType.
        const qMove = {
            pieceId: 'T1',
            target: { row: 3, col: 1 }
            // chosenType is undefined
        };

        // This is the function we fixed
        const legacyMove = quantumToLegacyMove(qMove, qState);

        // Assert that the adapter correctly recovered ['Knight'] instead of []
        expect(legacyMove.possibleTypes).toEqual(['Knight']);

        // Now simulate the UI executing the move
        pool.restrictIdentity('T1', legacyMove.possibleTypes);
        
        // Assert that T1's pool was not destroyed to size 0
        expect(pool.piecePossibilities.get('T1')?.size).toBe(1);
        expect(pool.piecePossibilities.get('T1')?.has('Knight')).toBe(true);

        // Apply global constraints (what LocalGameBoard does after restrictIdentity)
        const updatedTokens = [...tokens];
        updatedTokens[0].row = 3;
        updatedTokens[0].col = 1;
        updatedTokens[0].hasMoved = true;

        pool.resolveGlobalConstraints(updatedTokens);

        // Now evaluate T2. Since Max Knights is 2, and T1, T3 are Knights, T2 MUST become a Pawn!
        const t2Candidates = pool.piecePossibilities.get('T2');
        expect(t2Candidates?.has('Knight')).toBe(false);
        expect(t2Candidates?.has('Pawn')).toBe(true);
        expect(t2Candidates?.size).toBe(1);
    });
});
