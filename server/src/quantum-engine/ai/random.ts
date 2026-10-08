import { GameState, Move, MoveCandidate } from '../types';
import { generateLegalMoves } from '../moveGenerator';
import { PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING } from '../constants';
import { applyMove } from '../stateTransition';

/**
 * Returns all possible concrete moves (including individual quantum type choices)
 */
export function getConcreteMoveChildren(state: GameState, options: { allPromotions?: boolean; playable?: boolean } = {}): { move: Move; next: GameState }[] {
    const moves: Move[] = [];
    const myPieces = state.pieces.filter(p => p.alive && p.owner === state.sideToMove);

    for (const piece of myPieces) {
        const candidates = generateLegalMoves(state, piece.id);

        for (const candidate of candidates) {
            let handledTypes = candidate.requiredTypes;

            // Castling branch
            const isCastling = (handledTypes & PIECE_KING) !== 0 && Math.abs(candidate.target.col - piece.position.col) === 2 && Math.abs(candidate.target.row - piece.position.row) === 0;
            if (isCastling) {
                moves.push({
                    pieceId: piece.id,
                    target: candidate.target,
                    chosenType: PIECE_KING
                });
                handledTypes &= ~PIECE_KING;
            }

            // En Passant branch
            const forwardDir = piece.owner === 'white' ? -1 : 1;
            const targetPiece = state.pieces.find(p => p.alive && p.position.row === candidate.target.row && p.position.col === candidate.target.col);
            const isEnPassant = (handledTypes & PIECE_PAWN) !== 0 && Math.abs(candidate.target.col - piece.position.col) === 1 && (candidate.target.row - piece.position.row) === forwardDir && !targetPiece;
            // The player UI applies the full mask on an ordinary destination;
            // it has no separate "exclude Pawn" en-passant choice dialog.
            if (isEnPassant && !options.playable) {
                moves.push({
                    pieceId: piece.id,
                    target: candidate.target,
                    chosenType: PIECE_PAWN
                });
                handledTypes &= ~PIECE_PAWN;
            }

            // Promotion branch
            const isPromotion = (handledTypes & PIECE_PAWN) !== 0 && (candidate.target.row === 0 || candidate.target.row === 7);
            if (isPromotion) {
                for (const promotionTarget of options.allPromotions
                    ? [PIECE_QUEEN, PIECE_ROOK, PIECE_BISHOP, PIECE_KNIGHT] : [PIECE_QUEEN]) moves.push({
                    pieceId: piece.id,
                    target: candidate.target,
                    chosenType: PIECE_PAWN,
                    promotionTarget
                });
                handledTypes &= ~PIECE_PAWN;
            }

            // Standard branch for remaining types
            if (handledTypes !== 0) {
                moves.push({
                    pieceId: piece.id,
                    target: candidate.target,
                    chosenType: handledTypes
                });
            }
        }
    }

    return moves.flatMap(move => {
        try {
            // Ensure the move is fully valid (doesn't throw generic invalid state errors,
            // though contradictions that result in a win are perfectly legal)
            return [{ move, next: applyMove(state, move) }];
        } catch (e) {
            return [];
        }
    });
}

export function getAllConcreteMoves(state: GameState, options: { allPromotions?: boolean; playable?: boolean } = {}): Move[] {
    return getConcreteMoveChildren(state, options).map(child => child.move);
}

export function getRandomMove(state: GameState): Move | null {
    const allMoves = getAllConcreteMoves(state);
    if (allMoves.length === 0) return null;
    return allMoves[Math.floor(Math.random() * allMoves.length)];
}
