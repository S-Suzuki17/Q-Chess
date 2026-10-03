import { MAX_PIECES, PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING } from '../constants';

export const PIECE_LIMITS: Record<number, number> = {
    [PIECE_PAWN]: MAX_PIECES.PAWN,
    [PIECE_KNIGHT]: MAX_PIECES.KNIGHT,
    [PIECE_BISHOP]: MAX_PIECES.BISHOP,
    [PIECE_ROOK]: MAX_PIECES.ROOK,
    [PIECE_QUEEN]: MAX_PIECES.QUEEN,
    [PIECE_KING]: MAX_PIECES.KING
};

export function getPieceLimit(type: number): number {
    return PIECE_LIMITS[type] ?? 0;
}
