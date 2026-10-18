import type { PieceType } from '../config/gameConfig';
import type { Token } from './GameEngine';
import { deduceMoveTypes } from './GameEngine';
import type { IdentityPool } from './IdentityPool';
import type { MoveRecord } from './gameRecordService';
import { legacyToQuantumState, TYPE_TO_BIT } from '../quantum-engine/adapter';
import { generateLegalMoves } from '../quantum-engine/moveGenerator';
import { applyMove } from '../quantum-engine/stateTransition';

const promotionTypes: readonly PieceType[] = ['Queen', 'Rook', 'Bishop', 'Knight'];

/** Destinations for the choices the existing local board can actually submit.
 * Keep ordinary candidate masks together; trying each identity separately would
 * invent choices that the UI does not offer. Simulated states are discarded. */
export function localMoveDestinations(tokens: Token[], pool: IdentityPool, selectedId: string,
    history: MoveRecord[]): { r: number; c: number }[] {
    const token = tokens.find(piece => piece.id === selectedId && !piece.isCaptured);
    if (!token) return [];
    // Selecting the opponent during its turn is also an inspection action.
    const last = history.at(-1);
    const state = legacyToQuantumState(tokens, pool, token.player, history.length, last ?? null);
    const lastMove = last ? { tokenId: last.tokenId, fromRow: last.from[0], fromCol: last.from[1],
        toRow: last.to[0], toCol: last.to[1] } : undefined;
    const possibilities = pool.piecePossibilities.get(token.id);
    return generateLegalMoves(state, token.id).flatMap(candidate => {
        const { row, col } = candidate.target;
        const types = deduceMoveTypes(token, row, col, tokens, lastMove)
            .filter(type => token.promotedTo ? type === token.promotedTo : possibilities?.has(type));
        if (!types.length) return [];
        const accepts = (choice: PieceType[], promotion?: PieceType) => {
            if (!choice.length) return false;
            try {
                applyMove(state, { pieceId: token.id, target: candidate.target,
                    chosenType: choice.reduce((mask, type) => mask | TYPE_TO_BIT[type], 0),
                    ...(promotion ? { promotionTarget: TYPE_TO_BIT[promotion] } : {}) });
                return true;
            } catch { return false; }
        };
        let legal: boolean;
        if (row === token.row && Math.abs(col - token.col) === 2 && types.includes('King')
            && (types.includes('Rook') || types.includes('Queen'))) {
            legal = accepts(['King']) || accepts(types.filter(type => type !== 'King'));
        } else if (!token.promotedTo && (row === 0 || row === 7) && types.includes('Pawn')) {
            // These are the four promotion buttons and the existing non-Pawn choice.
            legal = promotionTypes.some(type => accepts(types, type))
                || accepts(types.filter(type => type !== 'Pawn'));
        } else {
            legal = accepts(types);
        }
        return legal ? [{ r: row, c: col }] : [];
    });
}
