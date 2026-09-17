import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseURL = process.argv[2] || 'http://127.0.0.1:3100';
assert(['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname), 'Use a local server');
const output = resolve('../../outputs/quality-pass-sep15/campaign');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let currentPage;
try {
    for (const viewport of (process.argv.includes('--desktop-only') ? [{width:1440,height:960}] : [{ width: 1440, height: 960 }, { width: 360, height: 800 }])) {
        const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
        await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
        await context.addInitScript(() => {
            localStorage.setItem('qg_language', 'ja');
            localStorage.setItem('qg_sound_config', JSON.stringify({ bgmVolume: 0, seVolume: 0, masterMute: true }));
        });
        const page = await context.newPage();
        currentPage=page;
        page.setDefaultTimeout(30000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message=>{if(message.type()==='error'&&!/Failed to fetch|net::ERR_FAILED/.test(message.text())) console.error('Browser:',message.text());});
        await page.goto(baseURL);
        await page.locator('.title-play').click();
        await page.locator('.lobby-campaign-action').click();
        await page.locator('.campaign-boss-card .campaign-primary:enabled').waitFor();
        assert.equal(await page.locator('.campaign-round').count(), 4);
        await page.locator('[data-boss="sovereign"]').click();
        assert(await page.locator('.campaign-boss-card .campaign-primary').isDisabled());
        assert(await page.locator('[data-equipment="piece-jade"]').isDisabled());
        await page.locator('[data-boss="nox"]').click();
        assert(await page.locator('[data-equipment="board-standard"]').isEnabled());
        assert(await page.locator('[data-equipment="piece-standard"]').isEnabled());
        assert(await page.locator('.campaign-screen').evaluate(node => node.scrollWidth <= node.clientWidth + 1));
        await page.screenshot({ path: resolve(output, `hub-${viewport.width}.png`), fullPage: true });
        // Real UI: start as Black, let the CPU make White's first move, resign, and retry.
        await page.getByRole('button', { name: '黒・後手', exact: true }).click();
        await page.locator('.campaign-boss-card .campaign-primary').click();
        await page.locator('[data-graphics-state="ready"]').waitFor();
        assert.equal(await page.locator('[data-graphics-state]').getAttribute('data-render-loop'), 'demand');
        assert.equal(await page.getByRole('button', { name: '3D', exact: true }).getAttribute('aria-pressed'), 'true');
        await page.waitForFunction(() => document.querySelectorAll('.match-history li').length >= 1);
        assert((await page.locator('.match-player').first().innerText()).includes('NOX'));
        assert.equal(await page.locator('.board-3d').getAttribute('data-board-finish'), 'standard');
        await page.screenshot({ path: resolve(output, `match-black-${viewport.width}.png`) });
        await page.locator('.match-resign').click();
        await page.getByRole('button', { name: 'リザインする', exact: true }).click();
        await page.locator('dialog.campaign-result[open]').waitFor();
        assert.equal(await page.locator('#campaign-result-title').innerText(), 'YOU LOSE (敗北)...');
        assert.equal(await page.locator('.campaign-reward-earned').count(), 0);
        assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('qg_campaign_v1')).stars), {});
        await page.screenshot({ path: resolve(output, `loss-${viewport.width}.png`) });
        await page.getByRole('button', { name: '再挑戦', exact: true }).click();
        console.log('Rematch clicked');
        await page.locator('[data-graphics-state="ready"]').waitFor();
        assert.equal(await page.locator('dialog.campaign-result').count(), 0);
        await page.locator('.match-brand').click();
        await page.getByRole('button', { name: '戻る', exact: true }).click();
        await page.locator('.campaign-screen').waitFor();
        console.log(`PASS fresh campaign / Black / resignation / rematch ${viewport.width}`);

        // Explicit test save fixture, not a claim that a full tournament was won via UI.
        await page.evaluate(() => localStorage.setItem('qg_campaign_v1', JSON.stringify({
            version: 1, stars: { nox: 3, ember: 2, oracle: 1, sovereign: 3 }, board: 'standard', piece: 'standard',
        })));
        await page.reload();
        await page.locator('.lobby-campaign-action').click();
        await page.locator('[data-equipment="piece-jade"]:enabled').waitFor();
        await page.locator('[data-equipment="board-obsidian"]').click();
        await page.locator('[data-equipment="piece-jade"]').click();
        await page.reload();
        await page.locator('.lobby-campaign-action').click();
        await page.locator('[data-equipment="piece-jade"][aria-pressed="true"]').waitFor();
        assert.equal(await page.locator('[data-equipment="board-obsidian"]').getAttribute('aria-pressed'), 'true');
        await page.locator('[data-boss="nox"]').click();
        await page.locator('.campaign-boss-card .campaign-primary').click();
        await page.locator('[data-graphics-state="ready"]').waitFor();
        assert.equal(await page.locator('.board-3d').getAttribute('data-board-finish'), 'obsidian');
        assert.equal(await page.locator('.board-3d').getAttribute('data-piece-finish'), 'jade');
        assert.equal(await page.locator('.board-3d').getAttribute('data-camera'), 'fixed');
        await page.screenshot({ path: resolve(output, `unlocked-fixture-${viewport.width}.png`) });
        assert.deepEqual(errors, []);
        results.push({ viewport, passed: true, scenarios: ['fresh-locks', 'default-3d', 'black-cpu-first', 'resign', 'retry', 'saved-equipment-fixture'] });
        console.log(`PASS campaign ${viewport.width}x${viewport.height}`);
        await context.close();
    }
} catch(error) {
    console.error(error);
    if(currentPage&&!currentPage.isClosed()) {
        console.error(await currentPage.evaluate(()=>JSON.stringify({visibility:document.visibilityState,
            surface:document.querySelector('[data-graphics-state]')?.outerHTML.slice(0,500),
            canvas:[...document.querySelectorAll('canvas')].map(node=>({width:node.width,height:node.height,rect:node.getBoundingClientRect().toJSON()})),
            dialogs:document.querySelectorAll('dialog[open]').length})).catch(()=>null));
        await currentPage.screenshot({path:resolve(output,'failure.png'),timeout:5000}).catch(()=>{});
    }
    process.exitCode=1;
} finally {
    await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
    await browser.close();
}
