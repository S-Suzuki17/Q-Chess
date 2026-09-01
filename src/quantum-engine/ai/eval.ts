import { GameState, QuantumPiece } from '../types';
import { PlayerColor } from '../constants';
import { PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING } from '../constants';
import { hasType } from '../quantum/quantumState';

export interface Evaluator {
    evaluate(state: GameState, player: PlayerColor): number;
}

const PIECE_VALUES: Record<number, number> = {
    [PIECE_PAWN]: 1.0,
    [PIECE_KNIGHT]: 3.0,
    [PIECE_BISHOP]: 3.0,
    [PIECE_ROOK]: 5.0,
    [PIECE_QUEEN]: 9.0,
    [PIECE_KING]: 0.0 // Handled by winner state mostly, but we can assign a value if needed
};

export class EvalV0 implements Evaluator {
    evaluate(state: GameState, player: PlayerColor): number {
        if (state.winner === player) return 9999;
        if (state.winner && state.winner !== 'draw') return -9999;
        if (state.winner === 'draw') return 0;

        let score = 0;
        for (const p of state.pieces) {
            if (!p.alive) continue;
            if (p.owner === player) score += 1;
            else score -= 1;
        }
        return score;
    }
}

export class EvalV1 implements Evaluator {
    evaluate(state: GameState, player: PlayerColor): number {
        if (state.winner === player) return 9999;
        if (state.winner && state.winner !== 'draw') return -9999;
        if (state.winner === 'draw') return 0;

        let score = 0;
        for (const p of state.pieces) {
            if (!p.alive) continue;
            
            let pieceVal = this.getQuantumPieceValue(p);
            
            if (p.owner === player) score += pieceVal;
            else score -= pieceVal;
        }
        return score;
    }

    private getQuantumPieceValue(piece: QuantumPiece): number {
        if (piece.promoted && piece.promotedType !== undefined) {
            return PIECE_VALUES[piece.promotedType] || 1.0;
        }

        let maxVal = 0;
        let sumVal = 0;
        let count = 0;

        const types = [PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING];
        for (const t of types) {
            if (hasType(piece.state, t)) {
                const v = PIECE_VALUES[t];
                if (v > maxVal) maxVal = v;
                sumVal += v;
                count++;
            }
        }

        if (count === 0) return 0;

        // Hypothesis: The value of a superposition is higher than the average because the player has agency to collapse it optimally.
        // We evaluate it as a weighted blend of max possible value and average possible value.
        const avgVal = sumVal / count;
        
        // E.g., Queen (9) + Bishop (3). Max = 9, Avg = 6. 
        // A piece that CAN be a Queen is very valuable, but it's restricted by global limits.
        return (maxVal * 0.7) + (avgVal * 0.3);
    }
}
