// Real exported pages; external traffic is blocked. No sign-in or live writes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from 'playwright';
import { SEARCH_ROUTES, checkSearchMetadata, checkSearchFiles } from '../release/search-metadata.mjs';

const root = resolve(process.argv[2] || 'out');
const artifacts = resolve(process.argv[3] || 'scratch/public-guides-20261007');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.txt': 'text/plain' };
const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    if (!pathname.endsWith('/') && !extname(pathname)) { res.writeHead(308, { Location: pathname + '/' }).end(); return; }
    const file = resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
    catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
let browser;
try {
    await mkdir(artifacts, { recursive: true });
    for (const route of SEARCH_ROUTES) {
        const html = await readFile(resolve(root, '.' + route, 'index.html'), 'utf8');
        checkSearchMetadata(html, route);
        assert.doesNotMatch(html, /QUBIT4x|devDiaryTweets|開発AIのぼやき部屋|href=["']\/updates\/?["']/i);
        assert.doesNotMatch(html, /<script[^>]*src=["'][^"']*(?:googlesyndication|googleadservices|doubleclick)/i);
    }
    checkSearchFiles(await readFile(resolve(root, 'robots.txt'), 'utf8'), await readFile(resolve(root, 'sitemap.xml'), 'utf8'));
    browser = await chromium.launch({ headless: true });
    for (const [width, height] of [[390, 844], [1280, 800]]) {
        for (const lang of ['ja', 'en']) {
            const context = await browser.newContext({ viewport: { width, height }, locale: lang === 'ja' ? 'ja-JP' : 'en-US' });
            const errors = [];
            await context.routeWebSocket('**/*', socket => socket.close());
            await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.fulfill({ status: 503, json: { code: 'QA_EXTERNAL_BLOCKED' } }));
            await context.addInitScript(lang => localStorage.setItem('qg_language', lang), lang);
            const page = await context.newPage();
            page.on('pageerror', e => errors.push(e.message));
            try {
                await page.goto(origin, { waitUntil: 'domcontentloaded' });
                const entry = page.locator('[data-learning-entry]'); await entry.waitFor();
                await entry.locator('a[href="/guide/"]').click();
                await page.locator(`[data-learning-article="guide"][lang="${lang}"]`).waitFor();
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `guide overflow ${width}`);
                assert.ok(await page.locator('.game-page-content').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
                await page.screenshot({ path: resolve(artifacts, `guide-${lang}-${width}.png`) });
                await page.locator('a[href="#practice"]').click();
                const exercise = page.locator('[data-learning-exercise]').first();
                const summary = exercise.locator('summary'); await summary.focus(); await page.keyboard.press('Enter');
                assert.equal(await exercise.locator('details').getAttribute('open'), '');
                assert.ok(await exercise.locator('details p').isVisible());
                assert.ok(await page.locator('.game-page').evaluate(el => el.scrollTop > 0), 'guide scrolls to exercise');
                await page.screenshot({ path: resolve(artifacts, `exercise-${lang}-${width}.png`) });
                await page.locator('a[href="#chain"]').click();
                assert.ok(await page.locator('#chain-heading').evaluate(el => {
                    const header = document.querySelector('.game-page-header');
                    return el.getBoundingClientRect().top >= header.getBoundingClientRect().bottom;
                }), 'chain heading is below the sticky header');
                const chain = page.locator('[data-learning-chain]');
                assert.equal(await chain.locator('ol > li').count(), 5);
                assert.ok(await chain.isVisible());
                assert.ok(await chain.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'chain diagram has no overflow');
                await page.screenshot({ path: resolve(artifacts, `chain-${lang}-${width}.png`) });
                await page.locator('article nav a[href="/faq/"]').click();
                await page.locator(`[data-learning-article="faq"][lang="${lang}"]`).waitFor();
                const move = page.locator('details#move'); await move.locator('summary').click();
                assert.ok(await move.locator('p').isVisible());
                await page.screenshot({ path: resolve(artifacts, `faq-${lang}-${width}.png`) });
                await move.locator('a').click(); await page.locator('.game-page').waitFor();
                await page.locator('[data-learning-entry] a[href="/guide/"]').click();
                await page.getByLabel('ガイドの言語 / Guide language').selectOption(lang === 'ja' ? 'en' : 'ja');
                await page.locator(`[data-learning-article="guide"][lang="${lang === 'ja' ? 'en' : 'ja'}"]`).waitFor();
                for (const route of ['/about/', '/contact/', '/privacy/', '/terms/']) {
                    await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
                    const nav = page.locator('.game-page-links'); await nav.waitFor();
                    assert.equal(await nav.locator('a[href="/guide/"]').count(), 1, route);
                    assert.equal(await nav.locator('a[href="/faq/"]').count(), 1, route);
                    await nav.scrollIntoViewIfNeeded();
                    assert.ok(await nav.isVisible());
                    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflow ${width}`);
                }
                if (lang === 'ja') {
                    // Validate the guide's instructions on the actual local UI.
                    // Guest consent is stored only in this disposable browser.
                    await page.evaluate(() => localStorage.setItem('qg_language', 'ja'));
                    await page.goto(origin, { waitUntil: 'domcontentloaded' });
                    await page.getByRole('button', { name: 'ゲストとしてプレイ', exact: true }).click();
                    await page.locator('[data-terms-gate]').waitFor();
                    await page.getByRole('checkbox').check();
                    await page.getByRole('button', { name: '同意して続ける', exact: true }).click();
                    await page.locator('.lobby-studio').waitFor();
                    await page.getByRole('button', { name: '遊び方', exact: true }).click();
                    await page.locator('.interactive-tutorial [role="dialog"]').waitFor();
                    await page.getByRole('button', { name: '閉じる', exact: true }).click();
                    await page.getByRole('button', { name: '練習', exact: true }).click();
                    await page.getByRole('button', { name: '弱い', exact: true }).click();
                    await page.getByRole('button', { name: '白・先手', exact: true }).click();
                    await page.locator('[data-time-control="10m"]').click();
                    await page.locator('.match-layout').waitFor();
                    await page.getByRole('button', { name: '2D', exact: true }).click();
                    const from = page.getByRole('button', { name: 'a2', exact: true });
                    await from.focus(); await page.keyboard.press('Enter');
                    await page.locator('[data-testid="selected-square"]').filter({ hasText: 'a2' }).waitFor();
                    const to = page.getByRole('button', { name: 'a3', exact: true });
                    assert.equal(await to.getAttribute('data-move-target'), 'true');
                    await to.focus(); await page.keyboard.press('Enter');
                    const detailsButton = page.getByRole('button', { name: '棋譜・正体', exact: true });
                    if (await detailsButton.isVisible()) await detailsButton.click();
                    await page.locator('.match-history code').filter({ hasText: 'a2 → a3' }).waitFor();
                    await page.screenshot({ path: resolve(artifacts, `first-game-ja-${width}.png`) });
                    await page.getByRole('button', { name: 'ホームに戻る', exact: true }).click();
                    await page.getByRole('button', { name: '戻る', exact: true }).click();
                    await page.locator('.lobby-studio').waitFor();
                }
                assert.deepEqual(errors, [], `runtime errors ${lang} ${width}`);
                results.push({ width, height, lang, entry: true, keyboardAnswer: true, candidateChain: true, faqLink: true, languageSwitch: true, informationNavigation: true, firstGame: lang === 'ja', liveWrites: false });
            } catch (error) { await page.screenshot({ path: resolve(artifacts, `failure-${lang}-${width}.png`) }); throw error; }
            finally { await context.close(); }
        }
        const noJs = await browser.newContext({ viewport: { width, height }, javaScriptEnabled: false });
        const page = await noJs.newPage();
        for (const kind of ['guide', 'faq']) {
            await page.goto(`${origin}/${kind}/`);
            assert.equal(await page.locator(`[data-learning-article="${kind}"]`).count(), 1);
            const details = page.locator('article details').first(); await details.locator('summary').click();
            assert.ok(await details.locator('p').isVisible(), `${kind} answers without JS`);
        }
        results.push({ width, javaScript: false, readable: true, nativeAnswers: true });
        await noJs.close();
    }
    await writeFile(resolve(artifacts, 'results.json'), JSON.stringify({ initialHtml: SEARCH_ROUTES.length, results }, null, 2) + '\n');
    console.log(JSON.stringify({ initialHtml: SEARCH_ROUTES.length, passed: results.length, artifacts }));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
