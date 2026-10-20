/** The real static app, with transport responses confined to browser fixtures.
 * Never creates accounts, queue entries, purchases, or records on live services. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from 'playwright';
import {exportedGoogleSession} from './fixtures/exported-google-session.mjs';
const [releaseFlag='--release-flags=off', artifactDirectory='scratch/lobby-20261007', ...extraArgs] = process.argv.slice(2);
assert.ok(/^--release-flags=(on|off)$/.test(releaseFlag) && extraArgs.length===0,
    'Usage: check-lobby-browser.mjs [--release-flags=on|off] [artifact-directory]');
const releaseFlagsOn = releaseFlag.endsWith('=on');
const viewports = [[1920,1080],[1280,800],[390,844],[320,568]];
const requestedWidths = process.env.QG_TEST_LOBBY_WIDTHS?.split(',').map(Number);
assert.ok(!requestedWidths || (requestedWidths.length > 0 && requestedWidths.every(width => viewports.some(([known]) => known === width))), 'Unknown lobby viewport');

const root = resolve('out'), artifacts = resolve(artifactDirectory);
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
const termsSource = await readFile('src/config/currentTerms.ts', 'utf8');
const termsVersion = termsSource.match(/CURRENT_TERMS_VERSION\s*=\s*'([^']+)'/)[1];
const termsDate = termsSource.match(/CURRENT_TERMS_EFFECTIVE_DATE[^=]*=\s*'([^']+)'/)[1];
const user = { id:'QA_LobbyOnly', name:'QA Lobby', type:'registered' };
const google=await exportedGoogleSession(root,user);
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
    browser = await chromium.launch({ headless:true, ...(process.env.QG_TEST_CHROMIUM?{executablePath:process.env.QG_TEST_CHROMIUM}:{}) });
    for (const [width,height] of viewports.filter(([width]) => !requestedWidths || requestedWidths.includes(width))) {
        const context = await browser.newContext({ viewport:{ width,height } });
        const errors = [], remoteRequests = [];
        await context.routeWebSocket('**/*', socket => socket.close());
        await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.origin === origin) return route.continue();
            remoteRequests.push(url.pathname);
            if (url.pathname === '/auth/google/account') return route.fulfill({json:{authId:google.account.authId,account:google.account,termsVersion}});
            if (url.pathname === '/auth/v1/user') return route.fulfill({json:google.authUser});
            if (url.pathname === '/auth/v1/logout') return route.fulfill({status:204,body:''});
            if (url.pathname === '/account/current-terms') return route.fulfill({ json:{ userId:user.id, currentVersion:termsVersion, effectiveDate:termsDate, effective:true, consent:{ version:termsVersion, acceptedAt:new Date().toISOString() } } });
            if (url.pathname === '/account/progress') return route.fulfill({ json:{ userId:user.id, revision:0, progress, saved:true } });
            if (url.pathname === '/game-records') return route.fulfill({ json:{ records } });
            if (url.pathname === '/rewards/daily-login' && route.request().method()==='GET') return route.fulfill({json:{
                userId:user.id, enabled:true, streakDays:0, rewardPolicyVersion:1, tickets:{ranked:4,hint:0},
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
        await context.addInitScript(({ user,google }) => {
            localStorage.setItem('qg_language', 'ja');
            localStorage.setItem('qg_last_user', JSON.stringify(user));
            localStorage.setItem(google.sessionKey, JSON.stringify(google.session));
            localStorage.setItem('qchess_is2DView', 'true');
        }, { user,google });
        const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
        try {
        await page.goto(origin, { waitUntil:'domcontentloaded' });
        const lobby = page.locator('.lobby-studio'); await lobby.waitFor();
        await page.locator('.lobby-recent-row').nth(9).waitFor({ state:'attached' });
        await page.locator('.lobby-rating strong').filter({ hasText:'1000' }).waitFor();
        assert.equal(await page.locator('.lobby-recent-row').count(), 10);
        await page.locator('.lobby-library > summary').click();
        if (releaseFlagsOn) {
            await page.locator('.reward-balances dd').first().waitFor();
            assert.match(await page.locator('.reward-balances dd').nth(0).innerText(), /^4\b/);
            assert.match(await page.locator('.reward-balances dd').nth(1).innerText(), /^0\b/);
            assert.equal(await page.locator('.lobby-wallet-status').count(), 0);
        } else assert.equal(await page.locator('.lobby-wallet-status').innerText(), '未解放');
        assert.equal(await page.locator('[data-lobby-cosmetic="board"]').getAttribute('data-reward-id'), 'walnut');
        assert.ok(await lobby.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `lobby overflow ${width}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflow ${width}`);
        await page.locator('.lobby-bottom-navigation button').nth(1).click();
        const historyPanel=page.locator('div.fixed.inset-0').filter({has:page.getByRole('heading',{level:3,name:/棋譜/})});
        const history=historyPanel.locator('.overflow-y-auto');
        await history.getByRole('button').nth(9).waitFor();
        assert.equal(await history.getByRole('button').count(),10);
        if(await history.evaluate(node=>node.scrollHeight>node.clientHeight)){
            await history.evaluate(node=>node.scrollTop=node.scrollHeight);
            assert.ok(await history.evaluate(node=>node.scrollTop>0),'replay history scrolls when its rows exceed the viewport');
        }
        await historyPanel.getByRole('button',{name:'✕',exact:true}).click();
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

        // Actual game and strongest hint worker, with zero-ticket registered
        // practice and guest practice. No remote hint endpoint may be invoked.
        const verifyFreePractice = async identity => {
            const requestStart=remoteRequests.length;
            await page.locator('.lobby-shortcuts button').first().click();
            const practice=page.getByRole('dialog');await practice.waitFor();
            await practice.getByRole('button',{name:'黒・後手',exact:true}).click();
            assert.equal(await practice.getByRole('button',{name:'黒・後手',exact:true}).getAttribute('aria-pressed'),'true');
            await practice.getByRole('button',{name:'白・先手',exact:true}).click();
            await practice.locator('[data-time-control="10m"]').click();
            await page.locator('.match-layout').waitFor();
            const hint=page.locator('[data-hint-access="free"]');
            await hint.waitFor();assert.equal(await hint.innerText(),'無料でQUBEに聞く');await hint.click();
            await page.getByTestId('hint-destination').waitFor({timeout:25000});
            const from=(await page.getByTestId('hint-source').innerText()).trim(),to=(await page.getByTestId('hint-destination').innerText()).trim();
            assert.match(from,/^[a-h][1-8]$/);assert.match(to,/^[a-h][1-8]$/);assert.notEqual(from,to);
            assert.equal(await page.locator('#ranked-login-title').count(),0,identity+' practice does not require hint login');
            assert.ok(!remoteRequests.slice(requestStart).some(path=>/^\/(cpu-practice|match-hints|crown-hints)(\/|$)/.test(path)),identity+' practice stays local with zero ticket operations');
            await page.locator(`[data-square="${from}"]`).click();
            assert.equal(await page.locator(`[data-square="${to}"]`).getAttribute('data-move-target'),'true','practice destination is legal in the actual position');
            await page.locator(`[data-square="${to}"]`).click();
            await page.waitForFunction(()=>document.querySelectorAll('.match-history li').length>=2,{},{timeout:20000});
            assert.equal(await page.getByTestId('hint-destination').count(),0,'a moved position clears the old hint');
            await page.getByRole('button',{name:'ホームに戻る',exact:true}).click();
            await page.getByRole('button',{name:'戻る',exact:true}).click();await lobby.waitFor();
        };
        await verifyFreePractice('registered zero balance');
        // The same guest path is exercised at the phone width; the registered
        // game above covers every viewport without duplicating all worker runs.
        if (width===390) {
            await page.getByRole('button',{name:/設定/}).first().click();
            const settings = page.getByRole('dialog'), picker = settings.locator('[data-settings-section-picker]');
            if (await picker.isVisible()) await picker.selectOption('account');
            else await settings.getByRole('tab',{name:'アカウント',exact:true}).click();
            await settings.getByRole('tabpanel',{name:'アカウント',exact:true}).waitFor();
            await settings.locator('[data-settings-panel="account"]').click();
            await page.getByRole('button',{name:'ログアウト',exact:true}).click();
            await page.getByRole('button',{name:'ゲストとしてプレイ',exact:true}).click();
            await lobby.waitFor();
            assert.equal(await page.locator('[data-terms-gate]').count(),0);
            await verifyFreePractice('guest');
            await page.locator('.lobby-campaign-action').click();
            await page.locator('[data-testid="circuit-guest-preview"]').waitFor();
            await page.locator('.map-overview-trigger').click();
            const overview = page.locator('.map-overview-dialog'); await overview.waitFor();
            assert.equal(await overview.locator('[data-map-overview-tile]').count(),100);
            await overview.locator('header button').click(); await overview.waitFor({state:'detached'});
            await page.locator('.map-launch button').click();
            await page.locator('[data-testid="circuit-login-gate"]').waitFor();
            assert.equal(await page.locator('.match-layout').count(),0,'guest preview cannot start account-bound Crown progress');
            // Reload restores the explicitly owned synthetic registered fixture
            // through the real Google-account route, without live sign-in.
            await page.reload({waitUntil:'domcontentloaded'});await lobby.waitFor();
        }
        await page.locator('.lobby-campaign-action').click();
        await page.locator('.map-launch .campaign-primary').waitFor();
        const launch=await page.locator('.map-launch').boundingBox(),stages=await page.locator('.challenge-map').boundingBox();
        if(width<=700)assert.ok(launch.y<stages.y,'mobile puts the selected challenge before the stage list');
        await page.locator('.map-launch .campaign-primary').click();
        await page.locator('.match-layout').waitFor();
        await page.locator('[data-hint-access="ticket"]').waitFor();
        assert.equal(await page.locator('[data-hint-access="ticket"]').innerText(),'ヒント券を使用（1枚）');
        assert.equal(await page.locator('[data-hint-access="free"]').count(),0,'Crown never falls back to a free practice hint');
        await page.getByRole('button',{name:'ホームに戻る',exact:true}).click();
        await page.getByRole('button',{name:'戻る',exact:true}).click();
        await page.locator('.campaign-screen').waitFor();
        await page.locator('.campaign-header button').first().click();await lobby.waitFor();
        assert.deepEqual(errors, [], `runtime errors ${width}`);
        assert.ok(remoteRequests.includes('/auth/google/account'));
        results.push({ width,height, history:10, releaseFlagsOn, preview:true, settings:true, nativeDialogs:true, zeroBalancePracticeLegalHint:true, guestFreePractice:width===390, practiceHintNetworkCalls:0, cpuReply:true, crownTicketLabel:true, crownGuestLoginGate:width===390, liveTraffic:false });
        } catch (error) {
            await page.screenshot({ path:resolve(artifacts, `failure-${width}.png`) });
            console.error(JSON.stringify({ width, errors, intercepted:remoteRequests, screen:await page.locator('body').innerText() }));
            throw error;
        } finally { await context.close(); }
    }
    console.log(JSON.stringify({ passed:results.length, results }));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
