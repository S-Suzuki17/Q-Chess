import { describe, it, expect, vi } from 'vitest';
import { GameState, Move } from '../../types';
import { MCTSEngine } from '../mcts';
import { Evaluator } from '../eval';

// Mock everything MCTS relies on for state manipulation
vi.mock('../random', () => ({
    getAllConcreteMoves: (state: GameState) => (state as any).mockMoves || []
}));

vi.mock('../../terminal', () => ({
    getWinner: (state: GameState) => state.winner || null
}));

vi.mock('../../stateTransition', () => ({
    applyMove: (state: GameState, move: Move) => {
        // Just return the pre-baked next state stored in the move
        return (move as any).nextState;
    }
}));

vi.mock('../../hash', () => ({
    hashState: (state: GameState) => (state as any).id || 'hash'
}));

class MockEval implements Evaluator {
    evaluate(state: GameState, player: string): number {
        // Return 1.0 if player wins, -1.0 if loses
        if (state.winner === player) return 9999;
        if (state.winner && state.winner !== 'draw') return -9999;
        return 0; // Draw or neutral
    }
}

describe('MCTS Value Perspective Logic', () => {
    it('correctly propagates wins to the parent node', () => {
        // Root is White to move
        const rootState: any = { id: 'root', sideToMove: 'white', winner: null, mockMoves: [] };
        
        // Move A leads to a state where Black is to move, but Black has already lost (White wins)
        const stateA: any = { id: 'A', sideToMove: 'black', winner: 'white', mockMoves: [] };
        
        // Move B leads to a neutral state where Black is to move
        const stateB: any = { id: 'B', sideToMove: 'black', winner: null, mockMoves: [] };

        rootState.mockMoves = [
            { id: 'moveA', nextState: stateA },
            { id: 'moveB', nextState: stateB }
        ];

        const engine = new MCTSEngine(new MockEval(), { maxIterations: 10, timeLimitMs: 1000, seed: 1 });
        const stats = engine.search(rootState, { maxIterations: 10 });
        
        // MCTS should select moveA because it leads to an immediate win for White.
        // Wait, stateA has winner: 'white'. When simulate(stateA) is called:
        // rawScore = evalFn.evaluate(stateA, stateA.sideToMove) => evaluate(stateA, 'black') => returns -9999 (loss for Black)
        // normalized = 0 (loss for Black).
        // backpropagate(nodeA, 0) => reward = 1.0 - 0 = 1.0 => nodeA.localScore += 1.0
        // So nodeA gets a score of 1.0 (win) from White's perspective!
        // This is perfectly correct. nodeA will have high UCB1.

        expect(stats.move).toBeDefined();
        expect((stats.move as any).id).toBe('moveA');
    });

    it('avoids moves that lead to immediate loss', () => {
        // Root is White to move
        const rootState: any = { id: 'root', sideToMove: 'white', winner: null, mockMoves: [] };
        
        // Move A leads to state where Black is to move. White has LOST.
        const stateA: any = { id: 'A', sideToMove: 'black', winner: 'black', mockMoves: [] };
        
        // Move B leads to a neutral state
        const stateB: any = { id: 'B', sideToMove: 'black', winner: null, mockMoves: [] };

        rootState.mockMoves = [
            { id: 'moveA', nextState: stateA },
            { id: 'moveB', nextState: stateB }
        ];

        const engine = new MCTSEngine(new MockEval(), { maxIterations: 10, timeLimitMs: 1000, seed: 1 });
        const stats = engine.search(rootState, { maxIterations: 10 });
        
        // MCTS should select moveB because moveA is a loss.
        // For stateA (Black to move, winner: Black):
        // evaluate(stateA, 'black') => 9999 (win for Black)
        // normalized = 1 (win for Black).
        // backprop(nodeA, 1) => reward = 1.0 - 1 = 0 => nodeA.localScore += 0.
        // nodeA gets 0. nodeB will get ~0.5. So nodeB is selected!
        
        expect(stats.move).toBeDefined();
        expect((stats.move as any).id).toBe('moveB');
    });
});
