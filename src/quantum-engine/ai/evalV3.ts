import { GameState } from '../types';
import { PlayerColor, PIECE_KING } from '../constants';
import { EvalV1 } from './eval';

export class EvalV3 extends EvalV1 {
    evaluate(state: GameState, player: PlayerColor): number {
        // Winning is the ultimate goal
        if (state.winner === player) return 99999;
        if (state.winner && state.winner !== 'draw') return -99999;
        if (state.winner === 'draw') return 0;

        // Base material score from EvalV1
        let score = super.evaluate(state, player);

        // Core Strategy requested by user:
        // "自玉のキングが確定してしまうことが一番だめで相手のキングを確定させることが一番の報酬になるように"
        const KING_CONFIRMED_VALUE = 5000;

        for (const p of state.pieces) {
            if (!p.alive) continue;
            
            // Check if the piece's identity is fully collapsed to exactly KING
            if (p.state === PIECE_KING) {
                if (p.owner === player) {
                    score -= KING_CONFIRMED_VALUE;
                } else {
                    score += KING_CONFIRMED_VALUE;
                }
            }
        }

        return score;
    }
}
