import { GameState, PlayerColor, QuantumPiece } from './types';
import { PIECE_KING } from './constants';
import { generateLegalMoves } from './moveGenerator';
import { hasType } from './quantum/quantumState';
import { applyMove } from './stateTransition';
import { posEquals } from './board';

export function isPlayerInCheck(player: PlayerColor, state: GameState): boolean {
    const potentialKings = state.pieces.filter(p => p.alive && p.owner === player && hasType(p.state, PIECE_KING));
    
    // Q-GAMBIT Rule: Check only happens if there is exactly ONE potential king.
    if (potentialKings.length !== 1) {
        return false;
    }

    const king = potentialKings[0];
    const enemies = state.pieces.filter(p => p.alive && p.owner !== player);

    // If any enemy can legally move to the King's position, it is in check.
    for (const enemy of enemies) {
        // Since we are checking enemy attacks, we evaluate pseudo-legal moves for the enemy
        // Note: generating legal moves usually checks whose turn it is. 
        // We temporarily bypass turn checks by mapping over all enemies and generating moves directly.
        // Wait, generateLegalMoves enforces piece.owner === state.sideToMove.
        // We need a helper to get pseudo-legal attacks ignoring sideToMove.
        // Let's create a temporary state where it is the enemy's turn.
        const tempState: GameState = { ...state, sideToMove: enemy.owner };
        const moves = generateLegalMoves(tempState, enemy.id);
        if (moves.some(m => posEquals(m.target, king.position))) {
            return true;
        }
    }

    return false;
}

export function isCheckmate(player: PlayerColor, state: GameState): boolean {
    if (!isPlayerInCheck(player, state)) return false;

    const friendlyPieces = state.pieces.filter(p => p.alive && p.owner === player);

    for (const piece of friendlyPieces) {
        // Temporarily set turn to player just in case
        const tempState: GameState = { ...state, sideToMove: player };
        const moves = generateLegalMoves(tempState, piece.id);
        
        for (const move of moves) {
            // Need to test every valid interpretation (chosenType) that is physically possible
            const requiredBits = move.requiredTypes;
            // Iterate over all 6 types
            for (let i = 0; i < 6; i++) {
                const type = 1 << i;
                if ((requiredBits & type) !== 0) {
                    try {
                        const nextState = applyMove(tempState, {
                            pieceId: piece.id,
                            target: move.target,
                            chosenType: type,
                            promotionTarget: (type === PIECE_PAWN && (move.target.row === 0 || move.target.row === 7)) ? PIECE_QUEEN : undefined
                        });
                        
                        if (!isPlayerInCheck(player, nextState)) {
                            // Found a move that escapes check!
                            return false; 
                        }
                    } catch (e) {
                        // Invalid move due to constraints, skip
                    }
                }
            }
        }
    }

    return true; // No moves escape check
}

export function getWinner(state: GameState): PlayerColor | 'draw' | null {
    const whiteKings = state.pieces.filter(p => p.alive && p.owner === 'white' && hasType(p.state, PIECE_KING));
    const blackKings = state.pieces.filter(p => p.alive && p.owner === 'black' && hasType(p.state, PIECE_KING));

    if (whiteKings.length === 0) return 'black';
    if (blackKings.length === 0) return 'white';

    // If current player is checkmated, they lose.
    if (isCheckmate(state.sideToMove, state)) {
        return state.sideToMove === 'white' ? 'black' : 'white';
    }

    // Check for stalemate (no legal moves, but not in check)
    // For performance, we can leave stalemate to be checked externally or lazily, 
    // but for correctness, let's do a quick check if ANY move is possible.
    let hasAnyMove = false;
    const friendlyPieces = state.pieces.filter(p => p.alive && p.owner === state.sideToMove);
    checkMoves: for (const piece of friendlyPieces) {
        const moves = generateLegalMoves(state, piece.id);
        for (const move of moves) {
            for (let i = 0; i < 6; i++) {
                const type = 1 << i;
                if ((move.requiredTypes & type) !== 0) {
                    try {
                        applyMove(state, {
                            pieceId: piece.id,
                            target: move.target,
                            chosenType: type,
                            promotionTarget: (type === PIECE_PAWN && (move.target.row === 0 || move.target.row === 7)) ? PIECE_QUEEN : undefined
                        });
                        hasAnyMove = true;
                        break checkMoves;
                    } catch (e) {}
                }
            }
        }
    }

    if (!hasAnyMove) {
        return 'draw';
    }

    return null;
}

export function isGameOver(state: GameState): boolean {
    return getWinner(state) !== null;
}
