import { generateLegalMoves } from './moveGenerator';
import { posEquals } from './board';
import { hasType } from './quantum/quantumState';
import { Token } from '../lib/GameEngine';
import { IdentityPool } from '../lib/IdentityPool';
import { PieceType } from '../config/gameConfig';
import { GameState, QuantumPiece, Move } from './types';
import { ALL_PIECE_TYPES, PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING } from './constants';

const TYPE_TO_BIT: Record<PieceType, number> = {
    'Pawn': PIECE_PAWN,
    'Knight': PIECE_KNIGHT,
    'Bishop': PIECE_BISHOP,
    'Rook': PIECE_ROOK,
    'Queen': PIECE_QUEEN,
    'King': PIECE_KING
};

const BIT_TO_TYPE: Record<number, PieceType> = {
    [PIECE_PAWN]: 'Pawn',
    [PIECE_KNIGHT]: 'Knight',
    [PIECE_BISHOP]: 'Bishop',
    [PIECE_ROOK]: 'Rook',
    [PIECE_QUEEN]: 'Queen',
    [PIECE_KING]: 'King'
};

export function legacyToQuantumState(tokens: Token[], pool: IdentityPool, sideToMove: 'white' | 'black', ply: number = 0, lastMove: any = null): GameState {
    const pieces: QuantumPiece[] = tokens.map(t => {
        let stateBits = 0;
        const p = pool.piecePossibilities.get(t.id);
        if (p) {
            for (const type of Array.from(p)) {
                stateBits |= TYPE_TO_BIT[type];
            }
        }
        
        let promotedTypeBits: number | undefined = undefined;
        if (t.promotedTo) {
            promotedTypeBits = TYPE_TO_BIT[t.promotedTo];
            stateBits = PIECE_PAWN; // In legacy, promoted pieces might still have weird possibilities, but in quantum they are pawns
        }

        return {
            id: t.id,
            owner: t.player,
            origin: { row: t.player === 'white' ? 7 : 0, col: 0 },
            position: { row: t.row, col: t.col },
            state: stateBits === 0 ? ALL_PIECE_TYPES : stateBits,
            promoted: !!t.promotedTo,
            promotedType: promotedTypeBits,
            alive: !t.isCaptured,
            hasMoved: !!t.hasMoved
        };
    });

    let whiteCaptured = 0;
    let blackCaptured = 0;
    for (const t of tokens) {
        if (t.isCaptured) {
            if (t.player === 'white') blackCaptured++;
            else whiteCaptured++;
        }
    }

    let qLastMove: Move | undefined = undefined;
    if (lastMove) {
        qLastMove = {
            pieceId: lastMove.tokenId || lastMove.pieceId,
            target: { row: lastMove.targetRow || lastMove.toRow || 0, col: lastMove.targetCol || lastMove.toCol || 0 }
        };
    }

    return {
        pieces,
        sideToMove,
        ply,
        captured: { white: whiteCaptured, black: blackCaptured },
        winner: null,
        lastMove: qLastMove,
        hash: ''
    };
}


export function quantumToLegacyMove(move: Move, state: GameState): any {
    let requiredBits = 0;
    if (move.chosenType !== undefined) {
        requiredBits = move.chosenType;
    } else if (state) {
        const legalMoves = generateLegalMoves(state, move.pieceId);
        const candidate = legalMoves.find(m => posEquals(m.target, move.target));
        if (candidate) requiredBits = candidate.requiredTypes;
    }

    const types: PieceType[] = [];
    if (requiredBits > 0) {
        const allTypes = [PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING];
        for (const t of allTypes) {
            if (hasType(requiredBits, t)) {
                types.push(BIT_TO_TYPE[t]);
            }
        }
    }
    
    return {
        tokenId: move.pieceId,
        targetRow: move.target.row,
        targetCol: move.target.col,
        possibleTypes: types,
        promotedTo: move.promotionTarget ? BIT_TO_TYPE[move.promotionTarget] : undefined
    };
}
