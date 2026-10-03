import type { GameState, Move } from '../quantum-engine/types';
import { searchBestMove, type TacticalSearchOptions } from '../quantum-engine/ai/search';
import { EvalQoppelia } from '../quantum-engine/ai/evalQoppelia';
import { applyPracticeMove } from '../quantum-engine/practice';

/** The bounded search retains its best evaluated legal root move even when no
 * deeper iteration finishes. That is a usable shallow hint, not a failed search.
 * Exceptions, missing moves and the parent worker watchdog remain failures. */
export function searchCpuPracticePosition(state: GameState, budget: TacticalSearchOptions, hint: boolean): Move | null {
    const result = searchBestMove(state, new EvalQoppelia(), budget);
    if (hint && result.move) applyPracticeMove(state, result.move);
    return result.move;
}
