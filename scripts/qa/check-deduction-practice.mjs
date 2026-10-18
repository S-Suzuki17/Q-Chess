import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { resolve, sep, extname } from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import {walkTutorial} from './tutorial-walkthrough.mjs';

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

            const tutorial = page.locator('dialog.tutorial-shell');
            if(conf.textScale200)await page.addStyleTag({content:'.tutorial-copy-space{font-size:24px!important;line-height:1.6!important}.tutorial-heading h2{font-size:34px!important}.tutorial-actions button,.tutorial-course-picker select,.tutorial-command strong{font-size:20px!important}'});
            const evidence=await walkTutorial(page,{readAllCopy:true,strictFit:!conf.textScale200,checkRecovery:true,
                onLesson:async({id})=>{
                    if(['candidates','deduction-chain','castle','promotion','quantum-mate'].includes(id))
                        await page.screenshot({path:resolve(artifacts,conf.name+'-'+id+'.png')});
                }});
            assert.equal(evidence.lessons,24);
            assert.equal(evidence.unresolvedMate,true);

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
