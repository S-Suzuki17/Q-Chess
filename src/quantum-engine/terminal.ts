import { GameState } from './types';
import { PlayerColor } from './constants';
import { PIECE_KING } from './constants';
import { generateLegalMoves } from './moveGenerator';
import { hasType } from './quantum/quantumState';

export function getWinner(state: GameState): PlayerColor | 'draw' | null {
    // 1. Check if King is captured
    const whiteKings = state.pieces.filter(p => p.alive && p.owner === 'white' && hasType(p.state, PIECE_KING));
    const blackKings = state.pieces.filter(p => p.alive && p.owner === 'black' && hasType(p.state, PIECE_KING));

    if (whiteKings.length === 0) return 'black';
    if (blackKings.length === 0) return 'white';

    // 2. Check for checkmate/stalemate (No valid moves)
    const currentPieces = state.pieces.filter(p => p.alive && p.owner === state.sideToMove);
    let hasMoves = false;
    for (const p of currentPieces) {
        if (generateLegalMoves(state, p.id).length > 0) {
            hasMoves = true;
            break;
        }
    }

    if (!hasMoves) {
        // Standard chess distinguishes checkmate vs stalemate, but Q-GAMBIT might just use winner check based on check state
        // For Phase 1, we just return 'draw' if no moves (stalemate fallback) 
        // Real checkmate logic will rely on full simulation (which relies on stateTransition)
        // Since this is a pure engine, we must simulate moves to verify check.
        return 'draw'; // Simplified
    }

    return null;
}

export function isGameOver(state: GameState): boolean {
    return getWinner(state) !== null;
}
