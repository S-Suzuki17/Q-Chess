import type { GameState, Move } from '../types';
import { PIECE_KING, PIECE_PAWN } from '../constants';
import { generateLegalMoves } from '../moveGenerator';

/** These choices all have existing player dialogs; no arbitrary identity
 * confirmation is offered or assumed by the hint search. */
export interface HintAdvice {
    fromRow: number; fromCol: number; toRow: number; toCol: number;
    promotionTarget?: number;
    intention?: 'castle' | 'normal';
    declinePromotion?: boolean;
}
export function adviceForMove(state: GameState, move: Move): HintAdvice {
    const piece = state.pieces.find(p => p.id === move.pieceId && p.alive);
    if (!piece) throw new Error('Invalid hint mover');
    const candidate = generateLegalMoves(state, piece.id).find(m => m.target.row === move.target.row && m.target.col === move.target.col);
    if (!candidate) throw new Error('Invalid hint destination');
    const advice: HintAdvice = { fromRow: piece.position.row, fromCol: piece.position.col,
        toRow: move.target.row, toCol: move.target.col };
    if (move.promotionTarget) advice.promotionTarget = move.promotionTarget;
    else if (!piece.promotedType && (candidate.requiredTypes & PIECE_PAWN) && (move.target.row === 0 || move.target.row === 7)) {
        advice.declinePromotion = true;
    }
    if ((candidate.requiredTypes & PIECE_KING) && move.target.row === piece.position.row && Math.abs(move.target.col - piece.position.col) === 2) {
        advice.intention = move.chosenType === PIECE_KING ? 'castle' : 'normal';
    }
    return advice;
}
