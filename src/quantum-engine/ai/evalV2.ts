import { GameState, QuantumPiece } from '../types';
import { PlayerColor } from '../constants';
import { PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING } from '../constants';
import { hasType } from '../quantum/quantumState';
import { EvalV1 } from './eval';

export class EvalV2 extends EvalV1 {
    evaluate(state: GameState, player: PlayerColor): number {
        if (state.winner === player) return 9999;
        if (state.winner && state.winner !== 'draw') return -9999;
        if (state.winner === 'draw') return 0;

        let score = super.evaluate(state, player); // Inherit material from V1

        // Hypothesis: Uncertainty Evaluation
        // A piece with many candidates has higher flexibility (Uncertainty Bonus).
        // Conversely, heavily restricted pieces (count = 1) might be weak, unless it's a Queen/King.
        let uncertaintyScore = 0;
        
        for (const p of state.pieces) {
            if (!p.alive) continue;
            
            let count = 0;
            const types = [PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING];
            for (const t of types) {
                if (hasType(p.state, t)) count++;
            }

            // Simple heuristic: +0.2 points for every candidate beyond 1
            const flexibilityBonus = count > 1 ? (count - 1) * 0.2 : 0;
            
            if (p.owner === player) uncertaintyScore += flexibilityBonus;
            else uncertaintyScore -= flexibilityBonus;
        }

        return score + uncertaintyScore;
    }
}
