import { PlayerColor } from './constants';

/**
 * 8-bit integer representing candidates.
 */
export type QuantumState = number;

export interface Position {
    row: number;
    col: number;
}

export interface QuantumPiece {
    readonly id: string;
    readonly owner: PlayerColor;
    readonly origin: Position;
    readonly position: Position;
    readonly state: QuantumState;
    readonly promoted: boolean;
    readonly promotedType?: number;
    readonly hasMoved: boolean;
    readonly alive: boolean;
}

export interface GameState {
    readonly pieces: readonly QuantumPiece[];
    readonly sideToMove: PlayerColor;
    readonly ply: number;
    readonly captured: {
        readonly white: number; // Count of pieces captured by white
        readonly black: number; // Count of pieces captured by black
    };
    // Zobrist or custom deterministic hash
    readonly hash: string;
    // 'white', 'black', 'draw', or null if ongoing
    readonly winner: PlayerColor | 'draw' | null;
    readonly lastMove?: Move;
}

export interface Move {
    readonly pieceId: string;
    readonly target: Position;
    // If multiple interpretation types are valid, which one is chosen?
    readonly chosenType?: number;
    // If it triggers promotion
    readonly promotionTarget?: number;
}

// Result of checking pseudo-legal moves
export interface MoveCandidate {
    readonly target: Position;
    // The bitmask of types that could perform this move
    readonly requiredTypes: QuantumState; 
}
