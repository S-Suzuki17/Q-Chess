import { GameState } from './types';

/**
 * GameState Equality Specification
 * Two GameStates are considered strictly equal if and only if their hashes match.
 * The hash guarantees equality of:
 * 1. sideToMove (whose turn it is)
 * 2. captured piece counts (white and black)
 * 3. En Passant rights (via lastMove signature)
 * 4. Piece states: 
 *    - id
 *    - alive (is it on the board)
 *    - position (row, col)
 *    - state (the quantum constraint bitmask)
 *    - promotedType (its movement capabilities if promoted)
 *    - hasMoved (affects castling and pawn double-move rights)
 */
import { computeZobristHash } from './zobrist';

export function hashState(state: GameState): string {
    return computeZobristHash(state).toString(16);
}
