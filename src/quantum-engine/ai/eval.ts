import { GameState } from '../types';
import { PlayerColor } from '../constants';

export interface Evaluator {
    evaluate(state: GameState, player: PlayerColor): number;
}

// Eval V0: Pure alive material difference. Random baseline.
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
