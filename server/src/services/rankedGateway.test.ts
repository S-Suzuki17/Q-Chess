import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Server as NetServer } from 'node:net';

// Every gateway dependency with side effects is replaced before dynamic import.
// Private history is tested separately. Importing the entrypoint cannot touch data.
const h = vi.hoisted(() => {
    const routes = new Map<string, Function>(), listeners = new Map<string, Function>();
    const sockets = new Map<string, any>(), sessions = new Map<string, any>();
    const service = { cleanupOldRecords: vi.fn(), verifyLegacyPassword: vi.fn(), verifyUser: vi.fn(),
        rankedReady: vi.fn(), getMatchRating: vi.fn(), settleRankedMatch: vi.fn(), recordUnratedMatch: vi.fn(), profileAvatarStore: vi.fn(()=>({})), adRewardStore: vi.fn(()=>({})) };
    const mm = { registerSocket: vi.fn((userId, socketId) => sessions.set(userId, { userId, socketId, state: 'IDLE' })),
        getPlayerSession: vi.fn(id => sessions.get(id)), clearDisconnectTimer: vi.fn(), getQueueStats: vi.fn(() => ({})),
        takeCpuFallbacks: vi.fn(() => []), joinQueue: vi.fn(), leaveQueue: vi.fn(), removeSocket: vi.fn(), getMatch: vi.fn() };
    const app = { use: vi.fn(), get: vi.fn(), post: vi.fn((path, handler) => routes.set(path, handler)) };
    const io = { use: vi.fn(), on: vi.fn((event, handler) => listeners.set(event, handler)),
        sockets: { sockets, adapter: { rooms: new Map() } }, to: vi.fn(() => ({ emit: vi.fn() })) };
    return { routes, listeners, sockets, sessions, service, mm, app, io, json: vi.fn(), listen: vi.fn(), tick: vi.fn() };
});
vi.mock('express', () => ({ default: Object.assign(() => h.app, { json: h.json }) }));
vi.mock('http', () => ({ default: { createServer: vi.fn(() => ({ listen: h.listen })) } }));
vi.mock('cors', () => ({ default: vi.fn(() => () => {}) }));
vi.mock('socket.io', () => ({ Server: class { constructor() { return h.io; } } }));
vi.mock('./SupabaseService', () => ({ SupabaseService: class { constructor() { return h.service; } } }));
vi.mock('../matchmaking/MatchmakingService', () => ({ MatchmakingService: class { constructor() { return h.mm; } } }));
vi.mock('../game/RankedRuntime', () => ({ RankedRuntime: class { tick = h.tick; } }));
vi.mock('../game/GameEngine', () => ({ GameEngine: class {} }));
vi.mock('./PrivateGameRecordRoutes', () => ({ createPrivateGameRecordRouter: vi.fn(() => () => {}) }));
vi.mock('./ProfileAvatarRoutes', () => ({ createProfileAvatarRouter: vi.fn(() => () => {}) }));
vi.mock('./AdRewardRoutes', () => ({ createAdRewardRouter: vi.fn(() => () => {}) }));

function response() {
    const res: any = { code: 200, body: undefined, headers: {} };
    res.setHeader = vi.fn((key, value) => { res.headers[key] = value; });
    res.status = vi.fn(code => { res.code = code; return res; });
    res.json = vi.fn(body => { res.body = body; return res; }); res.end = vi.fn();
    return res;
}
async function login(username = 'Alice', password = 'correct', ip = '127.0.0.1') {
    const res = response();
    await h.routes.get('/auth/ranked-session')!({ body: { username, password }, socket: { remoteAddress: ip } }, res);
    return res;
}
async function socket(token: unknown, id = 'socket-1') {
    const handlers = new Map<string, Function>();
    const s: any = { id, handshake: { auth: { token } }, data: {}, connected: true, rooms: new Set(),
        on: vi.fn((event, handler) => handlers.set(event, handler)), use: vi.fn(), emit: vi.fn(), join: vi.fn(),
        to: vi.fn(() => ({ emit: vi.fn() })), disconnect: vi.fn(() => { s.connected = false; handlers.get('disconnect')?.(); }) };
    const next = vi.fn(); await h.io.use.mock.calls[0][0](s, next);
    if (!next.mock.calls[0]?.[0]) { h.sockets.set(id, s); h.listeners.get('connection')!(s); }
    const dispatch = (event: string, payload?: unknown) => {
        let result: unknown;
        s.use.mock.calls[0][0]([event, payload], () => { result = handlers.get(event)?.(payload); });
        return result;
    };
    return { s, next, dispatch };
}
beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(1_000_000);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(NetServer.prototype, 'listen').mockImplementation(() => { throw new Error('Real server startup forbidden in gateway tests'); });
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden in gateway tests'); }));
    h.routes.clear(); h.listeners.clear(); h.sockets.clear(); h.sessions.clear();
    h.service.verifyLegacyPassword.mockImplementation(async (id, password) => id === 'Alice' && password === 'correct');
    h.service.verifyUser.mockResolvedValue(null); h.service.rankedReady.mockResolvedValue(true);
    h.service.getMatchRating.mockResolvedValue(1000); h.mm.joinQueue.mockReturnValue({ success: true });
    await import('../index');
    expect(h.listen).toHaveBeenCalledTimes(1); expect(h.service.cleanupOldRecords).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('ranked gateway without network or database side effects', () => {
    it('verifies the actual password and returns an uncached identity-bound proof', async () => {
        expect(h.json).toHaveBeenCalledWith({ limit: '4kb' });
        const wrong = await login('Alice', 'wrong');
        expect(wrong.code).toBe(401); expect(wrong.body).toEqual({ code: 'AUTH_FAILED' });
        const good = await login();
        expect(good.code).toBe(200); expect(good.headers['Cache-Control']).toBe('no-store');
        expect(good.body).toMatchObject({ userId: 'Alice', expiresAt: 4_600_000 });
        expect(good.body.token).toMatch(/^ranked_[A-Za-z0-9_-]{43}$/);
        const connected = await socket(good.body.token);
        expect(connected.next).toHaveBeenCalledWith(); expect(connected.s.data).toMatchObject({ userId: 'Alice', verified: true });
        expect(h.service.verifyUser).not.toHaveBeenCalled();
    });
    it('limits the sixth username attempt before contacting the password verifier', async () => {
        for (let i = 0; i < 5; i++) expect((await login('Alice', 'wrong')).code).toBe(401);
        expect((await login()).code).toBe(429); expect(h.service.verifyLegacyPassword).toHaveBeenCalledTimes(5);
    });
    it('revokes a proof and disconnects only sockets carrying that proof', async () => {
        const proof = (await login()).body.token;
        const first = await socket(proof), other = await socket('GUEST-other', 'socket-2');
        const res = response();
        h.routes.get('/auth/ranked-session/revoke')!({ headers: { authorization: `Bearer ${proof}` } }, res);
        expect(res.code).toBe(204); expect(res.headers['Cache-Control']).toBe('no-store');
        expect(first.s.disconnect).toHaveBeenCalledWith(true); expect(other.s.disconnect).not.toHaveBeenCalled();
        expect((await socket(proof, 'revoked')).next).toHaveBeenCalledWith(expect.any(Error));
    });
    it('rejects bare/legacy identities and never marks a guest verified for ranked', async () => {
        for (const token of ['Alice', 'SUPABASE-Alice', 'guest-Alice', 'anon_Alice', {}, 'x'.repeat(8193)]) {
            expect((await socket(token)).next).toHaveBeenCalledWith(expect.any(Error));
        }
        const guest = await socket('GUEST-Alice');
        expect(guest.s.data.verified).toBe(false);
        await guest.dispatch('join_queue', { mode: 'ranked', timeControl: 600 });
        expect(guest.s.emit).toHaveBeenCalledWith('queue_error', { code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED' });
        expect(h.mm.joinQueue).not.toHaveBeenCalled(); expect(h.service.rankedReady).not.toHaveBeenCalled();
    });
    it('drops null, missing, primitive, and array packets before any event handler', async () => {
        const connected = await socket('GUEST-test'); connected.s.emit.mockClear();
        for (const event of ['join_queue', 'connect_match', 'intro_ready', 'emote', 'piece_selection', 'player_action', 'request_sync', 'ping']) {
            for (const body of [null, undefined, 'bad', 4, []]) {
                expect(() => connected.dispatch(event, body)).not.toThrow();
            }
        }
        expect(connected.s.emit).not.toHaveBeenCalled(); expect(h.mm.joinQueue).not.toHaveBeenCalled();
    });
    it.each([true, false])('cancels an asynchronous queue preflight without late queueing/errors (%s)', async ready => {
        const connected = await socket((await login()).body.token);
        let finish!: (ready: boolean) => void;
        h.service.rankedReady.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const pending = connected.dispatch('join_queue', { mode: 'ranked', timeControl: 600 });
        connected.dispatch('cancel_queue'); finish(ready); await pending;
        expect(h.mm.leaveQueue).toHaveBeenCalledWith('Alice'); expect(h.mm.joinQueue).not.toHaveBeenCalled();
        expect(connected.s.emit.mock.calls.some(([event]) => ['queue_joined', 'queue_error'].includes(event))).toBe(false);
    });
    it('does not let an older socket cancel the current socket queue', async () => {
        const proof = (await login()).body.token;
        const older = await socket(proof, 'older'), current = await socket(proof, 'current');
        older.dispatch('cancel_queue'); expect(h.mm.leaveQueue).not.toHaveBeenCalled();
        current.dispatch('cancel_queue'); expect(h.mm.leaveQueue).toHaveBeenCalledWith('Alice');
    });
    it('denies expired proofs on reconnect and subsequent ranked queue requests', async () => {
        const proof = (await login()).body;
        const connected = await socket(proof.token);
        vi.setSystemTime(proof.expiresAt);
        expect((await socket(proof.token, 'expired')).next).toHaveBeenCalledWith(expect.any(Error));
        await connected.dispatch('join_queue', { mode: 'ranked', timeControl: 600 });
        expect(connected.s.emit).toHaveBeenCalledWith('queue_error', { code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED' });
        expect(h.mm.joinQueue).not.toHaveBeenCalled();
    });
});
