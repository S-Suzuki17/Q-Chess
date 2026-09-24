// Run from the app root: node <path-to-this-script> http://127.0.0.1:3101
// Pure compiled GameEngine fixtures only: never import/launch server/index.
// Every HTTP request and WebSocket is intercepted. Only local static GETs pass.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const appRoot = resolve(process.cwd());
const require = createRequire(resolve(appRoot, 'package.json'));
const { chromium } = require('playwright');
const { GameEngine } = require(resolve(appRoot, 'server/dist/game/GameEngine.js'));
const { createInitialBoard } = require(resolve(appRoot, 'server/dist/game/quantumChess.js'));
const base = process.argv[2] ?? 'http://127.0.0.1:3101';
const baseURL = new URL(base);
assert(['localhost', '127.0.0.1'].includes(baseURL.hostname), 'Local preview only');
const output = resolve(appRoot, '../../outputs/ranked-fallback');
await mkdir(output, { recursive: true });

const user = { id: 'qa-ranked-user', name: 'Ranked QA', type: 'registered' };
const token = `ranked_${'q'.repeat(43)}`;
const password = 'fixture-password-never-store';
const fallbackText = '60秒間対戦相手が見つからない場合、近い強さのCPUとレート変動ありで対戦します。';
const proof = { token, userId: user.id, expiresAt: Date.now() + 3600000 };
const campaign = { version: 2, stars: {}, ascensions: [], stageStars: Array(100).fill(3), board: 'standard', piece: 'standard', effect: 'standard', music: 'standard', avatar: 'avatar-frame-15' };
const scenarios = [
    { name: 'verified-desktop', width: 1440, height: 1000, humanSide: 'host', needsLogin: false },
    { name: 'verified-mobile', width: 360, height: 800, humanSide: 'joiner', needsLogin: false },
    { name: 'reauth-mobile', width: 360, height: 800, humanSide: 'host', needsLogin: true },
];
const results = [];
const browser = await chromium.launch({ headless: true });

async function eventually(predicate, message, timeout = 10000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await new Promise(done => setTimeout(done, 25));
    }
    assert.fail(message);
}

async function selectQueue(page, mode = 'ranked') {
    // Japanese dict's final exported labels, not stale baseDict labels.
    const play = page.getByRole('button', { name: '対局する', exact: true });
    if (await play.isVisible()) await play.click();
    await page.getByRole('button', { name: mode === 'ranked' ? /ランク対局/ : /ランダム対局/ }).click();
    await page.locator('[data-time-control="10m"]').click();
    await page.locator('dialog[aria-labelledby="queue-title"][open]').waitFor();
}

async function noOverflow(locator, label) {
    assert(await locator.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${label} has horizontal overflow`);
}

try {
    for (const scenario of scenarios) {
        let step = 'fixture setup';
        const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, reducedMotion: 'reduce', serviceWorkers: 'block' });
        const pageErrors = [], consoleErrors = [], protocolErrors = [], writes = [], handshakes = [], queueEvents = [], failedResources = [];
        let cancelCount = 0, loginRequests = 0, introReady = false, activeSend = null, deadline = 0;
        const matchId = `ranked-qa-${scenario.name}`, cpuId = `ai:${matchId}`;
        const hostId = scenario.humanSide === 'host' ? user.id : cpuId;
        const joinerId = scenario.humanSide === 'joiner' ? user.id : cpuId;
        const cpu = { side: scenario.humanSide === 'host' ? 'joiner' : 'host', rating: 1000, level: 2 };
        const engine = new GameEngine(matchId, hostId, joinerId, createInitialBoard(), 600, {
            host: hostId === user.id ? user.name : 'CPU', joiner: joinerId === user.id ? user.name : 'CPU',
        }, 4000, true);
        engine.setMatchMetadata({ mode: 'ranked', cpu });
        engine.setPlayerRating(scenario.humanSide, 1000);
        engine.acknowledgeIntro(cpuId);
        const state = () => engine.getPublicState(user.id);

        await context.routeWebSocket('**/*', ws => {
            // This route never calls connectToServer, including unknown sockets.
            if (!new URL(ws.url()).pathname.startsWith('/socket.io/')) { ws.close(); return; }
            let verified = false;
            const send = (event, data) => ws.send(`42${JSON.stringify([event, data])}`);
            ws.send(`0${JSON.stringify({ sid: `fixture-${scenario.name}`, upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1000000 })}`);
            ws.onMessage(raw => {
                try {
                    const message = String(raw);
                    if (message.startsWith('40')) {
                        const auth = JSON.parse(message.slice(2));
                        // Do not print proof/credentials in test output on failure.
                        assert(auth.token === token, 'Socket handshake uses the verified proof');
                        assert(auth.userId === user.id, 'Socket proof belongs to selected account');
                        assert(!auth.token.startsWith('SUPABASE-'), 'No raw-ID compatibility token');
                        verified = true;
                        handshakes.push({ verified: true, rawIdToken: false });
                        activeSend = send;
                        ws.send(`40${JSON.stringify({ sid: `namespace-${handshakes.length}` })}`);
                        send('queue_stats', {});
                        return;
                    }
                    if (!message.startsWith('42')) return;
                    const [event, data] = JSON.parse(message.slice(2));
                    assert(verified, 'Application event requires verified namespace');
                    if (event === 'join_queue') {
                        queueEvents.push(data);
                        deadline = Date.now() + 60000;
                        send('queue_joined', { mode: data.mode, timeControl: data.timeControl, cpuFallbackAt: data.mode === 'ranked' ? deadline : null });
                    }
                    if (event === 'cancel_queue') cancelCount++;
                    if (event === 'connect_match' || event === 'request_sync') {
                        assert.equal(data.matchId, matchId);
                        send('match_start', state()); send('sync_state', state());
                    }
                    if (event === 'ping') send('pong', { clientTime: data.clientTime, serverTime: Date.now() });
                    if (event === 'intro_ready') {
                        introReady = true; engine.acknowledgeIntro(user.id); send('sync_state', state());
                    }
                } catch (error) { protocolErrors.push(error.message); }
            });
        });
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url());
            const headers = { 'Access-Control-Allow-Origin': baseURL.origin, 'Access-Control-Allow-Headers': 'content-type,authorization', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
            // Export previews do not serve Vercel's injected analytics scripts.
            if (request.method() === 'GET' && /^\/_vercel\/(insights|speed-insights)\/script\.js$/.test(url.pathname)) return route.fulfill({ contentType: 'application/javascript', body: '/* analytics disabled in isolated QA */' });
            if (url.pathname === '/auth/ranked-session') {
                // Owned game-server endpoint is mocked; never forward credentials.
                if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
                if (request.method() !== 'POST') return route.abort();
                loginRequests++;
                try {
                    const body = request.postDataJSON();
                    assert(body.username === user.id && body.password === password, 'Login posts selected account and entered password once');
                    assert(url.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname), 'No insecure remote credential endpoint');
                } catch (error) { protocolErrors.push(error.message); }
                return route.fulfill({ status: 200, headers, json: proof });
            }
            if (request.method() !== 'GET') {
                writes.push({ method: request.method(), path: url.pathname });
                return route.abort();
            }
            if (url.origin === baseURL.origin) return route.continue();
            if (url.pathname === '/rest/v1/profiles') {
                const profile = { id: user.id, name: user.name, rating_10m: 1000, rating_3m: 1000, rating_10s: 1000 };
                return route.fulfill({ headers, json: request.headers().accept?.includes('vnd.pgrst.object') ? profile : [profile] });
            }
            if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({ headers, json: [] });
            return route.abort();
        });
        await context.addInitScript(({ user, campaign, proof, seedProof }) => {
            localStorage.setItem('qg_language', 'ja');
            localStorage.setItem('qchess_is2DView', 'true');
            localStorage.setItem('qg_last_user', JSON.stringify(user));
            localStorage.setItem('qg_campaign_v1', JSON.stringify(campaign));
            localStorage.setItem('qg_sound_config', JSON.stringify({ bgmVolume: 0, seVolume: 0, masterMute: true }));
            if (seedProof) sessionStorage.setItem('qg_ranked_session_v1', JSON.stringify(proof));
        }, { user, campaign, proof, seedProof: !scenario.needsLogin });
        const page = await context.newPage();
        page.on('pageerror', error => pageErrors.push(error.message));
        page.on('response', response => { if (response.status() >= 400) failedResources.push({ status: response.status(), path: new URL(response.url()).pathname }); });
        page.on('console', message => {
            if (message.type() === 'error' && !/^Failed to load resource: net::ERR_FAILED/.test(message.text())) consoleErrors.push(message.text());
        });
        try {
            step = 'open ranked time control';
            await page.goto(base);
            await selectQueue(page);
            const queue = page.locator('dialog[aria-labelledby="queue-title"][open]');
            if (scenario.needsLogin) {
                step = 'registered account re-authentication';
                await queue.getByRole('heading', { name: 'レート戦のログイン確認', exact: true }).waitFor();
                assert.equal(queueEvents.length, 0, 'No ranked queue without proof');
                assert.equal(handshakes.length, 0, 'Registered raw ID is not sent as socket authentication');
                await queue.getByRole('button', { name: 'ログイン', exact: true }).click();
                const login = page.locator('dialog[aria-labelledby="ranked-login-title"][open]');
                await login.locator('input[name="password"]').fill(password);
                await login.getByRole('button', { name: 'ログイン', exact: true }).click();
                await login.waitFor({ state: 'detached' });
                await eventually(() => queueEvents.length === 1, 'Re-authentication must connect and join queue');
                await page.waitForTimeout(250);
                assert.equal(queueEvents.length, 1, 'Re-authentication queues exactly once');
                assert.equal(loginRequests, 1);
            }
            step = 'ranked fallback queue and cancellation';
            await queue.getByText(fallbackText, { exact: true }).waitFor();
            await eventually(() => queueEvents.length === 1, 'Expected one initial ranked queue');
            assert.deepEqual(queueEvents[0], { timeControl: 600, userName: user.name, mode: 'ranked' });
            assert(deadline > Date.now() + 50000, 'Fixture supplies actual 60-second deadline');
            assert(/\b(?:5\d|60)s\b/.test(await queue.innerText()), 'Queue shows deadline countdown');
            // Prove server deadline replaces the local 60-second estimate.
            activeSend('queue_joined', { mode: 'ranked', timeControl: 600, cpuFallbackAt: Date.now() + 17000 });
            await eventually(async () => /\b1[567]s\b/.test(await queue.innerText()), 'Queue uses server deadline');
            await noOverflow(queue, `${scenario.name} queue`);
            await queue.screenshot({ path: resolve(output, `${scenario.name}-queue.png`) });
            await queue.getByRole('button', { name: 'キャンセル', exact: true }).click();
            await queue.waitFor({ state: 'detached' });
            await eventually(() => cancelCount === 1, 'Cancel emits cancel_queue once');
            await page.waitForTimeout(150);
            assert.equal(cancelCount, 1, 'Unmount does not double-cancel');
            assert.equal(await page.locator('.match-intro[open]').count(), 0, 'Cancelled queue did not create CPU locally');

            step = 'CPU match found and intro';
            await selectQueue(page);
            await eventually(() => queueEvents.length === 2, 'Second ranked queue is active');
            assert.equal(queueEvents[1].mode, 'ranked');
            activeSend('match_found', { matchId, hostId, joinerId, timeControl: 600, mode: 'ranked', cpu });
            const intro = page.locator('.match-intro[open]');
            await intro.waitFor({ timeout: 15000 });
            const cpuSide = cpu.side === 'host' ? 'white' : 'black';
            const humanSide = cpu.side === 'host' ? 'black' : 'white';
            const cpuPanel = intro.locator(`[data-side="${cpuSide}"]`);
            assert((await cpuPanel.innerText()).includes('CPU・強さの目安 · 1000'), 'CPU is explicitly identified with estimated strength');
            assert.equal(await cpuPanel.locator('[data-intro-badge]').count(), 0, 'CPU is not presented as a calibrated human rank');
            assert((await intro.locator(`[data-side="${humanSide}"]`).innerText()).includes('1000'), 'Human opening rating is shown');
            assert.equal(await intro.locator('canvas').count(), 0);
            const clocks = await page.locator('.match-clock').allTextContents();
            await page.waitForTimeout(200);
            assert.deepEqual(await page.locator('.match-clock').allTextContents(), clocks, 'Intro pauses both clocks');
            assert.equal(introReady, false, 'Intro not acknowledged before user sees CPU');
            await noOverflow(intro, `${scenario.name} intro`);
            await intro.screenshot({ path: resolve(output, `${scenario.name}-cpu-intro.png`) });
            await intro.locator('button').click();
            await intro.waitFor({ state: 'detached' });
            await eventually(() => introReady, 'Human intro acknowledgement reaches server');
            assert.equal(state().introPending, false, 'Actual engine releases intro after both acknowledgements');
            assert.equal(cancelCount, 1, 'Match transition does not cancel queue again');

            step = 'server terminal state and authoritative rating receipt';
            const terminal = engine.processAction({ actionId: 'fixture-cpu-resign', version: state().version, playerId: cpuId, action: { type: 'RESIGN', payload: {} } });
            assert.equal(terminal.success, true, 'Actual engine produces terminal state');
            activeSend('sync_state', state());
            activeSend('rating_pending', { matchId });
            const result = page.locator('.match-result-dialog[open]');
            await result.waitFor({ timeout: 10000 });
            await result.locator('[data-rating-status="pending"]').waitFor();
            // Wrong user/match receipts cannot confirm a local update.
            const receipt = { matchId, userId: user.id, before: 1000, after: 1016, delta: 16, timeControl: 600 };
            activeSend('rating_settled', { ...receipt, userId: 'not-this-user' });
            activeSend('rating_settled', { ...receipt, matchId: 'not-this-match' });
            await page.waitForTimeout(100);
            assert.equal(await result.locator('[data-rating-status="settled"]').count(), 0);
            activeSend('rating_settled', receipt);
            const settled = result.locator('[data-rating-status="settled"]');
            await settled.waitFor();
            assert.match(await settled.innerText(), /レート更新済み\s*·\s*1000\s*→\s*1016\s*\(\+16\)/);
            await noOverflow(result, `${scenario.name} result`);
            await result.screenshot({ path: resolve(output, `${scenario.name}-rating-settled.png`) });

            step = 'storage, authority, and error checks';
            const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
            assert(!JSON.stringify(storage).includes(password), 'No password stored in localStorage or sessionStorage');
            assert(!Object.values(storage.local).some(value => value.includes('ranked_')), 'Opaque proof is session-only');
            const stored = JSON.parse(storage.session.qg_ranked_session_v1);
            assert(stored.token === token && stored.userId === user.id, 'Session stores only correct proof');
            assert.equal(Object.keys(stored).sort().join(','), 'expiresAt,token,userId');
            assert.deepEqual(JSON.parse(storage.local.qg_campaign_v1).stageStars, campaign.stageStars, 'Re-authentication preserves local progression');
            assert.deepEqual(writes, [], 'No browser game_records or profile rating writes');
            assert.deepEqual(protocolErrors, [], 'Fixture protocol errors');
            assert.deepEqual(pageErrors, [], 'Uncaught browser errors');
            assert.deepEqual(consoleErrors, [], 'Unexpected console errors');
            assert.equal(await page.locator('[data-nextjs-dialog], .vite-error-overlay').count(), 0);
            results.push({ scenario: scenario.name, width: scenario.width, pass: true, rankedQueueCount: queueEvents.length, cancelCount, loginRequests, verifiedHandshakes: handshakes.length, cpuSide, settlement: { before: 1000, after: 1016, delta: 16 }, directWrites: writes.length, pageErrors, consoleErrors });
        } catch (error) {
            await page.screenshot({ path: resolve(output, `${scenario.name}-failure.png`), fullPage: true }).catch(() => {});
            results.push({ scenario: scenario.name, pass: false, step, error: error.message, protocolErrors, pageErrors, consoleErrors, failedResources, writes, queueEvents, cancelCount, loginRequests, verifiedHandshakes: handshakes.length });
            throw error;
        } finally { await context.close(); }
    }
} finally {
    await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
    await browser.close();
}
console.log(`Ranked fallback QA: ${results.length} scenarios passed. Evidence: ${output}`);
