import { describe, it } from 'vitest';
import { runArena } from '../arena';

describe('Phase 2.5 Arena Benchmarks', () => {
    it('runs the benchmark', () => {
        const games = 100;
        runArena('random', 'random', games);
        runArena('greedy', 'random', games);
        runArena('greedy', 'greedy', games);
    }, 120000); // 2 minute timeout
});
