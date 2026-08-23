/**
 * Q-Gambit: Quantum Chess Logic Utilities
 * 
 * Core quantum mechanics:
 * 1. Superposition - Pieces exist in multiple states until observed
 * 2. Observation - Movement filters possibilities based on valid moves
 * 3. Entanglement - Team piece limits cause wave function collapse
 */

// Piece type limits per team
export const PIECE_LIMITS = {
    P: 8, // Pawns
    N: 2, // Knights
    B: 2, // Bishops
    R: 2, // Rooks
    Q: 1, // Queen
    K: 1, // King
};

// All possible piece types
export const PIECE_TYPES = ['P', 'N', 'B', 'R', 'Q', 'K'];

// Unicode symbols for pieces
export const SYMBOLS = {
    P: '♟',
    N: '♞',
    B: '♝',
    R: '♜',
    Q: '♛',
    K: '♚',
};

/**
 * Create initial board state with all pieces in superposition
 * @returns {{ board: (number|null)[], pieces: Piece[] }}
 */
export function createInitialBoard() {
    const pieces = [];
    const board = new Array(64).fill(null);
    let pieceId = 0;

    // White pieces (team 0) - rows 0-1 (y=0,1)
    for (let x = 0; x < 8; x++) {
        // Back row (y=0)
        pieces.push({
            id: pieceId,
            team: 0,
            possibilities: [...PIECE_TYPES],
            x,
            y: 0,
            captured: false,
        });
        board[x] = pieceId++;

        // Pawn row (y=1)
        pieces.push({
            id: pieceId,
            team: 0,
            possibilities: [...PIECE_TYPES],
            x,
            y: 1,
            captured: false,
        });
        board[8 + x] = pieceId++;
    }

    // Black pieces (team 1) - rows 6-7 (y=6,7)
    for (let x = 0; x < 8; x++) {
        // Pawn row (y=6)
        pieces.push({
            id: pieceId,
            team: 1,
            possibilities: [...PIECE_TYPES],
            x,
            y: 6,
            captured: false,
        });
        board[48 + x] = pieceId++;

        // Back row (y=7)
        pieces.push({
            id: pieceId,
            team: 1,
            possibilities: [...PIECE_TYPES],
            x,
            y: 7,
            captured: false,
        });
        board[56 + x] = pieceId++;
    }

    return { board, pieces };
}

/**
 * Convert x,y coordinates to board index
 */
export function coordToIndex(x, y) {
    return y * 8 + x;
}

/**
 * Convert board index to x,y coordinates
 */
export function indexToCoord(index) {
    return { x: index % 8, y: Math.floor(index / 8) };
}

/**
 * Check if coordinates are within board bounds
 */
export function isInBounds(x, y) {
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
export function isPathClear(board, fromX, fromY, toX, toY) {
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
 * @returns {boolean} True if move is valid
 */
export function isValidMoveForType(pieceType, fromX, fromY, toX, toY, team, board, isCapture) {
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
            return absDx <= 1 && absDy <= 1 && (absDx + absDy > 0);

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
 * @returns {string[]} Filtered array of possible piece types
 */
export function filterPossibilities(piece, toX, toY, board, isCapture) {
    return piece.possibilities.filter(type =>
        isValidMoveForType(type, piece.x, piece.y, toX, toY, piece.team, board, isCapture)
    );
}

/**
 * Count confirmed (single-possibility) pieces of each type for a team
 * Includes both active and captured pieces that were confirmed
 * @param {Piece[]} pieces - All pieces
 * @param {number} team - Team to count (0 or 1)
 * @returns {Object} Count of each confirmed piece type
 */
export function countConfirmedPieces(pieces, team) {
    const counts = { P: 0, N: 0, B: 0, R: 0, Q: 0, K: 0 };

    pieces.forEach(piece => {
        // Count all confirmed pieces (both active and captured)
        if (piece.team === team && piece.possibilities.length === 1) {
            counts[piece.possibilities[0]]++;
        }
    });

    return counts;
}

/**
 * Count captured pieces by their possibilities
 * Used to determine which piece types have been removed from the board
 * @param {Piece[]} pieces - All pieces
 * @param {number} team - Team to count (0 or 1)
 * @returns {Object} Counts per piece type that were captured
 */
export function countCapturedPieces(pieces, team) {
    const counts = { P: 0, N: 0, B: 0, R: 0, Q: 0, K: 0 };

    pieces.filter(p => p.team === team && p.captured).forEach(piece => {
        if (piece.possibilities.length === 1) {
            counts[piece.possibilities[0]]++;
        }
    });

    return counts;
}

/**
 * Resolve quantum entanglement - remove possibilities that exceed team limits
 * This propagates through all pieces when one piece's state changes
 * 
 * @param {Piece[]} pieces - All pieces (will create new array with updated pieces)
 * @param {number} team - Team to check (0 or 1)
 * @returns {Piece[]} New pieces array with entanglement resolved
 */
export function resolveEntanglement(pieces, team) {
    let result = [...pieces];
    let changed = true;
    let iterations = 0;
    const maxIterations = 100; // Prevent infinite loops

    // Keep iterating until no more changes (propagation complete)
    while (changed && iterations < maxIterations) {
        changed = false;
        iterations++;

        // Count confirmed pieces at the start of each iteration
        const confirmedCounts = countConfirmedPieces(result, team);

        result = result.map(piece => {
            if (piece.team !== team || piece.captured || piece.possibilities.length <= 1) {
                return piece;
            }

            // Remove possibilities that are at their limit
            const filteredPossibilities = piece.possibilities.filter(type =>
                confirmedCounts[type] < PIECE_LIMITS[type]
            );

            // Check if anything changed
            if (filteredPossibilities.length !== piece.possibilities.length) {
                changed = true;

                // If only one possibility left, it's now confirmed - update counts for next iteration
                if (filteredPossibilities.length === 1) {
                    confirmedCounts[filteredPossibilities[0]]++;
                }

                // Handle edge case: no possibilities left
                if (filteredPossibilities.length === 0) {
                    console.error('Quantum collapse error: No valid possibilities for piece', piece.id);
                    return { ...piece, possibilities: ['P'] }; // Fallback
                }

                return { ...piece, possibilities: filteredPossibilities };
            }

            return piece;
        });
    }

    if (iterations >= maxIterations) {
        console.warn('[Entanglement] Max iterations reached, possible infinite loop');
    }

    return result;
}

/**
 * Attempt to move a piece, applying quantum observation and entanglement
 * @param {Piece[]} pieces - All pieces
 * @param {(number|null)[]} board - Current board
 * @param {number} pieceId - ID of piece to move
 * @param {number} toX - Destination X
 * @param {number} toY - Destination Y
 * @returns {{ success: boolean, pieces: Piece[], board: (number|null)[], capturedPiece: Piece|null, message: string }}
 */
export function attemptMove(pieces, board, pieceId, toX, toY) {
    const pieceIndex = pieces.findIndex(p => p.id === pieceId);
    if (pieceIndex === -1) {
        return { success: false, pieces, board, capturedPiece: null, message: 'Piece not found' };
    }

    const piece = { ...pieces[pieceIndex] };
    const fromX = piece.x;
    const fromY = piece.y;

    // Check destination for capture
    const destIndex = coordToIndex(toX, toY);
    const destPieceId = board[destIndex];
    const isCapture = destPieceId !== null;
    let capturedPiece = null;

    // Validate it's not your own piece
    if (isCapture) {
        const targetPiece = pieces.find(p => p.id === destPieceId);
        if (targetPiece && targetPiece.team === piece.team) {
            return { success: false, pieces, board, capturedPiece: null, message: 'Cannot capture your own piece' };
        }
        capturedPiece = targetPiece;
    }

    // Filter possibilities based on the move (observation)
    const newPossibilities = filterPossibilities(piece, toX, toY, board, isCapture);

    if (newPossibilities.length === 0) {
        return { success: false, pieces, board, capturedPiece: null, message: 'Invalid move for this piece' };
    }

    // Update piece
    piece.possibilities = newPossibilities;
    piece.x = toX;
    piece.y = toY;

    // Update pieces array
    const newPieces = [...pieces];
    newPieces[pieceIndex] = piece;

    // Handle capture
    if (capturedPiece) {
        const capturedIndex = newPieces.findIndex(p => p.id === capturedPiece.id);
        newPieces[capturedIndex] = { ...newPieces[capturedIndex], captured: true };
    }

    // Update board
    const newBoard = [...board];
    newBoard[coordToIndex(fromX, fromY)] = null;
    newBoard[destIndex] = pieceId;

    // Resolve entanglement for both teams (chain the results)
    let resolvedPieces = resolveEntanglement(newPieces, 0);
    resolvedPieces = resolveEntanglement(resolvedPieces, 1);

    return {
        success: true,
        pieces: resolvedPieces,
        board: newBoard,
        capturedPiece,
        message: newPossibilities.length === 1
            ? `Piece collapsed to ${SYMBOLS[newPossibilities[0]]}!`
            : `Piece now has ${newPossibilities.length} possibilities`
    };
}

/**
 * Get all valid destination squares for a piece
 * @param {Piece} piece - The piece to check
 * @param {(number|null)[]} board - Current board state
 * @param {Piece[]} pieces - All pieces (to check teams)
 * @returns {Array<{x: number, y: number, isCapture: boolean}>} Valid moves
 */
/**
 * Get all valid destination squares for a piece
 * Optimized: Uses vector-based lookup instead of scanning the whole board
 * @param {Piece} piece - The piece to check
 * @param {(number|null)[]} board - Current board state
 * @param {Piece[]} pieces - All pieces (to check teams)
 * @returns {Array<{x: number, y: number, isCapture: boolean}>} Valid moves
 */
export function getValidMoves(piece, board, pieces) {
    const validMoves = [];

    // Union of all possible move types this quantum piece could be
    const moveTypes = new Set(piece.possibilities);

    // Helpers to add move if valid
    const checkAndAdd = (x, y) => {
        if (!isInBounds(x, y)) return;
        if (x === piece.x && y === piece.y) return; // Can't move to self

        const destIndex = coordToIndex(x, y);
        const destPieceId = board[destIndex];
        const isCapture = destPieceId !== null;

        // Can't capture own piece
        if (isCapture) {
            const targetPiece = pieces.find(p => p.id === destPieceId);
            if (targetPiece && targetPiece.team === piece.team) return;
        }

        // Check if any current possibility allows this move
        // Optimization: Pass pre-calculated flags to avoid redundant checks inside filterPossibilities if needed
        // For now, we rely on filterPossibilities doing the geometry check
        // Check if any current possibility allows this move
        // Optimization: Pass pre-calculated flags to avoid redundant checks inside filterPossibilities if needed
        // For now, we rely on filterPossibilities doing the geometry check
        const validTypes = filterPossibilities(piece, x, y, board, isCapture);
        if (validTypes.length > 0) {
            validMoves.push({ x, y, isCapture });
        }
    };

    // 1. Sliding moves (R, B, Q)
    const diagonals = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const straights = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    let directions = [];
    if (moveTypes.has('Q')) directions = [...diagonals, ...straights];
    else {
        if (moveTypes.has('B')) directions.push(...diagonals);
        if (moveTypes.has('R')) directions.push(...straights);
    }

    // Process sliding directions
    for (const [dx, dy] of directions) {
        let x = piece.x + dx;
        let y = piece.y + dy;

        while (isInBounds(x, y)) {
            checkAndAdd(x, y);
            // If blocked, stop sliding in this direction
            if (board[coordToIndex(x, y)] !== null) break;
            x += dx;
            y += dy;
        }
    }

    // 2. Knight moves (N)
    if (moveTypes.has('N') || moveTypes.has('K') || moveTypes.has('P')) { // Check finite steps
        const knightMoves = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
        const kingMoves = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

        let steps = [];
        if (moveTypes.has('N')) steps.push(...knightMoves);
        if (moveTypes.has('K')) steps.push(...kingMoves);

        // Filter unique steps (e.g. if K and Q both exist, K adds King steps but Q handles them via sliding usually,
        // but Q doesn't step 1 dist if blocked... wait, Q is sliding. K is step.)
        // Simplified: Just check all target squares for step pieces

        for (const [dx, dy] of steps) {
            checkAndAdd(piece.x + dx, piece.y + dy);
        }

        // 3. Pawn moves (P)
        if (moveTypes.has('P')) {
            const forward = piece.team === 0 ? 1 : -1;
            // Move forward 1
            checkAndAdd(piece.x, piece.y + forward);
            // Move forward 2 (handled by checkAndAdd logic validating it)
            checkAndAdd(piece.x, piece.y + forward * 2);
            // Captures
            checkAndAdd(piece.x - 1, piece.y + forward);
            checkAndAdd(piece.x + 1, piece.y + forward);
        }
    }

    // Post-processing: Deduplicate moves (since Q and B might share diagonal checks, or K and P might overlap)
    // Using a Map to dedupe by "x,y" key
    const uniqueMoves = new Map();
    validMoves.forEach(m => uniqueMoves.set(`${m.x},${m.y}`, m));

    return Array.from(uniqueMoves.values());
}

/**
 * Check if a team's King is confirmed and captured (game over)
 * Note: In quantum chess, King capture ends the game when King is confirmed
 * @param {Piece[]} pieces - All pieces
 * @param {number} team - Team to check
 * @returns {boolean} True if team has lost (King captured)
 */
export function isKingCaptured(pieces, team) {
    // Find all pieces that could be the King
    const potentialKings = pieces.filter(p =>
        p.team === team &&
        !p.captured &&
        p.possibilities.includes('K')
    );

    // If no pieces can be King, King must have been captured
    return potentialKings.length === 0;
}

/**
 * Check if any confirmed King is captured
 * @param {Piece[]} pieces - All pieces
 * @returns {'WHITE' | 'BLACK' | null} Winner, or null if game continues
 */
export function checkGameOver(pieces) {
    if (isKingCaptured(pieces, 0)) return 'BLACK';
    if (isKingCaptured(pieces, 1)) return 'WHITE';
    return null;
}

/**
 * Check if the King of a specific team is in check
 * @param {(number|null)[]} board - Current board state
 * @param {Piece[]} pieces - All pieces
 * @param {number} team - Team to check (0 or 1)
 * @returns {boolean} True if King is in check
 */
export function isKingInCheck(board, pieces, team) {
    // 1. Find the King
    // We only consider check if the King is CONFIRMED (1 possibility 'K')
    // If King is superposed, "check" is ambiguous, so we skip it for simplicity
    const king = pieces.find(p =>
        p.team === team &&
        !p.captured &&
        p.possibilities.length === 1 &&
        p.possibilities[0] === 'K'
    );

    if (!king) return false;

    // 2. Check if any opponent piece can attack the King
    const opponentTeam = team === 0 ? 1 : 0;
    const opponentPieces = pieces.filter(p => p.team === opponentTeam && !p.captured);

    for (const piece of opponentPieces) {
        // We can reuse filterPossibilities to see if moving to King's pos is valid
        // But we need to know if it's a capture move (King is there, so yes it's occupied)
        // filterPossibilities defined in this file (hoisted or available in scope)
        const validTypes = filterPossibilities(piece, king.x, king.y, board, true);
        if (validTypes.length > 0) {
            return true;
        }
    }

    return false;
}
