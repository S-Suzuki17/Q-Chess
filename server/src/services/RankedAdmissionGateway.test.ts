import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Server as NetServer } from 'node:net';

// Every gateway dependency with side effects is replaced before dynamic import.
// Private history is tested separately. Importing the entrypoint cannot touch data.
const h = vi.hoisted(() => {
    const routes = new Map<string, (...args:any[])=>any>(), listeners = new Map<string, (...args:any[])=>any>();
    const sockets = new Map<string, any>(), sessions = new Map<string, any>();
    const blocked=vi.fn(async()=>false);
    const admissionStore={renew:vi.fn(async()=>true),admit:vi.fn(async()=>({state:'active'})),void:vi.fn(async()=>({state:'voided'})),recover:vi.fn(async()=>[]),read:vi.fn(async()=>null),busy:vi.fn(async()=>false)};
    const service = {rankedAdmissionStore:()=>admissionStore, cleanupOldRecords: vi.fn(), verifyLegacyPassword: vi.fn(), verifyUser: vi.fn(),
        rankedReady: vi.fn(), getMatchRating: vi.fn(), settleRankedMatch: vi.fn(), recordUnratedMatch: vi.fn(), profileAvatarStore: vi.fn(()=>({})), adRewardStore: vi.fn(()=>({})), engagementMetricsStore: vi.fn(()=>({})), foundersStore: vi.fn(()=>({})), stripeMembershipStore: vi.fn(()=>({})),
        admitRankedMatch: vi.fn(), voidRankedAdmission: vi.fn(), cpuPracticeService: vi.fn() };
    const mm = { registerSocket: vi.fn((userId, socketId) => sessions.set(userId, { userId, socketId, state: 'IDLE' })),
        getPlayerSession: vi.fn(id => sessions.get(id)), clearDisconnectTimer: vi.fn(), getQueueStats: vi.fn(() => ({})),
        takeCpuFallbacks: vi.fn(() => []), joinQueue: vi.fn(), leaveQueue: vi.fn(), removeSocket: vi.fn(), getMatch: vi.fn(),
        reserveMatch: vi.fn(), connectMatch: vi.fn(),activateMatch:vi.fn(),getMatches:vi.fn(()=>[]),finishMatch:vi.fn(),accountBusy:vi.fn(),
        opponentDisconnect: vi.fn(() => null), awaitingReconnect: vi.fn(() => false), authenticationUnavailable:vi.fn(),authorityCheckPending:vi.fn(()=>false) };
    const app = { use: vi.fn(), get: vi.fn((path, handler) => routes.set(path, handler)), post: vi.fn((path, handler) => routes.set(path, handler)) };
    const io = { emit: vi.fn(), use: vi.fn(), on: vi.fn((event, handler) => listeners.set(event, handler)),
        sockets: { sockets, adapter: { rooms: new Map() } }, to: vi.fn(() => ({ emit: vi.fn() })) };
    return { entitlementReadsEnabled:false,admissionStore,routes, listeners, sockets, sessions, service, blocked, mm, app, io, json: vi.fn(), listen: vi.fn(), tick: vi.fn(),
        engineClass: undefined as typeof import('../game/GameEngine').GameEngine | undefined };
});
vi.mock('./TicketFeatureGates',()=>({cpuHintTicketsEnabled:()=>false,rankedTicketAdmissionEnabled:()=>true,rankedAdmissionRecoveryEnabled:()=>true}));
vi.mock('./SharedMatchFeatureGates',async original=>({...await original<typeof import('./SharedMatchFeatureGates')>(),
    sharedMatchEntitlementEnabled:()=>h.entitlementReadsEnabled}));
vi.mock('express', () => ({ default: Object.assign(() => h.app, { json: h.json }) }));
vi.mock('http', () => ({ default: { createServer: vi.fn(() => ({ listen: h.listen })) } }));
vi.mock('cors', () => ({ default: vi.fn(() => () => {}) }));
vi.mock('socket.io', () => ({ Server: class { constructor() { return h.io; } } }));
vi.mock('./SupabaseService', () => ({ SupabaseService: class { constructor() { return h.service; } } }));
vi.mock('../matchmaking/MatchmakingService', async importOriginal => ({
    CPU_FALLBACK_MS: (await importOriginal<typeof import('../matchmaking/MatchmakingService')>()).CPU_FALLBACK_MS,
    MatchmakingService: class { constructor() { return h.mm; } },
}));
vi.mock('../game/RankedRuntime', () => ({ RankedRuntime: class { tick = h.tick; } }));
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
// Crown HTTP authority has its own real-router and mounted-HTTP tests.
vi.mock('./CrownAdmissionRoutes', () => ({ createCrownAdmissionRouter: vi.fn(() => () => {}) }));
// HTTP inspection has its own real-router suite; this fixture isolates socket admission.
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
    const handlers = new Map<string, (...args:any[])=>any>();
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
    h.entitlementReadsEnabled=false;
    h.admissionStore.renew.mockReset().mockResolvedValue(true);h.admissionStore.admit.mockReset().mockResolvedValue({state:'active'});
    h.admissionStore.void.mockReset().mockResolvedValue({state:'voided'});h.admissionStore.recover.mockReset().mockResolvedValue([]);h.admissionStore.read.mockReset().mockResolvedValue(null);h.admissionStore.busy.mockReset().mockResolvedValue(false);
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
    const actual = new MatchmakingService(h.io as any,true);
    for (const key of ['registerSocket', 'getPlayerSession', 'clearDisconnectTimer', 'getQueueStats',
        'activateMatch','getMatches','finishMatch','accountBusy','takeCpuFallbacks', 'joinQueue', 'leaveQueue', 'removeSocket', 'getMatch', 'reserveMatch', 'connectMatch']) {
        vi.spyOn(h.mm as any, key).mockImplementation((...args: any[]) => (actual as any)[key](...args));
    }
    vi.stubEnv('RANKED_TICKET_ADMISSION_ENABLED', 'true');
    h.service.admitRankedMatch.mockRejectedValue(new Error('Missing ticket migration'));
    return actual;
}


async function microtasks() {for(let i=0;i<30;i++)await Promise.resolve();}
function responsePending<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve};}
describe('shared protocol socket middleware',()=>{
    it('admits object-shaped initial and refreshed entitlement requests through the actual packet guard',async()=>{
        h.entitlementReadsEnabled=true;
        expect((await import('./SharedMatchFeatureGates')).sharedMatchAdmissionEnabled()).toBe(false);
        const entitlement={plan:'standard',noAds:true,unlimitedOnlineRanked:true,periodEnd:'2099-01-01T00:00:00.000Z'};
        const read=vi.fn(async()=>entitlement);(h.service as any).sharedMatchEntitlement=read;
        const alice=await socket((await login()).body.token,'alice');
        await alice.dispatch('request_shared_entitlement',{});
        expect(read).toHaveBeenCalledExactlyOnceWith('Alice');
        expect(alice.s.emit).toHaveBeenCalledWith('shared_entitlement',{userId:'Alice',entitlement,sharedAdmissionEnabled:false});
        vi.setSystemTime(Date.now()+45000);
        await alice.dispatch('request_shared_entitlement',{});
        expect(read).toHaveBeenCalledTimes(2);
        for(const payload of [undefined,null,[],false])await alice.dispatch('request_shared_entitlement',payload);
        expect(read).toHaveBeenCalledTimes(2);
    });
    it('delivers initial and repeated entitlement responses over loopback Socket.IO through the index middleware',async()=>{
        h.entitlementReadsEnabled=true;
        vi.useRealTimers();vi.mocked(NetServer.prototype.listen).mockRestore();
        const {createServer}=await vi.importActual<typeof import('node:http')>('node:http');
        const {Server}=await vi.importActual<typeof import('socket.io')>('socket.io');
        const {io}=await import('socket.io-client');
        const entitlement={plan:'free',noAds:false,unlimitedOnlineRanked:false,periodEnd:null};
        const read=vi.fn(async()=>entitlement);(h.service as any).sharedMatchEntitlement=read;
        const token=(await login()).body.token,alice=await socket(token,'alice-loopback');
        const packetMiddleware=alice.s.use.mock.calls[0][0];
        const requestHandler=alice.s.on.mock.calls.find(([event])=>event==='request_shared_entitlement')![1];
        const http=createServer(),transportServer=new Server(http,{serveClient:false,transports:['websocket']});
        transportServer.on('connection',connected=>{
            // These are the actual registered index.ts middleware and handler;
            // the DB response is the only entitlement result substituted here.
            alice.s.emit.mockImplementation((event,data)=>connected.emit(event,data));
            connected.use(packetMiddleware);connected.on('request_shared_entitlement',requestHandler);
        });
        await new Promise<void>(resolve=>http.listen(0,'127.0.0.1',resolve));
        const address=http.address();if(!address||typeof address==='string')throw new Error('Loopback address missing');
        const client=io(`http://127.0.0.1:${address.port}`,{auth:{token},transports:['websocket'],reconnection:false,autoConnect:false});
        try {
            await new Promise<void>((resolve,reject)=>{client.once('connect',()=>resolve());client.once('connect_error',reject);client.connect();});
            const request=()=>new Promise<unknown>((resolve,reject)=>{
                const timeout=setTimeout(()=>reject(new Error('Entitlement response missing')),2000);
                client.once('shared_entitlement',value=>{clearTimeout(timeout);resolve(value);});
                client.emit('request_shared_entitlement',{});
            });
            expect(await request()).toEqual({userId:'Alice',entitlement,sharedAdmissionEnabled:false});
            expect(await request()).toEqual({userId:'Alice',entitlement,sharedAdmissionEnabled:false});
            expect(read).toHaveBeenCalledTimes(2);
        } finally {client.disconnect();await new Promise<void>(resolve=>transportServer.close(()=>resolve()));}
    });
    it('malformed authenticated choice packets cannot throw or reach admission',async()=>{
        vi.spyOn(await import('./SharedMatchFeatureGates'),'sharedMatchAdmissionEnabled').mockReturnValue(true);
        const alice=await socket((await login()).body.token,'alice');
        const matchId='11111111-2222-4333-8444-555555555555';
        for(const source of [undefined,null,[],{},["ticket"],{toString:null},{toString:'ticket'},false,1]){
            await expect(Promise.resolve(alice.dispatch('choose_match_admission',{matchId,source}))).resolves.toBeUndefined();
        }
        expect(h.admissionStore.admit).not.toHaveBeenCalled();
    });
});

describe('admitted ranked socket gateway',()=>{
    it('a crash before admission explicitly cancels the unknown queue UUID; private codes still work',async()=>{
        const mm=await realMatchmaking(),alice=await socket((await login()).body.token,'alice');
        const id='11111111-2222-4333-8444-555555555555';
        await alice.dispatch('connect_match',{matchId:id});
        expect(alice.s.emit).toHaveBeenCalledWith('match_cancelled',{matchId:id,reason:'match_not_found'});
        expect(mm.getMatch(id)).toBeUndefined();
        h.admissionStore.read.mockClear();
        await alice.dispatch('connect_match',{matchId:'ABC123'});
        expect(mm.getMatch('ABC123')!.state).toBe('WAITING_FOR_JOINER');
        expect(h.admissionStore.read).not.toHaveBeenCalled();expect(h.admissionStore.admit).not.toHaveBeenCalled();
        const guest=await socket('GUEST-friend','friend');
        await guest.dispatch('connect_match',{matchId:'ABC123'});
        expect(mm.getMatch('ABC123')!.state).toBe('IN_GAME');
        expect(mm.getMatch('ABC123')!.admission).toBeUndefined();
        expect(h.admissionStore.admit).not.toHaveBeenCalled();
    });
    it('concurrent connect/sync/action cannot expose an engine/start before the admission reply',async()=>{
        const mm=await realMatchmaking();
        h.service.verifyLegacyPassword.mockImplementation(async(id,password)=>['Alice','Bob'].includes(id)&&password==='correct');
        const alice=await socket((await login()).body.token,'alice'),bob=await socket((await login('Bob')).body.token,'bob');
        await alice.dispatch('join_queue',{mode:'ranked',timeControl:600});
        await bob.dispatch('join_queue',{mode:'ranked',timeControl:600});
        const id=mm.getPlayerSession('Alice')!.currentMatchId!;
        await alice.dispatch('connect_match',{matchId:id});
        const reply=responsePending<{state:string}>();h.admissionStore.admit.mockReturnValue(reply.promise);
        const pending=bob.dispatch('connect_match',{matchId:id});
        await microtasks();
        const duplicate=alice.dispatch('connect_match',{matchId:id});await microtasks();
        await alice.dispatch('request_sync',{matchId:id});
        await alice.dispatch('player_action',{actionId:'early',version:0,action:{type:'RESIGN',payload:{}}});
        expect(mm.getMatch(id)!.state).toBe('ADMITTING');expect(mm.getMatch(id)!.engine).toBeUndefined();
        for(const p of [alice,bob])expect(p.s.emit.mock.calls.some(([event])=>event==='match_start'||event==='sync_state')).toBe(false);
        expect(h.admissionStore.admit).toHaveBeenCalledOnce();
        reply.resolve({state:'active'});await pending;await duplicate;
        expect(mm.getMatch(id)!.state).toBe('IN_GAME');
        for(const p of [alice,bob])expect(p.s.emit.mock.calls.filter(([event])=>event==='match_start')).toHaveLength(1);
        expect(mm.getMatch(id)!.engine!.getPublicState('Alice').clock.white).toBe(600000);
    });
    it('RPC denial cancels both PvP participants and never emits a start',async()=>{
        const mm=await realMatchmaking();
        h.service.verifyLegacyPassword.mockImplementation(async(id,password)=>['Alice','Bob'].includes(id)&&password==='correct');
        const alice=await socket((await login()).body.token,'alice'),bob=await socket((await login('Bob')).body.token,'bob');
        await alice.dispatch('join_queue',{mode:'ranked',timeControl:600});await bob.dispatch('join_queue',{mode:'ranked',timeControl:600});
        const id=mm.getPlayerSession('Alice')!.currentMatchId!;
        h.admissionStore.admit.mockResolvedValue({state:'rejected',reason:'INSUFFICIENT_FUNDS'} as any);
        await alice.dispatch('connect_match',{matchId:id});await bob.dispatch('connect_match',{matchId:id});
        expect(mm.getMatch(id)!.engine).toBeUndefined();expect(mm.accountBusy('Alice')).toBe(false);expect(mm.accountBusy('Bob')).toBe(false);
        for(const p of [alice,bob]) {
            expect(p.s.emit).toHaveBeenCalledWith('match_cancelled',{matchId:id,reason:'INSUFFICIENT_FUNDS'});
            expect(p.s.emit.mock.calls.some(([event])=>event==='match_start')).toBe(false);
        }
    });
    it('reconnect to an old live owner waits; voided recovery never creates a private/new UUID',async()=>{
        const mm=await realMatchmaking(),alice=await socket((await login()).body.token,'alice');
        const id='11111111-2222-4333-8444-555555555555';
        h.admissionStore.read.mockResolvedValue({state:'active',matchId:id,ownerId:'other',humanIds:['Alice']} as any);
        await alice.dispatch('connect_match',{matchId:id});
        expect(alice.s.emit).toHaveBeenCalledWith('match_preparing',{matchId:id,reason:'owner_recovery'});
        expect(mm.getMatch(id)).toBeUndefined();expect(h.admissionStore.admit).not.toHaveBeenCalled();
        h.admissionStore.read.mockResolvedValue({state:'voided',matchId:id,reason:'server_recovery',humanIds:['Alice']} as any);
        await alice.dispatch('request_sync',{matchId:id});
        expect(alice.s.emit).toHaveBeenCalledWith('match_cancelled',{matchId:id,reason:'server_recovery'});
        expect(mm.getMatch(id)).toBeUndefined();
    });
    it('expired local authority rejects human action and sync while durable void is unresolved',async()=>{
        const mm=await realMatchmaking(),alice=await socket((await login()).body.token,'alice');
        await alice.dispatch('join_queue',{mode:'ranked',timeControl:600});
        vi.spyOn(Math,'random').mockReturnValue(.9);
        vi.setSystemTime(Date.now()+60000);
        const [m]=mm.takeCpuFallbacks();
        await alice.dispatch('connect_match',{matchId:m.matchId});
        const before=m.engine!.getPublicState('Alice').version;
        const reply=responsePending<{state:string}>();h.admissionStore.void.mockReturnValue(reply.promise);
        vi.setSystemTime(Date.now()+11000);
        alice.s.emit.mockClear();
        await alice.dispatch('player_action',{actionId:'late',version:before,action:{type:'RESIGN',payload:{}}});
        await alice.dispatch('request_sync',{matchId:m.matchId});
        expect(m.state).toBe('VOIDING');expect(mm.accountBusy('Alice')).toBe(true);
        expect(m.engine!.getPublicState('Alice').version).toBe(before);
        expect(alice.s.emit.mock.calls.some(([event])=>event==='sync_state'||event==='match_cancelled')).toBe(false);
        reply.resolve({state:'voided'});await microtasks();
        expect(m.state).toBe('CANCELLED');expect(mm.accountBusy('Alice')).toBe(false);
    });
});
