import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { resolve, sep, extname } from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = resolve('out');
const artifacts = resolve('scratch/deduction-practice-qa-results');
await mkdir(artifacts, { recursive: true });

const mime = { 
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', 
    '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', 
    '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.txt': 'text/plain',
    '.json': 'application/json'
};

const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    if (!pathname.endsWith('/') && !extname(pathname)) { 
        res.writeHead(308, { Location: pathname + '/' }).end(); 
        return; 
    }
    const file = resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + sep)) { 
        res.writeHead(403).end(); 
        return; 
    }
    try { 
        res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); 
        res.end(await readFile(file)); 
    } catch { 
        res.writeHead(404).end(); 
    }
});

await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ 
    headless: true, 
    ...(process.env.QG_TEST_CHROMIUM ? { executablePath: process.env.QG_TEST_CHROMIUM } : {}) 
});

const TEST_CONFIGS = [
    { width: 1280, height: 720, lang: 'ja', name: 'pc-ja-1280' },
    { width: 375, height: 667, lang: 'en', name: 'mobile-en-375' },
    { width: 320, height: 568, lang: 'ja', name: 'small-ja-320' },
    { width: 844, height: 390, lang: 'de', name: 'landscape-de-844' },
    { width: 375, height: 667, lang: 'ta', textScale200: true, name: 'mobile-ta-375-zoom200' },
];

const results = [];

try {
    for (const conf of TEST_CONFIGS) {
        console.log(`Running test: ${conf.name} (${conf.lang}, ${conf.width}x${conf.height})...`);
        const context = await browser.newContext({
            viewport: { width: conf.width, height: conf.height },
            locale: conf.lang === 'ja' ? 'ja-JP' : 'en-US',
            reducedMotion: 'reduce',
        });

        // Block external requests and models
        await context.routeWebSocket('**/*', socket => socket.close());
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.pathname.endsWith('.glb')) { return route.abort(); }
            return url.origin === origin ? route.continue() : route.fulfill({ status: 503, json: { code: 'QA_EXTERNAL_BLOCKED' } });
        });

        const page = await context.newPage();

        try {
            await page.addInitScript(({ lang, textScale200 }) => {
                localStorage.setItem('qg_language', lang);
                if (textScale200) {
                    document.documentElement.style.fontSize = '200%';
                }
            }, { lang: conf.lang, textScale200: !!conf.textScale200 });

            await page.goto(origin, { waitUntil: 'domcontentloaded' });

            // Wait for hydration to complete by ensuring interactive components are mounted
            const guestBtn = page.locator('.title-play');
            await guestBtn.waitFor({ state: 'visible' });
            await page.waitForTimeout(500); // Allow hydration event listeners to attach
            await guestBtn.click();

            // Wait for lobby
            await page.locator('.lobby-studio').waitFor({ timeout: 15000 });

            // Open tutorial from lobby bottom actions using dedicated data attribute
            const tutBtn = page.locator('[data-open-tutorial]');
            await tutBtn.waitFor();
            await tutBtn.click();

            const tutorial = page.locator('.interactive-tutorial [role="dialog"]');
            await tutorial.waitFor();

            // Check Qube teacher
            assert.equal(await tutorial.locator('[data-qube-teacher]').count(), 1, 'Qube teacher must be present');
            assert.equal(await tutorial.locator('[data-qube-speaker]').innerText(), 'QUBE', 'Qube speaker label');

            // 1. Verify Demo Review Button exists in Step 0
            const reviewBtn = tutorial.locator('[data-tutorial-review-demo]');
            assert.ok(await reviewBtn.isVisible(), 'Review demo button visible');
            await reviewBtn.click();

            // Wait for demo feedback message with custom selector
            const statusBox = tutorial.locator('[data-tutorial-status]');
            await statusBox.waitFor();
            assert.ok((await statusBox.innerText()).length > 0, 'Demo status message exists');
            await page.screenshot({ path: resolve(artifacts, `${conf.name}-demo.png`), fullPage: false });

            // Wait for demo to reset back to practice
            await page.waitForTimeout(700);

            // 2. Test Invalid click (Error recovery test)
            const a1 = tutorial.locator('.board-render-fallback').getByRole('button', { name: 'a1', exact: true });
            if (await a1.isVisible()) {
                await a1.click();
                // Should stay in step 0 after invalid click
                assert.ok(await tutorial.locator('[data-tutorial-step="0"]').isVisible(), 'Stays in step 0 after invalid click');
            }

            // 3. Test Reset Button
            const resetBtn = tutorial.locator('[data-tutorial-reset]');
            assert.ok(await resetBtn.isVisible(), 'Reset button visible');
            await resetBtn.click();

            // 4. Perform complete 12 steps with Practice & Constraint validation
            const squares = { 0: 'e2', 1: 'h5', 3: 'h7', 4: 'h5', 6: 'e1', 7: 'f3', 9: 'h5', 10: 'f3' };
            for (let step = 0; step < 12; step++) {
                await tutorial.locator(`[data-tutorial-step="${step}"]`).waitFor();
                const explanation = await tutorial.locator('[data-qube-explanation]').innerText();
                assert.ok(explanation.length > 5, `Step ${step} has non-empty instruction`);

                if (step === 1 && conf.name === 'pc-ja-1280') {
                    await page.screenshot({ path: resolve(artifacts, `${conf.name}-practice-step1.png`), fullPage: false });
                }

                if (squares[step]) {
                    const square = tutorial.locator('.board-render-fallback').getByRole('button', { name: squares[step], exact: true });
                    await square.focus();
                    await page.keyboard.press('Enter');
                } else {
                    if (step === 11) {
                        // Check Step 11 Piece Count Constraint Highlight
                        const constraintBanner = tutorial.locator('[data-tutorial-constraint-banner]');
                        assert.ok(await constraintBanner.isVisible(), 'Piece count constraint banner displayed at step 11');
                        await page.screenshot({ path: resolve(artifacts, `${conf.name}-step11-constraint.png`), fullPage: false });
                    }
                    await tutorial.locator('[data-tutorial-next]').click();
                }
            }

            // Tutorial dialog should be closed after step 11 Next click
            await tutorial.waitFor({ state: 'detached' });

            // 5. Test Escape key close & focus restoration
            await tutBtn.focus();
            await tutBtn.click();
            await tutorial.waitFor();
            await page.keyboard.press('Escape');
            await tutorial.waitFor({ state: 'detached' });

            // Verify focus returns to lobby
            const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
            assert.ok(['BUTTON', 'BODY'].includes(focusedTag), `Focus restored safely: ${focusedTag}`);

            // Take screenshot
            await page.screenshot({ path: resolve(artifacts, `${conf.name}.png`), fullPage: false });

            results.push({ name: conf.name, passed: true });
            console.log(`PASSED: ${conf.name}`);
        } catch (err) {
            console.error(`FAILED: ${conf.name}:`, err);
            await page.screenshot({ path: resolve(artifacts, `fail-${conf.name}.png`) });
            throw err;
        } finally {
            await context.close();
        }
    }

    await writeFile(resolve(artifacts, 'summary.json'), JSON.stringify({ passed: results.length, total: TEST_CONFIGS.length, results }, null, 2) + '\n');
    console.log(`ALL ${results.length} / ${TEST_CONFIGS.length} TESTS PASSED!`);
} finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
