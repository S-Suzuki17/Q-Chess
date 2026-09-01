import { describe, it } from 'vitest';
import { runArena } from '../arena';

describe('Phase 3.1 Arena Benchmarks', () => {
    it('runs the baseline benchmark', () => {
        const games = 10; // Keep it low for vitest to not timeout (MCTS takes 200ms per turn, ~6s per game, 10 games = 60s)
        runArena('random', 'random', games);
        runArena('greedy', 'random', games);
        runArena('mcts-v0', 'greedy', games);
        runArena('mcts-v0', 'random', games);
    }, 300000); // 5 min timeout
});
