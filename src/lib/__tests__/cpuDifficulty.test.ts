import { afterEach, expect, it, vi } from 'vitest';
import { requestCPUSearch } from '../cpuClient';
import { createInitialState } from '../../quantum-engine/initialState';
import { searchBestMove } from '../../quantum-engine/ai/search';
import { EvalQoppelia } from '../../quantum-engine/ai/evalQoppelia';
import { cpuDifficulty } from '../../config/cpuDifficulty';

afterEach(() => vi.unstubAllGlobals());
it.each([[1, 1000, 0], [3, 1500, 2], [5, 4000, 6]])('passes level %i through to the worker', async (level, timeLimitMs, maxDepth) => {
    let sent: unknown;
    const terminate = vi.fn();
    vi.stubGlobal('Worker', class {
        onmessage?: (event: unknown) => void;
        terminate = terminate;
        postMessage(message: unknown) {
            sent = message;
            this.onmessage?.({ data: { result: { move: null } } });
        }
    });
    const state = createInitialState();
    await requestCPUSearch(state, new AbortController().signal, level);
    expect(sent).toEqual({ state, timeLimitMs, maxDepth });
    expect(terminate).toHaveBeenCalledOnce();
});
it('easy evaluates the next position without deeper search', () => {
    const result = searchBestMove(createInitialState(), new EvalQoppelia(), cpuDifficulty(1));
    expect(result.move).not.toBeNull();
    expect(result.depth).toBe(0);
    expect(result.nodes).toBe(0);
    expect(Number.isFinite(result.score)).toBe(true);
});
