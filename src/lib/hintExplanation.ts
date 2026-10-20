import type { PieceType } from '../config/gameConfig';
import type { Token } from './GameEngine';
import type { MoveRecord } from './gameRecordService';
import { IdentityPool } from './IdentityPool';
import { legacyToQuantumState, TYPE_TO_BIT } from '../quantum-engine/adapter';
import { generateLegalMoves } from '../quantum-engine/moveGenerator';
import { applyMove } from '../quantum-engine/stateTransition';
import { isPlayerInCheck } from '../quantum-engine/terminal';
import { PIECE_KING, PIECE_PAWN } from '../quantum-engine/constants';
import { adviceForMove } from '../../server/src/quantum-engine/ai/hintAdvice';
import { isValidHintMove, squareName, type HintMove } from '../components/boardPresentation';

const types = Object.keys(TYPE_TO_BIT) as PieceType[];
const names = (mask: number) => types.filter(type => (mask & TYPE_TO_BIT[type]) !== 0);

export interface HintExplanation {
    remaining: PieceType[];
    excluded: PieceType[];
    capturedSquares: string[];
    otherChanges: { square: string; remaining: PieceType[] }[];
    givesCheck: boolean;
    escapesCheck: boolean;
}

/** Explain only the immediate, verifiable effects of the displayed hint.
 * This does not run another search, infer the AI's reasoning, or mutate the game.
 */
export function explainHint(
    hint: HintMove | null | undefined,
    tokens: Token[],
    candidates: ReadonlyMap<string, ReadonlySet<PieceType>> | undefined,
    turn: 'white' | 'black',
    history: readonly MoveRecord[] = [],
): HintExplanation | null {
    if (!hint || !isValidHintMove(hint)) return null;
    const mover = tokens.find(token => !token.isCaptured && token.player === turn
        && token.row === hint.fromRow && token.col === hint.fromCol);
    if (!mover) return null;
    try {
        const pool = new IdentityPool();
        for (const token of tokens) {
            pool.piecePossibilities.set(token.id, new Set(candidates?.get(token.id)
                ?? types.filter(type => token.probabilities[type] > 0)));
        }
        const before = legacyToQuantumState(tokens, pool, turn, history.length, history.at(-1) ?? null);
        // An incomplete display snapshot cannot support an explanation of King safety.
        if (['white', 'black'].some(side => !before.pieces.some(piece =>
            piece.alive && piece.owner === side && (piece.state & PIECE_KING)))) return null;
        const candidate = generateLegalMoves(before, mover.id).find(move =>
            move.target.row === hint.toRow && move.target.col === hint.toCol);
        if (!candidate) return null;
        const castling = (candidate.requiredTypes & PIECE_KING) !== 0
            && hint.fromRow === hint.toRow && Math.abs(hint.toCol - hint.fromCol) === 2;
        const promotion = !mover.promotedTo && (candidate.requiredTypes & PIECE_PAWN) !== 0
            && (hint.toRow === 0 || hint.toRow === 7);
        // Match the actual player dialogs, retaining every candidate for ordinary moves.
        const chosenType = hint.promotionTarget ? PIECE_PAWN
            : hint.intention === 'castle' ? PIECE_KING
                : candidate.requiredTypes & ~(castling ? PIECE_KING : 0) & ~(promotion ? PIECE_PAWN : 0);
        const move = { pieceId: mover.id, target: candidate.target, chosenType,
            promotionTarget: hint.promotionTarget };
        const expected = adviceForMove(before, move);
        if (expected.intention !== hint.intention || expected.promotionTarget !== hint.promotionTarget
            || !!expected.declinePromotion !== !!hint.declinePromotion) return null;
        const after = applyMove(before, move);
        const moved = after.pieces.find(piece => piece.id === mover.id)!;
        const original = before.pieces.find(piece => piece.id === mover.id)!;
        const remaining = names(moved.promotedType ?? moved.state);
        const previous = new Map(before.pieces.map(piece => [piece.id, piece]));
        return {
            remaining,
            excluded: hint.promotionTarget ? [] : names(original.promotedType ?? original.state)
                .filter(type => !remaining.includes(type)),
            capturedSquares: after.pieces.flatMap(piece => {
                const old = previous.get(piece.id)!;
                return old.alive && !piece.alive ? [squareName(old.position.row, old.position.col)] : [];
            }),
            otherChanges: after.pieces.flatMap(piece => {
                const old = previous.get(piece.id)!;
                return piece.alive && piece.id !== mover.id && old.state !== piece.state
                    ? [{ square: squareName(piece.position.row, piece.position.col),
                        remaining: names(piece.promotedType ?? piece.state) }] : [];
            }),
            givesCheck: !after.winner && isPlayerInCheck(after.sideToMove, after),
            escapesCheck: isPlayerInCheck(turn, before) && !isPlayerInCheck(turn, after),
        };
    } catch {
        // Old or incompatible snapshots must not break the board or invent a rationale.
        return null;
    }
}
