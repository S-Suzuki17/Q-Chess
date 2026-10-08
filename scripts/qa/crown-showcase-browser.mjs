// Real-component presentation checks. All progression is synthetic and every
// non-local request is denied. This is not gameplay, a purchase or a cloud grant.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {startShowcase} from './crown-showcase-server.mjs';
const output=resolve('scratch/crown-showcase-results');await mkdir(output,{recursive:true});
const {server,base}=await startShowcase();let browser;const results=[];
const strictHeights=new Set([568,667,720,844]);
try{
 browser=await chromium.launch({headless:true,...(process.env.QG_TEST_CHROMIUM?{executablePath:process.env.QG_TEST_CHROMIUM}:{})});
 const cases=[{width:320,height:568,lang:'ja'},{width:375,height:667,lang:'ja'},{width:390,height:844,lang:'ja'},{width:844,height:390,lang:'en'},{width:1280,height:720,lang:'ja'},{width:390,height:844,lang:'de'}];
 for(const viewport of cases){
  const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.addInitScript(()=>localStorage.setItem('qg_sound_config',JSON.stringify({bgmVolume:0,seVolume:0,masterMute:true})));
  await page.goto(`${base}/?cleared=24&lang=${viewport.lang}`);await page.locator('.crown-encounter .campaign-primary').waitFor();
  const measure=()=>page.locator('.crown-tab-panel:visible').evaluate(element=>({scrollWidth:element.scrollWidth,width:element.clientWidth,scrollHeight:element.scrollHeight,height:element.clientHeight,documentWidth:document.documentElement.scrollWidth,viewport:innerWidth}));
  let bounds=await measure();assert(bounds.documentWidth<=bounds.viewport+1,'No page horizontal overflow');assert(bounds.scrollWidth<=bounds.width+1,'No active panel horizontal overflow');
  if(strictHeights.has(viewport.height))assert(bounds.scrollHeight<=bounds.height+2,`Challenge needs scroll at ${viewport.width}×${viewport.height}: ${JSON.stringify(bounds)}`);
  await page.screenshot({path:resolve(output,`castle-${viewport.lang}-${viewport.width}x${viewport.height}.png`)});
  // Locked rooms can be examined, but their match entry remains disabled.
  await page.locator('[data-stage="26"]').click();assert(await page.locator('.crown-encounter .campaign-primary').isDisabled());
  await page.locator('[data-stage="25"]').click();assert(await page.locator('.crown-encounter .campaign-primary').isEnabled());
  const before=await page.evaluate(()=>JSON.stringify({...localStorage}));
  const trigger=page.locator('.crown-next-reward');await trigger.click();await page.locator('.reward-preview-dialog[open]').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.reward-preview-dialog').count(),0);
  assert(await trigger.evaluate(element=>element===document.activeElement),'Preview focus returns to trigger');
  await page.locator('#crown-main-tab-collection').click();
  const collected=new Set();
  for(const category of ['board','piece','avatar','effect','music']){
   await page.locator(`#crown-category-tab-${category}`).click();await page.locator(`#crown-category-panel-${category}`).waitFor();
   // The measured grid may update after a category/header changes height.
   await page.waitForFunction(()=>document.querySelectorAll('.crown-collection-card').length>0);
   let pages=0;
   while(true){
    bounds=await measure();assert(bounds.scrollWidth<=bounds.width+1,`${category}: no horizontal overflow`);
    if(strictHeights.has(viewport.height))assert(bounds.scrollHeight<=bounds.height+2,`${category}: category page must fit viewport`);
    for(const id of await page.locator('.crown-collection [data-championship-reward]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-championship-reward'))))collected.add(id);
    const next=page.locator('.crown-collection-footer .crown-pager button').last();pages++;assert(pages<40,'Pagination must converge');
    if(await next.isDisabled())break;await next.click();
   }
   const first=page.locator('.crown-item-preview').first();await first.click();await page.locator('.reward-preview-dialog[open]').waitFor();
   assert.equal(await page.locator('[data-equip-reward],[data-testid="preview-equip"]').count(),0,'Previews cannot equip or grant rewards');
   await page.keyboard.press('Escape');assert(await first.evaluate(element=>element===document.activeElement));
   results.push({viewport,category,pages,passed:true});
  }
  assert(collected.size>=100,'All100 current stage rewards must be reachable through categories');
  assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),before,'Browsing must not mutate progression or equipment');
  await page.locator('#crown-category-tab-avatar').click();await page.screenshot({path:resolve(output,`frames-${viewport.lang}-${viewport.width}x${viewport.height}.png`)});
  // Roving keyboard tabs and route return retain deliberate category selection.
  await page.locator('#crown-main-tab-collection').focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#crown-main-tab-challenge').getAttribute('aria-selected'),'true');
  await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#crown-category-tab-avatar').getAttribute('aria-selected'),'true');
  await page.locator('.campaign-header button').first().click();await page.locator('[data-reopen]').waitFor();await page.locator('[data-reopen]').click();await page.locator('.crown-encounter').waitFor();
  assert.deepEqual(errors,[]);await context.close();
 }
 // Motion and fallback are separate from the static reduced-motion pass above.
 for(const reducedMotion of ['reduce','no-preference'])for(const motif of ['rings','shards','starfall','corona']){
  const context=await browser.newContext({viewport:{width:960,height:640},reducedMotion,...(process.env.QG_RECORD_VIDEO?{recordVideo:{dir:resolve(output,'videos'),size:{width:960,height:640}}}:{})});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.addInitScript(()=>localStorage.setItem('qg_sound_config',JSON.stringify({bgmVolume:0,seVolume:0,masterMute:true})));
  const page=await context.newPage();await page.goto(`${base}/?view=effect&motif=${motif}`);await page.locator('[data-rendered="true"]').waitFor();
  await page.waitForTimeout(reducedMotion==='reduce'?100:950);await page.screenshot({path:resolve(output,`effect-${motif}-${reducedMotion}.png`)});
  await page.waitForFunction(()=>document.querySelector('.victory-fx')?.getAttribute('data-finished')==='true');
  const state=await page.locator('.victory-fx').evaluate(node=>({renderer:node.getAttribute('data-cinematic'),time:node.getAttribute('data-time'),reduced:node.getAttribute('data-reduced-motion')}));
  assert.equal(state.time,'3');if(reducedMotion==='reduce')assert.equal(state.reduced,'true');
  await page.locator('[data-replay-effect]').click();await page.locator('[data-rendered="true"]').waitFor();
  results.push({motif,reducedMotion,state,passed:true});await context.close();
 }
 // Mount/unmount and mid-shot preference changes exercise the real React owner,
 // beyond the pure clock/resource tests. Late model responses are held locally.
 {
  const context=await browser.newContext({viewport:{width:960,height:640},reducedMotion:'no-preference'}),page=await context.newPage();
  const errors=[],releases=[];let holdModels=true;page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   if(holdModels&&url.pathname.endsWith('.glb')){
    const response=await route.fetch();await new Promise(resolve=>releases.push(resolve));return route.fulfill({response}).catch(()=>{});
   }
   return route.continue();
  });
  await page.goto(`${base}/?view=effect&motif=corona`);await page.locator('[data-rendered="true"]').waitFor();
  await page.waitForTimeout(250);await page.locator('[data-toggle-effect]').click();assert.equal(await page.locator('.victory-fx').count(),0);
  holdModels=false;releases.forEach(release=>release());await page.waitForTimeout(150);
  assert.equal(await page.locator('.victory-fx').count(),0,'Late work must not restore an unmounted effect');
  await page.locator('[data-toggle-effect]').click();await page.locator('[data-rendered="true"]').waitFor();await page.waitForTimeout(100);
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('.victory-fx')?.getAttribute('data-finished')==='true');
  assert.equal(await page.locator('.victory-fx').getAttribute('data-time'),'3');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('[data-replay-effect]').click();await page.locator('[data-rendered="true"]').waitFor();
  await page.waitForTimeout(250);
  const contextLoss=await page.locator('[data-victory-layer="cinematic"]').evaluate(canvas=>{
   const extension=canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');if(!extension)return false;extension.loseContext();return true;
  });
  if(contextLoss)await page.waitForFunction(()=>document.querySelector('.victory-fx')?.getAttribute('data-cinematic')==='fallback');
  assert.deepEqual(errors,[]);results.push({effectOwnerLifecycle:true,lateUnmount:true,midShotReducedMotion:true,contextLoss,passed:true});await context.close();
 }
 for(const reducedMotion of ['reduce','no-preference']){
  const context=await browser.newContext({viewport:{width:640,height:720},reducedMotion});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await context.newPage();await page.goto(`${base}/?view=qube`);await page.locator('.qube-companion').waitFor();
  for(const state of ['idle','anticipation','victory','encouragement']){
   await page.locator(`[data-qube-select="${state}"]`).click();await page.locator('[data-replay-qube]').click();
   if(reducedMotion==='no-preference')await page.waitForFunction(()=>document.querySelector('.qube-companion')?.getAnimations({subtree:true}).length>0);
   else assert.equal(await page.locator('.qube-companion').evaluate(node=>node.getAnimations({subtree:true}).length),0);
   assert.equal(await page.locator('.qube-companion').getAttribute('data-qube-state'),state);
   await page.waitForTimeout(650);await page.screenshot({path:resolve(output,`qube-${state}-${reducedMotion}.png`)});
   await page.waitForTimeout(2600);assert.equal(await page.locator('.qube-companion').evaluate(node=>node.getAnimations({subtree:true}).length),0,'QUBE clips must stop rather than idle-loop');
   results.push({qubeState:state,reducedMotion,passed:true});
  }
  await context.close();
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify({scope:'Isolated real-component presentation; synthetic progress; no live services or match validation',results},null,2));
 console.log(JSON.stringify({passed:results.length,output},null,2));
}finally{await browser?.close();await server.close();}
