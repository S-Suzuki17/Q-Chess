import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { GameEngine } from '../game/GameEngine';
import { createInitialBoard } from '../game/quantumChess';
import { cpuProfileForRating } from '../game/RankCpuSearch';

// Real HTTP, Socket.IO, matchmaking, rules and runtime. Only persistence/identity
// is an isolated in-memory double. Never import credentials or contact production.
const h = vi.hoisted(() => ({ serverIo: null as any, saved: new Map<string, any>(),
    settle: vi.fn(), casual: vi.fn(), verify: vi.fn() }));
vi.mock('socket.io', async original => {
    const actual = await original<any>();
    return { ...actual, Server: class extends actual.Server {
        constructor(...args: any[]) { super(...args); h.serverIo = this; }
    } };
});
vi.mock('./SupabaseService', () => ({ SupabaseService: class {
    verifyLegacyPassword = async (id: string, password: string) => /^qa-[ab]-/.test(id) && password === 'local-test-only';
    verifyUser = h.verify;
    rankedReady = async () => true;
    getMatchRating = async () => 1000;
    settleRankedMatch = h.settle;
    recordUnratedMatch = h.casual;
    profileAvatarStore = () => ({});
    adRewardStore = () => ({});
    foundersStore = () => ({});
    accountDeletionStore = () => ({ blocked: async () => false });
    accountRecoveryStore = () => ({ ready: async () => false });
} }));
vi.mock('./PlayRewardVerifier', () => ({ createPlayRewardVerifier: () => () => { throw new Error('Play access forbidden'); } }));
const clients: Socket[] = [], timers: ReturnType<typeof setTimeout>[] = [];
let endpoint = '', gateway: http.Server;
const nativeFetch = globalThis.fetch;
beforeAll(async () => {
    const listen = http.Server.prototype.listen;
    vi.spyOn(http.Server.prototype, 'listen').mockImplementation(function (this: http.Server, ...args: any[]) {
        gateway = this;
        return listen.call(this, 0, '127.0.0.1', args.at(-1));
    } as any);
    const interval = globalThis.setInterval, timeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((...args: any[]) => {
        const timer = interval(...args as Parameters<typeof setInterval>); timers.push(timer); return timer;
    }) as typeof setInterval);
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((...args: any[]) => {
        const timer = timeout(...args as Parameters<typeof setTimeout>); timers.push(timer); return timer;
    }) as typeof setTimeout);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', ((input: any, init: any) => {
        if (!endpoint || !String(input).startsWith(endpoint + '/')) throw new Error('External network forbidden');
        return nativeFetch(input, init);
    }) as typeof fetch);
    h.verify.mockResolvedValue(null);
    h.settle.mockImplementation(async match => {
        if (!h.saved.has(match.matchId)) h.saved.set(match.matchId, {
            timeControl: match.timeControl,
            white: { userId: match.players.host, before: 1000, after: 1016, delta: 16 },
            black: { userId: match.players.joiner, before: 1000, after: 984, delta: -16 },
        });
        return h.saved.get(match.matchId);
    });
    await import('../index');
    if (!gateway.listening) await new Promise<void>(resolve => gateway.once('listening', resolve));
    endpoint = `http://127.0.0.1:${(gateway.address() as any).port}`;
});
afterAll(async () => {
    for (const client of clients) client.disconnect();
    if (h.serverIo) await new Promise<void>(resolve => h.serverIo.close(() => resolve()));
    gateway?.closeAllConnections();
    for (const timer of timers) { clearTimeout(timer); clearInterval(timer); }
    vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function event(client: Socket, name: string, accepts: (data: any) => boolean = () => true): Promise<any> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { client.off(name, handler); reject(new Error(`Timed out: ${name}`)); }, 4000);
        function handler(data: any) { if (accepts(data)) { clearTimeout(timer); client.off(name, handler); resolve(data); } }
        client.on(name, handler);
    });
}
async function connect(token: string, transport = 'websocket') {
    const client = io(endpoint, { auth: { token }, transports: [transport as any], reconnection: false, autoConnect: false });
    clients.push(client); const ready = event(client, 'connect'); client.connect(); await ready; return client;
}
async function proof(id: string) {
    const response = await fetch(endpoint + '/auth/ranked-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: id, password: 'local-test-only' }),
    });
    expect(response.status).toBe(200); return (await response.json()).token as string;
}
async function paired(a: Socket, b: Socket, mode: string, seconds: number) {
    const foundA = event(a, 'match_found'), foundB = event(b, 'match_found');
    const joined = event(a, 'queue_joined'); a.emit('join_queue', { mode, timeControl: seconds }); await joined;
    b.emit('join_queue', { mode, timeControl: seconds });
    const [match, other] = await Promise.all([foundA, foundB]); expect(other.matchId).toBe(match.matchId);
    const startA = event(a, 'match_start'), startB = event(b, 'match_start');
    a.emit('connect_match', { matchId: match.matchId, userName: 'White', avatarFrame: 'avatar-frame-01', introVersion: 1 });
    b.emit('connect_match', { matchId: match.matchId, userName: 'Black', avatarFrame: 'avatar-frame-15', introVersion: 1 });
    const [state, second] = await Promise.all([startA, startB]);
    expect(second.board).toEqual(state.board);
    expect(state).toMatchObject({ introPending: true, playerRatings: { host: 1000, joiner: 1000 }, clock: { white: seconds * 1000, black: seconds * 1000 } });
    const readyA = event(a, 'sync_state', s => s.introPending === false), readyB = event(b, 'sync_state', s => s.introPending === false);
    a.emit('intro_ready', { matchId: match.matchId }); b.emit('intro_ready', { matchId: match.matchId });
    const [ready] = await Promise.all([readyA, readyB]);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, ready.startsAt - Date.now()) + 30));
    return state;
}
describe('loopback online match integration (no production data)', () => {
    it.each([10, 180, 600])('plays both colors, recovers a disconnect and settles once (%s seconds)', async seconds => {
        const idA = `qa-a-${seconds}`, idB = `qa-b-${seconds}`;
        const tokenA = await proof(idA), tokenB = await proof(idB);
        const a = await connect(tokenA), b = await connect(tokenB, seconds === 180 ? 'polling' : 'websocket');
        const start = await paired(a, b, 'ranked', seconds), matchId = start.matchId;
        const action = { actionId: `white-${seconds}`, version: 0, action: { type: 'MOVE', payload: { pieceId: start.board[8], toX: 0, toY: 2 } } };
        const firstA = event(a, 'sync_state', s => s.version === 1), firstB = event(b, 'sync_state', s => s.version === 1);
        a.emit('player_action', action);
        const [white, black] = await Promise.all([firstA, firstB]); expect(white.board).toEqual(black.board);
        const duplicate = event(a, 'sync_state'); a.emit('player_action', action); expect((await duplicate).moveCount).toBe(1);
        const rejected = event(a, 'action_error');
        a.emit('player_action', { ...action, actionId: 'not-your-turn', version: 1 }); expect((await rejected).message).toBe('Invalid action');
        const disconnected = event(a, 'opponent_disconnected'); b.disconnect(); expect((await disconnected).gracePeriodSeconds).toBe(30);
        const restored = io(endpoint, { auth: { token: tokenB }, transports: ['websocket'], autoConnect: false, reconnection: false });
        clients.push(restored); const synced = event(restored, 'sync_state'); restored.connect();
        expect(await synced).toMatchObject({ matchId, version: 1, board: white.board, introPending: false });
        const nextA = event(a, 'sync_state', s => s.version === 2), nextB = event(restored, 'sync_state', s => s.version === 2);
        restored.emit('player_action', { actionId: `black-${seconds}`, version: 1, action: { type: 'MOVE', payload: { pieceId: start.board[48], toX: 0, toY: 5 } } });
        const [reply, same] = await Promise.all([nextA, nextB]); expect(reply.board).toEqual(same.board); expect(reply.moveCount).toBe(2);
        const receiptA = event(a, 'rating_settled'), receiptB = event(restored, 'rating_settled');
        const over = event(a, 'sync_state', s => !!s.gameOver);
        restored.emit('player_action', { actionId: `resign-${seconds}`, version: 2, action: { type: 'RESIGN', payload: {} } });
        expect(await over).toMatchObject({ gameOver: 'WHITE', gameOverReason: 'resignation' });
        expect(await receiptA).toMatchObject({ matchId, userId: idA, delta: 16, timeControl: seconds });
        expect(await receiptB).toMatchObject({ matchId, userId: idB, delta: -16, timeControl: seconds });
        const receiptAgain = event(a, 'rating_settled'); a.emit('request_sync', { matchId }); await receiptAgain;
        expect(h.settle.mock.calls.filter(([match]) => match.matchId === matchId)).toHaveLength(1);
        a.disconnect(); restored.disconnect();
    });
    it('cancels waiting and excludes guests from ranked', async () => {
        const guest = await connect('GUEST-qa-cancel');
        const denied = event(guest, 'queue_error'); guest.emit('join_queue', { mode: 'ranked', timeControl: 600 });
        expect((await denied).code).toBe('AUTH_REQUIRED');
        const joined = event(guest, 'queue_joined'); guest.emit('join_queue', { mode: 'random', timeControl: 600 }); await joined;
        const stats = event(guest, 'queue_stats', s => (s[600] ?? 0) === 0); guest.emit('cancel_queue'); await stats;
        guest.disconnect();
    });
    it('replaces the old live connection without forfeiting or resetting the match', async () => {
        const tokenA = await proof('qa-a-handoff'), tokenB = await proof('qa-b-handoff');
        const a = await connect(tokenA), b = await connect(tokenB);
        const state = await paired(a,b,'ranked',600);
        const replacementNotice = event(a,'session_replaced'), disconnected = event(a,'disconnect');
        const next = io(endpoint,{auth:{token:tokenA},transports:['websocket'],autoConnect:false,reconnection:false});
        clients.push(next); const restored = event(next,'sync_state'); next.connect();
        await replacementNotice; expect(await disconnected).toBe('io server disconnect');
        const resume = await restored;
        expect(resume.matchId).toBe(state.matchId); expect(resume.board).toEqual(state.board); expect(resume.gameOver).toBeFalsy();
        expect(a.connected).toBe(false);
        const moved = event(b,'sync_state',s=>s.version===1);
        next.emit('player_action',{actionId:'handoff-move',version:0,action:{type:'MOVE',payload:{pieceId:state.board[8],toX:0,toY:2}}});
        expect((await moved).moveCount).toBe(1);
        const ended = event(b,'sync_state',s=>!!s.gameOver);
        next.emit('player_action',{actionId:'handoff-resign',version:1,action:{type:'RESIGN',payload:{}}});
        expect((await ended).gameOverReason).toBe('resignation');
        next.disconnect();b.disconnect();
    });
    it('uses the compiled CPU worker and produces an authoritative legal move', async () => {
        const engine = new GameEngine('worker-qa', 'human', 'cpu', createInitialBoard(), 600);
        const state = engine.getPublicState('human');
        const worker = new Worker(path.resolve('server/dist/game/rankCpuWorker.js'), { workerData: { state, profile: cpuProfileForRating(1000, 600) } });
        try {
            const response: any = await new Promise((resolve, reject) => {
                worker.once('message', resolve); worker.once('error', reject);
                worker.once('exit', code => { if (code) reject(new Error(`Worker exit ${code}`)); });
            });
            expect(response.error).toBeUndefined(); expect(response.move).toBeTruthy();
            expect(engine.processAction({ actionId: 'worker', version: state.version, playerId: 'human', action: { type: 'MOVE', payload: response.move } }).success).toBe(true);
        } finally { await worker.terminate(); }
    });
});
