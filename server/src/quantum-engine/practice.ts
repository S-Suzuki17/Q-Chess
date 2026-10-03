import { applyMove } from './stateTransition';
import { getWinner } from './terminal';
import type { GameState, Move } from './types';

/** Both practice displays and the authoritative service import this engine. */
export const CPU_PRACTICE_RULES_VERSION = 'quantum-practice-v1';
export function applyPracticeMove(state: GameState, move: Move): GameState {
    if (state.winner || getWinner(state)) throw new Error('SESSION_FINISHED');
    const next = applyMove(state, move);
    return { ...next, winner: next.winner ?? getWinner(next) };
}

export interface CpuPracticeSnapshot {
    sessionId: string;
    userId: string;
    kind: 'cpu_practice';
    rulesVersion: string;
    playerSide: 'white' | 'black';
    level: 1 | 3 | 5;
    seconds: 10 | 180 | 600;
    revision: number;
    stateHash: string;
    state: GameState;
    history: Move[];
    status: 'active' | 'finished';
    whiteMs: number;
    blackMs: number;
}
