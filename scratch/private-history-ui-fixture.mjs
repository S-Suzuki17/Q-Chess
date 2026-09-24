import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';

// Isolated local UI fixture. No SDK, .env, filesystem, DB or remote requests.
// Never deploy this fixture or use its fixed credentials outside local QA.
const HOST = '127.0.0.1';
const PORT = 4311;
const USER = 'ReplayQA';
const PASSWORD = 'fixture-only';
const PROOF = 'qg_fixture_replayqa_local_only_0123456789abcdef';
const moves = [
    { turn: 1, player: 'white', tokenId: 'token_21', from: [6, 4], to: [4, 4], possibleTypes: ['Pawn', 'Rook', 'Queen'], replayVersion: 2, changes: [[21, 36, 25, 1, 0]] },
    { turn: 2, player: 'black', tokenId: 'token_13', from: [1, 4], to: [3, 4], possibleTypes: ['Pawn', 'Rook', 'Queen'], replayVersion: 2, changes: [[13, 28, 25, 1, 0]] },
    { turn: 3, player: 'white', tokenId: 'token_31', from: [7, 6], to: [5, 5], possibleTypes: ['Knight'], replayVersion: 2, changes: [[31, 45, 2, 1, 0]] },
    { turn: 4, player: 'black', tokenId: 'token_7', from: [0, 6], to: [2, 5], possibleTypes: ['Knight'], replayVersion: 2, changes: [[7, 21, 2, 1, 0]] },
];
const records = [
    { id: '10000000-0000-4000-8000-000000000003', created_at: '2026-09-18T08:03:00Z', white_id: USER, white_player: USER, black_id: 'ai:20000000-0000-4000-8000-000000000003', black_player: 'CPU Lv.3', winner: 'white_wins', mode: 'ranked_cpu', cpu_level: 3, time_control: '3m', moves, total_moves: 4 },
    { id: '10000000-0000-4000-8000-000000000002', created_at: '2026-09-18T08:02:00Z', white_id: 'StoneQA', white_player: 'StoneQA', black_id: USER, black_player: USER, winner: 'draw', mode: 'ranked', time_control: '10m', moves, total_moves: 4 },
    { id: '10000000-0000-4000-8000-000000000001', created_at: '2026-09-18T08:01:00Z', white_id: USER, white_player: USER, black_id: 'ai', black_player: 'CPU Lv.2', winner: 'black_wins', mode: 'cpu', cpu_level: 2, time_control: '10s', moves, total_moves: 4 },
];
const profiles = [USER, 'StoneQA', 'QuartzQA'].map((id, index) => ({
    id, name: id, rating: 1000 + index * 20, rating_10s: 1000, rating_3m: 1000, rating_10m: 1000,
    created_at: '2026-09-18T00:00:00Z', avatar_url: null,
}));
const stats = { totalGames: 37, wins: 20, losses: 12, draws: 5, whiteGames: 22, whiteWins: 12, blackGames: 15, blackWins: 8 };
const maintenance = { id: 1, maintenance_mode: false, announcement_en: null, announcement_ja: null };
const localOrigin = origin => {
    try {
        const url = new URL(origin);
        return ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    } catch { return false; }
};
async function readBody(request) {
    let length = 0;
    const chunks = [];
    for await (const chunk of request) {
        length += chunk.length;
        if (length > 4096) throw Object.assign(new Error('Fixture request too large'), { status: 413 });
        chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw Object.assign(new Error('Fixture expects JSON'), { status: 400 }); }
}
function makeFixtureServer() {
    let sessionIssued = false;
    const counters = new Map();
    let photo = null;
    const server = createServer(async (request, response) => {
        const json = (status, body) => {
            response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
            response.end(body === undefined ? undefined : JSON.stringify(body));
        };
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-QG-Fixture', 'local-only');
        const origin = request.headers.origin;
        if (origin && !localOrigin(origin)) return json(403, { error: 'FIXTURE_LOCAL_ORIGIN_ONLY' });
        if (origin) {
            response.setHeader('Access-Control-Allow-Origin', origin);
            response.setHeader('Vary', 'Origin');
        }
        response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info,prefer,range,accept-profile,content-profile,x-supabase-api-version');
        response.setHeader('Access-Control-Expose-Headers', 'Content-Range,X-QG-Fixture');
        if (request.method === 'OPTIONS') return json(204);
        const url = new URL(request.url || '/', `http://${HOST}:${PORT}`);
        const path = url.pathname;
        const key = `${request.method} ${path}`;
        counters.set(key, (counters.get(key) || 0) + 1);
        try {
            if (path === '/health') return json(200, { status: 'ok', fixture: true, noProductionConnections: true });
            if (path === '/__fixture/status') return json(200, { fixture: true, sessionIssued, requests: Object.fromEntries(counters),avatar:profiles[0].avatar_url });
            if (photo && path === photo.path && request.method === 'GET') {
                response.writeHead(200,{'Content-Type':'image/webp'});response.end(photo.bytes);return;
            }
            if (path.startsWith('/profile/avatar/') && request.method === 'POST') {
                if(!sessionIssued||request.headers.authorization!==`Bearer ${PROOF}`)return json(401,{code:'AUTH_REQUIRED'});
                if(path==='/profile/avatar/icon') {
                    const body=await readBody(request);
                    if(!/^circuit-(0[1-9]|1[0-5])$/.test(body?.iconId))return json(400,{code:'INVALID_ICON'});
                    profiles[0].avatar_url=`/avatars/${body.iconId}.svg`;
                } else if(path==='/profile/avatar/photo') {
                    const chunks=[];let length=0;
                    for await(const chunk of request){length+=chunk.length;if(length>2*1024*1024)return json(413,{code:'INVALID_BODY'});chunks.push(chunk);}
                    const imagePath=`/storage/v1/object/public/avatars/u/${createHash('sha256').update(USER).digest('hex')}/${randomUUID()}.webp`;
                    photo={path:imagePath,bytes:Buffer.concat(chunks)};
                    profiles[0].avatar_url=`http://${HOST}:${PORT}${imagePath}`;
                } else return json(404,{code:'NOT_FOUND'});
                return json(200,{userId:USER,avatarUrl:profiles[0].avatar_url});
            }
            if (path === '/auth/ranked-session' && request.method === 'POST') {
                const body = await readBody(request);
                if (body?.username !== USER || body?.password !== PASSWORD) return json(401, { error: 'FIXTURE_INVALID_CREDENTIALS' });
                sessionIssued = true;
                return json(200, { token: PROOF, userId: USER, expiresAt: Date.now() + 3600000 });
            }
            if (path === '/auth/ranked-session/revoke' && request.method === 'POST') {
                if (request.headers.authorization !== `Bearer ${PROOF}`) return json(401, { error: 'AUTH_REQUIRED' });
                sessionIssued = false;
                return json(204);
            }
            if (path.startsWith('/auth/v1/')) {
                if (path.endsWith('/session')) return json(200, { session: null, user: null });
                if (path.endsWith('/settings')) return json(200, { external: { google: false, discord: false }, disable_signup: true });
                if (path.endsWith('/logout')) return json(204);
                return json(401, { code: 'session_not_found', msg: 'Local fixture has no Supabase Auth session' });
            }
            if (path === '/game-records' || path === '/game-stats') {
                if (!sessionIssued || request.headers.authorization !== `Bearer ${PROOF}`) return json(401, { error: 'AUTH_REQUIRED' });
                for (const parameter of ['userId', 'user_id', 'p_user_id']) {
                    if (url.searchParams.has(parameter) && url.searchParams.get(parameter) !== USER) return json(403, { error: 'FIXTURE_OWNER_MISMATCH' });
                }
                if (request.method !== 'GET') return json(403, { error: 'FIXTURE_READ_ONLY' });
                if (path === '/game-stats') return json(200, { stats });
                const requested = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 10;
                const limit = Number.isFinite(requested) ? Math.max(0, Math.min(10, Math.floor(requested))) : 10;
                return json(200, { records: records.slice(0, limit) });
            }
            if (path.startsWith('/rest/v1/')) {
                if (request.method !== 'GET' || path.includes('/rpc/')) return json(403, { code: '42501', message: 'FIXTURE_READ_ONLY: registration and writes disabled' });
                if (path === '/rest/v1/game_records') return json(403, { code: '42501', message: 'Private history endpoint required' });
                let values;
                if (path === '/rest/v1/profiles') {
                    values = profiles;
                    const id = url.searchParams.get('id');
                    if (id?.startsWith('eq.')) values = values.filter(profile => profile.id === id.slice(3));
                    const limit = Number(url.searchParams.get('limit'));
                    if (Number.isSafeInteger(limit) && limit > 0) values = values.slice(0, limit);
                } else if (path === '/rest/v1/system_status') values = [maintenance];
                else if (path === '/rest/v1/friends' || path === '/rest/v1/active_matches') values = [];
                else return json(404, { error: 'FIXTURE_ROUTE_NOT_FOUND' });
                response.setHeader('Content-Range', values.length ? `0-${values.length - 1}/${values.length}` : '*/0');
                if (request.headers.accept?.includes('application/vnd.pgrst.object+json')) {
                    return values.length === 1 ? json(200, values[0]) : json(406, { code: 'PGRST116', message: 'Fixture object not found' });
                }
                return json(200, values);
            }
            return json(404, { error: 'FIXTURE_ROUTE_NOT_FOUND' });
        } catch (error) {
            return json(error?.status === 413 ? 413 : 400, { error: 'FIXTURE_BAD_REQUEST' });
        }
    });
    server.on('upgrade', (_request, socket) => {
        // Deliberately no Socket.IO or Realtime auth simulation. HTTP proof is separate.
        socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    });
    return server;
}

if (process.argv.includes('--self-test')) {
    const server = makeFixtureServer();
    await new Promise(resolve => server.listen(0, HOST, resolve));
    const base = `http://${HOST}:${server.address().port}`;
    const headers = { Authorization: `Bearer ${PROOF}` };
    try {
        assert.equal((await fetch(`${base}/game-records`)).status, 401);
        assert.equal((await fetch(`${base}/game-records`, { headers })).status, 401);
        const login = await fetch(`${base}/auth/ranked-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: USER, password: PASSWORD }) });
        assert.equal(login.status, 200); assert.equal((await login.json()).userId, USER);
        const listed = await fetch(`${base}/game-records?limit=10`, { headers });
        const history = (await listed.json()).records;
        assert.equal(history.length, 3); assert.ok(history.every(item => item.white_id === USER || item.black_id === USER));
        assert.equal(history[0].moves[0].replayVersion, 2); assert.equal(history[0].moves.length, 4);
        assert.equal((await fetch(`${base}/game-records?userId=Other`, { headers })).status, 403);
        assert.equal((await (await fetch(`${base}/game-records?limit=1`, { headers })).json()).records.length, 1);
        assert.equal((await fetch(`${base}/game-records`, { method: 'POST', headers })).status, 403);
        assert.equal((await fetch(`${base}/rest/v1/rpc/register_user`, { method: 'POST' })).status, 403);
        assert.equal((await fetch(`${base}/rest/v1/game_records`)).status, 403);
        assert.equal((await (await fetch(`${base}/game-stats`, { headers })).json()).stats.totalGames, 37);
        const profile = await fetch(`${base}/rest/v1/profiles?id=eq.ReplayQA`, { headers: { Accept: 'application/vnd.pgrst.object+json' } });
        assert.equal((await profile.json()).id, USER);
        const cors = await fetch(`${base}/health`, { headers: { Origin: 'http://localhost:3102' } });
        assert.equal(cors.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3102');
        assert.equal((await fetch(`${base}/health`, { headers: { Origin: 'https://example.com' } })).status, 403);
        assert.equal((await fetch(`${base}/auth/ranked-session/revoke`, { method: 'POST', headers })).status, 204);
        assert.equal((await fetch(`${base}/game-records`, { headers })).status, 401);
        console.log('PASS local-only UI fixture: auth, ownership, v2 replays, stats, readonly, CORS, revoke');
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
} else {
    const server = makeFixtureServer();
    server.on('error', error => { console.error(`Fixture failed to listen: ${error.code || 'unknown'}`); process.exitCode = 1; });
    server.listen(PORT, HOST, () => console.log(`Local-only private history fixture: http://${HOST}:${PORT} (ReplayQA, no database connections)`));
    const stop = () => { server.closeAllConnections(); server.close(() => process.exit(0)); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
