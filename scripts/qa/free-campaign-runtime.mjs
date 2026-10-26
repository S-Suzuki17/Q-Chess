// Real 100-tile components and CPU worker; only identity/progress/ad transport is synthetic.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { startMotionFixture } from './crown-motion-server.mjs';
const output = resolve('build/free-runtime-latency/campaign');
await mkdir(output, { recursive: true });
const { server, base } = await startMotionFixture();
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
try {
    for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
        const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
        await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
        await context.addInitScript(() => {
            localStorage.setItem('qchess_is2DView', 'true');
            localStorage.setItem('qg_sound_config', JSON.stringify({ masterMute: true, bgmVolume: 0, seVolume: 0 }));
        });
        const page = await context.newPage(); const errors = [];
        page.setDefaultTimeout(20000);
        page.on('pageerror', error => errors.push(error.message));
        try {
            await page.goto(`${base}/?view=circuit&lang=ja&cleared=0`);
            await page.getByRole('button', { name: '挑戦する', exact: true }).click();
            const skip = page.locator('.crown-entry-skip');
            if (await skip.isVisible()) await skip.click();
            await page.locator('.crown-match-intro').waitFor({ state: 'detached' });
            await page.locator('[data-square="e2"]').click();
            await page.locator('[data-square="d2"]').click();
            assert.equal(await page.getByTestId('selected-square').textContent(), 'd2');
            await page.locator('[data-square="e2"]').click();
            assert.equal(await page.getByTestId('selected-square').textContent(), 'e2');
            assert.equal(await page.locator('.match-history li').count(), 0, 'Selection must not submit a move');
            await page.locator('[data-square="e7"]').click();
            await page.waitForFunction(() => document.querySelectorAll('.match-history li').length >= 2);
            assert.equal(await page.locator('.match-retry').count(), 0, 'CPU search must not fail');
            assert.deepEqual(errors, []);
            await page.screenshot({ path: resolve(output, `campaign-${viewport.width}.png`) });
            results.push({ viewport, passed: true, checks: ['100-tile entry', 'one-click friendly selection', 'selection does not move', 'legal human capture', 'CPU reply', 'no retry error'] });
        } catch (error) {
            console.error(JSON.stringify({ errors, body: (await page.locator('body').innerText()).slice(0, 1500) }));
            throw error;
        } finally { await context.close(); }
    }
} finally {
    await browser.close(); await server.close();
    await writeFile(resolve(output, 'result.json'), JSON.stringify({ measuredAt: new Date().toISOString(), syntheticAccountTransport: true,
        actualDevice: false, results }, null, 2) + '\n');
}
console.log(JSON.stringify(results));
