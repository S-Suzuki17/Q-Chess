import { PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING, PlayerColor } from './constants';
import { Position } from './types';

// Pure geometric piece type deduction
export function deduceMoveTypesGeometry(
    start: Position, 
    target: Position, 
    color: PlayerColor, 
    isCapture: boolean, 
    hasMoved: boolean
): number {
    const dr = target.row - start.row;
    const dc = target.col - start.col;
    const absDr = Math.abs(dr);
    const absDc = Math.abs(dc);

    if (absDr === 0 && absDc === 0) return 0;

    let types = 0;
    const forwardDir = color === 'white' ? -1 : 1;
    const startRow = color === 'white' ? 6 : 1;

    // Pawn
    if (isCapture) {
        if (dr === forwardDir && absDc === 1) types |= PIECE_PAWN;
    } else {
        if (dc === 0) {
            if (dr === forwardDir) types |= PIECE_PAWN;
            else if (dr === forwardDir * 2 && start.row === startRow && !hasMoved) types |= PIECE_PAWN;
        }
    }

    // Knight
    if ((absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2)) {
        types |= PIECE_KNIGHT;
    }

    // Bishop
    if (absDr === absDc) {
        types |= PIECE_BISHOP;
    }

    // Rook
    if (absDr === 0 || absDc === 0) {
        types |= PIECE_ROOK;
    }

    // Queen
    if (absDr === absDc || absDr === 0 || absDc === 0) {
        types |= PIECE_QUEEN;
    }

    // King
    if (absDr <= 1 && absDc <= 1) {
        types |= PIECE_KING;
    }
    
    // Castling geometry (King moving 2 cols horizontally)
    const kingStartRow = color === 'white' ? 7 : 0;
    if (absDr === 0 && absDc === 2 && !hasMoved && start.row === kingStartRow) {
        types |= PIECE_KING;
    }

    return types;
}
