import { GameState, Move, QuantumPiece } from './types';
import { resolveQuantumState } from './quantum/candidateSolver';
import { generateLegalMoves } from './moveGenerator';
import { InvalidMove, QuantumContradiction } from './errors';
import { PIECE_PAWN, PIECE_KING, PIECE_ROOK } from './constants';
import { hasType } from './quantum/quantumState';
import { posEquals } from './board';
import { isPlayerInCheck } from './terminal';

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

    let usedType = candidate.requiredTypes;
    if (move.chosenType !== undefined) {
        if (move.chosenType === 0 || (usedType & move.chosenType) !== move.chosenType) {
            throw new InvalidMove("Chosen type is not valid for this move.");
        }
        usedType = move.chosenType;
    }

    let nextPieces = state.pieces.map(p => ({ ...p }));
    let movingPiece = nextPieces.find(p => p.id === move.pieceId)!;

    if (!movingPiece.promotedType) {
        movingPiece.state &= usedType;
    }

    let capturedWhite = state.captured.white;
    let capturedBlack = state.captured.black;

    // Normal Capture
    const targetPiece = nextPieces.find(p => p.alive && posEquals(p.position, move.target));
    if (targetPiece) {
        targetPiece.alive = false;
        targetPiece.position = { row: -1, col: -1 };
        targetPiece.state &= ~PIECE_KING;
        if (targetPiece.owner === 'white') capturedBlack++;
        else capturedWhite++;
    }

    // Castling Side Effect
    if (hasType(usedType, PIECE_KING) && Math.abs(move.target.col - movingPiece.position.col) === 2) {
        const isKingside = move.target.col > movingPiece.position.col;
        const rookCol = isKingside ? 7 : 0;
        const newRookCol = isKingside ? move.target.col - 1 : move.target.col + 1;
        const rookToken = nextPieces.find(p => p.alive && p.owner === movingPiece.owner && p.position.row === movingPiece.position.row && p.position.col === rookCol);
        if (rookToken) {
            rookToken.position = { row: movingPiece.position.row, col: newRookCol };
            rookToken.hasMoved = true;
            if (!rookToken.promotedType) {
                rookToken.state &= PIECE_ROOK;
            }
        }
    }

    // En Passant Side Effect
    if (hasType(usedType, PIECE_PAWN) && !targetPiece && move.target.col !== movingPiece.position.col) {
        const capturedRow = movingPiece.position.row;
        const capturedCol = move.target.col;
        const epPiece = nextPieces.find(p => p.alive && p.owner !== movingPiece.owner && p.position.row === capturedRow && p.position.col === capturedCol);
        if (epPiece) {
            epPiece.alive = false;
            epPiece.position = { row: -1, col: -1 };
            epPiece.state &= ~PIECE_KING;
            if (epPiece.owner === 'white') capturedBlack++;
            else capturedWhite++;
            // En Passant target MUST have been a pawn
            if (!epPiece.promotedType) {
                epPiece.state &= PIECE_PAWN;
            }
        }
    }

    movingPiece.position = move.target;
    movingPiece.hasMoved = true;

    // Promotion
    if (!movingPiece.promotedType && hasType(usedType, PIECE_PAWN)) {
        const promotionRow = movingPiece.owner === 'white' ? 0 : 7;
        if (movingPiece.position.row === promotionRow) {
            if (move.promotionTarget === undefined) {
                throw new InvalidMove("Promotion target required for pawn reaching end rank.");
            }
            movingPiece.state = PIECE_PAWN;
            movingPiece.promotedType = move.promotionTarget;
            movingPiece.promoted = true;
        }
    }

    const nextTurn = state.sideToMove === 'white' ? 'black' : 'white';
    const recordedMove = { ...move, from: piece.position, chosenType: usedType };
    let winner: GameState['winner'] = null;
    try {
        nextPieces = resolveQuantumState(nextPieces);
    } catch (error) {
        if (!(error instanceof QuantumContradiction) || !error.player) throw error;
        // A player cannot discard their own last King or exceed their own quota.
        if (error.player === state.sideToMove) throw new InvalidMove(error.message);
        winner = state.sideToMove;
        nextPieces = error.pieces ?? nextPieces;
    }

    const nextState: GameState = {
        pieces: nextPieces,
        sideToMove: nextTurn,
        ply: state.ply + 1,
        captured: { white: capturedWhite, black: capturedBlack },
        winner,
        lastMove: recordedMove,
        hash: ''
    };
    if (!winner && isPlayerInCheck(state.sideToMove, nextState)) {
        throw new InvalidMove('The move leaves your last possible King in check.');
    }
    return nextState;
}
