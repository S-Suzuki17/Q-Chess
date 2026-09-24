import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Same deterministic effect/ref harness as useMoveHint.test.ts, with dependency updates.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock('react', () => ({
    useRef: (value: unknown) => {
        const index = hooks.cursor++;
        return hooks.slots[index] ??= { current: value };
    },
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
        const index = hooks.cursor++;
        const previous = hooks.slots[index] as { deps?: unknown[]; cleanup?: () => void } | undefined;
        if (!previous || !deps || !previous.deps || deps.some((value, key) => value !== previous.deps?.[key])) {
            previous?.cleanup?.();
            hooks.slots[index] = { deps, cleanup: effect() };
        }
    },
}));
const backend = vi.hoisted(() => ({ channel: vi.fn(), removeChannel: vi.fn() }));
vi.mock('../lib/supabaseClient', () => ({ supabase: backend }));
import { useRealtimeRefresh } from './useRealtimeRefresh';

type Status = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';
type Binding = { table: string; select: string[] };
const channels: ReturnType<typeof createChannel>[] = [];
function createChannel() {
    let statusCallback: (status: Status, error?: Error) => void = () => {};
    const changes: (() => void)[] = [];
    const channel = {
        on: vi.fn((_event: string, _binding: Binding, callback: () => void) => { changes.push(callback); return channel; }),
        subscribe: vi.fn((callback: typeof statusCallback) => { statusCallback = callback; return channel; }),
        status: (status: Status, error?: Error) => statusCallback(status, error),
        change: () => changes.forEach(callback => callback()),
    };
    return channel;
}
let win: EventTarget;
let doc: EventTarget & { visibilityState: string };
const render = (tables: Parameters<typeof useRealtimeRefresh>[0], refresh = vi.fn(), enabled = true) => {
    hooks.cursor = 0;
    // eslint-disable-next-line react-hooks/rules-of-hooks -- React is mocked by this deterministic effect harness.
    useRealtimeRefresh(tables, refresh, enabled);
    return refresh;
};
const unmount = () => {
    for (const slot of hooks.slots) (slot as { cleanup?: () => void } | undefined)?.cleanup?.();
    hooks.slots = [];
};

beforeEach(() => {
    vi.useFakeTimers();
    hooks.slots = []; hooks.cursor = 0; channels.length = 0;
    backend.channel.mockReset().mockImplementation(() => { const channel = createChannel(); channels.push(channel); return channel; });
    backend.removeChannel.mockReset().mockResolvedValue('ok');
    win = new EventTarget();
    doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('window', win); vi.stubGlobal('document', doc);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('useRealtimeRefresh lifecycle', () => {
    it('normalizes duplicate/reordered tables without recreating subscriptions', () => {
        const refresh = render(['profiles', 'game_records', 'profiles']);
        expect(channels[0].on.mock.calls.map(call => call[1])).toEqual([
            { event: '*', schema: 'public', table: 'game_records', select: ['id'] },
            { event: '*', schema: 'public', table: 'profiles', select: ['id'] },
        ]);
        render(['game_records', 'profiles'], refresh);
        expect(backend.channel).toHaveBeenCalledTimes(1);
    });
    it('does not subscribe or install polling when disabled, including empty tables', () => {
        render(['profiles'], vi.fn(), false); render([], vi.fn(), false);
        expect(backend.channel).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    });
    it('uses empty tables for initial/focus/online/visible/poll HTTP refresh without WebSocket channels', async () => {
        const refresh = render([]);
        await vi.advanceTimersByTimeAsync(100); expect(refresh).toHaveBeenCalledTimes(1);
        win.dispatchEvent(new Event('online')); win.dispatchEvent(new Event('focus'));
        await vi.advanceTimersByTimeAsync(100); expect(refresh).toHaveBeenCalledTimes(2);
        doc.visibilityState = 'hidden'; await vi.advanceTimersByTimeAsync(30100);
        expect(refresh).toHaveBeenCalledTimes(2);
        doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(100); expect(refresh).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(30100); expect(refresh).toHaveBeenCalledTimes(4);
        unmount(); win.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(30100);
        expect(refresh).toHaveBeenCalledTimes(4); expect(vi.getTimerCount()).toBe(0);
        expect(backend.channel).not.toHaveBeenCalled(); expect(backend.removeChannel).not.toHaveBeenCalled();
    });
    it('cancels a private initial refresh when disabled before the debounce fires', async () => {
        const refresh = render([]); render([], refresh, false);
        await vi.advanceTimersByTimeAsync(30100);
        expect(refresh).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); expect(backend.channel).not.toHaveBeenCalled();
    });
    it('preserves the room key projection for active matches', () => {
        render(['active_matches']);
        expect(channels[0].on.mock.calls[0][1].select).toEqual(['room_id']);
    });
    it('reports repeated errors once per cause/outage and resets after reconnect', async () => {
        const refresh = render(['profiles']); const channel = channels[0];
        channel.status('CHANNEL_ERROR', new Error('channel error: transport failure'));
        channel.status('CHANNEL_ERROR', new Error('channel error: transport failure'));
        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(console.warn).toHaveBeenLastCalledWith(expect.any(String), 'profiles', 'CHANNEL_ERROR', 'transport_failure');
        channel.status('TIMED_OUT'); channel.status('TIMED_OUT');
        expect(console.warn).toHaveBeenCalledTimes(2);
        channel.status('SUBSCRIBED'); await vi.advanceTimersByTimeAsync(100);
        expect(refresh).toHaveBeenCalledTimes(1);
        channel.status('CHANNEL_ERROR', new Error('channel error: transport failure'));
        expect(console.warn).toHaveBeenCalledTimes(3);
        expect(backend.channel).toHaveBeenCalledTimes(1); expect(backend.removeChannel).not.toHaveBeenCalled();
    });
    it.each([
        ['socket closed: 1006 (private user information)', 'socket_closed_1006'],
        ['mismatch between server and client bindings for postgres changes', 'binding_mismatch'],
        ['InvalidJWTExpiration: Token has expired', 'token_expired'],
        ['Unauthorized: bearer private-token', 'authorization_failed'],
        ['too_many_channels: private-value', 'rate_limited'],
        ['unexpected private-value https://example.com/?apikey=secret', 'unclassified_error'],
    ])('classifies %s without exposing the raw error or its cause', (message, reason) => {
        render(['profiles']);
        channels[0].status('CHANNEL_ERROR', new Error(message, { cause: { access_token: 'secret', payload: 'private-row' } }));
        expect(console.warn).toHaveBeenLastCalledWith(expect.any(String), 'profiles', 'CHANNEL_ERROR', reason);
        expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/private-token|private-value|private-row|apikey=secret/);
    });
    it('recovers on online/focus/visibility/poll and debounces bursts', async () => {
        const refresh = render(['profiles']);
        win.dispatchEvent(new Event('online')); win.dispatchEvent(new Event('focus')); channels[0].change();
        await vi.advanceTimersByTimeAsync(100); expect(refresh).toHaveBeenCalledTimes(1);
        doc.visibilityState = 'hidden';
        await vi.advanceTimersByTimeAsync(30100); win.dispatchEvent(new Event('online'));
        await vi.advanceTimersByTimeAsync(100); expect(refresh).toHaveBeenCalledTimes(1);
        doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(100); expect(refresh).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(30100); expect(refresh).toHaveBeenCalledTimes(3);
    });
    it('uses the latest callback without resubscribing', async () => {
        const first = render(['profiles']); const latest = vi.fn(); render(['profiles'], latest);
        channels[0].change(); await vi.advanceTimersByTimeAsync(100);
        expect(first).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledTimes(1); expect(backend.channel).toHaveBeenCalledTimes(1);
    });
    it('serializes in-flight refreshes and retains one pending invalidation', async () => {
        let finish!: () => void;
        const refresh = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
        render(['profiles'], refresh); channels[0].change(); await vi.advanceTimersByTimeAsync(100);
        channels[0].change(); channels[0].change(); await vi.advanceTimersByTimeAsync(100);
        expect(refresh).toHaveBeenCalledTimes(1);
        finish(); await vi.advanceTimersByTimeAsync(100); expect(refresh).toHaveBeenCalledTimes(2);
    });
    it('ignores late status/data callbacks and removes all recovery listeners on cleanup', async () => {
        const removeWindowListener = vi.spyOn(win, 'removeEventListener');
        const removeDocumentListener = vi.spyOn(doc, 'removeEventListener');
        const refresh = render(['profiles']); const channel = channels[0];
        channel.change(); unmount();
        channel.status('CHANNEL_ERROR', new Error('transport failure')); channel.status('TIMED_OUT'); channel.status('SUBSCRIBED'); channel.change();
        win.dispatchEvent(new Event('online')); win.dispatchEvent(new Event('focus')); doc.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(60100);
        expect(refresh).not.toHaveBeenCalled(); expect(console.warn).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
        expect(removeWindowListener.mock.calls.map(call => call[0])).toEqual(['focus', 'online']);
        expect(removeDocumentListener.mock.calls.map(call => call[0])).toEqual(['visibilitychange']);
        expect(backend.removeChannel).toHaveBeenCalledExactlyOnceWith(channel);
    });
    it('does not report a refresh rejection after disposal or rerun pending work', async () => {
        let reject!: (reason: Error) => void;
        const refresh = vi.fn(() => new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise; }));
        render(['profiles'], refresh); channels[0].change(); await vi.advanceTimersByTimeAsync(100);
        channels[0].change(); await vi.advanceTimersByTimeAsync(100); unmount(); reject(new Error('private-value'));
        await vi.advanceTimersByTimeAsync(1000);
        expect(console.error).not.toHaveBeenCalled(); expect(refresh).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    });
    it('retains real active refresh errors without logging private details', async () => {
        const refresh = vi.fn().mockRejectedValue(new Error('fetch failed: https://example.com/?apikey=secret'));
        render(['profiles'], refresh); channels[0].change(); await vi.advanceTimersByTimeAsync(100);
        expect(console.error).toHaveBeenCalledExactlyOnceWith('Failed to refresh live data:', 'transport_failure');
    });
    it('isolates old callbacks when table dependencies replace a channel', async () => {
        const refresh = render(['profiles']); const old = channels[0]; render(['game_records'], refresh);
        old.status('CHANNEL_ERROR', new Error('transport failure')); old.change(); channels[1].status('SUBSCRIBED');
        await vi.advanceTimersByTimeAsync(100);
        expect(console.warn).not.toHaveBeenCalled(); expect(refresh).toHaveBeenCalledTimes(1);
        expect(backend.removeChannel).toHaveBeenCalledExactlyOnceWith(old);
    });
});
