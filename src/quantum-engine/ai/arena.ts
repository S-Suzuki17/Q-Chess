import { GameState, Move, PlayerColor } from '../types';
import { createInitialState } from '../initialState';
import { getRandomMove } from './random';
import { getGreedyMove } from './greedy';
import { applyMove } from '../stateTransition';
import { getWinner } from '../terminal';
import { MCTSEngine, SearchStats, MCTSOptions } from './mcts';
import { EvalV0 } from './eval';

export interface AgentResult {
    move: Move | null;
    stats?: SearchStats;
}

export type Agent = (state: GameState, options?: MCTSOptions) => AgentResult;

export function wrapRandom(): Agent {
    return (state) => ({ move: getRandomMove(state) });
}

export function wrapGreedy(): Agent {
    return (state) => {
        const start = performance.now();
        const move = getGreedyMove(state);
        return {
            move,
            stats: { move, iterations: 1, nodes: 1, timeMs: performance.now() - start, nodesPerSec: 0, maxDepth: 1, ttHits: 0 }
        };
    };
}

export function wrapMCTS(options: MCTSOptions = { timeLimitMs: 200 }): Agent {
    const evaluator = new EvalV0();
    const engine = new MCTSEngine(evaluator, options);
    return (state) => {
        const stats = engine.search(state, options);
        return { move: stats.move, stats };
    };
}

export const Agents: Record<string, () => Agent> = {
    'random': wrapRandom,
    'greedy': wrapGreedy,
    'mcts-v0': () => wrapMCTS({ timeLimitMs: 200, maxIterations: 1000 })
};

export interface MatchResult {
    winner: PlayerColor | 'draw' | null;
    plies: number;
    timeMs: number;
    whiteStats: SearchStats[];
    blackStats: SearchStats[];
}

export function playMatch(agentWhite: Agent, agentBlack: Agent): MatchResult {
    let state = createInitialState();
    let plies = 0;
    const start = performance.now();
    const whiteStats: SearchStats[] = [];
    const blackStats: SearchStats[] = [];

    while (true) {
        const currentWinner = state.winner || getWinner(state);
        if (currentWinner) {
            return { winner: currentWinner, plies, timeMs: performance.now() - start, whiteStats, blackStats };
        }

        if (plies > 200) {
            return { winner: 'draw', plies, timeMs: performance.now() - start, whiteStats, blackStats };
        }

        const isWhite = state.sideToMove === 'white';
        const agent = isWhite ? agentWhite : agentBlack;
        
        const res = agent(state);

        if (!res.move) {
            return { winner: 'draw', plies, timeMs: performance.now() - start, whiteStats, blackStats };
        }

        if (res.stats) {
            if (isWhite) whiteStats.push(res.stats);
            else blackStats.push(res.stats);
        }

        state = applyMove(state, res.move);
        plies++;
    }
}

function aggregateStats(statsList: SearchStats[]) {
    if (statsList.length === 0) return { avgIters: 0, avgNodes: 0, avgNodesPerSec: 0, avgDepth: 0, avgTime: 0, ttHits: 0 };
    let iters = 0, nodes = 0, nps = 0, depth = 0, time = 0, tt = 0;
    for (const s of statsList) {
        iters += s.iterations; nodes += s.nodes; nps += s.nodesPerSec;
        depth += s.maxDepth; time += s.timeMs; tt += s.ttHits;
    }
    const len = statsList.length;
    return {
        avgIters: iters / len, avgNodes: nodes / len, avgNodesPerSec: nps / len,
        avgDepth: depth / len, avgTime: time / len, avgTtHits: tt / len
    };
}

export function runArena(nameWhite: string, nameBlack: string, games: number) {
    console.log(`\n=== Arena: ${nameWhite} (W) vs ${nameBlack} (B) [${games} Games] ===`);
    let whiteWins = 0, blackWins = 0, draws = 0, totalPlies = 0, totalTime = 0;
    const allWhiteStats: SearchStats[] = [];
    const allBlackStats: SearchStats[] = [];

    for (let i = 0; i < games; i++) {
        const agentW = Agents[nameWhite]();
        const agentB = Agents[nameBlack]();
        const res = playMatch(agentW, agentB);
        if (res.winner === 'white') whiteWins++;
        else if (res.winner === 'black') blackWins++;
        else draws++;
        
        totalPlies += res.plies;
        totalTime += res.timeMs;
        allWhiteStats.push(...res.whiteStats);
        allBlackStats.push(...res.blackStats);
    }

    const wStats = aggregateStats(allWhiteStats);
    const bStats = aggregateStats(allBlackStats);

    console.log(`WinRate: W ${((whiteWins/games)*100).toFixed(1)}% | B ${((blackWins/games)*100).toFixed(1)}% | Draw ${((draws/games)*100).toFixed(1)}%`);
    console.log(`AvgPlies: ${(totalPlies/games).toFixed(1)} | AvgMatchTime: ${(totalTime/games).toFixed(1)}ms`);
    if (allWhiteStats.length > 0) {
        console.log(`White Stats: ${wStats.avgTime.toFixed(1)}ms/turn | Depth: ${wStats.avgDepth.toFixed(1)} | Iters: ${wStats.avgIters.toFixed(0)} | Nodes: ${wStats.avgNodes.toFixed(0)} (${wStats.avgNodesPerSec.toFixed(0)} nps)`);
    }
    if (allBlackStats.length > 0) {
        console.log(`Black Stats: ${bStats.avgTime.toFixed(1)}ms/turn | Depth: ${bStats.avgDepth.toFixed(1)} | Iters: ${bStats.avgIters.toFixed(0)} | Nodes: ${bStats.avgNodes.toFixed(0)} (${bStats.avgNodesPerSec.toFixed(0)} nps)`);
    }
}
