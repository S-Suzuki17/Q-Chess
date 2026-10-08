import { afterEach, expect, it, vi } from 'vitest';
import { requestCPUSearch } from '../cpuClient';
import { createInitialState } from '../../quantum-engine/initialState';
import { searchBestMove } from '../../quantum-engine/ai/search';
import { EvalQoppelia } from '../../quantum-engine/ai/evalQoppelia';
import { cpuDifficulty } from '../../config/cpuDifficulty';
import { PERSONALITY_WEIGHTS, CPU_PERSONALITIES } from '../../config/cpuPersonalities';

afterEach(() => vi.unstubAllGlobals());
it.each(CPU_PERSONALITIES)('sends the %s personality to the CPU worker without changing difficulty', async personality => {
    let sent: unknown;
    vi.stubGlobal('Worker', class {
        onmessage?: (event: unknown) => void;
        terminate() {}
        postMessage(message: unknown) {
            sent = message;
            this.onmessage?.({ data: { result: { move: null } } });
        }
    });
    await requestCPUSearch(createInitialState(), new AbortController().signal, 3, personality);
    expect(sent).toMatchObject({ personality, maxDepth: 2, timeLimitMs: 1500 });
});
it('boss personalities actually change position evaluation', () => {
    const state = createInitialState();
    const advanced = state.pieces.find(piece => piece.owner === 'white' && piece.position.row === 6)!;
    advanced.position.row = 4;
    const scores = Object.values(PERSONALITY_WEIGHTS).map(weights => new EvalQoppelia(weights).evaluate(state, 'white'));
    expect(scores.every(Number.isFinite)).toBe(true);
    expect(new Set(scores).size).toBe(CPU_PERSONALITIES.length);
});
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
it('returns a legal, finite result even if its time budget expires during root ordering', () => {
    const result=searchBestMove(createInitialState(),new EvalQoppelia(),{timeLimitMs:0,maxDepth:3});
    expect(result.move).not.toBeNull();
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.depth).toBe(0);
});
