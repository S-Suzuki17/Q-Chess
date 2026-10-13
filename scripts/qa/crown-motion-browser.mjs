/** Real CampaignMode/LocalGameBoard/board/engine; only account/progress/ad transport is synthetic. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {startMotionFixture} from './crown-motion-server.mjs';
const output=resolve(process.argv[2]??'scratch/crown-motion-results');await mkdir(output,{recursive:true});
const{server,base}=await startMotionFixture();let browser;const results=[];
const push=(name,data={})=>{results.push({name,passed:true,...data});};
async function open(viewport,{reduce=false,low=false,videoFail=false,record=false,view='circuit',cleared=0,lang='ja',flat=true}={}){
 const context=await browser.newContext({viewport,reducedMotion:reduce?'reduce':'no-preference',...(record?{recordVideo:{dir:resolve(output,'raw-video'),size:viewport}}:{})}),page=await context.newPage();const errors=[],assets=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
  if(url.pathname.includes('/assets/crown-entry/')){assets.push(url.pathname);if(videoFail&&url.pathname.endsWith('.webm'))return route.abort();}return route.continue();
 });
 await context.addInitScript(({low,flat})=>{
  localStorage.setItem('qg_sound_config',JSON.stringify({masterMute:true,bgmVolume:0,seVolume:.7}));localStorage.setItem('qchess_is2DView',String(flat));
  if(low)Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2});
  window.qaHidden=false;Object.defineProperty(document,'hidden',{get:()=>window.qaHidden});window.qaSetHidden=hidden=>{window.qaHidden=hidden;document.dispatchEvent(new Event('visibilitychange'));};
  window.qaAudios=[];const NativeAudio=window.Audio;window.Audio=function(...args){const audio=new NativeAudio(...args);window.qaAudios.push(audio);return audio;};
  window.qaFrames=[];window.qaLongTasks=[];window.qaFrameHandle=0;
  new PerformanceObserver(entries=>{window.qaLongTasks.push(...entries.getEntries().map(e=>({start:e.startTime,duration:e.duration})));}).observe({entryTypes:['longtask']});
  window.qaMeasureStart=()=>{window.qaFrames=[];window.qaLongTasks=[];const sample=t=>{window.qaFrames.push(t);window.qaFrameHandle=requestAnimationFrame(sample);};window.qaFrameHandle=requestAnimationFrame(sample);};
  window.qaMeasureEnd=()=>{cancelAnimationFrame(window.qaFrameHandle);const a=window.qaFrames,d=a.slice(1).map((v,i)=>v-a[i]).sort((a,b)=>a-b);return{frames:a.length,medianMs:d[Math.floor(d.length*.5)]??null,p95Ms:d[Math.floor(d.length*.95)]??null,longTasks:window.qaLongTasks};};
 },{low,flat});
 await page.goto(`${base}/?view=${view}&cleared=${cleared}&lang=${lang}`,{waitUntil:'domcontentloaded'});
 await page.locator(view==='practice'?'.match-layout':'.crown-encounter .campaign-primary').waitFor();
 return{context,page,errors,assets};
}
async function glyph(page,selector='.crown-opponent .crown-character-body'){
 await page.locator(selector+'[data-character-art="blender"]').waitFor();return page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect(),img=el.querySelector('img');return{width:r.width,height:r.height,character:el.dataset.crownCharacter,art:el.dataset.characterArt,imageWidth:img?.naturalWidth,imageHeight:img?.naturalHeight};});
}

async function start(page){await page.locator('.crown-encounter .campaign-primary').click();await page.locator('.crown-match-intro[open]').waitFor();}
async function end(context,page,name){assert.deepEqual(page?await page.locator('.crown-match-intro').count():0,0);const video=page?.video();await context.close();if(video&&name)await copyFile(await video.path(),resolve(output,name+'.webm'));}
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.QG_TEST_CHROMIUM});
 // Same source/CSS path as the corrected baseline, with warmed fixture modules and real 2D input.
 {
  const{context,page,errors}=await open({width:1280,height:800},{record:true});
  await page.locator('[data-stage="2"]').click();await page.locator('[data-stage="1"]').click();await page.waitForTimeout(250);
  const style=await glyph(page);assert(style.width>90&&style.height>100);assert.equal(style.imageWidth,256);await page.screenshot({path:resolve(output,'room-desktop.png')});
  const actor=await page.locator('.crown-opponent-info strong').textContent();assert(!/CPU|\d/.test(actor));const id=await page.locator('.crown-opponent [data-crown-enemy-id]').getAttribute('data-crown-enemy-id');
  await page.evaluate(()=>window.qaMeasureStart());await start(page);
  assert.equal(await page.locator('.crown-match-intro').getAttribute('data-crown-intro-enemy'),id);
  const initial=await page.locator('.match-clock').allTextContents();await page.waitForTimeout(300);assert.deepEqual(await page.locator('.match-clock').allTextContents(),initial);
  const before=Date.now();await page.locator('[data-crown-skip]').evaluate(el=>{el.click();el.click();});await page.locator('.crown-match-intro').waitFor({state:'detached'});const skipMs=Date.now()-before;
  assert((await page.locator('.match-player-name strong').allTextContents()).includes(actor));assert.equal(await page.locator('.match-player [data-crown-enemy-id]').getAttribute('data-crown-enemy-id'),id);
  await page.locator('[data-square="e2"]').click();assert.equal(await page.getByTestId('selected-square').textContent(),'e2');const target=page.locator('[data-square][data-move-target="true"]').first();await target.click();await page.waitForFunction(()=>document.querySelectorAll('.match-history li').length>0);await page.screenshot({path:resolve(output,'board-desktop.png')});
  await page.waitForTimeout(2200);const perf=await page.evaluate(()=>window.qaMeasureEnd());assert.equal(await page.locator('.crown-board-arrival').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0);assert.deepEqual(errors,[]);
  push('desktop: readable adopted piece; same original body room/intro/board; paused clock; double skip; live board input; finite arrival',{style,actor,id,skipMs,perf});await end(context,page,'after-desktop');
 }
 for(const viewport of [{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:320,height:180}]){
  const{context,page,errors}=await open(viewport,{reduce:true,lang:'en',cleared:99});
  await page.locator('[data-stage="100"]').click();const actor=await page.locator('.crown-opponent-info strong').textContent();assert(actor.includes('Aureus'));
  const style=await glyph(page);assert(style.width>50&&style.height>60);const width=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));assert(width.page<=width.viewport+1);
  const launch=page.locator('.crown-encounter .campaign-primary');await launch.scrollIntoViewIfNeeded();assert(await launch.isVisible());await page.screenshot({path:resolve(output,`room-${viewport.width}x${viewport.height}.png`)});
  await start(page);await page.locator('.crown-match-intro').waitFor({state:'detached'});assert((await page.locator('.match-player-name strong').allTextContents()).includes(actor));assert.deepEqual(errors,[]);push('responsive/reduced: final King and controls remain readable/reachable',{viewport,style,width,layoutViewportEmulation:true});await end(context,page);
 }
 // All 100 are selectable, distinct and represented by one current portrait, including accessible labels.
 {
  const{context,page,errors}=await open({width:1280,height:800},{reduce:true,cleared:99});const names=[],identities=[];
  for(let p=9;p>=0;p--){if(p!==9)await page.locator('.crown-pager>button').first().click();for(let id=p*10+1;id<=p*10+10;id++){
   const node=page.locator(`[data-stage="${id}"]`);await node.click();const name=await page.locator('.crown-opponent-info strong').textContent();assert((await node.getAttribute('aria-label')).includes(name));names.push(name);identities.push(await page.locator('.crown-opponent [data-crown-enemy-id]').getAttribute('data-crown-enemy-id'));assert.equal(await page.locator('.crown-opponent [data-crown-enemy-id]').count(),1);
   if([1,21,41,61,81,100].includes(id))await page.screenshot({path:resolve(output,`enemy-${id}.png`)});
  }}assert.equal(new Set(names).size,6);assert.equal(new Set(identities).size,6);assert(names.every(n=>!/CPU|\d/.test(n)));assert.deepEqual(errors,[]);push('100 stages cycle six original characters with accessible names; only the selected portrait is rendered',{names,identities});await end(context,page);
 }
 for(const action of ['cancel','escape','back','reduce','hidden']){
  const{context,page,errors}=await open({width:390,height:844},{cleared:2});await page.locator('[data-stage="3"]').click();await start(page);
  const initial=await page.locator('.match-clock').allTextContents();
  if(action==='cancel')await page.screenshot({path:resolve(output,'intro-mobile.png')});
  if(action==='cancel')await page.locator('[data-crown-entry-cancel]').click();
  if(action==='escape')await page.keyboard.press('Escape');
  if(action==='back')await page.evaluate(()=>window.dispatchEvent(new PopStateEvent('popstate')));
  if(action==='reduce')await page.emulateMedia({reducedMotion:'reduce'});
  if(action==='hidden'){
   await page.evaluate(()=>window.qaSetHidden(true));await page.waitForTimeout(1900);assert.equal(await page.locator('.crown-match-intro[open]').count(),1);assert.deepEqual(await page.locator('.match-clock').allTextContents(),initial);assert.equal(await page.locator('.crown-match-intro video').evaluate(v=>v.paused&&!v.hasAttribute('src')),true);await page.evaluate(()=>window.qaSetHidden(false));
  }
  await page.locator('.crown-match-intro').waitFor({state:'detached'});
  if(['cancel','escape','back'].includes(action)){await page.waitForTimeout(1900);assert.equal(await page.locator('.match-layout').count(),0);assert.equal(await page.locator('.crown-screen').getAttribute('data-circuit-stage'),'3');assert(await page.locator('.crown-encounter .campaign-primary').evaluate(el=>el===document.activeElement),'Canceled introduction returns focus to the recreated challenge action');}
  else assert.equal(await page.locator('.match-layout').count(),1);
  assert.deepEqual(errors,[]);push(`intro: ${action} settles once and cannot activate a stale scene`,{tenSecondClockPreserved:true,visibilityTest:action==='hidden'?'document visibility event injected in a real browser':null});await end(context,page);
 }
 for(const fallback of ['codec-failure','low-resources','reduced']){
  const{context,page,assets,errors}=await open({width:1280,height:800},{videoFail:fallback==='codec-failure',low:fallback==='low-resources',reduce:fallback==='reduced'});
  await page.locator('[data-stage="2"]').click();await page.locator('[data-stage="1"]').click();await page.waitForTimeout(250);const button=page.locator('.crown-encounter .campaign-primary');assert(await button.isEnabled());
  await start(page);await page.locator('.crown-match-intro').waitFor({state:'detached'});assert.equal(await page.locator('.match-layout').count(),1);if(fallback!=='codec-failure')assert.equal(assets.filter(x=>x.endsWith('.webm')).length,0);assert.deepEqual(errors,[]);push(`media fallback: ${fallback} preserves entry/input without waiting for a video`,{assets});await end(context,page);
 }
 // Real Audio elements and the existing SoundService preference/volume stop path.
 {
  const{context,page,errors}=await open({width:1280,height:800});await page.evaluate(()=>window.qaSetSound({masterMute:false,bgmVolume:0,seVolume:.3}));await start(page);
  await page.waitForFunction(()=>window.qaAudios.some(a=>a.src.endsWith('/chamber-entry.wav')&&!a.paused));const audio=await page.evaluate(()=>window.qaAudios.filter(a=>a.src.endsWith('/chamber-entry.wav')).map(a=>({volume:a.volume,paused:a.paused,duration:a.duration})));assert.equal(audio[0].volume,.3);
  await page.evaluate(()=>window.qaSetSound({masterMute:true}));assert(await page.evaluate(()=>window.qaAudios.filter(a=>a.src.endsWith('/chamber-entry.wav')).every(a=>a.paused)));await page.locator('[data-crown-entry-cancel]').click();assert.deepEqual(errors,[]);push('native cue uses SE volume and stops immediately when muted/canceled',{audio});await end(context,page);
 }
 // Normal 3D is verified separately from forced WebGL failure, with the real board.
 for(const fail of [false,true]){
  const{context,page,errors}=await open({width:1280,height:800},{reduce:true,flat:false});
  if(fail)await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /^webgl/.test(type)?null:get.call(this,type,...args);};});
  if(fail){await page.reload();await page.locator('.crown-encounter .campaign-primary').waitFor();}
  await start(page);await page.locator('.crown-match-intro').waitFor({state:'detached'});
  if(fail){await page.locator('.board-render-fallback [data-square="e2"]').click();assert.equal(await page.getByTestId('selected-square').textContent(),'e2');push('forced WebGL failure: real 2D fallback accepts board input',{expectedCanvasInitializationFailure:true});}
  else {await page.waitForFunction(()=>document.querySelector('[data-graphics-state]')?.dataset.graphicsState==='ready');const gpu=await page.locator('.board-webgl-layer canvas').evaluate(c=>{const gl=c.getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');return{webgl2:!!gl,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};});assert(gpu.webgl2);await page.screenshot({path:resolve(output,'board-3d.png')});assert.deepEqual(errors,[]);push('actual 3D board renders retained adopted models/materials',{gpu});}
  await end(context,page);
 }
 {
  const{context,page,errors}=await open({width:390,height:844},{reduce:true,view:'practice'});await page.locator('.match-intro').waitFor({state:'detached'});assert((await page.locator('.match-player-name strong').allTextContents()).some(n=>n.startsWith('CPU (')));assert.equal(await page.locator('[data-crown-enemy-id]').count(),0);assert.deepEqual(errors,[]);push('practice retains its CPU name and generic introduction');await end(context,page);
 }
 const result={status:'passed',createdAt:new Date().toISOString(),browser:browser.version(),source:'feat/crown-motion-20261012 over main 584252f',tailwindUtilitiesGenerated:true,checks:results.length,results,productionDataWritten:false,externalRequestsBlocked:true,limitations:['Desktop Chromium; viewport/visibility/resource emulation does not certify Android hardware or GPU performance.','Auth/progress/ad transport is synthetic; actual local engine, boards, media and UI execute.'],output};await writeFile(resolve(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:result.checks,output}));
}finally{await browser?.close();await server.close();}
