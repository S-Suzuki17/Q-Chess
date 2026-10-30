// Real exported app, local guest practice; never contacts production APIs.
// Usage: node scripts/qa/measure-board-input.mjs <baseline-export> <candidate-export> [output-directory]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { OrthographicCamera, Vector3 } from 'three';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [resolve('server')] }));
const output = resolve(process.argv[4] || 'build/free-runtime-latency/input');
await mkdir(output, { recursive: true });
await build({ entryPoints: ['src/components/boardPresentation.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: resolve(output, 'board-presentation.cjs') });
const { boardCamera } = require(resolve(output, 'board-presentation.cjs'));
const roots = { before: resolve(process.argv[2]), after: resolve(process.argv[3]) };
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary' };
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
try {
    for (const [variant, root] of Object.entries(roots)) {
        const server = createServer(async (request, response) => {
            const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
            const file = resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
            if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
            try { response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); response.end(await readFile(file)); }
            catch { response.writeHead(404).end(); }
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        try {
            for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
                for (const view of ['2D', '3D']) {
                    const touch = viewport.width < 500;
                    const context = await browser.newContext({ viewport, reducedMotion: 'no-preference', hasTouch: touch, isMobile: touch });
                    const errors = [];
                    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
                    await context.addInitScript(view => {
                        localStorage.setItem('qg_language', 'ja');
                        localStorage.setItem('qchess_is2DView', String(view === '2D'));
                        localStorage.setItem('qg_sound_config', JSON.stringify({ masterMute: true, bgmVolume: 0, seVolume: 0 }));
                    }, view);
                    const page = await context.newPage(); page.setDefaultTimeout(20000);
                    page.on('pageerror', error => errors.push(error.message));
                    try {
                        await page.goto(origin);
                        await page.getByRole('button', { name: 'CPUで練習', exact: true }).click();
                        await page.locator('.match-intro').waitFor({ state: 'detached' });
                        await page.getByRole('button', { name: view, exact: true }).click();
                        if (view === '3D') await page.locator('[data-graphics-state="ready"]').waitFor();
                        else await page.locator('[data-square="e2"]').waitFor();
                        const clickSquare = async square => {
                            if (view === '2D') {
                                const cell = page.locator(`[data-square="${square}"]`);
                                return touch ? cell.tap() : cell.click();
                            }
                            const canvas = await page.locator('.board-webgl-layer canvas').boundingBox();
                            assert(canvas);
                            const setup = boardCamera(canvas.width, canvas.height);
                            const camera = new OrthographicCamera(-canvas.width / 2, canvas.width / 2, canvas.height / 2, -canvas.height / 2, .1, 100);
                            camera.position.set(...setup.position); camera.zoom = setup.zoom; camera.lookAt(0, 0, 0);
                            camera.updateProjectionMatrix(); camera.updateMatrixWorld();
                            const point = new Vector3(square.charCodeAt(0) - 97 - 3.5, .35, 8 - Number(square[1]) - 3.5).project(camera);
                            const x = canvas.x + (point.x + 1) * canvas.width / 2, y = canvas.y + (1 - point.y) * canvas.height / 2;
                            await (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
                        };
                        const measure = async (square, move = false) => {
                            await page.evaluate(({ square, move }) => {
                                window.__inputResult = null;
                                let start, observed = false;
                                const count = document.querySelectorAll('.match-history li').length;
                                const observer = new MutationObserver(() => {
                                    if (start === undefined || observed) return;
                                    const ready = move ? document.querySelectorAll('.match-history li').length > count
                                        : document.querySelector('[data-testid="selected-square"]')?.textContent?.trim() === square;
                                    if (!ready) return;
                                    observed = true; observer.disconnect(); clearTimeout(timeout);
                                    const domMs = performance.now() - start;
                                    requestAnimationFrame(() => requestAnimationFrame(() => {
                                        window.__inputResult = { domMs, twoFrameBoundaryMs: performance.now() - start };
                                    }));
                                });
                                observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
                                const down = () => { start = performance.now(); };
                                document.addEventListener('pointerdown', down, { capture: true, once: true });
                                const timeout = setTimeout(() => {
                                    observer.disconnect(); document.removeEventListener('pointerdown', down, true);
                                    window.__inputResult = { error: 'Input was not reflected within 5 seconds' };
                                }, 5000);
                            }, { square, move });
                            await clickSquare(square);
                            await page.waitForFunction(() => window.__inputResult !== null);
                            const value = await page.evaluate(() => window.__inputResult);
                            assert(!value.error, value.error);
                            return value;
                        };
                        const selections = [];
                        for (let sample = 0; sample < 5; sample++) {
                            selections.push(await measure('e2'));
                            await clickSquare('e2');
                            await page.waitForFunction(() => document.querySelector('[data-testid="selected-square"]')?.textContent?.trim() === '—');
                        }
                        await measure('e2');
                        await clickSquare('d2');
                        const switched = (await page.locator('[data-testid="selected-square"]').textContent()) === 'd2';
                        if (variant === 'after') assert(switched, 'Friendly-piece selection must switch with one click');
                        if (switched) await clickSquare('d2');
                        await measure('e2');
                        const move = await measure('e7', true);
                        await clickSquare('h2');
                        const selectedDuringCpu = await page.locator('[data-testid="selected-square"]').innerText();
                        await page.waitForFunction(() => document.querySelectorAll('.match-history li').length >= 2);
                        const selectedAfterCpu = await page.locator('[data-testid="selected-square"]').innerText();
                        let nextMove = null;
                        if (variant === 'after') {
                            assert.equal(selectedDuringCpu, 'h2');
                            assert.equal(selectedAfterCpu, 'h2', 'CPU reply must retain the first friendly selection');
                            nextMove = await measure('h4', true);
                        }
                        assert.deepEqual(errors, []);
                        const gpu = view === '3D' ? await page.locator('canvas').evaluate(canvas => {
                            const gl = canvas.getContext('webgl2'), ext = gl?.getExtension('WEBGL_debug_renderer_info');
                            return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
                        }) : null;
                        const result = { variant, viewport, view, selections, move, friendlyPieceSwitchesInOneClick: switched, cpuReplied: true, selectedDuringCpu, selectedAfterCpu, nextMove, gpu, errors };
                        results.push(result); console.log(JSON.stringify(result));
                    } catch (error) {
                        console.error((await page.locator('body').innerText()).slice(0, 1400));
                        await page.screenshot({ path: resolve(output, `${variant}-${view}-${viewport.width}-failure.png`) });
                        throw error;
                    } finally { await context.close(); }
                }
            }
        } finally { await new Promise(resolve => server.close(resolve)); }
    }
} finally {
    await browser.close();
    await writeFile(resolve(output, 'result.json'), JSON.stringify({ measuredAt: new Date().toISOString(),
        note: 'Local Chrome, synthetic viewport and guest practice. DOM/two animation frame timing is not a physical-display or Android measurement.', results }, null, 2) + '\n');
}
