import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const baseURL=process.argv[2]||'http://127.0.0.1:3100';
assert(['localhost','127.0.0.1'].includes(new URL(baseURL).hostname));
const output=resolve('../../outputs/championship-100/verification');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
let page;
try {
    for(const viewport of [{width:1440,height:960},{width:360,height:800}]) {
        const context=await browser.newContext({viewport,reducedMotion:'no-preference'});
        await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(baseURL).origin?route.continue():route.abort());
        // Isolated local fixture exercises all unlocks; never written to the public app.
        await context.addInitScript(()=>{
            localStorage.setItem('qg_language','ja');
            localStorage.setItem('qg_sound_config',JSON.stringify({bgmVolume:0,seVolume:0,masterMute:true}));
            if(!localStorage.getItem('qg_campaign_v1')) {
                const stars={nox:3,ember:3,oracle:3,sovereign:3};
                localStorage.setItem('qg_campaign_v1',JSON.stringify({version:2,stars,ascensions:Array.from({length:99},()=>stars),board:'standard',piece:'jade',effect:'standard'}));
            }
        });
        page=await context.newPage();page.setDefaultTimeout(25000);
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.goto(baseURL);await page.locator('.title-play').click();
        await page.locator('.lobby-campaign-action').click();
        await page.locator('.campaign-screen[data-campaign-lap="101"]').waitFor();
        assert(await page.locator('.campaign-screen').evaluate(node=>node.scrollWidth<=node.clientWidth+1));
        const ids=new Set();
        for(let grade=1;grade<=10;grade++) {
            await page.locator('.championship-collection select').selectOption(String(grade));
            for(const id of await page.locator('[data-championship-reward]').evaluateAll(nodes=>nodes.map(node=>node.dataset.championshipReward))) ids.add(id);
            assert.equal(await page.locator('[data-equip-reward]:disabled').count(),0);
        }
        assert.equal(ids.size,100);
        await page.locator('.championship-collection').scrollIntoViewIfNeeded();
        await page.screenshot({path:resolve(output,`collection-${viewport.width}.png`)});
        await page.locator('[data-equip-reward="champion-board-100"]').click();
        await page.locator('[data-equip-reward="champion-effect-099"]').click();
        await page.locator('[data-testid="preview-victory-effect"]').click();
        await page.locator('[data-victory-effect="champion-effect-099"]').waitFor();
        assert.equal(await page.locator('.victory-fx i').count(),52);
        await page.screenshot({path:resolve(output,`effect-${viewport.width}.png`)});
        await page.locator('[data-victory-effect]').waitFor({state:'detached'});
        await page.reload();await page.locator('.lobby-campaign-action').click();
        await page.locator('.campaign-screen[data-campaign-lap="101"]').waitFor();
        const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('qg_campaign_v1')));
        assert.equal(saved.board,'champion-board-100');assert.equal(saved.effect,'champion-effect-099');
        await page.locator('[data-boss="nox"]').click();
        await page.locator('.campaign-boss-card .campaign-primary').click();
        await page.locator('[data-graphics-state="ready"]').waitFor();
        assert.equal(await page.locator('.board-3d').getAttribute('data-board-finish'),'champion-board-100');
        assert.equal(await page.locator('.board-3d').getAttribute('data-camera'),'fixed');
        assert.equal(await page.getByRole('button',{name:'3D',exact:true}).getAttribute('aria-pressed'),'true');
        await page.screenshot({path:resolve(output,`imperial-x-${viewport.width}.png`)});
        await page.getByRole('button',{name:'2D',exact:true}).click();
        await page.locator('.board-2d').waitFor();
        await page.getByRole('button',{name:'3D',exact:true}).click();
        await page.locator('[data-graphics-state="ready"]').waitFor();
        assert.deepEqual(errors,[]);
        results.push({viewport,passed:true,rewards:ids.size,saveFixture:true});
        console.log(`PASS 100 rewards + saved equipment + 3D/2D ${viewport.width}`);
        await context.close();
    }
} catch(error) {
    console.error(error);
    if(page&&!page.isClosed()) {
        await page.screenshot({path:resolve(output,'failure.png'),timeout:5000}).catch(()=>{});
        console.error(await page.locator('[data-graphics-state]').getAttribute('data-graphics-state',{timeout:1000}).catch(()=>null));
    }
    process.exitCode=1;
} finally {
    await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));
    await browser.close();
}
