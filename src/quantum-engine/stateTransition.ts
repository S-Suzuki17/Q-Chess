import { GameState, Move, QuantumPiece, QuantumState } from './types';
import { resolveQuantumState } from './quantum/candidateSolver';
import { generateLegalMoves } from './moveGenerator';
import { InvalidMove, InvalidState } from './errors';
import { PIECE_PAWN, PIECE_KING, PIECE_ROOK } from './constants';
import { hasType, removeType } from './quantum/quantumState';
import { posEquals } from './board';

export function applyMove(state: GameState, move: Move): GameState {
    const piece = state.pieces.find(p => p.id === move.pieceId);
    if (!piece || !piece.alive || piece.owner !== state.sideToMove) {
        throw new InvalidMove("Invalid piece selected for move.");
    }

    const legalMoves = generateLegalMoves(state, move.pieceId);
    const candidate = legalMoves.find(m => posEquals(m.target, move.target));
    if (!candidate) {
        throw new InvalidMove("Move is not pseudo-legal.");
    }

    // Determine the type used to make this move
    let usedType = candidate.requiredTypes;
    if (move.chosenType !== undefined) {
        if (!hasType(usedType, move.chosenType)) {
            throw new InvalidMove("Chosen type is not valid for this move.");
        }
        usedType = move.chosenType;
    }

    // Clone pieces
    let nextPieces = state.pieces.map(p => ({ ...p }));
    let movingPiece = nextPieces.find(p => p.id === move.pieceId)!;

    // Apply movement constraint
    movingPiece.state &= usedType;

    // Handle captures
    const targetPiece = nextPieces.find(p => p.alive && posEquals(p.position, move.target));
    let capturedWhite = state.captured.white;
    let capturedBlack = state.captured.black;
    if (targetPiece) {
        targetPiece.alive = false;
        if (targetPiece.owner === 'white') capturedBlack++;
        else capturedWhite++;
    }

    // Handle En Passant / Castling logic omitted for brevity in Phase 1,
    // assuming standard captures for now.

    // Move the piece
    movingPiece.position = move.target;

    // Handle Promotion
    if (hasType(movingPiece.state, PIECE_PAWN)) {
        const promotionRow = movingPiece.owner === 'white' ? 0 : 7;
        if (movingPiece.position.row === promotionRow) {
            if (move.promotionTarget === undefined) {
                throw new InvalidMove("Promotion target required.");
            }
            movingPiece.state = move.promotionTarget;
            movingPiece.promoted = true;
        }
    }

    // Run Constraint Solver
    nextPieces = resolveQuantumState(nextPieces);

    return {
        pieces: nextPieces,
        sideToMove: state.sideToMove === 'white' ? 'black' : 'white',
        ply: state.ply + 1,
        captured: { white: capturedWhite, black: capturedBlack },
        winner: null,
        hash: ''
    };
}
