export const PIECE_PAWN = 1 << 0;   // 1
export const PIECE_KNIGHT = 1 << 1; // 2
export const PIECE_BISHOP = 1 << 2; // 4
export const PIECE_ROOK = 1 << 3;   // 8
export const PIECE_QUEEN = 1 << 4;  // 16
export const PIECE_KING = 1 << 5;   // 32

export const ALL_PIECE_TYPES = PIECE_PAWN | PIECE_KNIGHT | PIECE_BISHOP | PIECE_ROOK | PIECE_QUEEN | PIECE_KING; // 63

export type PlayerColor = 'white' | 'black';

export const MAX_PIECES = {
    PAWN: 8,
    KNIGHT: 2,
    BISHOP: 2,
    ROOK: 2,
    QUEEN: 1,
    KING: 1
} as const;

export const BOARD_SIZE = 8;
