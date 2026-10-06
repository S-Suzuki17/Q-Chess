/** Actual status panels + actual access hook + app CSS, synthetic transport only. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = resolve(repo, 'scripts/qa/fixtures/commerce-status');
const stub = resolve(root, 'stubs.tsx');
const built = await build({
    root, configFile: false, logLevel: 'warn', build: { write: false },
    resolve: { alias: [
        { find: 'next/link', replacement: stub }, { find: '@capacitor/core', replacement: stub },
        { find: /^\.\.\/hooks\/useAppPlatform$/, replacement: stub },
        ...['stripeMembership', 'currentAccountTerms', 'dailyLoginRewards'].map(name => ({ find: new RegExp(`^\\.\\./lib/${name}$`), replacement: stub })),
    ] },
    define: { 'process.env': {} },
});
if (process.argv.includes('--build-only')) {
    console.log('PASS: actual commerce status fixture compiles; browser interactions and layout NOT RUN');
    process.exit(0);
}
const assets = new Map((Array.isArray(built) ? built : [built]).flatMap(bundle => bundle.output)
    .map(asset => [asset.fileName, asset.type === 'chunk' ? asset.code : asset.source]));
const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname.slice(1) || 'index.html';
    const asset = assets.get(path);
    if (asset === undefined) { response.writeHead(404).end(); return; }
    const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'text/javascript';
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
    response.end(asset);
});
const scenarios = ['legacy', 'standard', 'plus', 'retained', 'sandbox', 'mixed'];
const balances = { standard: ['13', '0'], plus: ['13', '10'], retained: ['27', '7'], sandbox: ['77', '10'], mixed: ['13', '10'] };
const artifactDir = process.env.COMMERCE_STATUS_ARTIFACT_DIR;
let browser;
try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    if (artifactDir) await mkdir(resolve(artifactDir), { recursive: true });
    for (const width of [390, 1280]) for (const lang of ['en', 'ja']) for (const platform of ['web', 'android']) {
        const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
        const errors = [], externalRequests = [], webSockets = [];
        await context.routeWebSocket('**/*', socket => { webSockets.push(socket.url()); socket.close(); });
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === origin) return route.continue();
            externalRequests.push(url.href); return route.abort();
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        for (const scenario of scenarios) {
            await page.goto(`${origin}/?scenario=${scenario}&platform=${platform}&lang=${lang}`);
            await page.waitForFunction(() => window.commerceStatusQA?.ready);
            const usage = page.locator('[data-panel="usage"]');
            const store = page.locator('[data-panel="store"]');
            await usage.locator('.reward-balances').first().waitFor();
            const hasLegacy = scenario === 'legacy' || scenario === 'mixed';
            const entitlement = usage.locator('[data-commerce-entitlements]');
            assert.equal(await usage.locator('[data-legacy-member-tickets]').count(), hasLegacy ? 1 : 0);
            if (hasLegacy) assert.deepEqual(await usage.locator('[data-legacy-member-tickets] dd').allTextContents(), ['4', '5']);
            if (scenario === 'legacy') assert.equal(await entitlement.count(), 0);
            else {
                assert.deepEqual(await entitlement.locator('dd').allTextContents(), balances[scenario]);
                assert.equal(await entitlement.getAttribute('data-commerce-mode'), scenario === 'sandbox' ? 'test' : 'live');
                assert.doesNotMatch(await entitlement.textContent(), /2\.99|expire|失効|carry over|持ち越/);
                if (scenario === 'sandbox') {
                    assert.match(await entitlement.textContent(), lang === 'ja' ? /テスト専用/ : /Test mode only/);
                    assert.doesNotMatch(await entitlement.textContent(), /Unlimited|広告なし|無制限/);
                }
                if (scenario === 'retained') assert.doesNotMatch(await entitlement.textContent(), /Standard|Plus|Unlimited|無制限/);
            }
            if (platform === 'android') {
                assert.equal(await store.locator('section').count(), 0);
                // Existing stock-expiry rules may mention a payment reversal
                // (決済取消); that disclosure is not a payment invitation.
                assert.doesNotMatch(await usage.textContent(), /Stripe|USD|\$|checkout|支払い方法|購入する|購入へ進む|決済へ進む/);
                assert.equal(await usage.locator('a,button,input,[role="button"],[role="link"],[data-product-catalog],[data-purchase-review]').count(), 0);
            } else {
                await store.locator('.reward-membership-status,[data-commerce-entitlements]').first().waitFor();
                assert.equal(await store.locator('[data-legacy-membership-terms]').count(), hasLegacy ? 1 : 0);
                const storeText = await store.textContent();
                if (hasLegacy) assert.match(storeText, /2\.99/);
                else assert.doesNotMatch(storeText, /2\.99|expire|失効|carry over|持ち越/);
                assert.equal(await store.locator('[data-purchase-review]').count(), 0, 'Source readiness must remain OFF');
                assert.equal(await store.locator('input:not(:disabled)').count(), 0);
                if (scenario === 'standard' || scenario === 'plus') {
                    const product = await store.locator('[data-current-commerce-product]').textContent();
                    assert.match(product, scenario === 'standard' ? /Standard.*\$3\.00/ : /Plus.*\$6\.00/);
                }
            }
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal document overflow');
            assert(await page.locator('[data-commerce-fixture]').evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'Horizontal panel overflow');
            assert.deepEqual(await page.evaluate(() => ({ checkout: window.commerceStatusQA.checkout, consent: window.commerceStatusQA.consent })),
                { checkout: 0, consent: 0 }, 'Read-only review must not charge or consent');
            if (artifactDir) await page.screenshot({ path: resolve(artifactDir, `commerce-status-${scenario}-${platform}-${lang}-${width}.png`), fullPage: true });

            if (scenario === 'plus' && platform === 'web') {
                const billing = store.getByRole('button');
                await billing.evaluate(button => { button.click(); button.click(); });
                assert.equal(await page.evaluate(() => window.commerceStatusQA.portal), 1, 'Repeated billing clicks create one request');
                await page.evaluate(() => window.commerceStatusQA.replaceAccount());
                await page.waitForFunction(() => document.querySelector('[data-commerce-fixture]')?.getAttribute('data-account') === 'ReplacementFixture');
                await page.evaluate(async () => { window.commerceStatusQA.releasePortal(); await Promise.resolve(); await Promise.resolve(); });
                assert.equal(new URL(page.url()).origin, origin, 'Stale account billing response must not navigate');
            }
        }
        assert.deepEqual(errors, [], 'Browser runtime errors');
        assert.deepEqual(externalRequests, [], 'Unexpected external requests');
        assert.deepEqual(webSockets, [], 'Unexpected WebSocket');
        console.log(`PASS: commerce status ${platform} ${lang} ${width}px, six ownership/stock scenarios`);
        await context.close();
    }
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
