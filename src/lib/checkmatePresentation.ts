import type { GameState } from '../quantum-engine/types';
import { isCheckmate } from '../quantum-engine/terminal';

/** Timeouts, resignation and King captures alone are not confirmed checkmates. */
export function isCheckmateFinish(winner: 'white_wins' | 'black_wins' | 'draw' | null, state: GameState) {
    if (!winner || winner === 'draw') return false;
    const expectedWinner = state.sideToMove === 'white' ? 'black_wins' : 'white_wins';
    return winner === expectedWinner && isCheckmate(state.sideToMove, {...state, winner:null});
}

/** The decorative victory mark is separate from the rule-specific finish reason. */
export function hasVictoryPresentation(effect: string | undefined) {
    return effect === 'standard' || !!effect?.startsWith('champion-effect-');
}

export function showPlayerVictory(won: boolean, campaign: boolean, spectator: boolean) {
    return won && !campaign && !spectator;
}

export function gameOverDialogDelay(effect: string, won: boolean, includeStandard = true) {
    // Keep the existing Campaign transition; its result owns a contained celebration.
    return won && (effect.startsWith('champion-effect-') || (includeStandard && effect === 'standard')) ? 3200 : 1500;
}
