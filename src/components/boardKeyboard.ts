/** Move focus in screen coordinates. Navigation never commits a chess move. */
export function nextBoardFocus(index: number, key: string, flipped: boolean, control = false): number | null {
    let row = Math.floor(index / 8), col = index % 8;
    const direction = flipped ? -1 : 1;
    switch (key) {
        case 'ArrowUp': row -= direction; break;
        case 'ArrowDown': row += direction; break;
        case 'ArrowLeft': col -= direction; break;
        case 'ArrowRight': col += direction; break;
        case 'Home':
            col = flipped ? 7 : 0;
            if (control) row = flipped ? 7 : 0;
            break;
        case 'End':
            col = flipped ? 0 : 7;
            if (control) row = flipped ? 0 : 7;
            break;
        default: return null;
    }
    return Math.max(0, Math.min(7, row)) * 8 + Math.max(0, Math.min(7, col));
}
