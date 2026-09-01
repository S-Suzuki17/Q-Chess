import { GameState, QuantumPiece, MoveCandidate } from './types';
import { deduceMoveTypesGeometry } from './move';
import { posEquals } from './board';
import { PIECE_KING, PIECE_KNIGHT, PIECE_PAWN } from './constants';
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
    const hasMoved = piece.hasMoved;
    const kingStartRow = piece.owner === 'white' ? 7 : 0;
    const forwardDir = piece.owner === 'white' ? -1 : 1;
    
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const targetPos = { row: r, col: c };
            if (posEquals(piece.position, targetPos)) continue;

            const targetPiece = state.pieces.find(p => p.alive && posEquals(p.position, targetPos));
            if (targetPiece && targetPiece.owner === piece.owner) {
                continue; // Cannot capture own piece
            }

            const isCapture = !!targetPiece;
            let requiredTypes = deduceMoveTypesGeometry(piece.position, targetPos, piece.owner, isCapture, hasMoved);

            // Castling Extra Validation
            if (hasType(requiredTypes, PIECE_KING) && Math.abs(targetPos.col - piece.position.col) === 2 && Math.abs(targetPos.row - piece.position.row) === 0) {
                const cornerCol = targetPos.col > piece.position.col ? 7 : 0;
                const cornerToken = state.pieces.find(p => p.alive && p.owner === piece.owner && p.position.row === kingStartRow && p.position.col === cornerCol);
                
                // If corner piece has moved or doesn't exist, invalidate castling
                if (!cornerToken || cornerToken.hasMoved) {
                    requiredTypes &= ~PIECE_KING;
                }
            }

            // En Passant Extra Validation
            if (!isCapture && Math.abs(targetPos.col - piece.position.col) === 1 && (targetPos.row - piece.position.row) === forwardDir) {
                const lastMove = state.lastMove;
                if (lastMove) {
                    const lastMovePiece = state.pieces.find(p => p.id === lastMove.pieceId);
                    if (lastMovePiece && lastMovePiece.owner !== piece.owner && lastMovePiece.position.row === piece.position.row && lastMovePiece.position.col === targetPos.col) {
                        // Check if it moved 2 squares (from original pawn start)
                        // Actually, we don't store fromRow in lastMove right now.
                        // But if it's on row 3 (white's EP rank) or 4 (black's EP rank) 
                        // and it's the last moved piece, it must have been a 2-square pawn move if its state was pawn.
                        const isPawnStartRankEP = (piece.owner === 'white' && piece.position.row === 3) || (piece.owner === 'black' && piece.position.row === 4);
                        if (isPawnStartRankEP) {
                            requiredTypes |= PIECE_PAWN;
                        }
                    }
                }
            }

            // Filter out types that the piece does not have
            if (piece.promotedType) {
                requiredTypes &= piece.promotedType;
            } else {
                requiredTypes &= piece.state;
            }

            if (requiredTypes === 0) continue;

            if (isBlocked(piece.position, targetPos, state.pieces)) {
                requiredTypes &= PIECE_KNIGHT;
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
