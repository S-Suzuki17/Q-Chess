import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createInitialState } from '../quantum-engine/initialState';
import { applyMove } from '../quantum-engine/stateTransition';
import { searchBestMove } from '../quantum-engine/ai/search';
import { EvalV3 } from '../quantum-engine/ai/evalV3';
import { cpuHintTicketsEnabled } from '../../server/src/services/TicketFeatureGates';

type Request = { requestId: number; state: ReturnType<typeof createInitialState>; timeLimitMs: number; maxDepth: number };
const workers: TestWorker[] = [];
class TestWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: { message: string }) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    terminate = vi.fn();
    postMessage = vi.fn<(request: Request) => void>();
    constructor() { workers.push(this); }
    respond(result: unknown = { move: null }) {
        this.onmessage?.({ data: { requestId: this.postMessage.mock.lastCall![0].requestId, result } });
    }
}
let client: typeof import('./cpuClient');
let visibility: EventTarget & { hidden: boolean };
beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.resetModules();
    workers.length = 0;
    visibility = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal('document', visibility);
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('Worker', TestWorker);
    client = await import('./cpuClient');
});
afterEach(() => {
    window.dispatchEvent(new Event('pagehide'));
    vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
const request = (signal = new AbortController().signal) => client.requestCPUSearch(createInitialState(), signal, 1);

it('returns a legal local practice move with ticket services OFF and preserves the input', async () => {
    vi.stubEnv('CPU_HINT_TICKETS_ENABLED', 'false');
    expect(cpuHintTicketsEnabled()).toBe(false);
    const fetcher = vi.fn(() => { throw new Error('Free practice must not contact ticket services'); });
    vi.stubGlobal('fetch', fetcher);
    const state = createInitialState();
    const original = structuredClone(state);
    const pending = client.requestCPUSearch(state, new AbortController().signal, 5);
    workers[0].respond(searchBestMove(state, new EvalV3(), { maxDepth: 1, timeLimitMs: 100 }));
    const result = await pending;
    expect(result.move).toBeTruthy();
    expect(applyMove(state, result.move!).sideToMove).toBe('black');
    expect(state).toEqual(original);
    expect(workers[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({ state, maxDepth: 6, timeLimitMs: 4000 }));
    expect(workers[0].terminate).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
});

it('reuses a completed worker without letting an old signal cancel the next search', async () => {
    const oldController = new AbortController();
    const first = request(oldController.signal);
    workers[0].respond(); await first;
    const second = client.requestCPUSearch(createInitialState(), new AbortController().signal, 3, 'balanced',
        { timeLimitMs: 1500, maxDepth: 2, tieBreakSeed: 1234 });
    oldController.abort();
    expect(workers).toHaveLength(1);
    expect(workers[0].terminate).not.toHaveBeenCalled();
    expect(workers[0].postMessage.mock.lastCall![0]).toMatchObject({ timeLimitMs: 1500, maxDepth: 2, tieBreakSeed: 1234, personality: 'balanced' });
    workers[0].respond(); await second;
    vi.advanceTimersByTime(30_000);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    const third = request();
    expect(workers).toHaveLength(2);
    workers[1].respond(); await third;
});

it('does not queue hints behind a busy CPU and retains only one idle worker', async () => {
    const first = request();
    const hint = client.requestQubeSearch(createInitialState(), new AbortController().signal, 5000);
    expect(workers).toHaveLength(2);
    expect(workers[1].postMessage).toHaveBeenCalledWith(expect.objectContaining({ personality: 'balanced' }));
    workers[0].respond(); await first;
    workers[1].respond(); await hint;
    expect(workers[0].terminate).not.toHaveBeenCalled();
    expect(workers[1].terminate).toHaveBeenCalledOnce();
});

it('terminates an aborted search while another search can complete and be reused', async () => {
    const controller = new AbortController();
    const cancelled = request(controller.signal);
    const rejected = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    const active = request();
    controller.abort(); await rejected;
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    workers[1].respond(); await active;
    const next = request();
    expect(workers).toHaveLength(2);
    workers[1].respond(); await next;
});

it('ignores a duplicate reply from the previous search on a reused worker', async () => {
    const first = request();
    const oldId = workers[0].postMessage.mock.lastCall![0].requestId;
    workers[0].respond(); await first;
    let settled = false;
    const next = request().then(value => { settled = true; return value; });
    workers[0].onmessage?.({ data: { requestId: oldId, result: { move: 'stale' } } });
    await Promise.resolve();
    expect(settled).toBe(false);
    workers[0].respond();
    expect(await next).toEqual({ move: null });
});

it.each(['worker', 'message', 'search', 'malformed', 'missing-result'])('discards a failed worker (%s) before the next search', async kind => {
    const pending = request();
    const rejected = expect(pending).rejects.toBeInstanceOf(Error);
    const worker = workers[0];
    if (kind === 'worker') worker.onerror?.({ message: 'Worker failed' });
    if (kind === 'message') worker.onmessageerror?.();
    if (kind === 'search') worker.onmessage?.({ data: { requestId: worker.postMessage.mock.lastCall![0].requestId, error: 'Search failed' } });
    if (kind === 'malformed') worker.onmessage?.({ data: null });
    if (kind === 'missing-result') worker.respond({});
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
    const next = request();
    expect(workers).toHaveLength(2);
    workers[1].respond(); await next;
});

it('cleans up a reused worker when postMessage fails', async () => {
    const first = request(); workers[0].respond(); await first;
    workers[0].postMessage.mockImplementationOnce(() => { throw new DOMException('Cannot clone', 'DataCloneError'); });
    await expect(request()).rejects.toMatchObject({ name: 'DataCloneError' });
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
});

it('keeps the existing timeout budget and terminates a stuck worker', async () => {
    const pending = request();
    const rejected = expect(pending).rejects.toThrow('CPU timed out');
    vi.advanceTimersByTime(10_999);
    expect(workers[0].terminate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); await rejected;
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
});

it('does not start a worker for a cancelled request or expired hint clock', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(request(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(client.requestQubeSearch(createInitialState(), new AbortController().signal, 0)).rejects.toThrow('SEARCH_CLOCK_EXPIRED');
    expect(workers).toHaveLength(0);
});

it.each(['hidden', 'pagehide', 'completed-while-hidden'])('releases idle memory when the app is backgrounded (%s)', async kind => {
    const pending = request();
    if (kind === 'completed-while-hidden') visibility.hidden = true;
    workers[0].respond(); await pending;
    if (kind === 'hidden') { visibility.hidden = true; visibility.dispatchEvent(new Event('visibilitychange')); }
    if (kind === 'pagehide') window.dispatchEvent(new Event('pagehide'));
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
});
