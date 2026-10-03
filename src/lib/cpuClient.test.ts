import { afterEach, expect, it, vi } from 'vitest';
import { requestCPUSearch } from './cpuClient';
import { createInitialState } from '../quantum-engine/initialState';
import { applyMove } from '../quantum-engine/stateTransition';
import { searchBestMove } from '../quantum-engine/ai/search';
import { EvalV3 } from '../quantum-engine/ai/evalV3';
import { cpuHintTicketsEnabled } from '../../server/src/services/TicketFeatureGates';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('still returns a legal CPU practice hint from the local worker while ticket services are OFF', async () => {
    vi.stubEnv('CPU_HINT_TICKETS_ENABLED', 'true');
    expect(cpuHintTicketsEnabled()).toBe(false);
    const fetcher = vi.fn(() => { throw new Error('Free practice must not contact ticket services'); });
    vi.stubGlobal('fetch', fetcher);
    const terminate = vi.fn(), posted = vi.fn();
    vi.stubGlobal('Worker', class {
        onmessage?: (event: { data: unknown }) => void;
        onerror?: (event: { message: string }) => void;
        terminate = terminate;
        postMessage(message: { state: ReturnType<typeof createInitialState> }) {
            posted(message);
            queueMicrotask(() => this.onmessage?.({ data: {
                result: searchBestMove(message.state, new EvalV3(), { maxDepth: 1, timeLimitMs: 100 }),
            } }));
        }
    });
    const state = createInitialState();
    const result = await requestCPUSearch(state, new AbortController().signal, 5);
    expect(result.move).toBeTruthy();
    expect(applyMove(state, result.move!).sideToMove).toBe('black');
    expect(posted).toHaveBeenCalledWith(expect.objectContaining({ state, maxDepth: expect.any(Number) }));
    expect(terminate).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
});
