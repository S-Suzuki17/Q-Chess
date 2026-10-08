import type { GameState, Move } from '../quantum-engine/types';
import type { TacticalSearchOptions } from '../quantum-engine/ai/search';
import { getConcreteMoveChildren } from '../quantum-engine/ai/random';
import { onlineHintAdvice } from './MatchHintPosition';
import type { OnlineHintBoard } from './OnlineHintBoard';
import { searchCpuPracticePosition } from './CpuPracticeSearchWorker';

/** Native online adjudication stays behind this server-only worker entrypoint. */
export function searchOnlineHintPosition(state: GameState, budget: TacticalSearchOptions, online: OnlineHintBoard): Move | null {
    const validate = (move: Move) => onlineHintAdvice(online, state, move);
    const rootMoves = getConcreteMoveChildren(state, { allPromotions: true, playable: true })
        .filter(child => { try { validate(child.move); return true; } catch { return false; } })
        .map(child => child.move);
    return searchCpuPracticePosition(state, { ...budget, rootMoves }, true, 'balanced', validate);
}
