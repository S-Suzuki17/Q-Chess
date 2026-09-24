import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Deterministic effect harness: transport/Auth are mocked, not the lifecycle
// under test. Native/browser rendering remains a separate release QA gate.
const h = vi.hoisted(() => ({
    slots: [] as unknown[], cursor: 0,
    effects: [] as (() => void)[], cleanups: new Map<number, () => void>(),
    proof: vi.fn(), session: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), io: vi.fn(),
}));
vi.mock('react', async importOriginal => {
    const actual = await importOriginal<typeof import('react')>();
    return { ...actual,
        useState(initial: unknown) {
            const i = h.cursor++;
            if (!(i in h.slots)) h.slots[i] = initial;
            return [h.slots[i], (value: unknown) => { h.slots[i] = value; }];
        },
        useEffect(effect: () => (() => void) | undefined, deps: unknown[]) {
            const i = h.cursor++, previous = h.slots[i] as unknown[] | undefined;
            if (!previous || deps.some((value, j) => value !== previous[j])) {
                h.slots[i] = deps;
                h.effects.push(() => {
                    h.cleanups.get(i)?.();
                    const cleanup = effect();
                    if (cleanup) h.cleanups.set(i, cleanup); else h.cleanups.delete(i);
                });
            }
        },
    };
});
vi.mock('./supabaseClient', () => ({ supabase: { auth: {
    getSession: h.session, onAuthStateChange: h.subscribe,
} } }));
vi.mock('./rankedSession', () => ({
    readRankedSession: h.proof, gameServerUrl: () => 'http://127.0.0.1:3001',
    RANKED_SESSION_EVENT: 'qg_test_ranked_session',
}));
vi.mock('socket.io-client', () => ({ io: h.io }));

import { SocketProvider } from './SocketContext';
import { RANKED_SESSION_EVENT } from './rankedSession';

class Transport {
    connected = false;
    auth: unknown;
    handlers = new Map<string, (...args: unknown[]) => void>();
    on = vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        this.handlers.set(event, callback); return this;
    });
    connect = vi.fn(() => { this.connected = true; this.emit('connect'); return this; });
    disconnect = vi.fn(() => { this.connected = false; this.emit('disconnect'); return this; });
    emit(event: string, ...args: unknown[]) { this.handlers.get(event)?.(...args); }
}
let transport: Transport;
let authChanged: () => void;
const proof = (token = 'first-proof') => ({ token, userId: 'alice', expiresAt: Date.now() + 60_000 });
function render(userId: string | undefined = 'alice') {
    h.cursor = 0;
    const result = SocketProvider({ userId, children: null });
    h.effects.splice(0).forEach(effect => effect());
    return result.props.value as {
        isConnected: boolean; isAuthenticated: boolean; authPending: boolean;
        connectionError: string | null; queueStats: Record<number, number>;
    };
}
const flush = async () => { await vi.advanceTimersByTimeAsync(0); };
const unmount = () => { h.cleanups.forEach(cleanup => cleanup()); h.cleanups.clear(); };

beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks(); h.slots = []; h.cursor = 0; h.effects = [];
    vi.stubGlobal('window', new EventTarget());
    transport = new Transport(); h.io.mockReturnValue(transport);
    h.proof.mockReturnValue(proof());
    h.session.mockResolvedValue({ data: { session: null }, error: null });
    h.subscribe.mockImplementation((callback: () => void) => {
        authChanged = callback; return { data: { subscription: { unsubscribe: h.unsubscribe } } };
    });
});
afterEach(() => { unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('socket account handoff lifecycle', () => {
    it('does not connect a signed-out player', () => {
        SocketProvider({ userId: undefined, children: null });
        h.effects.splice(0).forEach(effect => effect());
        expect(h.io).not.toHaveBeenCalled();
    });
    it('connects the matching proof and allows guests only as unauthenticated players', () => {
        render(); expect(render()).toMatchObject({ isConnected: true, isAuthenticated: true });
        h.proof.mockReturnValue(null); render('GUEST-1');
        expect(render('GUEST-1')).toMatchObject({ isConnected: true, isAuthenticated: false });
        expect(h.io.mock.calls.at(-1)?.[1].auth.token).toBe('GUEST-1');
    });
    it('refuses an expired proof and an OAuth session belonging to another user', async () => {
        h.proof.mockReturnValue({ ...proof(), expiresAt: Date.now() - 1 });
        render(); expect(render().connectionError).toBe('AUTH_REQUIRED');
        expect(h.io).not.toHaveBeenCalled();
        h.proof.mockReturnValue(null);
        h.session.mockResolvedValue({ data: { session: { user: { id: 'bob' }, access_token: 'bob-token' } } });
        authChanged(); await flush();
        expect(h.io).not.toHaveBeenCalled();
    });
    it('keeps the replaced device disconnected across token refresh and stale events', async () => {
        render(); transport.emit('queue_stats', { 180: 3 });
        transport.emit('session_replaced');
        authChanged(); window.dispatchEvent(new Event(RANKED_SESSION_EVENT)); await flush();
        transport.emit('connect');
        expect(render().isConnected).toBe(false);
        transport.emit('queue_stats', { 180: 99 });
        transport.emit('connect_error', new Error('network'));
        expect(transport.connect).toHaveBeenCalledTimes(1);
        expect(render()).toMatchObject({ isConnected: false, isAuthenticated: false,
            authPending: false, connectionError: 'SESSION_REPLACED', queueStats: {} });
        expect(render().queueStats).toEqual({});
    });
    it('permits an explicit login with a genuinely new proof to reclaim the connection', async () => {
        render(); transport.emit('session_replaced');
        h.proof.mockReturnValue(proof('new-proof'));
        window.dispatchEvent(new Event(RANKED_SESSION_EVENT)); await flush();
        expect(transport.connect).toHaveBeenCalledTimes(2);
        expect(transport.auth).toEqual({ token: 'new-proof', userId: 'alice',client:{protocol:1,platform:'web',build:0} });
        expect(render()).toMatchObject({ isAuthenticated: true, connectionError: null });
    });
    it('ignores a late OAuth lookup after the server replaced this device', async () => {
        render(); h.proof.mockReturnValue(null);
        let resolve!: (value: unknown) => void;
        h.session.mockReturnValue(new Promise(done => { resolve = done; }));
        authChanged(); await flush(); transport.emit('session_replaced');
        resolve({ data: { session: { user: { id: 'alice' }, access_token: 'new-oauth-token' } } });
        await flush();
        expect(transport.connect).toHaveBeenCalledTimes(1);
        expect(render().connectionError).toBe('SESSION_REPLACED');
    });
    it('expires queue authorization without interrupting a running match', async () => {
        h.proof.mockReturnValue({ ...proof(), expiresAt: Date.now() + 1000 });
        render(); await vi.advanceTimersByTimeAsync(1000);
        expect(render()).toMatchObject({ isConnected: true, isAuthenticated: false });
        expect(transport.disconnect).not.toHaveBeenCalled();
    });
    it('cancels listeners and in-flight work on unmount', async () => {
        h.proof.mockReturnValue(null);
        let resolve!: (value: unknown) => void;
        h.session.mockReturnValue(new Promise(done => { resolve = done; }));
        render(); unmount();
        resolve({ data: { session: { user: { id: 'alice' }, access_token: 'late-token' } } });
        window.dispatchEvent(new Event(RANKED_SESSION_EVENT)); await flush();
        expect(h.io).not.toHaveBeenCalled(); expect(h.unsubscribe).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });
});
