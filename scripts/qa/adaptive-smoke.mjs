import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseURL = process.argv[2] || 'http://127.0.0.1:3101';
assert(['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname), 'Use a local server');
const output = resolve(process.argv[3] || 'scratch/adaptive');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.QG_BROWSER_CHANNEL ? { channel: process.env.QG_BROWSER_CHANNEL } : {}) });
const results = [];
let page;
try {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
    await context.addInitScript(() => {
        localStorage.setItem('qg_language', 'ja');
        localStorage.setItem('qg_sound_config', JSON.stringify({ masterMute: true, bgmVolume: 0, seVolume: 0 }));
    });
    page = await context.newPage();
    const errors = [];
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseURL);
    await page.locator('.title-play').click();
    await page.locator('.lobby-shortcuts, [data-terms-gate]').first().waitFor();
    if (await page.getByRole('checkbox').isVisible()) {
        await page.getByRole('checkbox').check();
        await page.getByRole('button', { name: '同意して続ける', exact: true }).click();
    }
    await page.locator('.lobby-shortcuts button').first().click();
    await page.locator('[data-time-control="10m"]').click();
    await page.locator('[data-graphics-state="ready"]').waitFor();
    await page.getByRole('button', { name: '2D', exact: true }).click();
    await page.locator('[data-square="e2"]').click();
    await page.locator('[data-square="e7"]').click();
    await page.locator('[data-captured-by="white"] [data-captured-token]').waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.match-history li').length >= 2);
    const history = await page.locator('.match-history ol').textContent();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.locator('[data-graphics-state="ready"]').waitFor();
    // 518 × 272 models a small landscape WebView after native bars/cutout insets.
    for (const [width, height] of [[360,800],[800,360],[518,272],[768,1024],[1024,768],[1280,800],[540,720],[320,640],[360,800]]) {
        await page.setViewportSize({ width, height });
        await page.locator('[data-graphics-state="ready"]').waitFor();
        // CSS-pixel dimensions must match the resized canvas; don't mistake stale pixels for success.
        await page.waitForFunction(() => {
            const canvas = document.querySelector('.board-webgl-layer canvas');
            return canvas && Math.abs(canvas.width / devicePixelRatio - canvas.getBoundingClientRect().width) < 2
                && Math.abs(canvas.height / devicePixelRatio - canvas.getBoundingClientRect().height) < 2;
        });
        await page.locator('[data-testid="match-board"]').evaluate(node => node.scrollIntoView({ block: 'start' }));
        const geometry = await page.evaluate(() => {
            const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
            const layout = document.querySelector('.match-layout');
            return { board: rect('[data-testid="match-board"]'), canvas: rect('.board-webgl-layer canvas'), footer: rect('.match-footer'),
                overflow: layout.scrollWidth > layout.clientWidth + 1,
                captured: document.querySelectorAll('[data-captured-by="white"] [data-captured-candidate]').length };
        });
        assert(!geometry.overflow, `${width}x${height}: horizontal overflow`);
        assert(geometry.canvas.width > 100 && geometry.canvas.height > 100, 'Positive canvas geometry');
        assert(geometry.captured > 0, 'Captured candidates remain available without tapping');
        assert.equal(await page.locator('.match-history ol').textContent(), history, 'Resize must preserve the match');
        assert.equal(await page.locator('.board-3d').getAttribute('data-camera'), 'fixed');
        assert(geometry.footer.top >= 0 && geometry.footer.bottom <= height + 1, 'Actions remain visible');
        if (height <= 360) {
            assert(geometry.board.height <= height - geometry.footer.height - 12, 'Short split window must reserve room for controls');
            assert(geometry.board.top >= 0 && geometry.board.bottom <= geometry.footer.top + 1, 'Whole board can be scrolled above the footer');
        }
        await page.screenshot({ path: resolve(output, `board-${width}x${height}.png`) });
        results.push({ width, height, passed: true, geometry });
        console.log(`PASS resize ${width}x${height}`);
    }
    assert.deepEqual(errors, []);
} catch (error) {
    console.error(error);
    if (page) {
        console.error((await page.locator('body').innerText()).slice(0, 1600));
        await page.screenshot({ path: resolve(output, 'failed-state.png') });
    }
    process.exitCode = 1;
} finally {
    await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
    await browser.close();
}
