import type { GameState, Move } from '../quantum-engine/types';
import { searchBestMove, type TacticalSearchOptions } from '../quantum-engine/ai/search';
import { EvalQoppelia } from '../quantum-engine/ai/evalQoppelia';
import { applyPracticeMove } from '../quantum-engine/practice';
import { PERSONALITY_WEIGHTS, type CPUPersonality } from '../quantum-engine/ai/personalities';
import { getConcreteMoveChildren } from '../quantum-engine/ai/random';
import { onlineHintAdvice } from './MatchHintPosition';
import type { OnlineHintBoard } from './MatchHintTypes';

/** The bounded search retains its best evaluated legal root move even when no
 * deeper iteration finishes. That is a usable shallow hint, not a failed search.
 * Exceptions, missing moves and the parent worker watchdog remain failures. */
export function searchCpuPracticePosition(state: GameState, budget: TacticalSearchOptions, hint: boolean, personality:CPUPersonality = 'balanced', online?: OnlineHintBoard): Move | null {
    const rootMoves = hint && online ? getConcreteMoveChildren(state, { allPromotions: true, playable: true })
        .filter(child => { try { onlineHintAdvice(online, state, child.move); return true; } catch { return false; } })
        .map(child => child.move) : undefined;
    const result = searchBestMove(state, new EvalQoppelia(PERSONALITY_WEIGHTS[hint ? 'balanced' : personality]),
        { ...budget, playableRoot: hint || budget.playableRoot, rootMoves });
    if (hint && result.move) {
        if (online) onlineHintAdvice(online, state, result.move);
        else applyPracticeMove(state, result.move);
    }
    return result.move;
}
