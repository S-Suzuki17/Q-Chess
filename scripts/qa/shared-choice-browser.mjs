/** Actual admission component + hook + app CSS; in-memory socket events only. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = resolve(repo, 'scripts/qa/fixtures/shared-choice');
const config = {
    root, configFile: false, logLevel: 'warn',
    build: { write: false },
};
const built = await build(config);
if (process.argv.includes('--build-only')) {
    console.log('PASS: actual shared-choice fixture compiles; browser interactions and layout NOT RUN');
    process.exit(0);
}
// Serve the compiled in-memory bundle: no Vite HMR socket and no file writes.
const assets = new Map((Array.isArray(built) ? built : [built]).flatMap(bundle => bundle.output)
    .map(asset => [asset.fileName, asset.type === 'chunk' ? asset.code : asset.source]));
const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname.slice(1) || 'index.html';
    const asset = assets.get(path);
    if (asset === undefined) { response.writeHead(404); response.end(); return; }
    const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'text/javascript';
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
    response.end(asset);
});
let browser;
const results = [], artifactDir = process.env.SHARED_CHOICE_ARTIFACT_DIR;
const ids = {
    first: '10000000-0000-4000-8000-000000000001',
    next: '10000000-0000-4000-8000-000000000002',
    third: '10000000-0000-4000-8000-000000000003',
    grant: '20000000-0000-4000-8000-000000000001',
    newGrant: '20000000-0000-4000-8000-000000000002',
};
const offer = (matchId = ids.first, grantId) => ({
    matchId, dailyFreeMatches: 3, ticketCost: 1, verifiedAdMatches: 1,
    verifiedAdAvailable: !!grantId, ...(grantId ? { grantId } : {}),
});
const words = {
    en: { title: 'Choose how to start this match', ticket: 'Use 1 rank ticket', ad: 'Use 1 verified ad match',
        unavailable: 'Rewarded ad option currently unavailable', cancel: 'Cancel without spending',
        pending: 'Confirming your choice…', error: 'Couldn’t confirm your choice. Retry or cancel.' },
    ja: { title: 'ランク戦の参加方法', ticket: 'ランク戦チケットを1枚使う', ad: '確認済み広告の1局分を使う',
        unavailable: '広告の参加方法は現在利用できません', cancel: 'キャンセル（消費なし）',
        pending: '参加を確認中…', error: '参加を確認できませんでした。再試行するかキャンセルしてください。' },
};
async function checkLayout(page) {
    const boxes = await page.getByRole('dialog').evaluate(dialog => {
        const nodes = [dialog, ...dialog.querySelectorAll('button,[role="status"],[role="alert"]')];
        return nodes.map(node => {
            const rect = node.getBoundingClientRect();
            return { tag: node.tagName, role: node.getAttribute('role'), x: rect.x, y: rect.y, right: rect.right,
                bottom: rect.bottom, height: rect.height, width: rect.width, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
        });
    });
    const viewport = page.viewportSize();
    for (const box of boxes) {
        assert(box.x >= 0 && box.y >= 0 && box.right <= viewport.width + 1 && box.bottom <= viewport.height + 1,
            `Clipped ${box.tag}/${box.role}: ${JSON.stringify(box)}`);
        assert(box.scrollWidth <= box.clientWidth + 1, `Horizontal overflow: ${JSON.stringify(box)}`);
        if (box.tag === 'BUTTON') assert(box.height >= 44, 'Choice target must be at least 44px tall');
    }
    const buttons = boxes.filter(box => box.tag === 'BUTTON');
    assert.equal(buttons.length, 3);
    assert(buttons[0].bottom <= buttons[1].y && buttons[1].bottom <= buttons[2].y, 'Choice buttons overlap');
}
try {
    await new Promise((resolve, reject) => {
        server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${server.address().port}/`;
    const allowedOrigin = new URL(origin).origin;
    browser = await chromium.launch({ headless: true });
    if (artifactDir) await mkdir(resolve(artifactDir), { recursive: true });
    for (const width of [390, 1280]) for (const lang of ['en', 'ja']) {
        const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
        const errors = [], externalRequests = [], webSockets = [];
        await context.routeWebSocket('**/*', socket => { webSockets.push(socket.url()); socket.close(); });
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === allowedOrigin) return route.continue();
            externalRequests.push(url.href); return route.abort();
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        const run = (method, ...args) => page.evaluate(({ method, args }) => window.sharedChoiceQA[method](...args), { method, args });
        const receive = (event, data, socket = 'account-a') => run('receive', socket, event, data);
        const messages = async event => (await run('emissions')).filter(message => message.event === event);
        const choices = () => messages('choose_match_admission');
        const text = words[lang];
        const ticket = page.getByRole('button', { name: text.ticket, exact: true });
        const pending = page.getByRole('status');
        const fixture = page.getByTestId('fixture');
        const assertState = async (isPending, isError = false) => {
            await page.waitForFunction(({ isPending, isError }) => {
                const node = document.querySelector('[data-testid="fixture"]');
                return node?.getAttribute('data-pending') === String(isPending) && node?.getAttribute('data-error') === String(isError);
            }, { isPending, isError });
        };
        const show = async (payload = offer(), socket = 'account-a') => {
            await receive('match_admission_choice_required', payload, socket);
            await page.getByRole('dialog', { name: text.title }).waitFor();
        };
        try {
            await page.goto(`${origin}?lang=${lang}`);
            await page.waitForFunction(() => window.sharedChoiceQA?.ready);
            await show(); await run('rerender');
            assert.deepEqual(await run('emissions'), [], 'Mount and offer must not emit consent or cancellation');
            assert(await ticket.isEnabled());
            assert(await page.getByRole('button', { name: text.unavailable, exact: true }).isDisabled());
            await checkLayout(page);
            if (artifactDir) await page.screenshot({ path: resolve(artifactDir, `shared-choice-${lang}-${width}.png`) });

            // Synchronous repeated DOM clicks exercise the hook's ref guard too.
            await ticket.evaluate(button => { button.click(); button.click(); });
            assert.deepEqual(await choices(), [{ socket: 'account-a', event: 'choose_match_admission', data: { matchId: ids.first, source: 'ticket' } }]);
            await assertState(true); assert.equal(await pending.textContent(), text.pending); assert(await ticket.isDisabled());
            await show(); assert(await ticket.isDisabled()); assert.equal((await choices()).length, 1); await checkLayout(page);
            await receive('match_admission_choice_error', { matchId: ids.next }); await assertState(true);
            await receive('match_admission_choice_error', { matchId: ids.first }); await assertState(false, true);
            assert.equal(await page.getByRole('alert').textContent(), text.error); assert(await ticket.isEnabled());
            assert.equal((await choices()).length, 1); await checkLayout(page);
            if (artifactDir) await page.screenshot({ path: resolve(artifactDir, `shared-choice-error-${lang}-${width}.png`) });
            await ticket.click(); await assertState(true); assert.equal((await choices()).length, 2);
            await run('retainChoice'); await run('capture', 'first', 'account-a');
            await page.getByRole('button', { name: text.cancel, exact: true }).click();
            await page.getByTestId('waiting').waitFor(); await assertState(false);
            await run('chooseRetained', 'ticket'); await run('cancelRetained');
            await receive('match_admission_choice_required', offer());
            assert.equal(await page.getByRole('dialog').count(), 0); assert.equal((await choices()).length, 2);
            assert.deepEqual(await messages('cancel_match_admission'), [{ socket: 'account-a', event: 'cancel_match_admission', data: { matchId: ids.first } }]);

            // Same React hook instance, new match: the reproduced stuck-pending case.
            await run('setMatch', ids.next); await page.waitForFunction(id => window.sharedChoiceQA.matchId === id, ids.next);
            await show(offer(ids.next)); await assertState(false); assert(await ticket.isEnabled());
            await ticket.click(); await assertState(true);
            for (const event of ['match_admission_choice_error', 'match_start', 'match_cancelled', 'disconnect']) {
                await run('replay', 'first', event, { matchId: ids.first });
            }
            await run('replay', 'first', 'match_admission_choice_required', offer());
            await run('chooseRetained', 'ticket'); await run('cancelRetained');
            await assertState(true); assert(await ticket.isDisabled()); assert.equal((await choices()).length, 3);
            await receive('match_admission_choice_error', { matchId: ids.first });
            await receive('match_cancelled', { matchId: ids.first }); await assertState(true);

            // Disconnect invalidates the offer; a reconnect alone never spends.
            await run('retainChoice'); await run('disconnect', 'account-a'); await page.getByTestId('waiting').waitFor();
            await assertState(false); await run('reconnect', 'account-a'); await run('chooseRetained', 'ticket');
            assert.equal((await choices()).length, 3); assert.equal(await page.getByRole('dialog').count(), 0);
            await receive('match_admission_choice_required', { ...offer(ids.next), verifiedAdAvailable: true, grantId: 'invalid' });
            assert.equal(await page.getByRole('dialog').count(), 0);
            await show(offer(ids.next, ids.grant)); assert.equal((await choices()).length, 3);
            await page.getByRole('button', { name: text.ad, exact: true }).click(); await assertState(true);
            assert.deepEqual((await choices()).at(-1).data, { matchId: ids.next, source: 'verified_ad', grantId: ids.grant });

            // Account ownership is modeled by transport replacement, with no auth calls.
            await run('capture', 'old-account', 'account-a'); await run('retainChoice'); await run('replaceSocket', 'account-b');
            await page.waitForFunction(() => window.sharedChoiceQA.socketId === 'account-b');
            await page.getByTestId('waiting').waitFor(); await assertState(false);
            await show(offer(ids.next, ids.newGrant), 'account-b'); assert.equal((await choices()).length, 4);
            await page.getByRole('button', { name: text.ad, exact: true }).click(); await assertState(true);
            for (const event of ['match_admission_choice_error', 'match_start', 'match_cancelled', 'disconnect']) {
                await run('replay', 'old-account', event, { matchId: ids.next });
            }
            await run('replay', 'old-account', 'match_admission_choice_required', offer(ids.next, ids.grant));
            await run('chooseRetained', 'verified_ad'); await run('cancelRetained'); await assertState(true);
            assert.equal((await choices()).length, 5);
            assert.deepEqual((await choices()).at(-1), { socket: 'account-b', event: 'choose_match_admission',
                data: { matchId: ids.next, source: 'verified_ad', grantId: ids.newGrant } });
            assert.equal((await messages('cancel_match_admission')).length, 1, 'Replacing transport for the same match must not auto-cancel it');
            await receive('match_start', { matchId: ids.next }, 'account-b'); await page.getByTestId('waiting').waitFor(); await assertState(false);
            await receive('match_admission_choice_required', offer(ids.next), 'account-b'); assert.equal(await page.getByRole('dialog').count(), 0);
            await run('setMatch', ids.third); await page.waitForFunction(id => window.sharedChoiceQA.matchId === id, ids.third);
            await show(offer(ids.third), 'account-b'); assert(await ticket.isEnabled());
            await run('replaceSocket', null); await page.waitForFunction(() => window.sharedChoiceQA.socketId === 'none');
            await page.getByTestId('waiting').waitFor(); await assertState(false);
            assert.equal(await fixture.getAttribute('data-error'), 'false');
            assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []); assert.deepEqual(webSockets, []);
            results.push({ width, lang, passed: true, choices: 5,
                checks: ['explicit consent', 'double click', 'ad unavailable', 'verified grant', 'error retry', 'cancel',
                    'match replacement', 'disconnect and re-offer', 'account/socket replacement', 'stale callbacks', 'null socket', 'status and layout'] });
        } finally { await context.close(); }
    }
    console.log(JSON.stringify({ passed: results.length, results, liveServices: false, scope: 'Actual choice UI and hook in a controlled fixture; no real auth, match server, balances or ad verification' }, null, 2));
} finally {
    await browser?.close();
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
