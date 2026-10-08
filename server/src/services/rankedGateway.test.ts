import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Server as NetServer } from 'node:net';

// Every gateway dependency with side effects is replaced before dynamic import.
// Private history is tested separately. Importing the entrypoint cannot touch data.
const h = vi.hoisted(() => {
    const routes = new Map<string, Function>(), listeners = new Map<string, Function>();
    const sockets = new Map<string, any>(), sessions = new Map<string, any>();
    const blocked=vi.fn(async()=>false);
    const service = { cleanupOldRecords: vi.fn(), verifyLegacyPassword: vi.fn(), verifyUser: vi.fn(),
        rankedReady: vi.fn(), getMatchRating: vi.fn(), settleRankedMatch: vi.fn(), recordUnratedMatch: vi.fn(), profileAvatarStore: vi.fn(()=>({})), adRewardStore: vi.fn(()=>({})), engagementMetricsStore: vi.fn(()=>({})), foundersStore: vi.fn(()=>({})), stripeMembershipStore: vi.fn(()=>({})),
        admitRankedMatch: vi.fn(), voidRankedAdmission: vi.fn(), cpuPracticeService: vi.fn() };
    const mm = { registerSocket: vi.fn((userId, socketId) => sessions.set(userId, { userId, socketId, state: 'IDLE' })),
        getPlayerSession: vi.fn(id => sessions.get(id)), clearDisconnectTimer: vi.fn(), getQueueStats: vi.fn(() => ({})),
        takeCpuFallbacks: vi.fn(() => []), joinQueue: vi.fn(), leaveQueue: vi.fn(), removeSocket: vi.fn(), getMatch: vi.fn(),
        reserveMatch: vi.fn(), connectMatch: vi.fn(),
        opponentDisconnect: vi.fn(() => null), awaitingReconnect: vi.fn(() => false), authenticationUnavailable:vi.fn(),authorityCheckPending:vi.fn(()=>false) };
    const app = { use: vi.fn(), get: vi.fn((path, handler) => routes.set(path, handler)), post: vi.fn((path, handler) => routes.set(path, handler)) };
    const io = { emit: vi.fn(), use: vi.fn(), on: vi.fn((event, handler) => listeners.set(event, handler)),
        sockets: { sockets, adapter: { rooms: new Map() } }, to: vi.fn(() => ({ emit: vi.fn() })) };
    return { routes, listeners, sockets, sessions, service, blocked, mm, app, io, json: vi.fn(), listen: vi.fn(), tick: vi.fn(),
        engineClass: undefined as typeof import('../game/GameEngine').GameEngine | undefined };
});
vi.mock('express', () => ({ default: Object.assign(() => h.app, { json: h.json }) }));
vi.mock('http', () => ({ default: { createServer: vi.fn(() => ({ listen: h.listen })) } }));
vi.mock('cors', () => ({ default: vi.fn(() => () => {}) }));
vi.mock('socket.io', () => ({ Server: class { constructor() { return h.io; } } }));
vi.mock('./SupabaseService', () => ({ SupabaseService: class { constructor() { return h.service; } } }));
vi.mock('../matchmaking/MatchmakingService', async importOriginal => ({
    CPU_FALLBACK_MS: (await importOriginal<typeof import('../matchmaking/MatchmakingService')>()).CPU_FALLBACK_MS,
    MatchmakingService: class { constructor() { return h.mm; } },
}));
vi.mock('../game/RankedRuntime', () => ({ RankedRuntime: class { tick = h.tick; replaySettlement = vi.fn(); } }));
vi.mock('../game/GameEngine', () => ({ GameEngine: class {
    constructor(...args: any[]) { if (h.engineClass) return new (h.engineClass as any)(...args); }
} }));
vi.mock('./PrivateGameRecordRoutes', () => ({ createPrivateGameRecordRouter: vi.fn(() => () => {}) }));
vi.mock('./ProfileAvatarRoutes', () => ({ createProfileAvatarRouter: vi.fn(() => () => {}) }));
vi.mock('./AdRewardRoutes', () => ({ createAdRewardRouter: vi.fn(() => () => {}) }));
vi.mock('./EngagementMetricsRoutes', () => ({ createEngagementMetricsRouter: vi.fn(() => () => {}) }));
vi.mock('./FoundersRewardRoutes', () => ({ createFoundersRewardRouter: vi.fn(() => () => {}) }));
vi.mock('./AccountDeletionRoutes', () => ({ createAccountDeletionRouter: vi.fn(() => () => {}), accountRequestGuard: vi.fn(() => () => {}) }));
vi.mock('./AccountRecoveryRoutes', () => ({ createAccountRecoveryRouter: vi.fn(() => () => {}) }));
vi.mock('./AccountProfileRoutes', () => ({ createAccountProfileRouter: vi.fn(() => () => {}) }));
vi.mock('./AccountSecurityRoutes', () => ({ createAccountSecurityRouter: vi.fn(() => () => {}) }));
vi.mock('./AccountProgressRoutes', () => ({ createAccountProgressRouter: vi.fn(() => () => {}) }));
vi.mock('./DailyLoginRoutes', () => ({ createDailyLoginRouter: vi.fn(() => () => {}) }));
vi.mock('./CpuPracticeRoutes', () => ({ createCpuPracticeRouter: vi.fn(() => () => {}) }));
// This fixture isolates socket/login handlers; Crown has real HTTP mount coverage.
vi.mock('./CrownAdmissionRoutes', () => ({ createCrownAdmissionRouter: vi.fn(() => () => {}) }));
vi.mock('./RankedSessionInspectionRoutes', () => ({ createRankedSessionInspectionRouter: vi.fn(() => () => {}) }));
vi.mock('./RankedRefundRoutes', () => ({ createRankedRefundRouter: vi.fn(() => () => {}) }));
vi.mock('./StripeMembershipRoutes', () => ({ createStripeMembershipRouter: vi.fn(() => () => {}), createStripeWebhookRouter: vi.fn(() => () => {}) }));
vi.mock('./AccountCurrentTermsRoutes', () => ({ createCurrentTermsRouter: vi.fn(() => () => {}) }));
vi.mock('./AccountTermsRoutes', () => ({ createAccountTermsRouter: vi.fn(() => () => {}) }));

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
        on: vi.fn((event, handler) => handlers.set(event, handler)), use: vi.fn(), emit: vi.fn(),
        join: vi.fn((room: string) => {
            s.rooms.add(room);
            if (!h.io.sockets.adapter.rooms.has(room)) h.io.sockets.adapter.rooms.set(room, new Set());
            h.io.sockets.adapter.rooms.get(room).add(id);
        }),
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
    vi.stubEnv('RANKED_TICKET_ADMISSION_ENABLED', 'false');
    vi.stubEnv('RANKED_ADMISSION_RECOVERY_ENABLED', 'false');
    vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(1_000_000);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(NetServer.prototype, 'listen').mockImplementation(() => { throw new Error('Real server startup forbidden in gateway tests'); });
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden in gateway tests'); }));
    h.routes.clear(); h.listeners.clear(); h.sockets.clear(); h.sessions.clear();
    h.io.sockets.adapter.rooms.clear(); h.engineClass = undefined;
    h.service.verifyLegacyPassword.mockImplementation(async (id, password) => id === 'Alice' && password === 'correct');
    h.service.verifyUser.mockResolvedValue(null); h.service.rankedReady.mockResolvedValue(true);
    h.service.getMatchRating.mockResolvedValue(1000); h.mm.joinQueue.mockReturnValue({ success: true });
    h.blocked.mockReset().mockResolvedValue(false);
    (h.service as any).accountDeletionStore = () => ({ blocked: h.blocked });
    (h.service as any).stripeDeletionLinks = () => vi.fn(async () => ({ intents: [], memberships: [] }));
    (h.service as any).stripeRetireSubscriptions = () => vi.fn(async () => {});
    (h.service as any).stripeRetireCommerceCheckouts = () => vi.fn(async () => { throw new Error('Commerce retirement forbidden in gateway fixture'); });
    (h.service as any).stripeCommercePrerequisites = () => ({ enabled: () => false, check: async () => false });
    (h.service as any).accountRecoveryStore = () => ({});
    (h.service as any).accountProfileStore = () => ({});
    (h.service as any).accountSecurityStore = () => ({restricted:async()=>false});
    (h.service as any).recordSecurityEvent = async()=>{};
    (h.service as any).restrictedAccounts = async()=>[];
    (h.service as any).accountProgressStore = () => ({});
    (h.service as any).dailyLoginStore = () => ({});
    (h.service as any).currentTermsStore = () => ({});
    (h.service as any).accountTermsStore = () => ({});
    (h.service as any).serviceStatusLoader = () => async()=>({maintenance:false,minimumAndroidBuild:0,minimumProtocol:0,announcement:{},revision:''});
    await import('../index');
    expect(h.listen).toHaveBeenCalledTimes(1); expect(h.service.cleanupOldRecords).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function realMatchmaking() {
    const { MatchmakingService } = await vi.importActual<typeof import('../matchmaking/MatchmakingService')>('../matchmaking/MatchmakingService');
    h.engineClass = (await vi.importActual<typeof import('../game/GameEngine')>('../game/GameEngine')).GameEngine;
    const actual = new MatchmakingService(h.io as any);
    for (const key of ['registerSocket', 'getPlayerSession', 'clearDisconnectTimer', 'getQueueStats',
        'takeCpuFallbacks', 'joinQueue', 'leaveQueue', 'removeSocket', 'getMatch', 'reserveMatch', 'connectMatch']) {
        vi.spyOn(h.mm as any, key).mockImplementation((...args: any[]) => (actual as any)[key](...args));
    }
    vi.stubEnv('RANKED_TICKET_ADMISSION_ENABLED', 'false');
    h.service.admitRankedMatch.mockRejectedValue(new Error('Missing ticket migration'));
    return actual;
}

describe('ranked gateway without network or database side effects', () => {
    it('mounts verified session inspection before generic restriction and account guards',async()=>{
        const {createRankedSessionInspectionRouter}=await import('./RankedSessionInspectionRoutes');
        const {createAccountSecurityRouter}=await import('./AccountSecurityRoutes');
        const {accountRequestGuard}=await import('./AccountDeletionRoutes');
        const inspection=vi.mocked(createRankedSessionInspectionRouter);
        expect(inspection).toHaveBeenCalledOnce();
        const [authority,deletion,gate]=inspection.mock.calls[0];
        expect(deletion.blocked).toBe(h.blocked);
        expect(authority.verifySession).toBeTypeOf('function');
        expect(gate.blocked('Alice')).toBe(false);
        const mounted=h.app.use.mock.calls.map(args=>args[0]);
        const index=mounted.indexOf(inspection.mock.results[0].value);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(mounted.indexOf(vi.mocked(createAccountSecurityRouter).mock.results[0].value));
        expect(index).toBeLessThan(mounted.indexOf(vi.mocked(accountRequestGuard).mock.results[0].value));
    });
    it('returns server time sampled after issuance without extending the absolute expiry',async()=>{
        const issuedAt=Date.now();
        (h.service as any).recordSecurityEvent=async()=>{vi.setSystemTime(issuedAt+250);};
        const result=await login();
        expect(result.code).toBe(200);expect(result.headers['Cache-Control']).toBe('no-store');
        expect(result.body).toEqual({token:expect.stringMatching(/^ranked_[A-Za-z0-9_-]{43}$/),userId:'Alice',
            expiresAt:issuedAt+60*60*1000,serverNow:issuedAt+250});
        expect(JSON.stringify(result.body)).not.toContain('correct');
    });
    it('starts free ranked PvP through the real matchmaking and engine while ticket DB is unavailable', async () => {
        const mm = await realMatchmaking();
        h.service.verifyLegacyPassword.mockImplementation(async (id, password) => ['Alice', 'Bob'].includes(id) && password === 'correct');
        const alice = await socket((await login()).body.token, 'alice');
        const bob = await socket((await login('Bob')).body.token, 'bob');
        await alice.dispatch('join_queue', { mode: 'ranked', timeControl: 600 });
        await bob.dispatch('join_queue', { mode: 'ranked', timeControl: 600 });
        const matchId = mm.getPlayerSession('Alice')!.currentMatchId!;
        await alice.dispatch('connect_match', { matchId });
        await bob.dispatch('connect_match', { matchId });
        expect(mm.getMatch(matchId)!.state).toBe('IN_GAME');
        expect(mm.getMatch(matchId)!.engine!.getPublicState('Alice').gameOver).toBeNull();
        for (const player of [alice, bob]) {
            expect(player.s.emit).toHaveBeenCalledWith('match_start', expect.objectContaining({ mode: 'ranked' }));
            expect(player.s.emit.mock.calls.some(([event]: [string]) => event === 'queue_error')).toBe(false);
        }
        expect(h.service.admitRankedMatch).not.toHaveBeenCalled();
        expect(h.service.voidRankedAdmission).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([0.1, 0.9])('starts free ranked CPU fallback on either side while tickets are OFF (%s)', async random => {
        const mm = await realMatchmaking();
        vi.spyOn(Math, 'random').mockReturnValue(random);
        const alice = await socket((await login()).body.token);
        await alice.dispatch('join_queue', { mode: 'ranked', timeControl: 600 });
        expect(alice.s.emit).toHaveBeenCalledWith('queue_joined', { mode: 'ranked', timeControl: 600, cpuFallbackAt: Date.now() + 10_000 });
        vi.setSystemTime(Date.now() + 9_999);
        expect(mm.takeCpuFallbacks()).toEqual([]);
        vi.setSystemTime(Date.now() + 1);
        const [match] = mm.takeCpuFallbacks();
        expect(match.cpu!.id).toMatch(/^ai:/);
        expect(match.cpu!.side).toBe(random < 0.5 ? 'host' : 'joiner');
        await alice.dispatch('connect_match', { matchId: match.matchId });
        expect(match.state).toBe('IN_GAME');
        expect(alice.s.emit).toHaveBeenCalledWith('match_start', expect.objectContaining({ mode: 'ranked', cpu: expect.any(Object) }));
        expect(alice.s.emit.mock.calls.some(([event]: [string]) => event === 'queue_error')).toBe(false);
        expect(h.service.admitRankedMatch).not.toHaveBeenCalled();
        expect(h.service.voidRankedAdmission).not.toHaveBeenCalled();
    });

    it.each(['false', 'true'])('rejects untrusted paid hint history without debiting tickets when enabled=%s', async enabled => {
        vi.stubEnv('CPU_HINT_TICKETS_ENABLED', enabled);
        const guest = await socket('GUEST-test');
        await guest.dispatch('request_cpu_hint', { requestId: 'request', pool: 'white', moveHistory: ['forged'] });
        expect(guest.s.emit).toHaveBeenCalledWith('cpu_hint_error', { requestId: 'request', error: enabled === 'true' ? 'USE_CPU_PRACTICE_API' : 'FEATURE_DISABLED' });
        expect(h.service.cpuPracticeService).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });
    it('identifies the deployed candidate solver without exposing account data', () => {
        const res = response();
        h.routes.get('/health')!({}, res);
        expect(res.headers['Cache-Control']).toBe('no-store');
        expect(res.body).toEqual({ status: 'ok', timestamp: Date.now(), rulesVersion: 'checkmate-v1', entanglementVersion: 'capture-king-v2' });
    });
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
        const limited=await login(); expect(limited.code).toBe(429);expect(limited.headers['Retry-After']).toBe('60');
        expect(h.service.verifyLegacyPassword).toHaveBeenCalledTimes(5);
    });
    it('denies a durable pending deletion before password work after a server restart',async()=>{
        h.blocked.mockResolvedValue(true);
        expect((await login()).code).toBe(409);
        expect(h.service.verifyLegacyPassword).not.toHaveBeenCalled();
    });
    it('revokes proof issued while a deletion starts during password verification',async()=>{
        h.blocked.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        expect((await login()).code).toBe(409);
        expect(h.service.verifyLegacyPassword).toHaveBeenCalledTimes(1);
    });
    it('fails closed without leaking upstream details and releases the admission slot',async()=>{
        h.blocked.mockRejectedValueOnce(new Error('private upstream detail'));
        const unavailable=await login();
        expect(unavailable.code).toBe(503);expect(unavailable.body).toEqual({code:'UNAVAILABLE'});
        expect(unavailable.headers['Retry-After']).toBe('5');
        expect((await login()).code).toBe(200);
    });
    it('bounds concurrent password checks across accounts and permits retry after completion',async()=>{
        const finish:Array<(value:boolean)=>void>=[];
        h.service.verifyLegacyPassword.mockImplementation(()=>new Promise<boolean>(resolve=>finish.push(resolve)));
        const pending=Array.from({length:16},(_,i)=>login('Player'+i,'wrong','peer'+i));
        // Each request first awaits the durable deletion lookup.
        for(let i=0;i<4;i++)await Promise.resolve();
        expect(finish).toHaveLength(16);
        const full=await login('Another','wrong','another-peer');
        expect(full.code).toBe(503);expect(full.headers['Retry-After']).toBe('2');
        finish.forEach(resolve=>resolve(false));await Promise.all(pending);
        h.service.verifyLegacyPassword.mockResolvedValue(true);
        expect((await login('Another','correct','another-peer')).code).toBe(200);
    });
    it('revokes a proof and disconnects only sockets carrying that proof', async () => {
        const proof = (await login()).body.token;
        const first = await socket(proof), other = await socket('GUEST-other', 'socket-2');
        const res = response();
        await h.routes.get('/auth/ranked-session/revoke')!({ headers: { authorization: `Bearer ${proof}` } }, res);
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
        await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
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

describe('awaited authority at the socket/login boundary', () => {
    it.each(['null', 'reject'] as const)('awaits socket identity and calls next once with a sanitized error on %s', async outcome => {
        const proof = (await login()).body.token;
        const { RankedAuth } = await import('./RankedAuth');
        let finish!: (value: null) => void, reject!: (error: Error) => void;
        const verify = vi.spyOn(RankedAuth.prototype, 'verifySession').mockImplementationOnce(() => new Promise((yes, no) => { finish = yes; reject = no; }));
        const pending = socket(proof);
        expect(verify).toHaveBeenCalledOnce(); expect(h.mm.registerSocket).not.toHaveBeenCalled();
        if (outcome === 'null') finish(null); else reject(new Error('private-password-and-token'));
        const result = await pending;
        expect(result.next).toHaveBeenCalledTimes(1);
        expect(result.next.mock.calls[0][0].message).toBe(outcome === 'null'
            ? 'Authentication Error: Invalid token' : 'Authentication Error: Account check unavailable');
        expect(h.mm.registerSocket).not.toHaveBeenCalled();
        expect(h.service.verifyUser).toHaveBeenCalledTimes(outcome === 'null' ? 1 : 0);
    });
    it.each(['null', 'reject'] as const)('awaits ranked admission verification without forfeiting the socket on %s', async outcome => {
        const connected = await socket((await login()).body.token);
        const { RankedAuth } = await import('./RankedAuth');
        let finish!: (value: null) => void, reject!: (error: Error) => void;
        const verify = vi.spyOn(RankedAuth.prototype, 'verifySession').mockImplementationOnce(() => new Promise((yes, no) => { finish = yes; reject = no; }));
        const pending = connected.dispatch('join_queue', { mode: 'ranked', timeControl: 600 });
        await vi.waitFor(() => expect(verify).toHaveBeenCalledOnce());
        expect(h.mm.joinQueue).not.toHaveBeenCalled();
        if (outcome === 'null') finish(null); else reject(new Error('private-password-and-token'));
        await pending;
        const code = outcome === 'null' ? 'AUTH_REQUIRED' : 'AUTH_UNAVAILABLE';
        expect(connected.s.emit).toHaveBeenCalledWith('queue_error', { code, message: code });
        expect(h.mm.joinQueue).not.toHaveBeenCalled(); expect(connected.s.disconnect).not.toHaveBeenCalled();
    });
    it.each([false, true])('does not acknowledge logout before delayed revocation settles (reject=%s)', async rejected => {
        const proof = (await login()).body.token, connected = await socket(proof);
        const { RankedAuth } = await import('./RankedAuth');
        let finish!: (value: boolean) => void, reject!: (error: Error) => void;
        vi.spyOn(RankedAuth.prototype, 'revokeSession').mockImplementationOnce(() => new Promise((yes, no) => { finish = yes; reject = no; }));
        const res = response();
        const pending = h.routes.get('/auth/ranked-session/revoke')!({ headers: { authorization: `Bearer ${proof}` } }, res);
        expect(res.status).not.toHaveBeenCalled(); expect(res.end).not.toHaveBeenCalled(); expect(connected.s.disconnect).not.toHaveBeenCalled();
        if (rejected) reject(new Error('private-password-and-token')); else finish(true);
        await pending;
        expect(res.code).toBe(rejected ? 503 : 204);
        if (rejected) {
            expect(res.body).toEqual({ code: 'UNAVAILABLE' }); expect(res.end).not.toHaveBeenCalled(); expect(connected.s.disconnect).not.toHaveBeenCalled();
        } else expect(connected.s.disconnect).toHaveBeenCalledExactlyOnceWith(true);
    });
    it.each(['before issuance', 'after issuance'])('does not revoke another device on an unavailable login check %s', async phase => {
        const original = (await login()).body.token;
        const { RankedAuth } = await import('./RankedAuth');
        const issue = vi.spyOn(RankedAuth.prototype, 'issueLegacySession');
        const revokeAll = vi.spyOn(RankedAuth.prototype, 'revokeUserSessions');
        const revokeOne = vi.spyOn(RankedAuth.prototype, 'revokeSession');
        if (phase === 'after issuance') h.blocked.mockResolvedValueOnce(false);
        h.blocked.mockRejectedValueOnce(new Error('private-password-and-token'));
        expect((await login()).code).toBe(503); expect(revokeAll).not.toHaveBeenCalled();
        expect((await socket(original)).next).toHaveBeenCalledExactlyOnceWith();
        if (phase === 'after issuance') {
            const issued = await issue.mock.results[0].value;
            expect(revokeOne).toHaveBeenCalledExactlyOnceWith(issued.token);
            expect((await socket(issued.token, 'not-returned')).next).toHaveBeenCalledWith(expect.any(Error));
        } else expect(revokeOne).not.toHaveBeenCalled();
    });
    it('continues to revoke every device when deletion is confirmed during login', async () => {
        const original = (await login()).body.token;
        h.blocked.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        expect((await login()).code).toBe(409);
        expect((await socket(original)).next).toHaveBeenCalledWith(expect.any(Error));
    });
    it.each([false, true])('awaits restriction lookup without revoking recovery identity; preserves connections on outage (reject=%s)', async rejected => {
        const proof=(await login()).body.token,connected=await socket(proof);
        const {RankedAuth}=await import('./RankedAuth');
        const revoke=vi.spyOn(RankedAuth.prototype,'revokeUserSessions');
        let finish!:(value:string[])=>void,reject!:(error:Error)=>void;
        const restricted=vi.fn().mockImplementationOnce(()=>new Promise((yes,no)=>{finish=yes;reject=no;}));
        (h.service as any).restrictedAccounts=restricted;
        await vi.advanceTimersByTimeAsync(15000);
        expect(restricted).toHaveBeenCalledExactlyOnceWith(['Alice']);expect(connected.s.disconnect).not.toHaveBeenCalled();
        if(rejected)reject(new Error('private-password-and-token'));else finish(['Alice']);
        await vi.advanceTimersByTimeAsync(0);
        expect(revoke).not.toHaveBeenCalled();
        if(rejected)expect(connected.s.disconnect).not.toHaveBeenCalled();
        else {expect(connected.s.emit).toHaveBeenCalledWith('account_restricted');expect(connected.s.disconnect).toHaveBeenCalledExactlyOnceWith(true);}
        // A restriction denies game admission, not recovery/deletion identity.
        const {createRankedSessionInspectionRouter}=await import('./RankedSessionInspectionRoutes');
        const authority=vi.mocked(createRankedSessionInspectionRouter).mock.calls[0][0];
        expect(await authority.verifySession(proof)).toMatchObject({userId:'Alice'});
    });
});

it('rejects a legacy handshake revoked while the asynchronous account guard is pending', async () => {
    const proof = (await login()).body.token;
    let finish!: (blocked: boolean) => void;
    h.blocked.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = socket(proof);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const res = response();
    await h.routes.get('/auth/ranked-session/revoke')!({ headers: { authorization: `Bearer ${proof}` } }, res);
    expect(res.code).toBe(204); expect(h.mm.registerSocket).not.toHaveBeenCalled(); finish(false);
    const result = await pending;
    expect(result.next).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'Authentication Error: Invalid token' }));
    expect(h.mm.registerSocket).not.toHaveBeenCalled();
});

it.each(['expiry', 'outage'] as const)('keeps an already-started game available on session %s without reauthorizing every action', async reason => {
    const mm = await realMatchmaking();
    h.service.verifyLegacyPassword.mockImplementation(async (id, password) => ['Alice', 'Bob'].includes(id) && password === 'correct');
    const proof = (await login()).body;
    const alice = await socket(proof.token, 'alice'), bob = await socket((await login('Bob')).body.token, 'bob');
    for (const player of [alice, bob]) await player.dispatch('join_queue', { mode: 'ranked', timeControl: 600 });
    const matchId = mm.getPlayerSession('Alice')!.currentMatchId!;
    for (const player of [alice, bob]) await player.dispatch('connect_match', { matchId });
    const { RankedAuth } = await import('./RankedAuth');
    const verify = vi.spyOn(RankedAuth.prototype, 'verifySession');
    if (reason === 'expiry') vi.setSystemTime(proof.expiresAt);
    else verify.mockRejectedValue(new Error('private-password-and-token'));
    alice.s.emit.mockClear(); await alice.dispatch('request_sync', { matchId });
    expect(verify).not.toHaveBeenCalled();
    expect(alice.s.emit).toHaveBeenCalledWith('sync_state', expect.objectContaining({ matchId }));
    expect(alice.s.disconnect).not.toHaveBeenCalled(); expect(mm.getMatch(matchId)!.state).toBe('IN_GAME');
});

it('does not start a password check from a preflight that predates a logout/reset barrier', async () => {
    let finish!: (blocked: boolean) => void;
    h.blocked.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = login(); await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const { createAccountSecurityRouter } = await import('./AccountSecurityRoutes');
    const gate = vi.mocked(createAccountSecurityRouter).mock.calls[0][2];
    gate.reserve('Alice', false); finish(false);
    const response = await pending;
    expect(response.code).toBe(409); expect(response.body).toEqual({ code: 'ACCOUNT_BUSY' });
    expect(h.service.verifyLegacyPassword).not.toHaveBeenCalled();
    gate.release('Alice'); expect((await login()).code).toBe(200);
});
