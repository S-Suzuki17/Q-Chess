import { GameState, Move, MoveCandidate } from '../types';
import { generateLegalMoves } from '../moveGenerator';
import { PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING } from '../constants';
import { applyMove } from '../stateTransition';

/**
 * Returns all possible concrete moves (including individual quantum type choices)
 */
export function getAllConcreteMoves(state: GameState): Move[] {
    const moves: Move[] = [];
    const myPieces = state.pieces.filter(p => p.alive && p.owner === state.sideToMove);

    for (const piece of myPieces) {
        const candidates = generateLegalMoves(state, piece.id);
        
        for (const candidate of candidates) {
            // Explode requiredTypes bitmask into individual move options
            // Keep the full superposition of the move
            const isPromotion = (candidate.requiredTypes & PIECE_PAWN) !== 0 && (candidate.target.row === 0 || candidate.target.row === 7);
            if (isPromotion) {
                moves.push({
                    pieceId: piece.id,
                    target: candidate.target,
                    chosenType: candidate.requiredTypes,
                    promotionTarget: PIECE_QUEEN
                });
            } else {
                moves.push({
                    pieceId: piece.id,
                    target: candidate.target,
                    chosenType: candidate.requiredTypes
                });
            }
        }
    }

    return moves.filter(move => {
        try {
            // Ensure the move is fully valid (doesn't throw generic invalid state errors, 
            // though contradictions that result in a win are perfectly legal)
            applyMove(state, move);
            return true;
        } catch (e) {
            return false;
        }
    });
}

export function getRandomMove(state: GameState): Move | null {
    const allMoves = getAllConcreteMoves(state);
    if (allMoves.length === 0) return null;
    return allMoves[Math.floor(Math.random() * allMoves.length)];
}
