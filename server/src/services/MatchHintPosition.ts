import { createHash } from 'node:crypto';
import type { Piece } from '../game/GameEngine';
import { attemptLegalMove } from '../game/quantumChess';
import { rankedEvaluationState } from '../game/RankCpuEvaluation';
import type { GameState, Move } from '../quantum-engine/types';
import type { HintAdvice } from '../quantum-engine/ai/hintAdvice';
import { adviceForMove } from '../quantum-engine/ai/hintAdvice';
import { MatchHintError, type OnlineHintBoard } from './MatchHintTypes';

export const MATCH_HINT_RULES_VERSION = 'match-hint-v1';
const bits: Record<string, number> = { P: 1, N: 2, B: 4, R: 8, Q: 16, K: 32 };
const promotions: Record<number, string> = { 2: 'N', 4: 'B', 8: 'R', 16: 'Q' };
export const onlineHintPieceId = (p: Pick<Piece, 'id' | 'team'>) => `${p.team === 0 ? 'w' : 'b'}_${p.id + 1}`;

/** Explicit projection: neither worker data nor its hash can contain a hidden
 * identity, a client-provided board, names, clocks, or other future fields. */
export function publicHintPiece(p: Piece): Piece {
    return { id: p.id, team: p.team, possibilities: p.possibilities.slice(), x: p.x, y: p.y,
        captured: p.captured,
        ...(p.hasMoved === undefined ? {} : { hasMoved: p.hasMoved }),
        ...(p.promoted === undefined ? {} : { promoted: p.promoted }) };
}
export function onlineHintState(board: OnlineHintBoard, ply: number): GameState {
    const projected = { pieces: board.pieces.map(publicHintPiece), turn: board.turn };
    const state = rankedEvaluationState(projected);
    return { ...state, ply, pieces: state.pieces.map((p, index) => ({ ...p, id: onlineHintPieceId(projected.pieces[index]) })) };
}
export function onlineHintHash(board: OnlineHintBoard, ply: number): string {
    return createHash('sha256').update(JSON.stringify({ rulesVersion: MATCH_HINT_RULES_VERSION,
        board: board.board, pieces: board.pieces.map(publicHintPiece), turn: board.turn, ply })).digest('hex');
}
/** Validate the search's canonical choice with the actual online adjudicator.
 * Promotion and normal/castle choices are also the ones sent by the player UI. */
export function onlineHintAdvice(board: OnlineHintBoard, state: GameState, move: Move): HintAdvice {
    const piece = board.pieces.find(p => onlineHintPieceId(p) === move?.pieceId);
    if (!piece || piece.captured || piece.team !== board.turn || !move?.target
        || ![move.target.row, move.target.col].every(n => Number.isInteger(n) && n >= 0 && n < 8)) {
        throw new MatchHintError('NO_LEGAL_HINT');
    }
    let advice: HintAdvice;
    try { advice = adviceForMove(state, move); } catch { throw new MatchHintError('NO_LEGAL_HINT'); }
    // Online UI always chooses N/B/R/Q when a possible Pawn reaches its last
    // rank. Canonical practice/Crown may decline; that choice cannot be played
    // by the online dialog or native adjudicator and is never a paid root.
    if (advice.declinePromotion) throw new MatchHintError('NO_LEGAL_HINT');
    const mask = piece.possibilities.reduce((sum, type) => sum | bits[type], 0);
    const chosen = move.chosenType ?? mask;
    if (!Number.isInteger(chosen) || chosen < 1 || (chosen & mask) !== chosen) throw new MatchHintError('NO_LEGAL_HINT');
    // The native dialog's normal choice excludes King only for a two-square
    // castle geometry. Other choices are adjudicated by destination geometry.
    const castleGeometry = (mask & 32) !== 0 && advice.toRow === advice.fromRow
        && Math.abs(advice.toCol - advice.fromCol) === 2;
    if (castleGeometry) advice.intention = chosen === 32 ? 'castle' : 'normal';
    const promotedTo = move.promotionTarget === undefined ? undefined : promotions[move.promotionTarget];
    if (move.promotionTarget !== undefined && !promotedTo) throw new MatchHintError('NO_LEGAL_HINT');
    const result = attemptLegalMove(board.pieces.map(publicHintPiece), board.board.slice(), piece.id,
        advice.toCol, 7 - advice.toRow, advice.intention, promotedTo);
    if (!result.success) throw new MatchHintError('NO_LEGAL_HINT');
    return advice;
}
