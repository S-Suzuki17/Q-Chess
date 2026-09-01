import { GameState, Move } from '../types';
import { getAllConcreteMoves } from './random';
import { applyMove } from '../stateTransition';

function evaluateState(state: GameState, aiColor: 'white'|'black'): number {
    if (state.winner === aiColor) return Infinity;
    if (state.winner && state.winner !== 'draw') return -Infinity;
    if (state.winner === 'draw') return 0;

    let score = 0;
    for (const piece of state.pieces) {
        if (!piece.alive) continue;
        const val = 1; // In quantum chess, all pieces are superpositions, so raw piece count is an okay heuristic
        if (piece.owner === aiColor) {
            score += val;
        } else {
            score -= val;
        }
    }
    
    // Captured pieces are literally dead, so the alive check covers them.
    return score;
}

export function getGreedyMove(state: GameState): Move | null {
    const allMoves = getAllConcreteMoves(state);
    if (allMoves.length === 0) return null;

    const myColor = state.sideToMove;
    let bestMove: Move | null = null;
    let bestScore = -Infinity;

    for (const move of allMoves) {
        try {
            const nextState = applyMove(state, move);
            const score = evaluateState(nextState, myColor);

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            } else if (score === bestScore) {
                // Random tie breaking to avoid repeating the exact same deterministic moves
                if (Math.random() > 0.5) {
                    bestMove = move;
                }
            }
        } catch (e) {
            // Ignore illegal interpretation
        }
    }

    return bestMove || allMoves[0]; // fallback to first legal
}
