// Run against a NEW commerce_upgrade DB via the disposable native PG17 runner:
// QG_TEST_POSTGREST_BIN=/absolute/postgrest.exe node --test scripts/qa/shared-match-runtime-postgres.test.mjs
// Requires npm --prefix server run build. Real index -> auth -> Socket.IO ->
// SupabaseService -> supabase-js -> local PostgREST -> raw migration SQL.
// Synthetic accounts/provider evidence only. Never accepts a hosted database URL.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdtemp, writeFile, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename, isAbsolute, join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import http from 'node:http';
import net from 'node:net';
import { io } from 'socket.io-client';
import { connect, connection, scalar, account, bind, member, snapshot, paidPeriod, wallet } from './commerce-postgres-support.mjs';
import { setupBaseline, applyPending, baselineEvidence } from './fixtures/commerce-postgres-baseline.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const password = 'SYNTHETIC-shared-runtime-password-7!';
const reportPath = join(tmpdir(), 'shared-match-runtime-postgres-results.json');
const enabled = {
    SHARED_MATCH_ENTITLEMENT_ENABLED: 'true',
    SHARED_MATCH_ADMISSION_ENABLED: 'true',
    SHARED_MATCH_ADMISSION_RECOVERY_ENABLED: 'true',
};
const testTitle = 'native full shared entrypath: real auth, sockets, PostgREST, paid entitlement and admission';

test(testTitle, { timeout: 225_000 }, async t => {
    const checks = [], trace = [], children = [], sockets = [], connections = [];
    const heldAdmissions = new Set();
    let server, relay, endpoint, relayUrl, logs = '', completed = false, failure;
    const fixtureDir = await mkdtemp(join(tmpdir(), 'qg-shared-runtime-'));
    const startedAt = Date.now();
    const cleanEnv = Object.fromEntries(['SystemRoot', 'WINDIR', 'ComSpec', 'TEMP', 'TMP', 'PATH', 'PATHEXT']
        .filter(key => process.env[key]).map(key => [key, process.env[key]]));
    // Optional trusted native PG bin supplies libpq/SSL DLLs on Windows.
    const pgBin = process.env.QG_TEST_PG_BIN;
    if (pgBin) {
        assert.ok(isAbsolute(pgBin), 'QG_TEST_PG_BIN must be an absolute trusted PostgreSQL bin');
        cleanEnv.PATH = [pgBin, join(dirname(pgBin), 'lib'), cleanEnv.PATH ?? ''].join(delimiter);
    }
    Object.assign(cleanEnv, { USERPROFILE: fixtureDir, APPDATA: fixtureDir, LOCALAPPDATA: fixtureDir, NODE_ENV: 'test' });
    const secret = randomBytes(32).toString('hex');
    const payload = [{ alg: 'HS256', typ: 'JWT' }, { role: 'service_role', exp: Math.floor(Date.now() / 1000) + 1800 }]
        .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    const serviceJwt = payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
    const open = async role => { const client = await connect(role); connections.push(client); return client; };
    const launch = (executable, args, env, ipc = false) => {
        const child = spawn(executable, args, { cwd: fixtureDir, env, windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe', ...(ipc ? ['ipc'] : [])] });
        children.push(child);
        child.on('error', error => { logs = (logs + '\n' + error.message).slice(-16000); });
        for (const stream of [child.stdout, child.stderr]) stream.on('data', value => {
            logs = (logs + value.toString()).slice(-16000);
        });
        return child;
    };
    const stop = async child => {
        if (!child || child.exitCode !== null || child.signalCode !== null) return;
        const exit = once(child, 'exit');
        child.kill();
        await Promise.race([exit, delay(5000).then(() => { if (child.exitCode === null) child.kill('SIGKILL'); })]);
    };
    const waitFor = async (check, label, timeout = 8000) => {
        const deadline = Date.now() + timeout;
        do {
            const result = await check();
            if (result) return result;
            await delay(25);
        } while (Date.now() < deadline);
        throw new Error('Timed out: ' + label + '\n' + logs);
    };
    const event = (socket, name, accept = () => true, timeout = 8000) => waitFor(() => {
        const index = socket.events.findIndex(row => row.name === name && accept(row.data));
        return index < 0 ? null : socket.events.splice(index, 1)[0].data ?? true;
    }, name + ' for ' + socket.fixtureUser, timeout);
    const check = async (name, fn) => {
        await fn();
        checks.push(name);
        console.log('PASS ' + name);
    };
    const startServer = async flags => {
        for (const socket of sockets) socket.disconnect();
        await stop(server);
        server = launch(process.execPath, [fileURLToPath(new URL('./shared-match-runtime-child.cjs', import.meta.url))],
            { ...cleanEnv, QG_SHARED_RUNTIME_FIXTURE: '1', SUPABASE_URL: relayUrl,
                SUPABASE_SERVICE_ROLE_KEY: serviceJwt, ...flags }, true);
        const ready = await new Promise((resolveReady, reject) => {
            const timeout = setTimeout(() => reject(new Error('Runtime startup timed out\n' + logs)), 45000);
            server.once('message', message => { clearTimeout(timeout); resolveReady(message); });
            server.once('error', error => { clearTimeout(timeout); reject(error); });
            server.once('exit', code => { clearTimeout(timeout); reject(new Error('Runtime exited ' + code + '\n' + logs)); });
        });
        assert.equal(ready.ready, true);
        endpoint = 'http://127.0.0.1:' + ready.port;
    };
    const login = async user => {
        const response = await fetch(endpoint + '/auth/ranked-session', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password }), signal: AbortSignal.timeout(6000),
        });
        const body = await response.json();
        assert.equal(response.status, 200, 'real password login: ' + JSON.stringify(body));
        assert.equal(body.userId, user);
        return body.token;
    };
    const socketFor = async user => {
        const token = await login(user);
        const socket = io(endpoint, { auth: { token, userId: 'UNTRUSTED-user-override' },
            transports: ['websocket'], reconnection: false, autoConnect: false, timeout: 6000 });
        socket.fixtureUser = user; socket.fixtureToken = token; socket.events = [];
        socket.onAny((name, data) => socket.events.push({ name, data }));
        sockets.push(socket);
        await new Promise((resolveReady, reject) => {
            socket.once('connect', resolveReady); socket.once('connect_error', reject); socket.connect();
        });
        return socket;
    };
    const entitlement = async socket => {
        socket.events = socket.events.filter(row => row.name !== 'shared_entitlement');
        socket.emit('request_shared_entitlement', {});
        const response = await event(socket, 'shared_entitlement');
        assert.equal(response.userId, socket.fixtureUser);
        return response;
    };
    const pair = async (first, second, mode, { waitStart = true } = {}) => {
        first.events.length = 0; second.events.length = 0;
        first.emit('join_queue', { timeControl: 600, mode }); await event(first, 'queue_joined');
        second.emit('join_queue', { timeControl: 600, mode });
        const [left, right] = await Promise.all([event(first, 'match_found'), event(second, 'match_found')]);
        assert.equal(left.matchId, right.matchId);
        const request = { matchId: left.matchId, introVersion: 1 };
        first.emit('connect_match', request); second.emit('connect_match', request);
        if (!waitStart) return { matchId: left.matchId };
        const [state, other] = await Promise.all([event(first, 'match_start'), event(second, 'match_start')]);
        assert.equal(state.matchId, left.matchId); assert.equal(other.matchId, state.matchId);
        return state;
    };
    const cancel = async (socket, match) => {
        socket.emit('cancel_match_admission', { matchId: match.matchId });
        await event(socket, 'match_cancelled', value => value.matchId === match.matchId);
    };
    let admin, service;
    const finish = async (socket, state, admitted = true) => {
        socket.emit('player_action', { actionId: randomUUID(), version: state.version,
            action: { type: 'RESIGN', payload: {} } });
        if (admitted) await waitFor(async () => (await scalar(admin,
            'select state as result from public.ranked_match_admissions where match_id=$1', [state.matchId])) === 'settled',
        'durable terminal receipt');
        else await event(socket, 'sync_state', value => value.matchId === state.matchId && value.gameOver);
        // Runtime marks local persistence complete after the SQL acknowledgement.
        await delay(75);
    };
    const createAccount = async options => {
        const user = await account(admin, options);
        await admin.query("update public.profiles set password_hash=extensions.crypt($2,extensions.gen_salt('bf',4)) where id=$1", [user, password]);
        return user;
    };
    const createPaid = async (sku, { confirmed = true } = {}) => {
        const user = await createAccount({ quota: 3, ranked: 0 });
        const membership = await member(service, user, sku, true);
        const paid = await snapshot(service, membership);
        if (confirmed) await paidPeriod(service, membership, paid.event);
        return { user, membership };
    };
    const allocations = matchId => scalar(admin,
        "select coalesce(jsonb_object_agg(user_id,source),'{}'::jsonb) as result from public.shared_match_allocations where match_id=$1", [matchId]);
    const balances = user => scalar(admin, "select jsonb_build_object('ranked',ranked_tickets,'legacy',member_ranked_tickets,"
        + "'purchasedHints',purchased_hint_tickets,'subscriptionHints',subscription_hint_tickets) as result "
        + "from public.ticket_wallets where user_id=$1", [user]);
    try {
        const postgrest = process.env.QG_TEST_POSTGREST_BIN ?? process.argv.find(value => /^--postgrest-bin=/.test(value))?.slice('--postgrest-bin='.length);
        assert.ok(postgrest && isAbsolute(postgrest), 'Set QG_TEST_POSTGREST_BIN to an explicit absolute trusted PostgREST executable');
        await access(postgrest); await access(join(root, 'server/dist/index.js'));
        admin = await open();
        await setupBaseline(admin); await applyPending(admin);
        assert.equal(baselineEvidence.pending.length, 13);
        assert.equal(baselineEvidence.pending.at(-1), '20261007141624_dormant_commerce_checkout_retirement.sql');
        // The public baseline intentionally has only system_status.id. These are
        // runtime HTTP prerequisites, not substitutes for admission/auth SQL.
        await admin.query([
            'alter table public.system_status',
            "add column if not exists maintenance_mode boolean not null default false,",
            "add column if not exists announcement_en text not null default '',",
            "add column if not exists announcement_ja text not null default '',",
            "add column if not exists announcements jsonb not null default '{}',",
            "add column if not exists minimum_android_build integer not null default 0,",
            "add column if not exists minimum_protocol integer not null default 0,",
            "add column if not exists updated_at timestamptz not null default now();",
            "insert into public.system_status(id) values('1');",
            'alter table public.system_status enable row level security;',
            'grant select on public.system_status to service_role;',
            'create role qg_shared_runtime_gateway login noinherit;',
            'grant anon,authenticated,service_role to qg_shared_runtime_gateway;',
        ].join('\n'));
        service = await open('service_role'); await bind(admin);
        const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
        const restPort = listener.address().port; await new Promise(resolveClose => listener.close(resolveClose));
        const rest = launch(postgrest, ['+RTS', '-N2', '-RTS'], {
            ...cleanEnv, PGRST_DB_URI: 'postgres://qg_shared_runtime_gateway@127.0.0.1:' + connection.port + '/commerce_upgrade?sslmode=disable&gssencmode=disable',
            PGRST_DB_SCHEMAS: 'public', PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: secret,
            PGRST_SERVER_HOST: '127.0.0.1', PGRST_SERVER_PORT: String(restPort), PGRST_LOG_LEVEL: 'warn', PGRST_DB_POOL: '8',
        });
        await waitFor(async () => {
            if (rest.exitCode !== null) throw new Error('PostgREST exited ' + rest.exitCode + '\n' + logs);
            try { return (await fetch('http://127.0.0.1:' + restPort + '/stripe_commerce_sources?select=source_key&limit=1', { headers: { Authorization: 'Bearer ' + serviceJwt }, signal: AbortSignal.timeout(1000) })).ok; }
            catch { return false; }
        }, 'local PostgREST', 15000);
        relay = http.createServer(async (request, response) => {
            if (!request.url.startsWith('/rest/v1/')) { response.writeHead(404); response.end(); return; }
            try {
                const chunks = []; for await (const chunk of request) chunks.push(chunk);
                const body = Buffer.concat(chunks);
                const url = new URL(request.url, 'http://127.0.0.1');
                const name = url.pathname.split('/').at(-1);
                const params = body.length && request.headers['content-type']?.includes('application/json') ? JSON.parse(body) : {};
                const upstream = await fetch('http://127.0.0.1:' + restPort + request.url.slice('/rest/v1'.length), {
                    method: request.method, headers: Object.fromEntries(['authorization', 'content-type', 'accept', 'prefer']
                        .filter(key => request.headers[key]).map(key => [key, request.headers[key]])),
                    ...(body.length ? { body } : {}), redirect: 'error', signal: AbortSignal.timeout(15000),
                });
                const bytes = Buffer.from(await upstream.arrayBuffer());
                // Never log Authorization headers, passwords, session/JWT tokens,
                // raw RPC parameters, or provider evidence.
                trace.push({ name, matchId: params.p_match_id ?? null, status: upstream.status });
                if (name === 'admit_shared_match') while (heldAdmissions.has(params.p_match_id) && !response.destroyed) await delay(25);
                if (response.destroyed) return;
                response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' });
                response.end(bytes);
            } catch {
                if (!response.destroyed) { response.writeHead(502); response.end('{"message":"local fixture upstream unavailable"}'); }
            }
        });
        relay.listen(0, '127.0.0.1'); await once(relay, 'listening');
        relayUrl = 'http://127.0.0.1:' + relay.address().port;

        for (const [label, flags] of [
            ['default-off', {}],
            ['explicit-off', { SHARED_MATCH_ENTITLEMENT_ENABLED: 'false', SHARED_MATCH_ADMISSION_ENABLED: 'false' }],
            ['wrong-string', { SHARED_MATCH_ENTITLEMENT_ENABLED: 'TRUE', SHARED_MATCH_ADMISSION_ENABLED: 'TRUE', SHARED_MATCH_ADMISSION_RECOVERY_ENABLED: 'TRUE' }],
            ['admission-requires-entitlement', { SHARED_MATCH_ENTITLEMENT_ENABLED: 'false', SHARED_MATCH_ADMISSION_ENABLED: 'true' }],
        ]) await check(label + ': no dormant entitlement/admission RPC and exhausted free random remains playable', async () => {
            const offset = trace.length; await startServer(flags);
            const first = await socketFor(await createAccount({ quota: 3 })), second = await socketFor(await createAccount({ quota: 3 }));
            assert.deepEqual(await entitlement(first), { userId: first.fixtureUser, entitlement: null, sharedAdmissionEnabled: false });
            const state = await pair(first, second, 'random'); await finish(first, state, false);
            assert.equal(await scalar(admin, 'select count(*)::integer as result from public.ranked_match_admissions where match_id=$1', [state.matchId]), 0);
            assert.equal(trace.slice(offset).some(row => ['get_shared_match_entitlement', 'admit_shared_match',
                'shared_match_admission_protocol_version', 'issue_shared_match_consent'].includes(row.name)), false);
        });

        await startServer(enabled);
        const standard = await createPaid('standard_monthly'), plus = await createPaid('plus_monthly');
        const standardSocket = await socketFor(standard.user), plusSocket = await socketFor(plus.user);
        const standardBefore = await balances(standard.user), plusBefore = await balances(plus.user);
        await check('active Standard and Plus return noAds/unlimited through real authenticated entitlement RPC', async () => {
            for (const [socket, plan] of [[standardSocket, 'standard'], [plusSocket, 'plus']]) {
                const response = await entitlement(socket);
                assert.equal(response.sharedAdmissionEnabled, true);
                assert.deepEqual(response.entitlement, { plan, unlimitedOnlineRanked: true, noAds: true,
                    periodEnd: response.entitlement.periodEnd });
                assert.ok(Date.parse(response.entitlement.periodEnd) > Date.now());
            }
            assert.ok(trace.some(row => row.name === 'get_shared_match_entitlement' && row.status === 200));
        });
        await check('both paid plans start random and ranked beyond combined quota with zero asset debit', async () => {
            for (const mode of ['random', 'ranked']) {
                const state = await pair(standardSocket, plusSocket, mode);
                assert.deepEqual(await allocations(state.matchId), { [standard.user]: 'subscription_unlimited', [plus.user]: 'subscription_unlimited' });
                await finish(standardSocket, state);
                assert.ok(trace.some(row => row.name === 'admit_shared_match' && row.matchId === state.matchId && row.status === 200));
            }
            assert.deepEqual(await balances(standard.user), standardBefore);
            assert.deepEqual(await balances(plus.user), plusBefore);
            assert.equal(await scalar(admin, 'select count(*)::integer as result from public.shared_match_consents where user_id=any($1::text[])', [[standard.user, plus.user]]), 0);
        });

        const free = await createAccount({ ranked: 1 }), freeSocket = await socketFor(free);
        await check('three combined random/ranked starts then only free participant explicitly chooses one ticket', async () => {
            assert.equal((await entitlement(freeSocket)).entitlement.noAds, false);
            for (const mode of ['random', 'ranked', 'random']) {
                const state = await pair(standardSocket, freeSocket, mode);
                assert.deepEqual(await allocations(state.matchId), { [standard.user]: 'subscription_unlimited', [free]: 'daily_quota' });
                await finish(freeSocket, state);
            }
            assert.equal((await wallet(service, free)).ranked_tickets, 1);
            const state = await pair(standardSocket, freeSocket, 'ranked', { waitStart: false });
            const choice = await event(freeSocket, 'match_admission_choice_required', value => value.matchId === state.matchId);
            assert.equal(choice.verifiedAdAvailable, false);
            assert.equal(choice.ticketCost, 1); assert.equal(choice.dailyFreeMatches, 3);
            assert.equal(standardSocket.events.some(row => row.name === 'match_admission_choice_required'), false);
            assert.equal(freeSocket.events.some(row => row.name === 'match_start'), false);
            assert.deepEqual(await allocations(state.matchId), {});
            assert.equal((await wallet(service, free)).ranked_tickets, 1);
            const before = trace.filter(row => row.name === 'issue_shared_match_consent').length;
            freeSocket.emit('choose_match_admission', { matchId: state.matchId, source: 'ticket', adViewed: true });
            await delay(100);
            assert.equal(trace.filter(row => row.name === 'issue_shared_match_consent').length, before);
            freeSocket.emit('choose_match_admission', { matchId: state.matchId, source: 'ticket' });
            const [started] = await Promise.all([event(freeSocket, 'match_start'), event(standardSocket, 'match_start')]);
            assert.deepEqual(await allocations(state.matchId), { [standard.user]: 'subscription_unlimited', [free]: 'free_ticket' });
            assert.equal((await wallet(service, free)).ranked_tickets, 0);
            assert.equal(await scalar(admin, 'select count(*)::integer as result from public.shared_match_consents where match_id=$1 and user_id=$2 and consumed_at is not null', [state.matchId, free]), 1);
            await finish(freeSocket, started);
        });

        for (const kind of ['expired', 'refund-blocked', 'unconfirmed-paid-period']) await check(kind + ': current SQL re-read removes unlimited/noAds and requires explicit admission choice', async () => {
            const paid = await createPaid('plus_monthly', { confirmed: kind !== 'unconfirmed-paid-period' });
            const socket = await socketFor(paid.user);
            if (kind !== 'unconfirmed-paid-period') assert.equal((await entitlement(socket)).entitlement.unlimitedOnlineRanked, true);
            if (kind === 'expired') await admin.query("update public.stripe_memberships set period_end=clock_timestamp()-interval '1 second' where user_id=$1", [paid.user]);
            if (kind === 'refund-blocked') await admin.query('update public.stripe_memberships set refund_blocked_until=period_end where user_id=$1', [paid.user]);
            const response = await entitlement(socket);
            assert.equal(response.entitlement.unlimitedOnlineRanked, false); assert.equal(response.entitlement.noAds, false);
            const match = await pair(standardSocket, socket, 'random', { waitStart: false });
            await event(socket, 'match_admission_choice_required', value => value.matchId === match.matchId);
            assert.equal(socket.events.some(row => row.name === 'match_start'), false);
            assert.deepEqual(await allocations(match.matchId), {});
            await cancel(socket, match); socket.disconnect();
        });

        await check('actual ten-second ranked CPU fallback honors paid unlimited admission', async () => {
            plusSocket.events.length = 0;
            plusSocket.emit('join_queue', { timeControl: 600, mode: 'ranked' }); await event(plusSocket, 'queue_joined');
            const found = await event(plusSocket, 'match_found', () => true, 15000);
            plusSocket.emit('connect_match', { matchId: found.matchId, introVersion: 1 });
            const state = await event(plusSocket, 'match_start');
            assert.ok(Object.values(state.players).some(id => id === 'ai:' + found.matchId));
            assert.deepEqual(await allocations(found.matchId), { [plus.user]: 'subscription_unlimited' });
            await finish(plusSocket, state);
            assert.deepEqual(await balances(plus.user), plusBefore);
        });

        await check('recovery-only keeps paid lookup and refunds committed lost starts without admitting new shared matches', async () => {
            const user = await createAccount({ quota: 3, ranked: 1 }), socket = await socketFor(user);
            const pending = await pair(standardSocket, socket, 'ranked', { waitStart: false });
            await event(socket, 'match_admission_choice_required', value => value.matchId === pending.matchId);
            heldAdmissions.add(pending.matchId);
            socket.emit('choose_match_admission', { matchId: pending.matchId, source: 'ticket' });
            await waitFor(async () => (await scalar(admin,
                'select state as result from public.ranked_match_admissions where match_id=$1', [pending.matchId])) === 'active', 'committed admission before lost acknowledgement');
            assert.equal(socket.events.some(row => row.name === 'match_start'), false);
            assert.equal((await wallet(service, user)).ranked_tickets, 0);
            // Stop the actual process while the real DB commit response is held.
            await stop(server); heldAdmissions.delete(pending.matchId);
            const offset = trace.length;
            await startServer({ SHARED_MATCH_ENTITLEMENT_ENABLED: 'true', SHARED_MATCH_ADMISSION_ENABLED: 'false',
                SHARED_MATCH_ADMISSION_RECOVERY_ENABLED: 'true' });
            const recovered = await socketFor(user), paidSocket = await socketFor(standard.user);
            const response = await entitlement(paidSocket);
            assert.equal(response.entitlement.noAds, true); assert.equal(response.sharedAdmissionEnabled, false);
            recovered.emit('connect_match', { matchId: pending.matchId, introVersion: 1 });
            await event(recovered, 'match_cancelled', value => value.matchId === pending.matchId, 30000);
            assert.equal(await scalar(admin, 'select state as result from public.ranked_match_admissions where match_id=$1', [pending.matchId]), 'voided');
            const refundResponse = await fetch(endpoint + '/tickets/ranked-refunds',
                { headers: { Authorization: 'Bearer ' + recovered.fixtureToken }, signal: AbortSignal.timeout(6000) });
            assert.equal(refundResponse.status, 200);
            assert.equal((await refundResponse.json()).freeRankedRefunds, 1);
            recovered.emit('connect_match', { matchId: pending.matchId, introVersion: 1 });
            await event(recovered, 'match_cancelled', value => value.matchId === pending.matchId);
            assert.equal(await scalar(admin, 'select count(*)::integer as result from public.ranked_ticket_refunds where source_match_id=$1 and user_id=$2', [pending.matchId, user]), 1);
            const ordinary = await pair(recovered, paidSocket, 'random'); await finish(recovered, ordinary, false);
            assert.equal(await scalar(admin, 'select count(*)::integer as result from public.ranked_match_admissions where match_id=$1', [ordinary.matchId]), 0);
            const recent = trace.slice(offset);
            assert.ok(recent.some(row => row.name === 'get_ranked_admission' && row.status === 200));
            assert.ok(recent.some(row => row.name === 'recover_expired_ranked_admissions' && row.status === 200));
            assert.equal(recent.some(row => row.name === 'admit_shared_match' || row.name === 'issue_shared_match_consent'), false);
        });
        completed = true;
    } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        console.error(logs);
        throw error;
    } finally {
        heldAdmissions.clear();
        for (const socket of sockets) socket.disconnect();
        await Promise.allSettled(children.map(stop));
        if (relay) { relay.closeAllConnections(); await new Promise(resolveClose => relay.close(resolveClose)); }
        await Promise.allSettled(connections.map(client => client.end()));
        await writeFile(reportPath, JSON.stringify({
            complete: completed, checks, elapsedMs: Date.now() - startedAt, ...(failure ? { failure } : {}),
            realEntrypoint: 'server/dist/index.js', productGateOverrides: false,
            realHttpLogin: true, realSocketIo: true, realSupabaseService: true, realPostgrest: true, realPostgres: true,
            database: 'fresh loopback commerce_upgrade', syntheticAccountsAndProviderEvidence: true,
            rawMigrations: baselineEvidence.pending, rpcCounts: Object.fromEntries([...new Set(trace.map(row => row.name))]
                .map(name => [name, trace.filter(row => row.name === name).length])),
            limitations: [
                'Provider purchase/refund webhook signatures are not exercised; billing is disabled and provider HTTP blocked.',
                'Canonical provider transitions, contention, role denial, refund expiry and isolation rejection remain covered by the separate native SQL suites.',
                'noAds is verified on the real socket response; browser/native ad rendering is covered separately.',
                'Minimal public fixture schema is not a complete hosted Supabase deployment; no production or device execution.',
            ],
        }, null, 2) + '\n', 'utf8');
        const temporaryRoot = resolve(tmpdir()), directory = resolve(fixtureDir);
        assert.equal(dirname(directory), temporaryRoot); assert.ok(basename(directory).startsWith('qg-shared-runtime-'));
        assert.equal((await lstat(directory)).isSymbolicLink(), false);
        await rm(directory, { recursive: true, force: true });
        t.diagnostic('Report: ' + reportPath);
    }
});




