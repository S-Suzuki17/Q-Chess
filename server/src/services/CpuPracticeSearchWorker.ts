import type { GameState, Move } from '../quantum-engine/types';
import { searchBestMove, type TacticalSearchOptions } from '../quantum-engine/ai/search';
import { EvalQoppelia } from '../quantum-engine/ai/evalQoppelia';
import { applyPracticeMove } from '../quantum-engine/practice';
import { PERSONALITY_WEIGHTS, type CPUPersonality } from '../quantum-engine/ai/personalities';

/** The bounded search retains its best evaluated legal root move even when no
 * deeper iteration finishes. Native online validation is supplied only by the
 * server's separate online worker; free practice uses canonical rules. */
export function searchCpuPracticePosition(state: GameState, budget: TacticalSearchOptions, hint: boolean,
    personality: CPUPersonality = 'balanced', validateHint?: (move: Move) => unknown): Move | null {
    const result = searchBestMove(state, new EvalQoppelia(PERSONALITY_WEIGHTS[hint ? 'balanced' : personality]),
        { ...budget, playableRoot: hint || budget.playableRoot });
    if (hint && result.move) {
        if (validateHint) validateHint(result.move);
        else applyPracticeMove(state, result.move);
    }
    return result.move;
}
