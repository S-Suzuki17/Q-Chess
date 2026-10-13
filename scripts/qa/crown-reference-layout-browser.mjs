/** Added reference layout checks; accepted character/lifecycle suites are not repeated. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {startMotionFixture} from './crown-motion-server.mjs';
const output=resolve(process.argv[2]??'scratch/crown-reference-layout');await mkdir(output,{recursive:true});
const{server,base}=await startMotionFixture();let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.QG_TEST_CHROMIUM});
 const sizes=process.argv[3]==='--remaining'?[[390,844,'ja',1],[844,390,'en',1],[1280,800,'en',1]]:[[375,812,'ja',1],[320,568,'ja',1],[375,812,'de',2]];
 for(const [width,height,lang,scale] of sizes){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.addInitScript(()=>{localStorage.setItem('qchess_is2DView','true');localStorage.setItem('qg_sound_config',JSON.stringify({masterMute:true,bgmVolume:0,seVolume:0}));});
  await page.goto(`${base}/?cleared=0&lang=${lang}`,{waitUntil:'domcontentloaded'});
  await page.locator('.crown-enemy-silhouette [data-character-art="blender"]').waitFor();
  if(scale===2)await page.evaluate(()=>{
   const items=[...document.querySelectorAll('.crown-screen *')].filter(node=>[...node.childNodes].some(child=>child.nodeType===3&&child.textContent.trim())).map(node=>[node,parseFloat(getComputedStyle(node).fontSize)]);
   for(const[node,size]of items)node.style.fontSize=`${size*2}px`;
  });
  const widthInfo=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));assert(widthInfo.page<=width+1);
  assert.equal(await page.locator('.pixel-castle-corridor image').count(),0);assert.equal(await page.locator('.crown-route-node').count(),10);
  const reward=page.locator('.crown-next-reward'),launch=page.locator('.crown-launch .campaign-primary');
  const placement=await page.evaluate(()=>{
   const box=(selector)=>{const node=document.querySelector(selector),r=node.getBoundingClientRect(),s=getComputedStyle(node);return{x:r.x,y:r.y,w:r.width,h:r.height,position:s.position,gridColumn:s.gridColumn,gridRow:s.gridRow};};
   return{qube:box('.crown-companion'),reward:box('.crown-next-reward'),launch:box('.crown-launch'),labels:box('.crown-opponent-info'),room:box('.crown-encounter')};
  });
  await writeFile(resolve(output,`placement-${width}-${lang}-${scale}.json`),JSON.stringify(placement,null,2)+'\n');
  await page.screenshot({path:resolve(output,`placement-${width}-${lang}-${scale}.png`)});
  const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  assert.equal(overlap(placement.qube,placement.reward),0,'QUBE must stay left of reward');assert.equal(overlap(placement.qube,placement.launch),0,'QUBE must stay above controls');assert.equal(overlap(placement.qube,placement.labels),0,'QUBE must not cover enemy information');
  assert(placement.qube.x+placement.qube.w<=placement.room.x+placement.room.w*.56,'QUBE belongs to left foreground');
  await launch.scrollIntoViewIfNeeded();assert(await launch.isEnabled());await page.screenshot({path:resolve(output,`crown-${width}x${height}-${lang}-${scale}.png`)});
  await reward.click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});assert(await reward.evaluate(el=>document.activeElement===el));
  await page.locator('.campaign-side button').last().click();assert.equal(await page.locator('.campaign-side button').last().getAttribute('aria-pressed'),'true');
  await page.locator('[data-stage="2"]').click();assert(await launch.isDisabled());await page.locator('[data-stage="1"]').click();assert(await launch.isEnabled());
  if(width===375&&scale===1){await launch.click();await page.locator('.match-layout').waitFor();await page.locator('.crown-match-intro').waitFor({state:'detached'});assert((await page.locator('.match-player-name strong').allTextContents()).includes('セイア'));}
  assert.deepEqual(errors,[]);results.push({width,height,lang,textScale:scale,pass:true,widthInfo,placement,checks:['QUBE does not overlap reward, controls or enemy labels','10 stage actions','direct SVG corridor','real reward preview/Escape/focus','side selection','locked-stage start guard',...(width===375&&scale===1?['Crown board handoff']:[])]});await context.close();
 }
 await writeFile(resolve(output,'result.json'),JSON.stringify({pass:true,source:'reference design QUBE placement correction after5f1371d',results,limits:'Real components/engine; identity/progress/admission isolated. Desktop viewport/text overrides, no physical Android performance claim.'},null,2)+'\n');console.log('Reference Crown corrected placement: 3 passed');
}finally{await browser?.close();await server.close();}
