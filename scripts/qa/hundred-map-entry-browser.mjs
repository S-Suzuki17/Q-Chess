/** Changed layout and actual MapMatchIntro/LocalGameBoard only; accepted map guard suite stays separate. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {startMotionFixture} from './crown-motion-server.mjs';
const output=resolve(process.argv[2]??'scratch/hundred-map-entry');await mkdir(output,{recursive:true});
const stub=resolve('scripts/qa/fixtures/castle-quest/stubs.tsx'),results=[],errors=[];
let browser,fixture;
const open=async(base,{lang='ja',scale=1,record=false,controlled=false}={})=>{
 const context=await browser.newContext({viewport:{width:375,height:667},...(record?{recordVideo:{dir:resolve(output,'raw-video'),size:{width:375,height:667}}}:{})}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await context.addInitScript(()=>{localStorage.setItem('qchess_is2DView','true');localStorage.setItem('qg_sound_config',JSON.stringify({masterMute:true,bgmVolume:0,seVolume:0}));window.qaHidden=false;Object.defineProperty(document,'hidden',{get:()=>window.qaHidden});window.qaSetHidden=(value,event=true)=>{window.qaHidden=value;if(event)document.dispatchEvent(new Event('visibilitychange'));};});
 if(controlled)await page.clock.install();
 await page.goto(base+'/?cleared=2&lang='+lang);await page.locator('.map-screen').waitFor();
 if(scale!==1)await page.evaluate(()=>{for(const n of document.querySelectorAll('.map-screen *'))if([...n.childNodes].some(c=>c.nodeType===3&&c.textContent.trim()))n.style.fontSize=parseFloat(getComputedStyle(n).fontSize)*2+'px';});
 if(controlled)await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 return{page,context};
};
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.QG_TEST_CHROMIUM});
 fixture=await startMotionFixture(0,{stateStub:stub,boardStub:stub});
 for(const lang of process.argv.includes('--entry-only')?[]:['ja','de']){
  const{page,context}=await open(fixture.base,{lang,scale:lang==='de'?2:1,record:lang==='ja'});
  const launch=page.locator('.map-launch .campaign-primary'),sides=page.locator('.map-top-launch .campaign-side button');
  await sides.last().click();
  const geometry=await page.evaluate(()=>{
   const primary=document.querySelector('.map-top-launch .campaign-primary').getBoundingClientRect();
   const sides=[...document.querySelectorAll('.map-top-launch .campaign-side button')].map(n=>{const box=n.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(n);return{box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},text:[...range.getClientRects()].map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom}))};});
   return{width:document.documentElement.scrollWidth,viewport:innerWidth,primary:{top:primary.top,bottom:primary.bottom},sides};
  });
  assert(geometry.width<=geometry.viewport+1);assert(geometry.primary.bottom<=667);
  for(const side of geometry.sides){assert(side.box.bottom<=geometry.primary.top);for(const t of side.text)assert(t.left>=side.box.left-1&&t.right<=side.box.right+1&&t.top>=side.box.top-1&&t.bottom<=side.box.bottom+1,'Side label stays inside its own control');}
  await page.screenshot({path:resolve(output,`latest-layout-${lang}.png`)});
  if(lang==='ja'){
   await sides.first().click();await launch.click();await page.locator('[data-qa-win]').click();await page.locator('.map-result').waitFor();await page.locator('[data-map-next]').click();await page.locator('[data-map-journey]').waitFor({state:'detached'});
   assert.equal(await page.locator('.challenge-map').getAttribute('data-map-frontier'),'4');assert.equal(await page.locator('[data-qa-result-source]').count(),0);
   await page.screenshot({path:resolve(output,'latest-saved-clear-next-tile.png')});
  }
  const video=page.video();await context.close();if(video)await video.saveAs(resolve(output,'latest-saved-clear-next-tile.webm'));
  results.push({case:'latest-mobile-side-wrap-and-initial-challenge',lang,textScale:lang==='de'?2:1,geometry,pass:true});console.log('Latest map layout passed '+lang);
 }
 await fixture.server.close();fixture=await startMotionFixture(0,{stateStub:stub});
 for(const action of process.argv.includes('--layout-only')?[]:['skip','normal','hidden-timeout','hidden-without-event-skip','cancel','escape','back','reduce']){
  const{page,context}=await open(fixture.base,{controlled:true});
  await page.locator('.map-launch .campaign-primary').click();await page.locator('.map-match-intro[open]').waitFor();
  assert.equal(await page.locator('.crown-match-intro,.crown-board-arrival,[data-crown-enemy-id]').count(),0);
  const initial=await page.locator('.match-clock').allTextContents();
  if(action==='skip'){await page.locator('[data-map-start-now]').evaluate(n=>{n.click();n.click();});}
  if(action==='normal')await page.clock.runFor(700);
  if(action==='hidden-timeout'||action==='hidden-without-event-skip'){
   await page.evaluate(event=>window.qaSetHidden(true,event),action==='hidden-timeout');
   if(action==='hidden-without-event-skip')await page.locator('[data-map-start-now]').evaluate(n=>{n.click();n.click();});
   await page.clock.runFor(1400);assert.equal(await page.locator('.map-match-intro[open]').count(),1);assert.deepEqual(await page.locator('.match-clock').allTextContents(),initial);
   await page.evaluate(()=>window.qaSetHidden(false));
  }
  if(action==='cancel')await page.locator('[data-map-intro-cancel]').click();
  if(action==='escape')await page.keyboard.press('Escape');
  if(action==='back')await page.evaluate(()=>window.dispatchEvent(new PopStateEvent('popstate')));
  if(action==='reduce'){await page.emulateMedia({reducedMotion:'reduce'});await page.clock.runFor(100);}
  await page.locator('.map-match-intro').waitFor({state:'detached'});
  if(['cancel','escape','back'].includes(action)){
   await page.clock.runFor(1500);assert.equal(await page.locator('.match-layout').count(),0);assert(await page.locator('.map-launch .campaign-primary').evaluate(n=>n===document.activeElement));
  }else{
   assert.equal(await page.locator('.match-layout').count(),1);assert(await page.getByTestId('match-board').evaluate(n=>n.contains(document.activeElement)),'Board receives focus after intro');
   assert.deepEqual(await page.locator('.match-clock').allTextContents(),initial);
   await page.locator('[data-square="e2"]').click();assert.equal(await page.getByTestId('selected-square').textContent(),'e2');
   if(action==='skip')await page.screenshot({path:resolve(output,'latest-real-board-after-intro.png')});
   await page.clock.runFor(1200);assert.notDeepEqual(await page.locator('.match-clock').allTextContents(),initial,'Clock begins only after intro');
  }
  results.push({case:'actual-map-intro-'+action,pass:true,actualEngineBoard:true,syntheticVisibility:action.startsWith('hidden'),controlledJavaScriptClock:true});await context.close();console.log('Map intro passed '+action);
 }
 assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'result.json'),JSON.stringify({pass:true,results,errors,limits:'Actual changed map/intro/LocalGameBoard/2D engine input. Identity/progress/admission transport is synthetic and external network blocked. No production auth, real engine win, payment, ads or physical Android claim.'},null,2)+'\n');
}finally{await browser?.close();await fixture?.server.close();}
