import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

// Local-only acceptance checks. No production accounts, writes or deployments.
const baseURL = process.argv[2] || 'http://127.0.0.1:3100';
assert(['127.0.0.1','localhost'].includes(new URL(baseURL).hostname), 'Use a local server');
const output = resolve(process.argv[3] || '../../outputs/quality-pass-sep15/browser');
await mkdir(output, {recursive:true});
const languages = ['en','ja','zh','ru','fr','de','es','tr','pl','hi','pt','ta'];
const languageFilter = process.argv.find(value => value.startsWith('--language='))?.split('=')[1];
assert(!languageFilter || languages.includes(languageFilter), 'Unknown language filter');
const browser = await chromium.launch({headless:true});
const results = [];

try {
    for (const [index, lang] of languages.entries()) {
        if (languageFilter && lang !== languageFilter) continue;
        const viewport = index === 0 ? {width:1440,height:960}
            : index % 2 ? {width:360,height:800} : {width:412,height:915};
        const context = await browser.newContext({viewport, reducedMotion:'reduce'});
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            return url.origin === new URL(baseURL).origin ? route.continue() : route.abort();
        });
        await context.addInitScript(language => {
            localStorage.setItem('qg_language', language);
            localStorage.setItem('qg_sound_config', JSON.stringify({bgmVolume:0,seVolume:0,masterMute:true}));
            localStorage.setItem('qchess_pieceMotion','true');
        }, lang);
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(baseURL);
        await page.locator('.title-play').waitFor();
        await page.waitForFunction(language => document.documentElement.lang === language, lang);
        await page.evaluate(() => document.fonts.ready);
        const titleGeometry = await page.evaluate(() => {
            const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
            return {actions:rect('.title-screen-actions'),description:rect('.title-screen-description'),
                overflow:document.querySelector('[data-screen="title"]').scrollWidth > innerWidth};
        });
        assert(!titleGeometry.overflow, `${lang}: title overflow`);
        const {actions:a,description:d} = titleGeometry;
        assert(a.right <= d.left || d.right <= a.left || a.bottom <= d.top || d.bottom <= a.top,
            `${lang}: description overlaps actions`);
        if (['en','ja','ta'].includes(lang)) await page.screenshot({path:resolve(output,`title-${lang}.png`),fullPage:true});
        await page.locator('.title-play').click();
        await page.locator('.lobby-shortcuts button').first().click();
        await page.locator('[data-time-control="10m"]').click();
        assert.equal(await page.getByRole('button',{name:'3D',exact:true}).getAttribute('aria-pressed'),'true', `${lang}: 3D should be the default`);
        await page.locator('[data-graphics-state="ready"]').waitFor();
        assert.equal(await page.locator('.board-3d').getAttribute('data-camera'),'fixed');
        assert.equal(await page.locator('.board-3d').getAttribute('data-piece-motion'),'off');
        assert.equal(await page.locator('[data-graphics-state]').getAttribute('data-render-loop'),'demand');
        assert(await page.locator('.board-scene-tools button').isDisabled());
        const geometry = await page.evaluate(() => {
            const board = document.querySelector('[data-testid="match-board"]').getBoundingClientRect();
            const hint = document.querySelector('.match-hint-action').getBoundingClientRect();
            const canvas = document.querySelector('.board-webgl-layer canvas');
            const layout = document.querySelector('.match-layout');
            return {boardWidth:board.width,canvasWidth:canvas.width,canvasHeight:canvas.height,
                overflow:layout.scrollWidth > layout.clientWidth + 1,
                hintVisible:hint.top >= 0 && hint.bottom <= innerHeight};
        });
        assert(!geometry.overflow, `${lang}: match overflow`);
        assert(geometry.canvasWidth > 0 && geometry.canvasHeight > 0);
        assert(geometry.hintVisible, `${lang}: hint is hidden below the viewport`);
        if (viewport.width < 1000) assert(geometry.boardWidth >= viewport.width - 10);
        await page.screenshot({path:resolve(output,`board-${lang}-${viewport.width}.png`)});

        if (lang === 'ja') {
            // Exercise 2D, legal capture, CPU response, and safe 3D return via actual controls.
            await page.getByRole('button',{name:'2D',exact:true}).click();
            await page.getByRole('button',{name:'e2',exact:true}).click();
            assert.equal(await page.locator('[data-testid="selected-square"]').innerText(),'e2');
            await page.getByRole('button',{name:'e7',exact:true}).click();
            await page.locator('[data-captured-by="white"] [data-captured-token]').waitFor();
            assert(await page.locator('[data-captured-by="white"] [data-captured-candidate]').count() > 0);
            await page.getByRole('button',{name:'3D',exact:true}).click();
            await page.locator('[data-graphics-state="ready"]').waitFor();
            await page.screenshot({path:resolve(output,'capture-ja-360.png')});
            await page.waitForFunction(() => document.querySelectorAll('.match-history li').length >= 2);
            await page.locator('.match-hint-action').click();
            await page.locator('[data-testid="hint-destination"]').waitFor();
            assert(await page.locator('[data-testid="hint-source"]').innerText());
            await page.screenshot({path:resolve(output,'hint-ja-360.png')});
            // Deliberately lose WebGL. The DOM board must remain playable while it recovers.
            await page.evaluate(() => {
                const canvas = document.querySelector('.board-webgl-layer canvas');
                const gl = canvas.getContext('webgl2');
                const extension = gl?.getExtension('WEBGL_lose_context');
                if (!extension) throw new Error('Context-loss testing unavailable');
                window.qgContextExtension = extension;
                extension.loseContext();
            });
            await page.locator('.board-render-fallback .board-2d').waitFor();
            await page.evaluate(() => window.qgContextExtension.restoreContext());
            await page.locator('[data-graphics-state="ready"]').waitFor();
            await page.emulateMedia({reducedMotion:'no-preference'});
            await page.locator('[data-piece-motion="on"]').waitFor();
            assert.equal(await page.locator('[data-graphics-state]').getAttribute('data-render-loop'),'always');
            await page.emulateMedia({reducedMotion:'reduce'});
            await page.locator('[data-piece-motion="off"]').waitFor();
            assert.equal(await page.locator('[data-graphics-state]').getAttribute('data-render-loop'),'demand');
        }
        assert.equal(errors.length,0,`${lang}: ${errors.join('; ')}`);
        results.push({lang,viewport,...geometry,passed:true});
        console.log(`PASS ${lang} ${viewport.width}x${viewport.height}`);
        await context.close();
    }
} finally {
    await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));
    await browser.close();
}
