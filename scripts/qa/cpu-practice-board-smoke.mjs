import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const base=process.argv[2]??'http://127.0.0.1:3032';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const output=resolve(process.argv[3]??'scratch/cpu-practice-browser');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});const results=[];let lastPage;
try{
    for(const viewport of [{width:1440,height:960},{width:360,height:800}]){
        const context=await browser.newContext({viewport,reducedMotion:'reduce'});
        await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
        await context.addInitScript(()=>{
            localStorage.setItem('qg_language','ja');localStorage.setItem('qchess_is2DView','true');
            localStorage.setItem('qg_sound_config',JSON.stringify({bgmVolume:0,seVolume:0,masterMute:true}));
        });
        const page=await context.newPage();lastPage=page;page.setDefaultTimeout(30000);const errors=[],paidRequests=[];
        page.on('pageerror',error=>errors.push(error.message));
        page.on('request',request=>{if(request.url().includes('/cpu-practice/'))paidRequests.push(request.url());});
        await page.goto(base);await page.locator('.title-play').click();
        await page.getByRole('checkbox').check();
        await page.getByRole('button',{name:'同意して続ける',exact:true}).click();
        await page.locator('.lobby-shortcuts button').first().click();
        await page.locator('[data-time-control="10m"]').click();
        await page.locator('.match-intro').waitFor({state:'detached'});
        await page.getByRole('button',{name:'2D',exact:true}).click();
        await page.getByRole('button',{name:'e2',exact:true}).click();
        await page.locator('[data-testid="selected-square"]').waitFor();
        await page.getByRole('button',{name:'e7',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.match-history li').length>=2);
        await page.locator('.match-hint-action').click();
        await page.locator('[data-testid="hint-destination"]').waitFor();
        assert(await page.locator('[data-testid="hint-source"]').innerText());
        const geometry=await page.evaluate(()=>{
            const layout=document.querySelector('.match-layout'),board=document.querySelector('[data-testid="match-board"]');
            return {overflow:layout.scrollWidth>layout.clientWidth+1,board:board.getBoundingClientRect().toJSON()};
        });
        assert(!geometry.overflow);assert(geometry.board.width>0);assert.deepEqual(paidRequests,[]);assert.deepEqual(errors,[]);
        await page.screenshot({path:resolve(output,`free-practice-hint-${viewport.width}.png`),fullPage:true});
        results.push({viewport,geometry,passed:true,scenarios:['free-practice','human-capture','cpu-response','worker-hint','OFF-no-paid-API']});
        console.log(`PASS free CPU practice/hint ${viewport.width}x${viewport.height}`);await context.close();
    }
}catch(error){console.error(error.message);if(lastPage){console.error((await lastPage.locator('body').innerText()).slice(0,2000));
    await lastPage.screenshot({path:resolve(output,'failed-state.png'),fullPage:true});}process.exitCode=1;}
finally{await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));await browser.close();}
