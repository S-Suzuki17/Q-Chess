// Local-only diagnostic: distinguish DOM readiness, animation scheduling, and GPU capture.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseURL = process.argv[2] || 'http://127.0.0.1:3101';
assert(['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname));
const output = resolve('../../outputs/championship-100/render-probe');
await mkdir(output, { recursive: true });
const result = { steps: [], errors: [], failedRequests: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
await context.addInitScript(() => {
    localStorage.setItem('qg_language', 'ja');
    localStorage.setItem('qg_sound_config', JSON.stringify({ masterMute: true, bgmVolume: 0, seVolume: 0 }));
    window.__renderProbe = { frames: 0, ticks: 0, lastFrame: 0, maxFrameGap: 0, longTasks: [] };
    function frame(time) {
        const probe = window.__renderProbe;
        if (probe.lastFrame) probe.maxFrameGap = Math.max(probe.maxFrameGap, time - probe.lastFrame);
        probe.lastFrame = time;
        probe.frames++;
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    setInterval(() => window.__renderProbe.ticks++, 100);
    new PerformanceObserver(list => {
        window.__renderProbe.longTasks.push(...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })));
        window.__renderProbe.longTasks = window.__renderProbe.longTasks.slice(-20);
    }).observe({ type: 'longtask', buffered: true });
});
const page = await context.newPage();
page.setDefaultTimeout(6000);
page.on('pageerror', error => result.errors.push(error.message));
page.on('response', response => { if (response.status() >= 400) result.failedRequests.push({ url: response.url(), status: response.status() }); });
const cdp = await context.newCDPSession(page);
async function step(name, action) {
    const started = Date.now();
    let timer;
    try {
        const value = await Promise.race([action(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Diagnostic timeout after 7 seconds')), 7000); })]);
        result.steps.push({ name, ms: Date.now() - started, value });
    } catch (error) {
        result.steps.push({ name, ms: Date.now() - started, error: error.message });
    } finally { clearTimeout(timer); }
    console.log(JSON.stringify(result.steps.at(-1)));
}
const sample = () => page.evaluate(() => {
    const surface = document.querySelector('[data-graphics-state]');
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return { ...window.__renderProbe, now: performance.now(), visibility: document.visibilityState,
        state: surface?.getAttribute('data-graphics-state'), rect: canvas?.getBoundingClientRect().toJSON(),
        renderer: debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),
        dialogs: document.querySelectorAll('dialog[open]').length,
        moves: document.querySelectorAll('.match-history li').length };
});
try {
    await page.goto(baseURL);
    await page.locator('.title-play').click();
    await page.locator('.lobby-campaign-action').click();
    await page.getByRole('button', { name: '黒・後手', exact: true }).click();
    await page.locator('.campaign-boss-card .campaign-primary').click();
    await page.waitForFunction(() => document.querySelector('[data-graphics-state]')?.getAttribute('data-graphics-state') === 'ready', null, { polling: 100, timeout: 20000 });
    await step('initial-main-world', sample);
    await step('initial-selector-count', () => page.locator('[data-graphics-state]').count());
    await step('initial-visible', () => page.locator('[data-graphics-state]').isVisible());
    await step('initial-locator-evaluate', () => page.locator('[data-graphics-state]').evaluate(node => node.getBoundingClientRect().toJSON()));
    await step('initial-after-selectors', sample);
    await step('initial-cdp-capture', async () => {
        const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
        await writeFile(resolve(output, 'initial.png'), Buffer.from(image.data, 'base64'));
        return image.data.length;
    });
    await page.locator('.match-resign').click();
    await page.getByRole('button', { name: '投了する', exact: true }).click();
    await page.locator('dialog.campaign-result[open]').waitFor();
    await page.getByRole('button', { name: '再挑戦', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-graphics-state]')?.getAttribute('data-graphics-state') === 'ready', null, { polling: 100, timeout: 20000 });
    await step('retry-main-world', sample);
    await step('retry-locator-evaluate', () => page.locator('[data-graphics-state]').evaluate(node => node.getBoundingClientRect().toJSON()));
    await step('retry-standard-screenshot', () => page.screenshot({ path: resolve(output, 'retry.png'), timeout: 6000 }).then(buffer => buffer.length));
    await step('retry-final', sample);
} catch (error) {
    result.failure = error.message;
    console.error(error);
    await step('failure-main-world', sample);
} finally {
    if (result.failure || result.steps.some(item => item.error)) process.exitCode = 1;
    await writeFile(resolve(output, 'results.json'), JSON.stringify(result, null, 2));
    await browser.close();
}
