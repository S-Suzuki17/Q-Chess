import { GameState, QuantumPiece } from '../types';
import { PlayerColor, PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING } from '../constants';
import { hasType } from '../quantum/quantumState';
import { Evaluator } from './eval';

const PIECE_VALUES: Record<number, number> = {
    [PIECE_PAWN]: 1.0,
    [PIECE_KNIGHT]: 3.0,
    [PIECE_BISHOP]: 3.0,
    [PIECE_ROOK]: 5.0,
    [PIECE_QUEEN]: 9.0,
    [PIECE_KING]: 0.0 
};

export class EvalV3 implements Evaluator {
    evaluate(state: GameState, player: PlayerColor): number {
        if (state.winner === player) return 99999;
        if (state.winner && state.winner !== 'draw') return -99999;
        if (state.winner === 'draw') return 0;

        let score = 0;

        let myGoodPieces = 0;
        let oppGoodPieces = 0;

        let myAdvancement = 0;
        let oppAdvancement = 0;

        for (const p of state.pieces) {
            if (!p.alive) continue;
            
            let count = 0;
            let maxVal = 0;
            const types = [PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING];
            for (const t of types) {
                if (hasType(p.state, t)) {
                    count++;
                    const v = PIECE_VALUES[t];
                    if (v > maxVal) maxVal = v;
                }
            }

            // Material Value
            const matValue = maxVal + (count * 0.5);
            if (p.owner === player) score += matValue;
            else score -= matValue;

            // Good Piece logic (Count >= 3)
            if (count >= 3) {
                if (p.owner === player) {
                    myGoodPieces++;
                    myAdvancement += (p.owner === 'white' ? (7 - p.position.row) : p.position.row);
                } else {
                    oppGoodPieces++;
                    oppAdvancement += (p.owner === 'white' ? (7 - p.position.row) : p.position.row);
                }
            }
        }

        // Asymmetric Flexibility Evaluation:
        // We value preserving OUR flexibility much higher than destroying the OPPONENT's flexibility.
        // This prevents the AI from sacrificing its own flexibility just to capture an opponent's piece.
        score += myGoodPieces * 30.0;
        score -= oppGoodPieces * 5.0;

        // Positional Bonus only for Good Pieces
        score += myAdvancement * 2.0;
        score -= oppAdvancement * 2.0;

        return score;
    }
}
