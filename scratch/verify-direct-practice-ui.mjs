import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = 3005;
const OUT_DIR = path.resolve('out');
const RESULT_DIR = path.resolve('scratch/practice-ui-results');

if (!fs.existsSync(RESULT_DIR)) {
    fs.mkdirSync(RESULT_DIR, { recursive: true });
}

// 簡易静的ファイルサーバー
function startServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let reqPath = req.url.split('?')[0];
            if (reqPath === '/') reqPath = '/index.html';
            let filePath = path.join(OUT_DIR, reqPath);
            if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
                filePath = filePath + '.html';
            }
            if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
                filePath = path.join(filePath, 'index.html');
            }

            if (!fs.existsSync(filePath)) {
                res.writeHead(404);
                res.end('Not Found');
                return;
            }

            const ext = path.extname(filePath);
            const mimeTypes = {
                '.html': 'text/html; charset=utf-8',
                '.js': 'application/javascript',
                '.mjs': 'application/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.svg': 'image/svg+xml',
                '.webp': 'image/webp',
                '.ico': 'image/x-icon',
                '.woff2': 'font/woff2',
            };
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            fs.createReadStream(filePath).pipe(res);
        });

        server.listen(PORT, () => {
            console.log(`Server listening on http://localhost:${PORT}`);
            resolve(server);
        });
    });
}

async function runVerification() {
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });

    const scenarios = [
        { name: 'pc-ja', width: 1280, height: 720, lang: 'ja', zoom: 1 },
        { name: 'pc-en', width: 1280, height: 720, lang: 'en', zoom: 1 },
        { name: 'mobile-ja', width: 375, height: 667, lang: 'ja', zoom: 1 },
        { name: 'mobile-small-ja', width: 320, height: 568, lang: 'ja', zoom: 1 },
        { name: 'mobile-de', width: 375, height: 667, lang: 'de', zoom: 1 },
        { name: 'mobile-small-ta', width: 320, height: 568, lang: 'ta', zoom: 1 },
        { name: 'mobile-zoom200-ja', width: 375, height: 667, lang: 'ja', zoom: 2 },
    ];

    const results = [];

    for (const s of scenarios) {
        const context = await browser.newContext({
            viewport: { width: s.width, height: s.height },
            deviceScaleFactor: 1,
        });
        const page = await context.newPage();

        // 言語設定をlocalStorageに注入
        await page.addInitScript((targetLang) => {
            localStorage.setItem('qg_language', targetLang);
            // 既存のログイン状態をクリアしてタイトル画面を確実に表示
            localStorage.removeItem('qg_last_user');
            localStorage.removeItem('qg_ranked_session');
        }, s.lang);

        await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });

        if (s.zoom !== 1) {
            await page.evaluate((z) => { document.body.style.zoom = z; }, s.zoom);
        }

        const practiceBtn = page.locator('.title-practice-direct');
        const exists = await practiceBtn.isVisible();
        const text = exists ? await practiceBtn.innerText() : '';
        const playBtnExists = await page.locator('.title-play').isVisible();
        const rulesBtnExists = await page.locator('.title-tutorial').isVisible();

        // バウンディングボックスチェック（はみ出し確認）
        const box = exists ? await practiceBtn.boundingBox() : null;
        const validLayout = box && box.width > 0 && box.height > 0 && box.x >= 0 && (box.x + box.width <= s.width * 1.05);

        const shotPath = path.join(RESULT_DIR, `${s.name}.png`);
        await page.screenshot({ path: shotPath });

        results.push({
            scenario: s.name,
            lang: s.lang,
            viewport: `${s.width}x${s.height}`,
            zoom: s.zoom,
            practiceButtonVisible: exists,
            practiceButtonText: text.replace(/\n/g, ' | '),
            playButtonVisible: playBtnExists,
            rulesButtonVisible: rulesBtnExists,
            validLayout: !!validLayout,
            screenshot: shotPath,
        });

        await context.close();
    }

    // クリック動作の検証: ボタン押下で即座にCPU対局（playing）に直行するか
    console.log('Testing click action...');
    const clickContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const clickPage = await clickContext.newPage();
    await clickPage.addInitScript(() => {
        localStorage.setItem('qg_language', 'ja');
        localStorage.removeItem('qg_last_user');
    });
    await clickPage.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });

    const btn = clickPage.locator('.title-practice-direct');
    await btn.click();
    await clickPage.waitForTimeout(1000);

    const mainScreen = await clickPage.locator('main[data-screen]').getAttribute('data-screen');
    console.log(`Screen after direct practice click: ${mainScreen}`);

    const playShotPath = path.join(RESULT_DIR, 'click-practice-transition.png');
    await clickPage.screenshot({ path: playShotPath });

    const clickSuccess = mainScreen === 'playing';

    await clickContext.close();
    await browser.close();
    server.close();

    const summaryPath = path.join(RESULT_DIR, 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify({ results, clickSuccess, mainScreen }, null, 2), 'utf-8');

    console.log('\n--- VERIFICATION SUMMARY ---');
    console.log(`Click Transition to Playing: ${clickSuccess ? 'PASS' : 'FAIL'} (screen=${mainScreen})`);
    for (const r of results) {
        console.log(`Scenario [${r.scenario}]: Button=${r.practiceButtonVisible}, ValidLayout=${r.validLayout}, Text="${r.practiceButtonText}"`);
    }
}

runVerification().catch(err => {
    console.error('Verification error:', err);
    process.exit(1);
});
