export type BoardTheme = 'classic' | 'marble' | 'neon';
export type HintMove = { fromRow: number; fromCol: number; toRow: number; toCol: number };
export const squareName = (row: number, col: number) => `${String.fromCharCode(97 + col)}${8 - row}`;
export function isValidHintMove(move: HintMove | null): move is HintMove {
    return !!move && [move.fromRow,move.fromCol,move.toRow,move.toCol].every(value => Number.isInteger(value) && value >= 0 && value < 8)
        && (move.fromRow !== move.toRow || move.fromCol !== move.toCol);
}

// The stage must never reach the playing surface. All dimensions are world units.
export const BOARD_HEIGHTS = { stage: -0.65, baseBottom: -0.49, rimTop: -0.03, squareTop: 0, overlay: 0.025 } as const;
export const BOARD_THEMES = {
    classic: { light: '#adb494', dark: '#424e3d', frame: '#283326', rim: '#c8ae74', stage: '#192019', label: '#eadbb6' },
    marble: { light: '#d9e0e5', dark: '#536574', frame: '#293c4c', rim: '#afbac5', stage: '#84949f', label: '#ecf2f6' },
    neon: { light: '#217f92', dark: '#322052', frame: '#11162c', rim: '#53e3eb', stage: '#0c0b1e', label: '#a0f5f7' },
} satisfies Record<BoardTheme, Record<string, string>>;

export function boardCamera(width: number, height: number, flipped = false, flat = false) {
    const narrow = width / height < 1.15;
    return {
        position: [0, flat ? 15 : 13, (flipped ? -1 : 1) * (flat ? 0.01 : narrow ? 5.5 : 7.5)] as [number, number, number],
        zoom: Math.min(width / 9.5, height / 9.3),
    };
}

// Arrow polygon in board coordinates. No marker IDs or rotation-specific offsets.
export function hintArrowPoints(move: HintMove): [number, number][] {
    if (!isValidHintMove(move)) return [];
    const dx = move.toCol - move.fromCol, dy = move.toRow - move.fromRow;
    const length = Math.hypot(dx, dy);
    if (!length) return [];
    const ux = dx / length, uy = dy / length;
    const point = (along: number, across: number): [number, number] => [
        move.fromCol + 0.5 + ux * along - uy * across,
        move.fromRow + 0.5 + uy * along + ux * across,
    ];
    return [point(0.34, -0.055), point(length - 0.32, -0.055), point(length - 0.32, -0.18),
        point(length - 0.08, 0), point(length - 0.32, 0.18), point(length - 0.32, 0.055), point(0.34, 0.055)];
}
