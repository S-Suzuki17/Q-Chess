import { IdentityPool } from './IdentityPool';
import { calculateProbabilities, type Token } from './GameEngine';
import type { AIMove } from './AIEngine';
import type { MoveRecord } from './gameRecordService';
import type { GameState } from '../quantum-engine/types';
import { createInitialState } from '../quantum-engine/initialState';
import { legacyToQuantumState, TYPE_TO_BIT } from '../quantum-engine/adapter';
import { applyMove } from '../quantum-engine/stateTransition';
import { getWinner } from '../quantum-engine/terminal';
import type { PieceType } from '../config/gameConfig';

export function positionForDisplay(state: GameState) {
    const pool = new IdentityPool();
    const types = Object.keys(TYPE_TO_BIT) as PieceType[];
    for (const piece of state.pieces) {
        pool.piecePossibilities.set(piece.id, new Set(types.filter(type => (piece.state & TYPE_TO_BIT[type]) !== 0)));
    }
    const tokens: Token[] = state.pieces.map(piece => ({
        id: piece.id, player: piece.owner,
        origin: piece.origin,
        row: piece.alive ? piece.position.row : -1,
        col: piece.alive ? piece.position.col : -1,
        isCaptured: !piece.alive, hasMoved: piece.hasMoved,
        promotedTo: types.find(type => TYPE_TO_BIT[type] === piece.promotedType),
        probabilities: calculateProbabilities(pool, piece.id)
    }));
    return { pool, tokens };
}

export function createLocalPosition() {
    return positionForDisplay(createInitialState());
}

/** Human and CPU moves use the same transition and full-board deduction. */
export function applyLocalMove(tokens: Token[], pool: IdentityPool, move: AIMove,
    player: 'white' | 'black', history: MoveRecord[]) {
    const before = legacyToQuantumState(tokens, pool, player, history.length, history.at(-1) ?? null);
    let state = applyMove(before, {
        pieceId: move.tokenId, target: { row: move.targetRow, col: move.targetCol },
        chosenType: move.possibleTypes.reduce((mask, type) => mask | TYPE_TO_BIT[type], 0),
        promotionTarget: move.promotedTo ? TYPE_TO_BIT[move.promotedTo] : undefined
    });
    state = { ...state, winner: state.winner ?? getWinner(state) };
    const changedIds = state.pieces.filter(piece =>
        piece.state !== before.pieces.find(p => p.id === piece.id)?.state).map(p => p.id);
    const captured = state.pieces.find(p => !p.alive && before.pieces.find(b => b.id === p.id)?.alive);
    return { ...positionForDisplay(state), state, changedIds, capturedId: captured?.id };
}
