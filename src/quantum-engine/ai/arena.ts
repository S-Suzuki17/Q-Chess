import { GameState, Move } from '../types';
import { PlayerColor } from '../constants';
import { createInitialState } from '../initialState';
import { getRandomMove } from './random';
import { getGreedyMove } from './greedy';
import { applyMove } from '../stateTransition';
import { getWinner } from '../terminal';

type Agent = (state: GameState) => Move | null;

export const Agents: Record<string, Agent> = {
    'random': getRandomMove,
    'greedy': getGreedyMove
};

export interface MatchResult {
    winner: PlayerColor | 'draw' | null;
    plies: number;
    timeMs: number;
}

export function playMatch(agentWhite: Agent, agentBlack: Agent): MatchResult {
    let state = createInitialState();
    let plies = 0;
    const start = performance.now();

    while (true) {
        // terminal.ts getWinner returns winner if state.winner is set (from contradictions)
        // or checks stalemate.
        const currentWinner = state.winner || getWinner(state);
        if (currentWinner) {
            return { winner: currentWinner, plies, timeMs: performance.now() - start };
        }

        // Failsafe for infinite games
        if (plies > 200) {
            return { winner: 'draw', plies, timeMs: performance.now() - start };
        }

        const agent = state.sideToMove === 'white' ? agentWhite : agentBlack;
        const move = agent(state);

        if (!move) {
            // No moves available (should be caught by stalemate check, but just in case)
            return { winner: 'draw', plies, timeMs: performance.now() - start };
        }

        state = applyMove(state, move);
        plies++;
    }
}

export function runArena(nameWhite: string, nameBlack: string, games: number) {
    console.log(`\n=== Arena: ${nameWhite} (White) vs ${nameBlack} (Black) [${games} Games] ===`);
    let whiteWins = 0;
    let blackWins = 0;
    let draws = 0;
    let totalPlies = 0;
    let totalTime = 0;

    for (let i = 0; i < games; i++) {
        const res = playMatch(Agents[nameWhite], Agents[nameBlack]);
        if (res.winner === 'white') whiteWins++;
        else if (res.winner === 'black') blackWins++;
        else draws++;
        
        totalPlies += res.plies;
        totalTime += res.timeMs;
    }

    const whiteWinRate = (whiteWins / games) * 100;
    const blackWinRate = (blackWins / games) * 100;
    const drawRate = (draws / games) * 100;
    const avgPlies = totalPlies / games;
    const avgTime = totalTime / games;

    console.log(`Results: White Wins: ${whiteWins} (${whiteWinRate.toFixed(1)}%), Black Wins: ${blackWins} (${blackWinRate.toFixed(1)}%), Draws: ${draws} (${drawRate.toFixed(1)}%)`);
    console.log(`Avg Plies: ${avgPlies.toFixed(1)}, Avg Time per Game: ${avgTime.toFixed(1)}ms`);
    
    return { whiteWins, blackWins, draws, avgPlies, avgTime };
}

const args = process.argv.slice(2);
if (args[0] === 'run') {
    const games = 100; // Doing 1000 might take 10-20 seconds for Greedy, let's test 100 first
    runArena('random', 'random', games);
    runArena('greedy', 'random', games);
    runArena('greedy', 'greedy', games);
}
