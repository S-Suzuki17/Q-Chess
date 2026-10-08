/** The real static app, with transport responses confined to browser fixtures.
 * Never creates accounts, queue entries, purchases, or records on live services. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from 'playwright';
const [releaseFlag='--release-flags=off', ...extraArgs] = process.argv.slice(2);
assert.ok(/^--release-flags=(on|off)$/.test(releaseFlag) && extraArgs.length===0,
    'Usage: check-lobby-browser.mjs [--release-flags=on|off]');
const releaseFlagsOn = releaseFlag.endsWith('=on');

const root = resolve('out'), artifacts = resolve('scratch/lobby-20261007');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.png':'image/png', '.woff2':'font/woff2', '.mp3':'audio/mpeg' };
const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    const file = resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file)); }
    catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const termsVersion = (await readFile('src/config/terms.ts', 'utf8')).match(/TERMS_VERSION='([^']+)'/)[1];
const user = { id:'QA_LobbyOnly', name:'QA Lobby', type:'registered' };
const proof = { userId:user.id, token:'ranked_' + 'a'.repeat(43), expiresAt:Date.now() + 3600000 };
const progress = { version:2, stars:{}, ascensions:[], stageStars:[], board:'walnut', piece:'boxwood', effect:'standard', music:'standard', avatar:'standard' };
const records = Array.from({ length:10 }, (_, index) => ({
    id:`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`, created_at:new Date(Date.now() - index * 3600000).toISOString(),
    white_id:user.id, black_id:'ai', white_player:user.name, black_player:`Fixture CPU ${index + 1}`,
    mode:'cpu', winner:index % 3 === 0 ? 'white_wins' : index % 3 === 1 ? 'black_wins' : 'draw', time_control:'10m', moves:[], total_moves:0,
}));
let browser;
const results = [];
try {
    await mkdir(artifacts, { recursive:true });
    browser = await chromium.launch({ headless:true });
    for (const [width,height] of [[1920,1080],[1280,800],[390,844],[320,568]]) {
        const context = await browser.newContext({ viewport:{ width,height } });
        const errors = [], remoteRequests = [];
        await context.routeWebSocket('**/*', socket => socket.close());
        await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.origin === origin) return route.continue();
            remoteRequests.push(url.pathname);
            if (url.pathname === '/auth/ranked-session/status') return route.fulfill({ json:{ userId:proof.userId, expiresAt:proof.expiresAt, serverNow:Date.now() } });
            if (url.pathname === '/account/terms') return route.fulfill({ json:{ userId:user.id, currentVersion:termsVersion, consent:{ version:termsVersion, acceptedAt:new Date().toISOString() } } });
            if (url.pathname === '/account/progress') return route.fulfill({ json:{ userId:user.id, revision:0, progress, saved:true } });
            if (url.pathname === '/game-records') return route.fulfill({ json:{ records } });
            if (url.pathname === '/rewards/daily-login' && route.request().method()==='GET') return route.fulfill({json:{
                userId:user.id, enabled:true, streakDays:0, rewardPolicyVersion:1, tickets:{ranked:4,hint:5},
                lastClaimUtcDay:null, currentUtcDay:new Date().toISOString().slice(0,10),
            }});
            if (url.pathname === '/membership/stripe/status') return route.fulfill({json:{
                userId:user.id, enabled:true, active:false, canManageBilling:false, cancelAtPeriodEnd:false,
                periodEnd:null, lastGrantUtcDay:null, tickets:{ranked:0,hint:0}, availableCheckoutSkus:[],
            }});
            if (url.pathname === '/rest/v1/profiles') return route.fulfill({ json:{ id:user.id, name:user.name, rating_10m:1000, rating_3m:1000, rating_10s:1000 } });
            // Fail closed for every other external request; no real traffic escapes.
            return route.fulfill({ status:503, json:{ code:'UNAVAILABLE' } });
        });
        await context.addInitScript(({ user,proof }) => {
            localStorage.setItem('qg_language', 'ja');
            localStorage.setItem('qg_last_user', JSON.stringify(user));
            localStorage.setItem('qg_ranked_session_v1', JSON.stringify(proof));
            localStorage.setItem('qchess_is2DView', 'true');
        }, { user,proof });
        const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
        try {
        await page.goto(origin, { waitUntil:'domcontentloaded' });
        const lobby = page.locator('.lobby-studio'); await lobby.waitFor();
        await page.locator('.lobby-recent-row').nth(9).waitFor({ state:'attached' });
        await page.locator('.lobby-rating strong').filter({ hasText:'1000' }).waitFor();
        assert.equal(await page.locator('.lobby-recent-row').count(), 10);
        if (releaseFlagsOn) {
            await page.locator('.reward-balances dd').first().waitFor();
            assert.match(await page.locator('.reward-balances dd').nth(0).innerText(), /^4\b/);
            assert.match(await page.locator('.reward-balances dd').nth(1).innerText(), /^5\b/);
            assert.equal(await page.locator('.lobby-wallet-status').count(), 0);
        } else assert.equal(await page.locator('.lobby-wallet-status').innerText(), '未解放');
        assert.equal(await page.locator('[data-lobby-cosmetic="board"]').getAttribute('data-reward-id'), 'walnut');
        assert.ok(await lobby.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `lobby overflow ${width}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflow ${width}`);
        const history = page.locator('.lobby-recent-list');
        assert.ok(await history.evaluate(node => node.scrollHeight > node.clientHeight), 'history is independently scrollable');
        await history.evaluate(node => node.scrollTop = node.scrollHeight);
        assert.ok(await history.evaluate(node => node.scrollTop > 0));
        await history.evaluate(node => node.scrollTop = 0);
        await page.screenshot({ path:resolve(artifacts, `lobby-${width}.png`) });
        await page.getByRole('button', { name:'ランク対局', exact:false }).first().click();
        await page.locator('[data-time-control="3m"]').waitFor();
        assert.ok(await page.getByRole('dialog').evaluate(dialog=>dialog.contains(document.activeElement)), 'focus stays inside the time dialog');
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({state:'detached'});
        assert.ok(await page.locator('.lobby-mode-grid button').first().evaluate(button=>button===document.activeElement), 'Escape restores focus to the ranked action');
        await page.locator('.lobby-play-action').click();
        await page.getByRole('dialog').waitFor();
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({state:'detached'});
        await page.locator('.lobby-mode-grid button').nth(3).click();
        const join=page.getByRole('dialog');await join.waitFor();
        assert.equal(await join.locator('button[type="submit"]').isEnabled(),false);
        await join.getByRole('textbox').fill('abc123');
        assert.equal(await join.locator('button[type="submit"]').isEnabled(),true);
        await page.keyboard.press('Escape');await join.waitFor({state:'detached'});
        await page.locator('[data-lobby-music="midnight"] button').click();
        const dialog = page.locator('dialog[data-reward-kind="music"]'); await dialog.waitFor();
        assert.equal(await dialog.locator('audio').getAttribute('preload'), 'none');
        assert.equal(await dialog.locator('audio').getAttribute('autoplay'), null);
        assert.ok((await dialog.locator('audio').getAttribute('src')).endsWith('/Ivory_and_Stream.mp3'));
        await page.keyboard.press('Escape'); await dialog.waitFor({ state:'detached' });
        await page.locator('.lobby-collection header button').click();
        const settings = page.getByRole('dialog'); await settings.waitFor();
        await settings.getByRole('button', { name:'閉じる', exact:true }).first().click();
        await settings.waitFor({ state:'detached' });
        await page.locator('.lobby-navigation').scrollIntoViewIfNeeded();
        assert.ok(await lobby.evaluate(node => node.scrollTop >= 0));

        // Actual game code and worker, not a Board stub. Backend operations still
        // fail closed and are intercepted, so these are uncharged local fixtures.
        if (releaseFlagsOn) {
            // Paid authoritative practice is covered by its server/SQL suites.
            // Use the real guest entry for this local worker and layout check.
            await page.getByRole('button',{name:/設定/}).first().click();
            await page.getByRole('button',{name:'アカウント',exact:true}).click();
            await page.getByRole('button',{name:'ログアウト',exact:true}).click();
            await page.getByRole('button',{name:'ゲストとしてプレイ',exact:true}).click();
            await page.locator('[data-terms-gate]').waitFor();
            await page.getByRole('checkbox').check();
            await page.getByRole('button',{name:'同意して続ける',exact:true}).click();
            await lobby.waitFor();
        }
        await page.locator('.lobby-shortcuts button').first().click();
        const practice=page.getByRole('dialog');await practice.waitFor();
        await practice.getByRole('button',{name:'黒・後手',exact:true}).click();
        assert.equal(await practice.getByRole('button',{name:'黒・後手',exact:true}).getAttribute('aria-pressed'),'true');
        await practice.getByRole('button',{name:'白・先手',exact:true}).click();
        await practice.locator('[data-time-control="10m"]').click();
        await page.locator('.match-layout').waitFor();
        const hint=page.getByRole('button',{name:'QUBEに聞く',exact:true});
        await hint.waitFor();await hint.click();
        let from='a2',to='a3';
        if(releaseFlagsOn){
            await page.getByText('ヒント券は登録アカウントでの練習で使えます。ホームに戻り、登録アカウントでログインしてください。',{exact:true}).waitFor();
            assert.equal(await page.locator('#ranked-login-title').count(),0,'guest has no password to re-enter');
            assert.equal(await page.getByTestId('hint-destination').count(),0);
            assert.ok(!remoteRequests.some(path=>path.startsWith('/cpu-practice')),'guest cannot debit paid practice tickets');
        }else{
            await page.getByTestId('hint-destination').waitFor({timeout:25000});
            from=(await page.getByTestId('hint-source').innerText()).trim();to=(await page.getByTestId('hint-destination').innerText()).trim();
            assert.match(from,/^[a-h][1-8]$/);assert.match(to,/^[a-h][1-8]$/);assert.notEqual(from,to);
        }
        await page.locator(`[data-square="${from}"]`).click();
        assert.equal(await page.locator(`[data-square="${to}"]`).getAttribute('data-move-target'),'true','practice destination is legal in the actual position');
        await page.locator(`[data-square="${to}"]`).click();
        await page.waitForFunction(()=>document.querySelectorAll('.match-history li').length>=2,{},{timeout:20000});
        assert.equal(await page.getByTestId('hint-destination').count(),0,'a moved position clears the old hint');
        await page.getByRole('button',{name:'ホームに戻る',exact:true}).click();
        await page.getByRole('button',{name:'戻る',exact:true}).click();await lobby.waitFor();
        if(releaseFlagsOn){
            await page.locator('.lobby-campaign-action').click();
            await page.getByRole('button',{name:'ログインしてプレイ',exact:true}).waitFor();
            assert.equal(await page.locator('.campaign-boss-card .campaign-primary').count(),0,'guest cannot start account-bound Crown progress');
            // Reload restores the explicitly owned synthetic registered fixture
            // through the same real session-status route, without live sign-in.
            await page.reload({waitUntil:'domcontentloaded'});await lobby.waitFor();
        }
        await page.locator('.lobby-campaign-action').click();
        await page.locator('.campaign-boss-card .campaign-primary').waitFor();
        const boss=await page.locator('.campaign-boss-card').boundingBox(),stages=await page.locator('.campaign-rounds').boundingBox();
        if(width<=700)assert.ok(boss.y<stages.y,'mobile puts the selected challenge before the stage list');
        await page.locator('.campaign-boss-card .campaign-primary').click();
        await page.locator('.match-layout').waitFor();
        if(releaseFlagsOn)assert.equal(await page.getByRole('button',{name:'QUBEに聞く',exact:true}).count(),0,'paid hints are for practice only');
        else await page.getByRole('button',{name:'QUBEに聞く',exact:true}).waitFor();
        await page.getByRole('button',{name:'ホームに戻る',exact:true}).click();
        await page.getByRole('button',{name:'戻る',exact:true}).click();
        await page.locator('.campaign-screen').waitFor();
        await page.locator('.campaign-header button').click();await lobby.waitFor();
        assert.deepEqual(errors, [], `runtime errors ${width}`);
        assert.ok(remoteRequests.includes('/auth/ranked-session/status'));
        results.push({ width,height, history:10, releaseFlagsOn, preview:true, settings:true, nativeDialogs:true, practiceLegalHint:!releaseFlagsOn, guestHintLoginGate:releaseFlagsOn, cpuReply:true, crown:true, crownGuestLoginGate:releaseFlagsOn, liveTraffic:false });
        } catch (error) {
            await page.screenshot({ path:resolve(artifacts, `failure-${width}.png`) });
            console.error(JSON.stringify({ width, errors, intercepted:remoteRequests, screen:await page.locator('body').innerText() }));
            throw error;
        } finally { await context.close(); }
    }
    console.log(JSON.stringify({ passed:results.length, results }));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
