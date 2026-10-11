// Focused follow-up only: fictional local fixture; all external requests blocked.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {startShowcase} from './crown-showcase-server.mjs';
const output=resolve('scratch/multi-review-qa');await mkdir(output,{recursive:true});
const {server,base}=await startShowcase();const results=[];let browser;
const textOnly=process.argv.includes('--text-400-only');
const layoutOnly=process.argv.includes('--layout-only')||process.argv.includes('--short-only');
const shortOnly=process.argv.includes('--short-only');
async function record(name,fn){try{results.push({name,status:'passed',...await fn()});}catch(error){results.push({name,status:'failed',error:String(error)});}}
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.QG_TEST_CHROMIUM});
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'no-preference'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const page=await context.newPage();await page.goto(base+'/?cleared=99&lang=ja');
 if(layoutOnly)for(const viewport of shortOnly?[{width:320,height:568},{width:844,height:390}]:[{width:390,height:844},{width:1280,height:720},{width:320,height:568},{width:844,height:390}])for(const tab of shortOnly?['challenge']:['challenge','collection'])await record(`normal-${viewport.width}-${viewport.height}-${tab}`,async()=>{
  await page.setViewportSize(viewport);await page.goto(base+'/?cleared=99&lang=ja');await page.locator('#crown-main-tab-'+tab).click();await page.waitForTimeout(100);
  const metrics=await page.locator('.crown-tab-panel:visible').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight}));assert(metrics.scrollWidth<=metrics.width+1);
  await page.screenshot({path:resolve(output,`normal-${viewport.width}-${viewport.height}-${tab}.png`)});
  if(viewport.height>568)assert(metrics.scrollHeight<=metrics.height+2,'normal size should not need panel scroll '+JSON.stringify(metrics));
  const controls=page.locator(tab==='challenge'?'.crown-encounter .campaign-primary':'.crown-collection-footer .crown-pager button').last();await controls.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));assert(await controls.isVisible());
  if(tab==='challenge'){const objective=page.locator('.crown-objective');assert(await objective.isVisible());await objective.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));const overlap=await page.evaluate(()=>{const e=document.querySelector('.crown-encounter'),l=document.querySelector('.crown-launch'),copy=document.querySelector('.crown-encounter-copy'),journey=document.querySelector('.crown-journey');return {copyBottom:copy.getBoundingClientRect().bottom,launchTop:l.getBoundingClientRect().top,encounterBottom:e.getBoundingClientRect().bottom,journeyTop:journey.getBoundingClientRect().top,encounterRight:e.getBoundingClientRect().right,journeyLeft:journey.getBoundingClientRect().left};});assert(overlap.copyBottom<=overlap.launchTop+1&&(overlap.encounterBottom<=overlap.journeyTop+1||overlap.encounterRight<=overlap.journeyLeft+1),'encounter text/launch/journey overlap '+JSON.stringify(overlap));}
  await page.screenshot({path:resolve(output,`normal-${viewport.width}-${viewport.height}-${tab}.png`)});return {viewport,tab,metrics};
 });
 if(!textOnly&&!layoutOnly)await record('normal-motion-frames',async()=>{
  await page.locator('#crown-main-tab-collection').click();await page.locator('#crown-category-tab-avatar').click();const ids=[];
  do{
   assert.equal(await page.locator('.crown-collection').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0);
   const cards=page.locator('.crown-item-preview');const count=await cards.count();
   for(let i=0;i<count;i++){
    const card=cards.nth(i);await card.click();await page.locator('.reward-preview-dialog[open]').waitFor();
    const avatar=page.locator('.avatar-reward-preview');const id=await avatar.locator('[data-avatar-frame]').getAttribute('data-avatar-frame');ids.push(id);
    const animation=await avatar.evaluate(el=>el.getAnimations({subtree:true}).map(a=>({state:a.playState,iterations:a.effect.getTiming().iterations,duration:a.effect.getTiming().duration})));
    assert(animation.some(a=>a.state==='running'&&a.iterations===1),id+' must start one finite animation');
    await page.waitForTimeout(850);assert.equal(await avatar.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0);
    await page.keyboard.press('Escape');assert(await card.evaluate(el=>el===document.activeElement));
   }
   const next=page.locator('.crown-collection-footer .crown-pager button').last();if(await next.isDisabled())break;await next.click();
  }while(true);
  assert(new Set(ids).size>=15);return {frames:ids,method:'Real CSS animations, normal motion; each preview starts once and stops'};
 });
 for(const multiplier of layoutOnly?[]:textOnly?[4]:[2,4])for(const tab of ['challenge','collection'])await record(`text-${multiplier}-${tab}`,async()=>{
  await page.goto(base+'/?cleared=99&lang=de');await page.locator('#crown-main-tab-'+tab).click();
  await page.evaluate(scale=>{const nodes=[...document.querySelectorAll('.crown-screen *')].filter(el=>[...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim()));const fonts=nodes.map(el=>({el,font:parseFloat(getComputedStyle(el).fontSize)}));for(const {el,font}of fonts)el.style.fontSize=font*scale+'px';},multiplier);
  await page.waitForTimeout(100);const bounds=await page.locator('.crown-screen').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,docWidth:document.documentElement.scrollWidth,viewport:innerWidth}));
  await page.screenshot({path:resolve(output,`text-${multiplier}-${tab}.png`)});
  const action=page.locator(tab==='challenge'?'.crown-encounter .campaign-primary':'.crown-collection-footer .crown-pager button').last();await action.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));const actionBounds=await action.boundingBox();assert(actionBounds&&actionBounds.x>=0&&actionBounds.x+actionBounds.width<=390&&actionBounds.y>=0&&actionBounds.y+actionBounds.height<=844,'primary action must fit viewport after scroll '+JSON.stringify(actionBounds));
  assert(bounds.scrollWidth<=bounds.width+1&&bounds.docWidth<=bounds.viewport+1,'text enlargement horizontal overflow');
  if(tab==='challenge'){const overlap=await page.evaluate(()=>({copyBottom:document.querySelector('.crown-encounter-copy').getBoundingClientRect().bottom,launchTop:document.querySelector('.crown-launch').getBoundingClientRect().top,encounterBottom:document.querySelector('.crown-encounter').getBoundingClientRect().bottom,journeyTop:document.querySelector('.crown-journey').getBoundingClientRect().top}));assert(overlap.copyBottom<=overlap.launchTop+1&&overlap.encounterBottom<=overlap.journeyTop+1,'text / launch / journey overlap');}
  await page.screenshot({path:resolve(output,`text-${multiplier}-${tab}-controls.png`)});
  const close=page.locator('.campaign-header button').first();await close.scrollIntoViewIfNeeded();await close.click();await page.locator('[data-reopen]').waitFor();
  return {multiplier,tab,bounds,method:'Each text-bearing element computed font-size multiplied; not native browser/text accessibility zoom'};
 });
 await context.close();
 if(!textOnly&&!layoutOnly)await record('visibility-return',async()=>{
  const ctx=await browser.newContext({viewport:{width:640,height:720}});await ctx.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());const p=await ctx.newPage();
  await p.addInitScript(()=>{window.qaHidden=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.qaHidden});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.qaHidden?'hidden':'visible'});});
  await p.goto(base+'/?view=effect');await p.locator('[data-rendered="true"]').waitFor();
  await p.evaluate(()=>{window.qaHidden=true;document.dispatchEvent(new Event('visibilitychange'));});const atHide=await p.locator('.victory-fx').getAttribute('data-time');await p.waitForTimeout(350);assert.equal(await p.locator('.victory-fx').getAttribute('data-time'),atHide);
  await p.evaluate(()=>{window.qaHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await p.waitForFunction(()=>document.querySelector('.victory-fx')?.dataset.finished==='true');assert.equal(await p.locator('.victory-fx').getAttribute('data-time'),'3');await p.screenshot({path:resolve(output,'visibility-return.png')});await ctx.close();
  return {method:'Synthetic document.hidden getter + actual visibilitychange; background tab scheduling not certified',pause:true,completion:true};
 });
 if(!textOnly&&!layoutOnly)await record('delayed-image-close',async()=>{
  const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});let hold=false;const releases=[];let delayed=0;const errors=[];
  await ctx.route('**/*',async r=>{const url=new URL(r.request().url());if(url.origin!==base)return r.abort();if(hold&&url.pathname.startsWith('/avatars/circuit-')){const response=await r.fetch();delayed++;await new Promise(resolve=>releases.push(resolve));return r.fulfill({response}).catch(()=>{});}return r.continue();});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/?cleared=99');await p.locator('#crown-main-tab-collection').click();await p.locator('#crown-category-tab-avatar').click();
  // Cache is disabled by routing; change the preview image URL locally to force a delayed request.
  await p.locator('.crown-item-preview').first().click();await p.locator('.reward-preview-dialog[open]').waitFor();hold=true;await p.locator('.avatar-reward-preview img').evaluate(el=>el.src=el.src+'?qa-delayed=1');await p.waitForFunction(()=>document.querySelector('.avatar-reward-preview img')?.complete===false);await p.waitForTimeout(100);assert(delayed>0);
  await p.keyboard.press('Escape');hold=false;releases.forEach(fn=>fn());await p.waitForTimeout(200);assert.equal(await p.locator('.reward-preview-dialog').count(),0);assert.deepEqual(errors,[]);await p.screenshot({path:resolve(output,'delayed-image-closed.png')});await ctx.close();return {delayed,closedRemainsClosed:true};
 });
}finally{await browser?.close();await server.close();await writeFile(resolve(output,shortOnly?'short-layout-after.json':layoutOnly?'normal-layout-after.json':textOnly?'text-400-after.json':'results.json'),JSON.stringify({scope:'Focused local browser follow-up; synthetic data and seams explicitly noted',results},null,2));console.log(JSON.stringify(results,null,2));}
