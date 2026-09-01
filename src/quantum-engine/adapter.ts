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

export function legacyToQuantumState(tokens: Token[], pool: IdentityPool, sideToMove: 'white' | 'black'): GameState {
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
            // We don't have origin tracking in legacy Token, but we can guess or it doesn't matter for non-pawns
            // Actually, castling requires origin. But in legacy, token.hasMoved handles it.
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

    return {
        pieces,
        sideToMove,
        ply: 0,
        captured: { white: whiteCaptured, black: blackCaptured },
        winner: null,
        // En Passant requires lastMove. The UI passes it into GameEngine? 
        // No, UI tracks moveHistory but doesn't pass lastMove to AI right now.
        // That means AI won't see EP. We'll leave it undefined for now.
        hash: ''
    };
}

export function quantumToLegacyMove(move: Move): any {
    const types: PieceType[] = [];
    if (move.chosenType !== undefined) {
        types.push(BIT_TO_TYPE[move.chosenType]);
    }
    
    return {
        tokenId: move.pieceId,
        targetRow: move.target.row,
        targetCol: move.target.col,
        possibleTypes: types,
        promotedTo: move.promotionTarget ? BIT_TO_TYPE[move.promotionTarget] : undefined
    };
}
