import type { GameState } from '../quantum-engine/types';
import { isCheckmate } from '../quantum-engine/terminal';

/** Timeouts, resignation and king captures alone do not trigger a mate cinematic. */
export function isCheckmateFinish(winner: 'white_wins' | 'black_wins' | 'draw' | null, state: GameState) {
    if (!winner || winner === 'draw') return false;
    const expectedWinner = state.sideToMove === 'white' ? 'black_wins' : 'white_wins';
    return winner === expectedWinner && isCheckmate(state.sideToMove, {...state, winner:null});
}
