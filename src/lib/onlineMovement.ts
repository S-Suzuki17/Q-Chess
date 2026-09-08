// Online movement geometry mirrors server/src/game/quantumChess.ts.
// Keep parity tests in tests/online-movement.test.mjs when either side changes.
/**
 * Convert x,y coordinates to board index
 */
export function coordToIndex(x: number, y: number) {
    return y * 8 + x;
}

/**
 * Convert board index to x,y coordinates
 */
export function indexToCoord(index: number) {
    return { x: index % 8, y: Math.floor(index / 8) };
}

/**
 * Check if coordinates are within board bounds
 */
export function isInBounds(x: number, y: number) {
    return x >= 0 && x < 8 && y >= 0 && y < 8;
}

/**
 * Check if a path is clear for sliding pieces (R, B, Q)
 * @param {(number|null)[]} board - Current board state
 * @param {number} fromX - Starting X
 * @param {number} fromY - Starting Y
 * @param {number} toX - Destination X
 * @param {number} toY - Destination Y
 * @returns {boolean} True if path is clear
 */
export function isPathClear(board: (number | null)[], fromX: number, fromY: number, toX: number, toY: number) {
    const dx = Math.sign(toX - fromX);
    const dy = Math.sign(toY - fromY);

    let x = fromX + dx;
    let y = fromY + dy;

    while (x !== toX || y !== toY) {
        if (board[coordToIndex(x, y)] !== null) {
            return false;
        }
        x += dx;
        y += dy;
    }

    return true;
}

/**
 * Check if a move is valid for a specific piece type
 * @param {string} pieceType - 'P', 'N', 'B', 'R', 'Q', or 'K'
 * @param {number} fromX - Starting X
 * @param {number} fromY - Starting Y
 * @param {number} toX - Destination X
 * @param {number} toY - Destination Y
 * @param {number} team - 0 for white, 1 for black
 * @param {(number|null)[]} board - Current board state
 * @param {boolean} isCapture - Whether this move captures an opponent
 * @param {any} piece - Optional piece reference
 * @param {any[]} pieces - Optional pieces array
 * @returns {boolean} True if move is valid
 */
export function isValidMoveForType(pieceType: string, fromX: number, fromY: number, toX: number, toY: number, team: number, board: any[], isCapture: boolean, piece: any = null, pieces: any[] = []) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    switch (pieceType) {
        case 'P': {
            // Pawns move forward (different direction per team)
            const forward = team === 0 ? 1 : -1;
            const startRow = team === 0 ? 1 : 6;

            if (isCapture) {
                // Diagonal capture
                return dy === forward && absDx === 1;
            } else {
                // Forward move (no capture)
                if (dx !== 0) return false;
                if (dy === forward) return true;
                // Double move from start
                if (dy === forward * 2 && fromY === startRow) {
                    // Check intermediate square is empty
                    const midY = fromY + forward;
                    return board[coordToIndex(fromX, midY)] === null;
                }
                return false;
            }
        }

        case 'N':
            // Knight: L-shape movement, can jump
            return (absDx === 2 && absDy === 1) || (absDx === 1 && absDy === 2);

        case 'B':
            // Bishop: Diagonal only, sliding
            if (absDx !== absDy || absDx === 0) return false;
            return isPathClear(board, fromX, fromY, toX, toY);

        case 'R':
            // Rook: Horizontal/vertical only, sliding
            if (dx !== 0 && dy !== 0) return false;
            if (dx === 0 && dy === 0) return false;
            return isPathClear(board, fromX, fromY, toX, toY);

        case 'Q':
            // Queen: Diagonal or straight, sliding
            if (absDx !== absDy && dx !== 0 && dy !== 0) return false;
            if (dx === 0 && dy === 0) return false;
            return isPathClear(board, fromX, fromY, toX, toY);

        case 'K':
            // King: One square in any direction
            if (absDx <= 1 && absDy <= 1 && (absDx + absDy > 0)) return true;
            // Castling
            if (absDx === 2 && dy === 0 && piece && pieces) {
                const kingStartRow = team === 0 ? 0 : 7;
                if (fromY === kingStartRow && !piece.hasMoved) {
                    const rookX = dx > 0 ? 7 : 0;
                    const rookId = board[coordToIndex(rookX, kingStartRow)];
                    if (rookId !== null) {
                        const rookPiece = pieces.find((p: any) => p.id === rookId);
                        if (rookPiece && rookPiece.team === team && !rookPiece.hasMoved && !rookPiece.captured) {
                            return isPathClear(board, fromX, fromY, toX, toY);
                        }
                    }
                }
            }
            return false;
            
        default:
            return false;
    }
}

/**
 * Filter piece possibilities based on attempted move
 * This is the core "observation" mechanic - the wave function collapses
 * to only those piece types that could legally make this move
 * 
 * @param {Piece} piece - The piece being moved
 * @param {number} toX - Destination X
 * @param {number} toY - Destination Y
 * @param {(number|null)[]} board - Current board state
 * @param {boolean} isCapture - Whether this move captures an opponent
 * @param {any[]} pieces - Optional pieces array
 * @returns {string[]} Filtered array of possible piece types
 */
export function filterPossibilities(piece: any, toX: number, toY: number, board: any[], isCapture: boolean, pieces: any[] = []) {
    return piece.possibilities.filter((type: string) =>
        isValidMoveForType(type, piece.x, piece.y, toX, toY, piece.team, board, isCapture, piece, pieces)
    );
}

