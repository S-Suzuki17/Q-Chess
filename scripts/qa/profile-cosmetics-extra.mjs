// Local, read-only fixtures. Count actual WebGL draws, not just UI flags.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base=process.argv[2]??'http://127.0.0.1:3101';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Local fixtures only');
const output=resolve('../../outputs/profile-cosmetics');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];

async function fixture({failWebGL=false}={}) {
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
    await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(request.method()!=='GET')return route.abort();
        if(url.origin===new URL(base).origin)return route.continue();
        if(url.pathname==='/rest/v1/profiles')return route.fulfill({json:{id:'badge-qa',name:'Badge QA',rating_10m:1800,rating_3m:2250,rating_10s:1100}});
        if(url.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});
        return route.abort();
    });
    await context.addInitScript(({failWebGL})=>{
        localStorage.setItem('qg_language','ja');
        localStorage.setItem('qg_last_user',JSON.stringify({id:'badge-qa',name:'Badge QA',type:'registered'}));
        localStorage.setItem('qg_sound_config',JSON.stringify({bgmVolume:0,seVolume:0,masterMute:true}));
        const draws=new WeakMap();
        window.__badgeDrawCount=canvas=>draws.get(canvas)??0;
        for(const type of [window.WebGLRenderingContext,window.WebGL2RenderingContext]) {
            if(!type)continue;
            for(const method of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {
                const original=type.prototype[method];
                if(!original)continue;
                type.prototype[method]=function(...args) {
                    draws.set(this.canvas,(draws.get(this.canvas)??0)+1);
                    return original.apply(this,args);
                };
            }
        }
        if(failWebGL) {
            const original=HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext=function(type,...args) {
                return type==='webgl'||type==='webgl2'?null:original.call(this,type,...args);
            };
        }
    },{failWebGL});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);
    await page.getByRole('button',{name:'⚙️ 設定',exact:true}).click();
    await page.locator('[data-settings-panel="account"]').click();
    const panel=page.locator('.profile-cosmetics');
    await panel.locator('[data-current-badge="bishop"]').waitFor();
    return {context,page,panel,errors};
}

async function rendering(page,panel,label,expectedMotion) {
    // Allow pending demand frames to settle, then sample this canvas only.
    await page.waitForTimeout(450);
    const before=await panel.locator('canvas').evaluate(canvas=>window.__badgeDrawCount(canvas));
    await page.waitForTimeout(650);
    const after=await panel.locator('canvas').evaluate(canvas=>window.__badgeDrawCount(canvas));
    const draws=after-before;
    if(expectedMotion)assert(draws>0,`${label}: expected active WebGL draws`);
    else assert.equal(draws,0,`${label}: must stop continuous WebGL draws`);
    results.push({test:label,pass:true,draws});
}

try {
    const failed=await fixture({failWebGL:true});
    await failed.panel.locator('[data-badge-renderer="fallback"]').waitFor({timeout:20000});
    assert.equal(await failed.panel.locator('canvas').count(),0);
    assert.equal(await failed.panel.locator('.profile-badge-fallback svg').count(),1);
    await failed.panel.locator('[data-preview-badge="king"]').click();
    await failed.panel.locator('[data-badge-id="king"][data-badge-renderer="fallback"]').waitFor();
    assert.equal(await failed.panel.locator('[data-current-badge="bishop"]').count(),1);
    assert.deepEqual(failed.errors,[]);
    results.push({test:'Initialization failure: SVG stays usable, preview does not retry WebGL',pass:true});
    await failed.context.close();

    const {context,page,panel,errors}=await fixture();
    const viewer=panel.locator('.profile-badge-viewer');
    await viewer.locator('canvas').waitFor();
    await panel.locator('[data-badge-renderer="webgl"]').waitFor({timeout:15000});
    await panel.locator('select').focus();
    await page.mouse.move(0,0);
    await page.keyboard.press('Tab');
    assert(await viewer.evaluate(node=>node===document.activeElement),'Tab must focus the 3D viewer');
    assert(await viewer.evaluate(node=>node.matches(':focus-visible')&&getComputedStyle(node).outlineStyle!=='none'),'Keyboard focus must be visible');
    await rendering(page,panel,'Keyboard focus starts motion',true);
    await viewer.hover();
    await page.mouse.move(0,0);
    assert(await viewer.evaluate(node=>node===document.activeElement));
    await rendering(page,panel,'Pointer leave preserves keyboard focus motion',true);
    await viewer.hover();
    await viewer.evaluate(node=>node.blur());
    await rendering(page,panel,'Blur preserves pointer hover motion',true);
    await page.mouse.move(0,0);
    await rendering(page,panel,'No hover or focus: demand rendering',false);

    await viewer.focus();
    await page.emulateMedia({reducedMotion:'reduce'});
    await rendering(page,panel,'Reduced motion overrides focus',false);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await rendering(page,panel,'Preference change resumes focused motion',true);
    await panel.locator('input[type="checkbox"]').uncheck();
    await viewer.focus();
    await rendering(page,panel,'Motion checkbox overrides focus',false);
    await panel.locator('input[type="checkbox"]').check();
    await viewer.focus();
    await rendering(page,panel,'Motion checkbox restores focused motion',true);

    // Synthetic document lifecycle tests the visibility handler, not Android OS suspension.
    await page.evaluate(()=>{
        Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await rendering(page,panel,'Hidden document handler suspends motion',false);
    await page.evaluate(()=>{
        delete document.visibilityState;
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await rendering(page,panel,'Visible document handler resumes focused motion',true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.profile-badge-canvas canvas').count(),0);
    assert.equal(await page.locator('.profile-cosmetics').count(),0);
    assert.deepEqual(errors,[]);
    results.push({test:'Escape unmounts the viewer with no uncaught errors',pass:true});
    await context.close();
} catch(error) {
    results.push({pass:false,error:error.message});
    throw error;
} finally {
    await writeFile(resolve(output,'interaction-results.json'),JSON.stringify({passed:results.length>0&&results.every(r=>r.pass),results},null,2));
    await browser.close();
}
console.log(`Profile interaction QA: ${results.length} checks passed.`);
