import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {startShowcase} from './crown-showcase-server.mjs';
const output=resolve('scratch/crown-extended-results');await mkdir(output,{recursive:true});
const {server,base}=await startShowcase();let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.QG_TEST_CHROMIUM});
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 await page.goto(base+'/?cleared=99&lang=ja');await page.locator('[data-stage="100"]').waitFor();await page.locator('[data-stage="100"]').click();assert.equal(await page.locator('.crown-screen').getAttribute('data-circuit-stage'),'100');
 await page.screenshot({path:resolve(output,'stage100.png')});results.push({stage100:true});
 for(const zoom of [2,4]){
  await page.setViewportSize({width:1280/zoom,height:720/zoom});
  for(const tab of ['challenge','collection']){
   await page.locator('#crown-main-tab-'+tab).click();
   const bounds=await page.locator('.crown-tab-panel:visible').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight,pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,physicalRight:el.getBoundingClientRect().right}));
   assert(bounds.physicalRight<=bounds.viewport+1,`${zoom}× ${tab} panel exceeds viewport`);
   assert(bounds.scrollWidth<=bounds.width+1,`${zoom}× ${tab} has horizontal overflow`);
   const controls=page.locator(tab==='challenge'?'.crown-encounter .campaign-primary':'.crown-collection-footer .crown-pager button').last();await controls.scrollIntoViewIfNeeded();assert(await controls.isVisible());
   await page.screenshot({path:resolve(output,`zoom-${zoom}-${tab}.png`)});results.push({zoom,method:'Effective desktop layout viewport at 200/400%; browser/device zoom not certified',tab,bounds,controlsReachable:true});
  }
 }
 await page.setViewportSize({width:390,height:844});await page.locator('#crown-category-tab-avatar').click();
 assert.equal(await page.locator('.crown-collection').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0);
 await page.locator('.crown-item-preview').first().click();await page.locator('.reward-preview-dialog[open]').waitFor();await page.waitForTimeout(1800);
 assert.equal(await page.locator('.avatar-reward-preview').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0);results.push({staticFrameList:true,finiteFramePreview:true});await context.close();
 for(const viewport of [{width:390,height:844},{width:1280,height:720}]){
  const ctx=await browser.newContext({viewport}),p=await ctx.newPage();await ctx.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await p.addInitScript(()=>{window.qaFrames=[];window.qaStartFrames=()=>{window.qaFrames=[];const sample=t=>{window.qaFrames.push(t);if(window.qaFrames.length<240)requestAnimationFrame(sample);};requestAnimationFrame(sample);};localStorage.setItem('qg_sound_config',JSON.stringify({masterMute:true,bgmVolume:0,seVolume:0}));});
  await p.goto(base+'/?view=effect&motif=corona');await p.locator('[data-rendered="true"]').waitFor();await p.waitForTimeout(3500);await p.evaluate(()=>window.qaStartFrames());await p.locator('[data-replay-effect]').click();await p.waitForFunction(()=>document.querySelector('.victory-fx')?.dataset.cinematic==='ready');
  const gpu=await p.locator('[data-victory-layer="cinematic"]').evaluate(canvas=>{const gl=canvas.getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');return {webgl2:!!gl,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};});
  await p.waitForFunction(()=>document.querySelector('.victory-fx')?.dataset.finished==='true');
  const perf=await p.evaluate(()=>{const a=window.qaFrames,d=a.slice(1).map((v,i)=>v-a[i]).sort((a,b)=>a-b);return {samples:d.length,medianMs:d[Math.floor(d.length/2)],p95Ms:d[Math.floor(d.length*.95)],meanFps:1000/(d.reduce((a,b)=>a+b,0)/d.length)};});
  const time=await p.locator('.victory-fx').getAttribute('data-time');await p.waitForTimeout(350);assert.equal(await p.locator('.victory-fx').getAttribute('data-time'),time);
  results.push({viewport,gpu,perf,scope:'Cloud software renderer; viewport emulation, not device/GPU certification',stopped:true});await ctx.close();
 }
 // Force a real getContext failure only for WebGL, leaving Canvas2D available.
 const ctx=await browser.newContext(),p=await ctx.newPage();await ctx.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 await p.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /^webgl/.test(type)?null:original.call(this,type,...args);};});
 await p.goto(base+'/?view=effect');await p.waitForFunction(()=>document.querySelector('.victory-fx')?.dataset.cinematic==='fallback');await p.screenshot({path:resolve(output,'webgl-fallback.png')});results.push({forcedWebGLFailure:true,canvas2D:true});await ctx.close();
 // Observe native media playback; no fake Audio or paid service.
 {
  const ctx=await browser.newContext(),p=await ctx.newPage();await ctx.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await p.addInitScript(()=>{window.qaAudios=[];const NativeAudio=window.Audio;window.Audio=function(...args){const a=new NativeAudio(...args);window.qaAudios.push(a);return a;};});
  await p.goto(base+'/?view=effect');await p.locator('[data-rendered="true"]').waitFor();
  const modulePath='/@fs'+resolve('src/lib/SoundService.ts');
  await p.evaluate(async path=>{window.qaSound=(await import(path)).soundManager;window.qaSound.updateConfig({masterMute:false,seVolume:.3});},modulePath);
  await p.locator('[data-replay-effect]').click();await p.waitForFunction(()=>window.qaAudios.some(a=>a.currentTime>0&&!a.paused));
  const active=await p.evaluate(()=>window.qaAudios.filter(a=>!a.paused).map(a=>({volume:a.volume,time:a.currentTime,src:new URL(a.src).pathname})));
  assert(active.every(a=>Math.abs(a.volume-.3)<.001));await p.evaluate(()=>window.qaSound.updateConfig({masterMute:true}));assert(await p.evaluate(()=>window.qaAudios.every(a=>a.paused)));
  const before=await p.evaluate(()=>window.qaAudios.length);await p.locator('[data-replay-effect]').click();await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>window.qaAudios.length),before);
  results.push({nativeAudioPlayed:true,volume:.3,mutingStops:true,mutedReplayDoesNotPlay:true,audibleOutput:'Not available in headless cloud',active});await ctx.close();
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify({results},null,2));console.log(JSON.stringify({passed:results.length,output}));
}finally{await browser?.close();await server.close();}
