import { QuantumPiece } from '../types';
import { QuantumContradiction } from '../errors';
import { hasType, isCollapsed, removeType } from './quantumState';
import { getPieceLimit } from './constraints';
import { PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING, PlayerColor } from '../constants';

const ALL_TYPES_ARRAY = [PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING];

export function resolveQuantumState(pieces: readonly QuantumPiece[]): QuantumPiece[] {
    const currentPieces = pieces.map(p => ({ ...p }));
    let changed = true;

    while (changed) {
        changed = false;

        // Count fully collapsed pieces per player
        const collapsedCounts: Record<PlayerColor, Record<number, number>> = {
            white: { [PIECE_PAWN]: 0, [PIECE_KNIGHT]: 0, [PIECE_BISHOP]: 0, [PIECE_ROOK]: 0, [PIECE_QUEEN]: 0, [PIECE_KING]: 0 },
            black: { [PIECE_PAWN]: 0, [PIECE_KNIGHT]: 0, [PIECE_BISHOP]: 0, [PIECE_ROOK]: 0, [PIECE_QUEEN]: 0, [PIECE_KING]: 0 }
        };

        for (const p of currentPieces) {
            if (p.state === 0) {
                throw new QuantumContradiction(`Piece ${p.id} has no possible states remaining.`);
            }
            if (isCollapsed(p.state)) {
                collapsedCounts[p.owner][p.state]++;
            }
        }

        // Apply constraints
        for (let i = 0; i < currentPieces.length; i++) {
            const p = currentPieces[i];
            if (isCollapsed(p.state)) {
                // Wait, what if the board already has too many collapsed pieces?
                if (collapsedCounts[p.owner][p.state] > getPieceLimit(p.state)) {
                    throw new QuantumContradiction(`Exceeded max piece limit for type ${p.state} for player ${p.owner}`);
                }
                continue;
            }

            let newState = p.state;
            for (const type of ALL_TYPES_ARRAY) {
                if (hasType(newState, type)) {
                    const limit = getPieceLimit(type);
                    const current = collapsedCounts[p.owner][type];
                    if (current >= limit) {
                        // Max pieces of this type reached, so it cannot be this type
                        newState = removeType(newState, type);
                    }
                }
            }

            if (newState !== p.state) {
                if (newState === 0) {
                    throw new QuantumContradiction(`Piece ${p.id} was reduced to 0 possible states due to exhaustion.`);
                }
                currentPieces[i].state = newState;
                changed = true;
            }
        }
    }

    return currentPieces;
}
