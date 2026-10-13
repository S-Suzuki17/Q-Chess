/** Actual 2D engine/CPU worker; public first-move crash regression, no external transport. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {startMotionFixture} from './crown-motion-server.mjs';
const output=resolve(process.argv[2]??'scratch/practice-locale');await mkdir(output,{recursive:true});
const reproduce=process.argv.includes('--reproduce'),languages=reproduce?['hi','de','fr']:['ja','en','zh','ru','fr','de','es','tr','pl','hi','pt','ta'];
const results=[];let browser,fixture;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.QG_TEST_CHROMIUM});
 fixture=await startMotionFixture();
 for(const lang of languages){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  await context.route('**/*',r=>new URL(r.request().url()).origin===fixture.base?r.continue():r.abort());
  await context.addInitScript(()=>{localStorage.setItem('qchess_is2DView','true');localStorage.setItem('qg_sound_config',JSON.stringify({masterMute:true,bgmVolume:0,seVolume:0}));});
  page.on('pageerror',e=>errors.push({message:e.message,stack:e.stack}));
  await page.goto(fixture.base+'/?view=practice-locale&lang='+lang);
  await page.locator('.match-intro').waitFor({state:'detached'});
  await page.locator('[data-square="e2"]').click();assert.equal(await page.getByTestId('selected-square').textContent(),'e2');
  if(reproduce){
   const errorPromise=page.waitForEvent('pageerror',{timeout:15000});
   await page.locator('[data-square="f4"]').click();const error=await errorPromise;
   assert(error.message.includes(`reading '${{hi:7,de:3,fr:2}[lang]}'`));
  }else{
   await page.locator('[data-square="f4"]').click();
   await page.waitForFunction(()=>document.querySelectorAll('.match-history li').length>=2,{},{timeout:20000});
   // The live history displays newest moves first; the first human move is last.
   const first=await page.locator('.match-history li').last().innerText();assert(first.includes('e2')&&first.includes('f4'));
   assert.equal(await page.locator('.match-layout').count(),1);assert.equal(errors.length,0);
   await page.screenshot({path:resolve(output,`first-move-${lang}.png`),fullPage:true});
   results.push({lang,pass:true,mode:'Guest CPU practice / 2D / Easy / White / 10m',first,historyLength:await page.locator('.match-history li').count(),actualEngineAndWorker:true,errors});
  }
  if(reproduce){await page.screenshot({path:resolve(output,`reproduced-${lang}.png`)});results.push({lang,reproduced:true,errors});}
  console.log((reproduce?'REPRODUCED ':'PASS ')+lang);await context.close();
 }
 await writeFile(resolve(output,'result.json'),JSON.stringify({pass:!reproduce,reproduced:reproduce,results,limits:'Actual current source, real engine and local CPU worker. No production auth/DB, online multiplayer, ads, payment or physical Android proof. External requests aborted.'},null,2)+'\n');
}finally{await browser?.close();await fixture?.server.close();}
