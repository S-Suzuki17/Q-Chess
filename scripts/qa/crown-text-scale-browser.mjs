/** Focused missing coverage: real Crown UI at 375px with doubled text sizes. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {startMotionFixture} from './crown-motion-server.mjs';
const output=resolve(process.argv[2]??'scratch/crown-text-scale');await mkdir(output,{recursive:true});
const {server,base}=await startMotionFixture();let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.QG_TEST_CHROMIUM});
 const context=await browser.newContext({viewport:{width:375,height:812},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 await context.addInitScript(()=>{localStorage.setItem('qchess_is2DView','true');localStorage.setItem('qg_sound_config',JSON.stringify({masterMute:true,bgmVolume:0,seVolume:0}));});
 await page.goto(`${base}/?lang=de&cleared=99`,{waitUntil:'domcontentloaded'});
 await page.locator('[data-stage="100"]').click();
 await page.locator('.crown-opponent [data-character-art="blender"]').waitFor();
 const scaled=await page.evaluate(()=>{
  const nodes=[...document.querySelectorAll('.crown-screen *')].filter(node=>[...node.childNodes].some(child=>child.nodeType===Node.TEXT_NODE&&child.textContent.trim()));
  const sizes=nodes.map(node=>[node,parseFloat(getComputedStyle(node).fontSize)]);
  for(const [node,size] of sizes)node.style.fontSize=`${size*2}px`;
  return sizes.length;
 });
 assert(scaled>10);
 const width=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));assert(width.page<=width.viewport+1);
 const launch=page.locator('.crown-encounter .campaign-primary');await launch.scrollIntoViewIfNeeded();assert(await launch.isEnabled());
 await page.screenshot({path:resolve(output,'crown-375-de-double-text.png'),fullPage:true});
 await launch.click();await page.locator('.crown-match-intro').waitFor({state:'detached'});
 assert((await page.locator('.match-player-name strong').allTextContents()).includes('Aureus'));
 await page.locator('[data-square="e2"]').click();assert.equal(await page.getByTestId('selected-square').textContent(),'e2');assert.deepEqual(errors,[]);
 await context.close();
 await writeFile(resolve(output,'result.json'),JSON.stringify({passed:true,viewport:{width:375,height:812},language:'de',textSizeMultiplier:2,scaledTextElements:scaled,width,checks:['no horizontal overflow','final King name preserved','challenge reachable and clickable','real board selection after introduction'],limits:'Desktop Chromium viewport and explicit computed-font overrides; not physical Android accessibility or OS font scaling.',errors},null,2)+'\n');
 console.log('375px German / doubled text: passed');
}finally{await browser?.close();await server.close();}
