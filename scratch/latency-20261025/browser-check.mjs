import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const base = 'http://127.0.0.1:4253';
const output = resolve('scratch/latency-20261025');
const browser = await chromium.launch({channel:'chrome',headless:true});
const results=[];
try {
 for (const viewport of [{width:1440,height:960},{width:390,height:844}]) {
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.addInitScript(()=>{
   localStorage.setItem('qchess_is2DView','true');
   localStorage.setItem('qg_sound_config',JSON.stringify({bgmVolume:0,seVolume:0,masterMute:true}));
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/?view=practice-locale&lang=ja');
  await page.locator('.match-intro').waitFor({state:'detached'});
  await page.getByRole('button',{name:'2D',exact:true}).click();
  await page.locator('[data-square="e2"]').waitFor();
  const selectionMs=await page.evaluate(()=>new Promise((resolve,reject)=>{
   const start=performance.now();
   const timer=setTimeout(()=>{observer.disconnect();reject(Error('selection timeout'));},5000);
   const observer=new MutationObserver(()=>{
    if(document.querySelector('[data-testid="selected-square"]')?.textContent?.includes('e2')){
     observer.disconnect();clearTimeout(timer);resolve(performance.now()-start);
    }
   });
   observer.observe(document.body,{childList:true,subtree:true,attributes:true});
   document.querySelector('[data-square="e2"]').click();
  }));
  assert(await page.locator('[data-move-target="true"]').count()>0);
  await page.locator('[data-square="e7"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.match-history li').length>=2);
  await page.locator('.match-hint-action').click();
  await page.locator('[data-testid="hint-destination"]').waitFor();
  await page.getByRole('button',{name:'3D',exact:true}).click();
  await page.locator('[data-graphics-state="ready"]').waitFor();
  const geometry=await page.evaluate(()=>{
   const board=document.querySelector('[data-testid="match-board"]').getBoundingClientRect();
   const layout=document.querySelector('.match-layout');
   return {width:board.width,height:board.height,overflow:layout.scrollWidth>layout.clientWidth+1};
  });
  assert(geometry.width>0&&!geometry.overflow);assert.deepEqual(errors,[]);
  await page.screenshot({path:resolve(output,`practice-${viewport.width}.png`)});
  results.push({viewport,selectionMs,geometry,passed:true,checks:['2D selection','legal capture','CPU reply','free hint','3D switch']});
  console.log(JSON.stringify(results.at(-1)));
  await context.close();
 }
} finally {
 await writeFile(resolve(output,'browser-results.json'),JSON.stringify(results,null,2));
 await browser.close();
}
