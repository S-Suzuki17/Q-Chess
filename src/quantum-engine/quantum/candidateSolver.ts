import { QuantumPiece } from '../types';
import { QuantumContradiction } from '../errors';
import { hasType, removeType } from './quantumState';
import { getPieceLimit } from './constraints';
import { PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING, PlayerColor } from '../constants';

const ALL_TYPES_ARRAY = [PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING];

const SUBSETS: number[] = [];
for (let i = 1; i < 64; i++) {
    SUBSETS.push(i);
}

export function resolveQuantumState(pieces: readonly QuantumPiece[]): QuantumPiece[] {
    // Clone pieces to avoid mutating original
    const currentPieces = pieces.map(p => ({ ...p }));
    let changed = true;
    let loopCount = 0;
    const MAX_LOOPS = 20;

    while (changed && loopCount < MAX_LOOPS) {
        changed = false;
        loopCount++;

        for (const player of ['white', 'black'] as PlayerColor[]) {
            const playerPieces = currentPieces.filter(p => p.owner === player);

            // If a piece has state 0, it's a contradiction
            for (const p of playerPieces) {
                if (p.state === 0) {
                    throw new QuantumContradiction(`Piece ${p.id} has no possible states remaining.`);
                }
            }

            for (const subsetMask of SUBSETS) {
                // Calculate max allowed pieces for this subset
                let reqCount = 0;
                for (const type of ALL_TYPES_ARRAY) {
                    if ((subsetMask & type) !== 0) {
                        reqCount += getPieceLimit(type);
                    }
                }

                // Find pieces whose possible states are entirely contained within this subset
                // A piece is in the subset if it has NO bits outside the subset mask.
                // i.e. (p.state & ~subsetMask) === 0
                const piecesInSubset = playerPieces.filter(p => (p.state & ~subsetMask) === 0);

                if (piecesInSubset.length > reqCount) {
                    throw new QuantumContradiction(`Exceeded max piece limit for subset mask ${subsetMask} for player ${player}`);
                }

                if (piecesInSubset.length === reqCount) {
                    // This subset is fully saturated. 
                    // No other piece can be any of the types in this subset.
                    for (const p of playerPieces) {
                        // If the piece is NOT one of the pieces locked into this subset
                        if (!piecesInSubset.find(subsetPiece => subsetPiece.id === p.id)) {
                            const overlap = p.state & subsetMask;
                            if (overlap !== 0) {
                                p.state = p.state & ~subsetMask;
                                changed = true;
                                if (p.state === 0) {
                                    throw new QuantumContradiction(`Piece ${p.id} state reduced to 0 by subset exhaustion.`);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (loopCount >= MAX_LOOPS) {
        // Technically should be fine, but just in case of infinite loop logic errors
        throw new QuantumContradiction("Solver reached max loops (unresolvable circular dependency)");
    }

    // Post-solver validation: Both players MUST have at least one potential King
    const whiteHasKing = currentPieces.some(p => p.alive && p.owner === 'white' && hasType(p.state, PIECE_KING));
    const blackHasKing = currentPieces.some(p => p.alive && p.owner === 'black' && hasType(p.state, PIECE_KING));
    
    if (!whiteHasKing) {
        throw new QuantumContradiction("White has no potential Kings remaining.");
    }
    if (!blackHasKing) {
        throw new QuantumContradiction("Black has no potential Kings remaining.");
    }

    return currentPieces;
}
