import { Position } from './types';
import { BOARD_SIZE } from './constants';

export function isOutOfBounds(r: number, c: number): boolean {
    return r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE;
}

export function posToIndex(r: number, c: number): number {
    return r * BOARD_SIZE + c;
}

export function indexToPos(index: number): Position {
    return {
        row: Math.floor(index / BOARD_SIZE),
        col: index % BOARD_SIZE
    };
}

export function posEquals(p1: Position, p2: Position): boolean {
    return p1.row === p2.row && p1.col === p2.col;
}
