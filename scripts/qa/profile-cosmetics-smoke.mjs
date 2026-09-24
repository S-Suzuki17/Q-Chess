// Local-only isolated fixtures. Does not authenticate, upload, or write to a service.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base=process.argv[2]??'http://127.0.0.1:3100';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Local fixtures only');
const output=resolve('../../outputs/profile-cosmetics');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
try{
    for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:430,height:932},{width:360,height:800},{width:320,height:720}]){
        const context=await browser.newContext({viewport,reducedMotion:'reduce'});
        await context.route('**/*',async route=>{
            const request=route.request(),url=new URL(request.url());
            if(request.method()!=='GET')return route.abort();
            if(url.origin===new URL(base).origin)return route.continue();
            if(url.pathname==='/rest/v1/profiles')return route.fulfill({json:{id:'badge-qa',name:'Badge QA',avatar_url:`${base}/icon.jpg`,rating_10m:1800,rating_3m:2250,rating_10s:1100}});
            if(url.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});
            return route.abort();
        });
        await context.addInitScript(()=>{
            localStorage.setItem('qg_language','ja');
            localStorage.setItem('qg_last_user',JSON.stringify({id:'badge-qa',name:'Badge QA',type:'registered'}));
            localStorage.setItem('qg_sound_config',JSON.stringify({bgmVolume:0,seVolume:0,masterMute:true}));
            localStorage.setItem('qg_campaign_v1',JSON.stringify({version:2,stars:{},ascensions:[],stageStars:Array(100).fill(3),board:'standard',piece:'standard',effect:'standard',music:'standard',avatar:'avatar-frame-15'}));
        });
        const page=await context.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.goto(base);
        await page.getByRole('button',{name:'⚙️ 設定',exact:true}).click();
        await page.locator('[data-settings-panel="account"]').click();
        const panel=page.locator('.profile-cosmetics');
        await panel.locator('[data-current-badge="bishop"]').waitFor();
        await panel.locator('[data-badge-renderer="webgl"]').waitFor({timeout:15000});
        await panel.locator('[data-avatar-frame="avatar-frame-15"]').waitFor();
        await panel.locator('.account-avatar-portrait img').evaluate(async img=>{await img.decode();});
        const save=await page.evaluate(()=>localStorage.getItem('qg_campaign_v1'));
        for(const id of ['pawn','knight','bishop','rook','queen','king']){
            await panel.locator(`[data-preview-badge="${id}"]`).click();
            await panel.locator(`[data-badge-id="${id}"]`).waitFor();
            assert.equal(await panel.locator('canvas').count(),1);
            assert.equal(await panel.locator('[data-current-badge="bishop"]').count(),1,'Preview must not replace actual rank');
            await panel.locator('.profile-insignia-stage').scrollIntoViewIfNeeded();
            await panel.locator('.profile-insignia-stage').screenshot({path:resolve(output,`${id}-${viewport.width}.png`)});
        }
        assert.equal(await page.evaluate(()=>localStorage.getItem('qg_campaign_v1')),save);
        await panel.locator('select').selectOption('3m');
        await panel.locator('[data-current-badge="queen"]').waitFor();
        await panel.locator('select').selectOption('10s');
        assert.equal(await panel.locator('[data-current-badge="none"]').count(),1);
        assert.equal(await panel.locator('canvas').count(),0);
        await panel.locator('[data-preview-badge="king"]').click();
        await panel.locator('[data-badge-renderer="webgl"]').waitFor({timeout:15000});
        assert(await panel.evaluate(node=>node.scrollWidth<=node.clientWidth+1));
        const photo=await panel.locator('.account-avatar-portrait').boundingBox();
        const badge=await panel.locator('.profile-badge-viewer').boundingBox();
        const overlapWidth=Math.min(photo.x+photo.width,badge.x+badge.width)-Math.max(photo.x,badge.x);
        const overlapHeight=Math.min(photo.y+photo.height,badge.y+badge.height)-Math.max(photo.y,badge.y);
        assert(overlapWidth<=0||overlapHeight<=0,`Portrait overlaps badge at ${viewport.width}px`);
        const aura=await panel.locator('.account-avatar-aura').boundingBox();
        const auraOverlapWidth=Math.min(aura.x+aura.width,badge.x+badge.width)-Math.max(aura.x,badge.x);
        const auraOverlapHeight=Math.min(aura.y+aura.height,badge.y+badge.height)-Math.max(aura.y,badge.y);
        assert(auraOverlapWidth<=0||auraOverlapHeight<=0,`Frame/aura overlaps badge at ${viewport.width}px`);
        const stage=await panel.locator('.profile-insignia-stage').boundingBox();
        assert(badge.x>=stage.x&&badge.x+badge.width<=stage.x+stage.width+1,'Badge must fit in its stage');
        await panel.locator('canvas').evaluate(canvas=>canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
        await panel.locator('[data-badge-renderer="fallback"]').waitFor();
        assert.equal(await panel.locator('canvas').count(),0);
        assert.equal(await panel.locator('.profile-badge-fallback svg').count(),1);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.profile-cosmetics').count(),0);
        assert.equal(await page.locator('.profile-badge-canvas canvas').count(),0);
        assert.deepEqual(errors,[]);
        results.push({viewport,pass:true,sixPreviews:true,ratingControls:true,saveUnchanged:true,contextLossFallback:true,portraitAndAuraUnobstructed:true});
        await context.close();
    }
}catch(error){
    results.push({pass:false,error:error.message});
    throw error;
}finally{
    await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));
    await browser.close();
}
