import { describe, it } from 'vitest';
import { runArena } from '../arena';

describe('Phase 3.1 Arena Benchmarks', () => {
    it('runs the baseline benchmark', () => {
        const games = 2; // Keep it low for vitest to not timeout
        runArena('random', 'random', games);
        runArena('greedy', 'random', games);
        runArena('mcts-v0', 'greedy', games);
        runArena('mcts-v0', 'random', games);
    }, 300000); // 5 min timeout
});
