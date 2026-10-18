import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {startMotionFixture} from './crown-motion-server.mjs';
const output=resolve(process.argv[2]??'scratch/hundred-map-browser');await mkdir(output,{recursive:true});
const stub=resolve('scripts/qa/fixtures/castle-quest/stubs.tsx');
const {server,base}=await startMotionFixture(0,{stateStub:stub,boardStub:stub});let browser;const results=[];
const ready=page=>page.locator('.map-screen').waitFor();
const launch=page=>page.locator('.map-launch .campaign-primary').click();
const stats=page=>page.evaluate(()=>({...window.qaQuest,stored:JSON.parse(localStorage.getItem('qa_castle_progress')??'null')}));
const win=async page=>{await launch(page);await page.locator('[data-qa-win]').click();await page.locator('.map-result[data-result=win]').waitFor();};
const absentCastles=async page=>assert.equal(await page.locator('[data-castle-actor],.crown-castle-scene,.castle-victory-scene,[data-crown-enemy-id]').count(),0);
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.QG_TEST_CHROMIUM});
 for(const [width,height,lang,scale] of [[375,812,'ja',1],[320,568,'ja',1],[1280,800,'en',1],[844,390,'en',1],[375,812,'de',2]]){
  const recordVideo=width===375&&scale===1&&process.env.QG_TEST_SKIP_VIDEO!=='1';
  const context=await browser.newContext({viewport:{width,height},recordVideo:recordVideo?{dir:resolve(output,'recording'),size:{width,height}}:undefined}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+'/?cleared=0&lang='+lang);await ready(page);await absentCastles(page);
  if(scale===2)await page.evaluate(()=>{for(const n of [...document.querySelectorAll('.map-screen *')].filter(n=>[...n.childNodes].some(c=>c.nodeType===3&&c.textContent.trim())))n.style.fontSize=parseFloat(getComputedStyle(n).fontSize)*2+'px';});
  await page.locator('.map-overview-trigger').click();assert.equal(await page.locator('[data-map-overview-tile]').count(),100);await page.keyboard.press('Escape');assert.equal(await page.locator('.map-tile').count(),10);
  const boxes=await page.locator('.map-tile').evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));assert(boxes.every(b=>b.w>=44&&b.h>=44));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:resolve(output,`map-${width}-${lang}.png`)});
  await page.locator('.map-launch .campaign-primary').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,`controls-${width}-${lang}.png`)});
  await page.locator('.map-reward').click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');assert(await page.locator('.map-reward').evaluate(n=>n===document.activeElement));
  await win(page);assert.equal((await stats(page)).updates,1);await absentCastles(page);await page.screenshot({path:resolve(output,`clear-${width}-${lang}.png`)});
  await page.locator('[data-map-next]').click();await ready(page);await page.locator('[data-map-journey]').waitFor({state:'detached'});
  assert.equal(await page.locator('.challenge-map').getAttribute('data-map-frontier'),'2');assert.equal(await page.locator('.map-screen').getAttribute('data-circuit-stage'),'2');assert.equal(await page.locator('[data-qa-result-source]').count(),0);assert.equal((await stats(page)).updates,1);
  await page.locator('.map-tile[data-stage="1"]').click();assert.equal(await page.locator('.challenge-map').getAttribute('data-map-frontier'),'2');assert.equal((await stats(page)).updates,1);
  await page.locator('.map-tile[data-stage="3"]').click();assert(!(await page.locator('.map-launch .campaign-primary').isEnabled()));assert.equal((await stats(page)).updates,1);
  await page.locator('.map-tile[data-stage="2"]').click();await launch(page);assert.equal(await page.locator('[data-qa-result-source]').getAttribute('data-qa-result-source'),'2');assert.deepEqual(errors,[]);
  results.push({case:'map-layout-saved-clear-selection',width,height,lang,textScale:scale,pass:true});
  if(recordVideo){await context.close();await page.video().saveAs(resolve(output,'saved-clear-next-tile.webm'));}else await context.close();console.log('Map layout passed '+width+' '+lang);
 }
 for(const scenario of ['9-10','10-11','19-20','99-100','100-final','skip','reduced','hidden','back','save-error','loss','draw','replay','revoked','reload']){
  const before={'9-10':8,'10-11':9,'19-20':18,'99-100':98,'100-final':99,replay:9}[scenario]??0;
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:scenario==='reduced'?'reduce':'no-preference'}),page=await context.newPage();await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const controlled=['skip','hidden','back','revoked'].includes(scenario);if(controlled)await page.clock.install();
  await page.goto(base+'/?cleared='+before+'&lang=ja'+(scenario==='save-error'?'&saveError=1':''));await ready(page);
  if(scenario==='replay')await page.locator('.map-tile[data-stage="1"]').click();
  if(controlled)await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
  await launch(page);await page.locator(scenario==='loss'?'[data-qa-loss]':scenario==='draw'?'[data-qa-draw]':'[data-qa-win]').click();await page.locator('.map-result').waitFor();
  if(['100-final','save-error','loss','draw'].includes(scenario)){
   assert.equal(await page.locator('[data-map-next]').count(),0);await page.locator('.campaign-result-actions button').last().click();await ready(page);assert.equal(await page.locator('.challenge-map').getAttribute('data-map-frontier'),scenario==='100-final'?'100':String(before+1));assert.equal(await page.locator('[data-stage="101"]').count(),0);
  }else{
   if(scenario==='revoked')await page.evaluate(()=>{window.qaQuest.revoked=true;});
   await page.locator('[data-map-next]').click();
   if(scenario==='revoked'){assert.equal(await page.locator('.map-result').count(),1);}else{
    await ready(page);if(controlled)await page.clock.runFor(32);
    if(scenario==='skip'){await page.locator('[data-map-skip]').click();assert(await page.locator('.map-launch .campaign-primary').evaluate(n=>n===document.activeElement));}
    if(scenario==='hidden')await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    if(scenario==='back'){await page.locator('.crown-header button').first().click();if(controlled)await page.clock.runFor(1800);assert.equal(await page.locator('.map-screen').count(),0);}
    else if(scenario==='reload'){await page.reload();await ready(page);assert.equal(await page.locator('[data-map-journey]').count(),0);assert.equal((await stats(page)).updates,0);}
    else{await page.locator('[data-map-journey]').waitFor({state:'detached'});assert.equal(await page.locator('[data-qa-result-source]').count(),0);assert.equal(await page.locator('.challenge-map').getAttribute('data-map-frontier'),String(Math.min(100,scenario==='replay'?10:before+2)));}
   }
  }
  if(scenario!=='reload')assert.equal((await stats(page)).updates,1);results.push({case:scenario,pass:true,controlledJavaScriptClock:controlled,syntheticVisibility:scenario==='hidden'});await context.close();console.log('Map guard passed '+scenario);
 }
 await writeFile(resolve(output,'result.json'),JSON.stringify({pass:true,results,scope:'Real map/CampaignMode/Result. Synthetic identity, progress transport and duplicate match result; no live account, payment, DB, engine-play or physical Android claim.'},null,2)+'\n');
}finally{await browser?.close();await server.close();}
