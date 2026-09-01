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
export function hashState(state: GameState): string {
    const pStr = [...state.pieces]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(p => `${p.id}:${p.alive?1:0}:${p.position.row},${p.position.col}:${p.state}:${p.promotedType||0}:${p.hasMoved?1:0}`)
        .join('|');
        
    const lm = state.lastMove ? `${state.lastMove.pieceId}:${state.lastMove.target.row},${state.lastMove.target.col}` : 'none';
    
    return `${state.sideToMove}|cw:${state.captured.white}|cb:${state.captured.black}|lm:${lm}|${pStr}`;
}
