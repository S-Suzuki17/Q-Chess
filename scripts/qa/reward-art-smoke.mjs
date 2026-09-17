import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const base=process.argv[2]??'http://127.0.0.1:3100';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Local fixtures only');
const output=resolve('../../outputs/reward-art-sep17');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
let page;
try {
 for(const viewport of [{width:1440,height:1000},{width:360,height:800}]) {
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  await context.addInitScript(()=>{
   localStorage.setItem('qg_language','ja');
   localStorage.setItem('qg_sound_config',JSON.stringify({bgmVolume:0,seVolume:0,masterMute:true}));
  });
  page=await context.newPage();page.setDefaultTimeout(30000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.locator('.title-play').click();await page.locator('.lobby-campaign-action').click();
  const before=await page.evaluate(()=>localStorage.getItem('qg_campaign_v1'));
  await page.locator('.championship-collection select').selectOption('10');
  await page.locator('.championship-collection').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.reward-board-art').count(),6);
  assert.equal(await page.locator('.reward-effect-art .reward-sigil').count(),4);
  assert(await page.locator('.campaign-screen').evaluate(node=>node.scrollWidth<=node.clientWidth+1));
  await page.locator('.championship-collection').evaluate(node=>node.scrollIntoView({block:'start'}));
  await page.screenshot({path:resolve(output,`collection-${viewport.width}.png`)});
  const boardIds=viewport.width>700?['091','092','094','096','098','100']:['091','100'];
  for(const suffix of boardIds) {
   const id='champion-board-'+suffix;
   await page.locator(`[data-preview-reward="${id}"]`).click();
   await page.locator('dialog [data-graphics-state="ready"]').waitFor();
   assert(await page.locator('[data-testid="preview-equip"]').isDisabled());
   assert.equal(await page.locator('dialog .board-3d').getAttribute('data-camera'),'fixed');
   await page.locator('dialog').screenshot({path:resolve(output,`${id}-${viewport.width}.png`)});
   await page.locator('.reward-preview-dialog header button').click();
   assert.equal(await page.evaluate(()=>localStorage.getItem('qg_campaign_v1')),before);
  }
  // Reduced motion is a static, visible insignia, not an empty effect preview.
  for(const suffix of ['093','095','097','099']) {
   await page.locator(`[data-preview-reward="champion-effect-${suffix}"]`).click();
   await page.locator('dialog [data-graphics-state="ready"]').waitFor();
   assert.equal(await page.locator('.victory-fx-seal').evaluate(node=>getComputedStyle(node).opacity),'1');
   assert.equal(await page.locator('.victory-fx-seal').evaluate(node=>getComputedStyle(node).animationName),'none');
   await page.locator('dialog').screenshot({path:resolve(output,`effect-${suffix}-${viewport.width}.png`)});
   await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>localStorage.getItem('qg_campaign_v1')),before);
  }
  // Normal motion runs once, then holds the illustration in preview only.
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('[data-preview-reward="champion-effect-099"]').click();
  await page.locator('dialog [data-graphics-state="ready"]').waitFor();
  await page.locator('.reward-preview-dialog footer button').first().click();
  assert.equal(await page.locator('.victory-fx i').count(),52);
  await page.waitForTimeout(1100);
  await page.locator('dialog').screenshot({path:resolve(output,`effect-motion-${viewport.width}.png`)});
  await page.waitForTimeout(2900);
  assert.equal(await page.locator('.victory-fx-seal').evaluate(node=>getComputedStyle(node).opacity),'1');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-preview-reward="midnight"]').count(),0);
  // Isolated earned-reward fixture; this is not a real victory or a cloud write.
  await page.evaluate(()=>{
   const stars={nox:3,ember:3,oracle:3,sovereign:3};
   localStorage.setItem('qg_campaign_v1',JSON.stringify({version:2,stars,ascensions:Array.from({length:99},()=>stars),board:'standard',piece:'standard',effect:'standard',music:'standard'}));
  });
  await page.reload();await page.locator('.lobby-campaign-action').click();
  await page.locator('.championship-collection select').selectOption('10');
  await page.locator('[data-equip-reward="champion-board-100"]').click();
  await page.reload();await page.locator('.lobby-campaign-action').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qg_campaign_v1')).board),'champion-board-100');
  await page.locator('[data-boss="nox"]').click();await page.locator('.campaign-boss-card .campaign-primary').click();
  await page.locator('[data-graphics-state="ready"]').waitFor();
  await page.screenshot({path:resolve(output,`match-${viewport.width}.png`)});
  await page.getByRole('button',{name:'2D',exact:true}).click();await page.locator('.board-2d').waitFor();
  assert.equal(await page.locator('[data-square]').count(),64);
  await page.getByRole('button',{name:'3D',exact:true}).click();await page.locator('[data-graphics-state="ready"]').waitFor();
  const lost=await page.locator('.board-webgl-layer canvas').evaluate(canvas=>{
   const extension=canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
   if(!extension) return false;extension.loseContext();return true;
  });
  assert(lost,'Context loss extension unavailable');
  await page.locator('.board-render-fallback .board-2d').waitFor();
  assert.equal(await page.locator('.board-render-fallback [data-square]').count(),64);
  assert.deepEqual(errors,[]);
  results.push({viewport,passed:true,boardPreviews:boardIds.length,effectFamilies:4,lockedPreviewNoMutation:true,equipPersisted:true,contextLossFallback:true,errors});
  console.log(`PASS reward art, static/motion effects, persistence, fallback ${viewport.width}`);
  await context.close();
 }
} catch(error) {
 if(page&&!page.isClosed()) await page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});
 throw error;
} finally {
 await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));
 await browser.close();
}
