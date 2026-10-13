import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {startMotionFixture} from './crown-motion-server.mjs';
const output=resolve(process.argv[2]??'scratch/castle-transitions');await mkdir(output,{recursive:true});
const stub=resolve('scripts/qa/fixtures/castle-quest/stubs.tsx'),{server,base}=await startMotionFixture(0,{stateStub:stub,boardStub:stub});let browser;const results=[];
const hidden=async(page,state)=>page.evaluate(value=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>value});document.dispatchEvent(new Event('visibilitychange'));},state);
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.QG_TEST_CHROMIUM});
 for(const name of ['defeat-skip','defeat-reduced-mid','defeat-hidden','defeat-next-immediate','defeat-final-100','save-error','loss','draw','intro-skip','intro-reduced-mid','intro-hidden','intro-cancel']){
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'no-preference'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());await page.addInitScript(()=>localStorage.setItem('qg_sound_config',JSON.stringify({masterMute:true,bgmVolume:0,seVolume:0})));
  if(name.startsWith('intro')){
   await page.goto(base+'/?view=transition-review');await page.locator('[data-open-intro]').click();await page.locator('.crown-match-intro [data-castle-actor]').waitFor();
   assert.equal(await page.locator('.crown-intro-stage [data-qube-artwork]').count(),1);
   if(name==='intro-skip'){await page.locator('[data-crown-skip]').click({clickCount:2});}
   if(name==='intro-reduced-mid'){await page.waitForTimeout(80);await page.emulateMedia({reducedMotion:'reduce'});}
   if(name==='intro-hidden'){await hidden(page,true);await page.waitForTimeout(1900);assert.equal((await page.evaluate(()=>window.qaQuestTransitions)).done,0);await hidden(page,false);}
   if(name==='intro-cancel'){await page.keyboard.press('Escape');await page.waitForTimeout(1900);}
   await page.locator('.crown-match-intro').waitFor({state:'detached'});assert.deepEqual(await page.evaluate(()=>window.qaQuestTransitions),name==='intro-cancel'?{done:0,cancel:1}:{done:1,cancel:0});
  }else{
   await page.goto(base+'/?lang=ja&cleared='+(name==='defeat-final-100'?99:0)+(name==='save-error'?'&saveError=1':''));await page.locator('.crown-launch .campaign-primary').click();
   await page.locator('[data-qa-'+(name==='loss'||name==='draw'?name:'win')+']').click();await page.locator('.campaign-result').waitFor();
   if(name==='loss'||name==='draw'){assert.equal(await page.locator('[data-castle-defeated]').count(),0);assert.equal(await page.locator('[data-castle-go-deeper]').count(),0);}
   else if(name==='save-error'){assert.equal(await page.locator('[data-castle-defeated]').count(),0);assert.equal(await page.locator('[data-castle-go-deeper]').count(),0);}
   else{
    await page.locator('.castle-victory-scene[data-castle-defeated="true"]').waitFor();
    if(name==='defeat-skip'){await page.locator('[data-castle-defeat-skip]').click();assert(await page.locator('[data-castle-go-deeper]').evaluate(n=>n===document.activeElement));}
    if(name==='defeat-reduced-mid'){await page.waitForTimeout(80);await page.emulateMedia({reducedMotion:'reduce'});}
    if(name==='defeat-hidden'){await hidden(page,true);await hidden(page,false);}
    if(name==='defeat-next-immediate'){await page.locator('[data-castle-go-deeper]').click({clickCount:2});await page.locator('[data-castle-travel-skip]').click();assert.equal(await page.locator('.crown-reference').getAttribute('data-circuit-stage'),'2');assert.equal(await page.locator('[data-qa-result-source]').count(),0);}
    else {await page.locator('.castle-victory-scene[data-crown-motion="settled"]').waitFor();const animation=await page.locator('.castle-victory-scene').evaluate(node=>node.getAnimations({subtree:true}).filter(a=>a.playState==='running').length);assert.equal(animation,0);await page.screenshot({path:resolve(output,name+'.png')});}
    if(name==='defeat-final-100'){assert.equal(await page.locator('[data-castle-go-deeper]').count(),0);assert.equal(await page.locator('[data-castle-actor="crown-king"]').count(),1);}
   }
   assert.equal(await page.evaluate(()=>window.qaQuest.updates),1,'one result save; visual phases never save');
  }
  assert.deepEqual(errors,[]);results.push({case:name,pass:true});console.log('Changed quest transition passed: '+name);await context.close();
 }
 await writeFile(resolve(output,'result.json'),JSON.stringify({pass:true,results,scope:'Actual unified result/entrance/journey UI; synthetic identity/progress/outcome, no production write. Hidden event is simulated; no physical Android performance claim.'},null,2)+'\n');
}finally{await browser?.close();await server.close();}
