import { GameState, QuantumPiece, MoveCandidate } from './types';
import { deduceMoveTypesGeometry } from './move';
import { posEquals, isOutOfBounds } from './board';
import { hasType } from './quantum/quantumState';

export function isBlocked(
    start: {row: number, col: number}, 
    target: {row: number, col: number}, 
    pieces: readonly QuantumPiece[]
): boolean {
    const dr = target.row - start.row;
    const dc = target.col - start.col;
    const absDr = Math.abs(dr);
    const absDc = Math.abs(dc);

    if (absDr === 0 || absDc === 0 || absDr === absDc) {
        const stepR = absDr === 0 ? 0 : dr / absDr;
        const stepC = absDc === 0 ? 0 : dc / absDc;
        let r = start.row + stepR;
        let c = start.col + stepC;
        
        while (r !== target.row || c !== target.col) {
            if (pieces.some(p => p.alive && p.position.row === r && p.position.col === c)) {
                return true;
            }
            r += stepR;
            c += stepC;
        }
    }
    return false;
}

export function generateLegalMoves(state: GameState, pieceId: string): MoveCandidate[] {
    const piece = state.pieces.find(p => p.id === pieceId);
    if (!piece || !piece.alive || piece.owner !== state.sideToMove) return [];

    const candidates: MoveCandidate[] = [];
    
    // Check every square on the board
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const targetPos = { row: r, col: c };
            if (posEquals(piece.position, targetPos)) continue;

            const targetPiece = state.pieces.find(p => p.alive && posEquals(p.position, targetPos));
            if (targetPiece && targetPiece.owner === piece.owner) {
                continue; // Cannot capture own piece
            }

            const isCapture = !!targetPiece;
            const hasMoved = piece.position.row !== piece.origin.row || piece.position.col !== piece.origin.col;

            let requiredTypes = deduceMoveTypesGeometry(piece.position, targetPos, piece.owner, isCapture, hasMoved);

            // Filter out types that the piece does not have
            requiredTypes = requiredTypes & piece.state;

            if (requiredTypes === 0) continue;

            // Check if path is blocked (for sliding pieces / pawn)
            if (isBlocked(piece.position, targetPos, state.pieces)) {
                // If path is blocked, only Knight can jump
                // Wait, if it's blocked, castling is also blocked.
                // We just mask out everything except Knight.
                // NOTE: Castling is tricky, it cannot jump over pieces.
                // So if blocked, we strictly keep KNIGHT.
                requiredTypes &= 2; // PIECE_KNIGHT is 2
            }

            if (requiredTypes !== 0) {
                candidates.push({
                    target: targetPos,
                    requiredTypes
                });
            }
        }
    }

    return candidates;
}
