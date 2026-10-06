import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Deterministic effect harness: transport/Auth are mocked, not the lifecycle
// under test. Native/browser rendering remains a separate release QA gate.
const h = vi.hoisted(() => ({
    slots: [] as unknown[], cursor: 0,
    effects: [] as (() => void)[], cleanups: new Map<number, () => void>(),
    proof: vi.fn(), candidate: vi.fn(), proofRevision: 0, forget: vi.fn(), remaining: vi.fn(),
    session: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), io: vi.fn(),
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
    readRankedSession: h.proof, readRankedSessionCandidate: h.candidate, rankedSessionRemainingMs: h.remaining,
    rankedSessionRevision: () => h.proofRevision, forgetRevokedRankedSession: h.forget,
    gameServerUrl: () => 'http://127.0.0.1:3001',
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
    emit = vi.fn((event: string, ...args: unknown[]) => { this.handlers.get(event)?.(...args); });
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
    h.io.mockImplementation((_url, options) => {
        transport = new Transport(); transport.auth = options.auth; return transport;
    });
    h.proofRevision = 0;
    h.proof.mockReturnValue(proof());
    h.candidate.mockImplementation(() => h.proof());
    h.forget.mockImplementation((value, revision) => {
        const candidate = h.candidate();
        if (!Number.isSafeInteger(revision) || revision < 0 || revision > h.proofRevision ||
            candidate?.token !== value.token || candidate.userId !== value.userId || candidate.expiresAt !== value.expiresAt) return false;
        if (revision === h.proofRevision) h.proofRevision++;
        h.proof.mockReturnValue(null); h.candidate.mockImplementation(() => h.proof());
        window.dispatchEvent(new Event(RANKED_SESSION_EVENT));
        return true;
    });
    h.remaining.mockImplementation((value: {expiresAt:number}) => Math.max(0,value.expiresAt-Date.now()));
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
    it('sends the object-shaped entitlement request on connection and periodic refresh', async () => {
        h.proof.mockReturnValue({...proof(),expiresAt:Date.now()+120_000});
        render();
        expect(transport.emit.mock.calls.filter(([event])=>event==='request_shared_entitlement'))
            .toEqual([['request_shared_entitlement',{}]]);
        await vi.advanceTimersByTimeAsync(45_000);
        expect(transport.emit.mock.calls.filter(([event])=>event==='request_shared_entitlement'))
            .toEqual([['request_shared_entitlement',{}],['request_shared_entitlement',{}]]);
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
        expect(h.forget).not.toHaveBeenCalled();
        expect(h.proof()).toMatchObject({ token: 'first-proof' });
    });
    it('permits an explicit login with a genuinely new proof to reclaim the connection', async () => {
        render(); transport.emit('session_replaced');
        const previous = transport;
        h.proof.mockReturnValue(proof('new-proof'));
        window.dispatchEvent(new Event(RANKED_SESSION_EVENT)); await flush();
        expect(transport).not.toBe(previous);
        expect(transport.connect).toHaveBeenCalledOnce();
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
    it('keeps an expired legacy match connected through background auth refreshes', async () => {
        const original = { ...proof(), expiresAt: Date.now() + 1000 };
        h.proof.mockImplementation(() => original.expiresAt > Date.now() ? original : null);
        h.candidate.mockReturnValue(original);
        render(); await vi.advanceTimersByTimeAsync(1000);
        authChanged(); await flush();
        window.dispatchEvent(new Event(RANKED_SESSION_EVENT)); await flush();
        expect(render()).toMatchObject({ isConnected: true, isAuthenticated: false, authPending: false, connectionError: null });
        expect(transport.disconnect).not.toHaveBeenCalled();
        expect(transport.connect).toHaveBeenCalledOnce();
        expect(h.session).not.toHaveBeenCalled();
        expect(h.forget).not.toHaveBeenCalled();
    });
    it('does not treat an expired proof as permission to reconnect after a transport loss', async () => {
        const original = { ...proof(), expiresAt: Date.now() + 1000 };
        h.proof.mockImplementation(() => original.expiresAt > Date.now() ? original : null);
        h.candidate.mockReturnValue(original);
        render(); await vi.advanceTimersByTimeAsync(1000);
        transport.disconnect(); transport.connect();
        expect(render()).toMatchObject({ isConnected: true, isAuthenticated: false });
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

describe('bounded server session revocation', () => {
    it('forgets only the proof belonging to the revoked socket and stops background reconnects', async () => {
        const original = proof(); h.proof.mockReturnValue(original);
        render(); transport.emit('queue_stats', { 180: 3 });
        transport.emit('session_revoked', { reason: 'revoked' });
        expect(h.forget).toHaveBeenCalledExactlyOnceWith(original, 0);
        expect(h.proof()).toBeNull();
        authChanged(); await flush(); transport.emit('connect');
        expect(transport.connect).toHaveBeenCalledOnce();
        expect(render()).toMatchObject({ isConnected: false, isAuthenticated: false, authPending: false,
            connectionError: 'AUTH_REQUIRED', queueStats: {} });
        expect(h.session).not.toHaveBeenCalled();
    });
    it.each([undefined, null, {}, { reason: 'expired' }, { reason: 'replaced' }])('ignores a non-revocation notice (%j)', notice => {
        render(); transport.emit('session_revoked', notice);
        expect(h.forget).not.toHaveBeenCalled();
        expect(transport.disconnect).not.toHaveBeenCalled();
        expect(render().isAuthenticated).toBe(true);
    });
    it('ignores late notices and transport events after a newer proof owns a fresh socket', async () => {
        render(); const previous = transport;
        h.proofRevision++; h.proof.mockReturnValue(proof('new-proof'));
        window.dispatchEvent(new Event(RANKED_SESSION_EVENT)); await flush();
        previous.emit('session_revoked', { reason: 'revoked' });
        previous.emit('session_replaced'); previous.emit('disconnect'); previous.emit('connect');
        previous.emit('queue_stats', { 180: 99 }); previous.emit('connect_error', new Error('auth'));
        expect(transport).not.toBe(previous);
        expect(h.forget).not.toHaveBeenCalled();
        expect(h.proof()).toMatchObject({ token: 'new-proof' });
        expect(render()).toMatchObject({ isConnected: true, isAuthenticated: true, connectionError: null, queueStats: {} });
        transport.emit('session_revoked', { reason: 'revoked' });
        expect(h.forget).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ token: 'new-proof' }), 1);
    });
    it('protects a newer stored proof even before its queued refresh runs', async () => {
        render(); const previous = transport;
        h.proofRevision++; h.proof.mockReturnValue(proof('new-proof'));
        window.dispatchEvent(new Event(RANKED_SESSION_EVENT));
        previous.emit('session_revoked', { reason: 'revoked' });
        expect(h.proof()).toMatchObject({ token: 'new-proof' });
        expect(previous.disconnect).not.toHaveBeenCalled();
        await flush(); expect(render().isAuthenticated).toBe(true);
    });
    it('stops the revoked socket immediately while a newer successful login can still reclaim a fresh socket', async () => {
        render(); const previous = transport;
        h.proofRevision++;
        previous.emit('session_revoked', { reason: 'revoked' });
        expect(h.proof()).toBeNull();
        expect(previous.disconnect).toHaveBeenCalledOnce();
        expect(h.proofRevision).toBe(1);
        expect(render()).toMatchObject({ isConnected: false, isAuthenticated: false, connectionError: 'AUTH_REQUIRED' });
        previous.emit('session_revoked', { reason: 'revoked' });
        expect(h.forget).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ token: 'first-proof' }), 0);

        // The pending generation now returns a genuinely new proof.
        h.proof.mockReturnValue(proof('new-proof'));
        window.dispatchEvent(new Event(RANKED_SESSION_EVENT)); await flush();
        expect(transport).not.toBe(previous);
        expect(transport.auth).toMatchObject({ token: 'new-proof' });
        expect(render()).toMatchObject({ isConnected: true, isAuthenticated: true, connectionError: null });
        previous.emit('session_revoked', { reason: 'revoked' });
        expect(h.proof()).toMatchObject({ token: 'new-proof' });
        expect(h.forget).toHaveBeenCalledOnce();
    });
    it('clears a genuinely revoked current proof after an unsuccessful newer login left its generation advanced', async () => {
        render(); h.proofRevision++;
        transport.emit('session_revoked', { reason: 'revoked' });
        expect(h.proof()).toBeNull();
        expect(transport.disconnect).toHaveBeenCalledOnce();
        authChanged(); await flush();
        expect(transport.connect).toHaveBeenCalledOnce();
        expect(render()).toMatchObject({ isConnected: false, isAuthenticated: false, connectionError: 'AUTH_REQUIRED' });
    });
    it('ignores an old account socket after switching users', () => {
        render(); const previous = transport;
        h.proofRevision++; h.proof.mockReturnValue({ ...proof('bob-proof'), userId: 'bob' });
        render('bob'); previous.emit('session_revoked', { reason: 'revoked' });
        expect(h.forget).not.toHaveBeenCalled();
        expect(h.proof()).toMatchObject({ token: 'bob-proof', userId: 'bob' });
        expect(render('bob')).toMatchObject({ isConnected: true, isAuthenticated: true, connectionError: null });
    });
    it('cannot clear OAuth when legacy auth is replaced or on an OAuth socket itself', async () => {
        render(); const previous = transport;
        h.proofRevision++; h.proof.mockReturnValue(null);
        h.session.mockResolvedValue({ data: { session: { user: { id: 'alice' }, access_token: 'oauth-token' } } });
        authChanged(); await flush();
        previous.emit('session_revoked', { reason: 'revoked' });
        transport.emit('session_revoked', { reason: 'revoked' });
        expect(h.forget).not.toHaveBeenCalled();
        expect(transport.auth).toMatchObject({ token: 'oauth-token' });
        expect(render()).toMatchObject({ isConnected: true, isAuthenticated: true, connectionError: null });
    });
    it('ignores a delayed revocation callback after disposal', () => {
        render(); const callback = transport.handlers.get('session_revoked')!;
        unmount(); callback({ reason: 'revoked' });
        expect(h.forget).not.toHaveBeenCalled();
        expect(h.proof()).toMatchObject({ token: 'first-proof' });
    });
});

describe('verified legacy clock handling',()=>{
    it('uses the verified remaining lifetime rather than a skewed absolute device clock',async()=>{
        h.proof.mockReturnValue({...proof(),expiresAt:Date.now()-86400000});
        let remaining=1000;h.remaining.mockImplementation(()=>remaining);
        render();expect(render().isAuthenticated).toBe(true);expect(h.io).toHaveBeenCalledOnce();
        remaining=0;await vi.advanceTimersByTimeAsync(1000);expect(render().isAuthenticated).toBe(false);expect(transport.disconnect).not.toHaveBeenCalled();
    });
    it('does not prematurely expire a 30-day proof at the maximum timer boundary',async()=>{
        let remaining=30*86400000;h.remaining.mockImplementation(()=>remaining);
        render();remaining-=2147483647;await vi.advanceTimersByTimeAsync(2147483647);
        expect(render().isAuthenticated).toBe(true);const rest=remaining;remaining=0;await vi.advanceTimersByTimeAsync(rest);
        expect(render().isAuthenticated).toBe(false);expect(transport.disconnect).not.toHaveBeenCalled();
    });
});
