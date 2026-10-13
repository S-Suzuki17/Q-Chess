import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {startMotionFixture} from './crown-motion-server.mjs';
const output=resolve(process.argv[2]??'scratch/castle-quest-browser');await mkdir(output,{recursive:true});
const stub=resolve('scripts/qa/fixtures/castle-quest/stubs.tsx');
const {server,base}=await startMotionFixture(0,{stateStub:stub,boardStub:stub});
let browser;const results=[];
const stats=page=>page.evaluate(()=>({...window.qaQuest,stored:JSON.parse(localStorage.getItem('qa_castle_progress')??'null')}));
const launch=page=>page.locator('.crown-launch .campaign-primary').click();
const ready=page=>page.locator('.crown-reference').waitFor();
const win=async page=>{await launch(page);await page.locator('[data-qa-win]').click();await page.locator('.campaign-result[data-result="win"]').waitFor();};
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.QG_TEST_CHROMIUM});
 for(const [width,height,lang,scale] of [[375,812,'ja',1],[320,568,'ja',1],[390,844,'ja',1],[844,390,'en',1],[1280,800,'en',1],[375,812,'de',2]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'no-preference',recordVideo:width===375&&scale===1?{dir:resolve(output,'recording'),size:{width,height}}:undefined}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.log('page error: '+e.message);});await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.addInitScript(()=>{localStorage.setItem('qg_sound_config',JSON.stringify({masterMute:true,bgmVolume:0,seVolume:0}));});
  await page.goto(base+'/?cleared=0&lang='+lang);await ready(page);await page.waitForTimeout(1500);
  await page.screenshot({path:resolve(output,'room-'+width+'-'+lang+'.png'),fullPage:true});
  await win(page);await page.locator('.castle-victory-scene[data-crown-motion="settled"]').waitFor();assert.equal((await stats(page)).updates,1,'duplicate outcome must save once');
  if(width===375&&scale===1)await page.screenshot({path:resolve(output,'victory-before-travel.png')});
  await page.locator('[data-castle-go-deeper]').click();await ready(page);
  if(scale===2)await page.evaluate(()=>{const items=[...document.querySelectorAll('.crown-reference *')].filter(n=>[...n.childNodes].some(c=>c.nodeType===3&&c.textContent.trim())).map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);for(const[n,size]of items)n.style.fontSize=size*2+'px';});
  assert.equal(await page.locator('.crown-reference').getAttribute('data-circuit-stage'),'2');
  await page.locator('[data-castle-journey="1:2"]').waitFor();
  await page.waitForTimeout(450);
  const motion=await page.evaluate(()=>({state:document.querySelector('[data-castle-journey]')?.getAttribute('data-crown-motion'),reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,far:getComputedStyle(document.querySelector('[data-castle-layer="far"]')).transform,near:getComputedStyle(document.querySelector('[data-castle-layer="near"]')).transform,leg:getComputedStyle(document.querySelector('.castle-scene-qube [data-qube-part="leg-left"]')).animationName,enemy:document.querySelector('.castle-scene-enemy[data-crown-enemy-id]')?.getAttribute('data-crown-enemy-id')}));
  console.log('motion sample: '+JSON.stringify(motion));
  assert.notEqual(motion.far,motion.near);assert.equal(motion.leg,'castle-qube-step');
  await page.screenshot({path:resolve(output,'travel-'+width+'-'+lang+'.png'),fullPage:true});
  assert.equal(await page.locator('[data-qa-result-source]').count(),0,'journey must never start another match');
  await page.locator('[data-castle-journey]').waitFor({state:'detached'});
  assert.equal((await stats(page)).updates,1);assert.equal((await stats(page)).stored.stageStars.length,1);
  const overflow=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));assert(overflow.width<=width+1,'no horizontal overflow');
  assert.match(await page.locator('.crown-opponent-info strong').textContent(),lang==='ja'?/カイル/:/Kyle/);
  const placement=await page.evaluate(()=>{
    const box=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
    return{room:box('.crown-encounter'),enemy:box('[data-castle-actor]'),qube:box('[data-castle-qube]'),reward:box('.crown-next-reward'),launch:box('.crown-launch'),labels:box('.crown-opponent-info'),heading:box('.crown-encounter h2')};
  });
  const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  await writeFile(resolve(output,'placement-'+width+'-'+lang+'.json'),JSON.stringify(placement,null,2)+'\n');
  assert(Math.abs(placement.enemy.x+placement.enemy.width/2-placement.room.x-placement.room.width/2)<22,'enemy body and held weapon centered in castle');
  assert(placement.reward.width/placement.room.width<.34,'reward is a small card');
  for(const [a,b]of [['enemy','reward'],['enemy','qube'],['enemy','labels'],['qube','reward'],['qube','labels'],['qube','launch'],['reward','launch'],['reward','labels'],['reward','heading']])assert.equal(overlap(placement[a],placement[b]),0,a+' overlaps '+b);
  await page.screenshot({path:resolve(output,'arrival-'+width+'-'+lang+'.png'),fullPage:true});
  if(width===320||scale===2){await page.locator('[data-castle-qube]').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,'scrolled-scene-'+width+'-'+lang+'.png')});await page.locator('.crown-launch .campaign-primary').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,'scrolled-controls-'+width+'-'+lang+'.png')});await page.locator('.crown-route-node').last().scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,'scrolled-all-stages-'+width+'-'+lang+'.png')});}
  await page.locator('.crown-next-reward').click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});assert(await page.locator('.crown-next-reward').evaluate(n=>n===document.activeElement));
  await page.locator('.campaign-side button').last().click();await page.waitForTimeout(50);assert.equal(await page.locator('[data-castle-journey]').count(),0,'side change must not replay travel');
  await launch(page);assert.equal(await page.locator('[data-qa-result-source]').getAttribute('data-qa-result-source'),'2','next match starts only on challenge');
  assert.deepEqual(errors,[]);results.push({case:'win-depth-new-enemy',width,height,lang,textScale:scale,motion,overflow,pass:true});
  if(width===375&&scale===1){await context.close();await page.video().saveAs(resolve(output,'victory-depth-next-enemy.webm'));}else await context.close();
  console.log('Quest layout / travel passed: '+width+' '+lang+' x'+scale);
 }
 for(const scenario of (process.argv.includes('--layouts-only')?[]:['skip','reduced','hidden','start-during-travel','reload','back','save-error','loss','draw','99','100','revoked'])){
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:scenario==='reduced'?'reduce':'no-preference'}),page=await context.newPage();
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.addInitScript(()=>localStorage.setItem('qg_sound_config',JSON.stringify({masterMute:true,bgmVolume:0,seVolume:0})));
  const cleared=scenario==='99'?98:scenario==='100'?99:0;
  await page.goto(base+'/?cleared='+cleared+'&lang=ja'+(scenario==='save-error'?'&saveError=1':''));await ready(page);
  if(scenario==='loss'||scenario==='draw'){
   await launch(page);await page.locator('[data-qa-'+scenario+']').click();assert.equal(await page.locator('[data-castle-go-deeper]').count(),0);assert.equal((await stats(page)).stored.stageStars.length,0);
  }else if(scenario==='revoked'){
   await launch(page);await page.evaluate(()=>window.qaQuest.revoked=true);await page.locator('[data-qa-win]').click();assert.equal((await stats(page)).updates,0);assert.equal(await page.locator('.campaign-result').count(),0);
  }else{
   await win(page);
   if(scenario==='save-error'||scenario==='100'){assert.equal(await page.locator('[data-castle-go-deeper]').count(),0);if(scenario==='save-error')assert.equal((await stats(page)).stored,null);}
   else{
    await page.locator('[data-castle-go-deeper]').click();await ready(page);
    if(scenario==='skip'){await page.locator('[data-castle-travel-skip]').click();assert(await page.locator('.crown-launch .campaign-primary').evaluate(n=>n===document.activeElement));}
    if(scenario==='reduced'){await page.waitForTimeout(300);assert.equal(await page.locator('[data-castle-journey]').count(),0);}
    if(scenario==='hidden'){await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(50);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await page.locator('[data-castle-journey]').count(),0);}
    if(scenario==='start-during-travel'){await launch(page);assert.equal(await page.locator('[data-qa-result-source]').getAttribute('data-qa-result-source'),'2');}
    if(scenario==='reload'){await page.reload();await ready(page);assert.equal(await page.locator('.crown-reference').getAttribute('data-circuit-stage'),'2');assert.equal(await page.locator('[data-castle-journey]').count(),0);}
    if(scenario==='back'){await page.evaluate(()=>window.dispatchEvent(new PopStateEvent('popstate')));assert.equal(await page.locator('[data-castle-journey]').count(),0);}
    if(scenario==='99'){await page.locator('[data-castle-journey]').waitFor({state:'detached'});assert.equal(await page.locator('.crown-reference').getAttribute('data-circuit-stage'),'100');assert.equal(await page.locator('[data-final-throne="true"]').count(),1);assert.match(await page.locator('.crown-opponent-info strong').textContent(),/アウレウス/);}
    if(scenario!=='reload')assert.equal((await stats(page)).updates,1,'decoration does not write progress');
   }
  }
  results.push({case:scenario,pass:true});await context.close();console.log('Quest lifecycle passed: '+scenario);
 }
 await writeFile(resolve(output,'result.json'),JSON.stringify({pass:true,sourceBase:'62ef233',results,limits:'Real CampaignMode, Result, castle, QUBE and enemy components. Local synthetic identity/progress transport and injected match outcome; no production account, gameplay result, payment or DB. Desktop Chromium viewport tests; hidden event is synthetic; physical Android not tested.'},null,2)+'\n');
}finally{await browser?.close();await server.close();}
