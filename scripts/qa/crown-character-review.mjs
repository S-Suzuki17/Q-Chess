import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {startMotionFixture} from './crown-motion-server.mjs';
const output=resolve(process.argv[2]??'scratch/crown-character-review');await mkdir(output,{recursive:true});const{server,base}=await startMotionFixture();let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.QG_TEST_CHROMIUM});const context=await browser.newContext({viewport:{width:1280,height:760},reducedMotion:'reduce'}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 await page.goto(base+'/?view=toon-review');await page.waitForFunction(()=>document.querySelectorAll('[data-character-art="toon"]').length===6);await page.screenshot({path:resolve(output,'six-characters-with-qube.png'),fullPage:true});assert.deepEqual(errors,[]);
 const images=await page.locator('.crown-character-still').evaluateAll(nodes=>nodes.map(img=>({src:new URL(img.src).pathname,width:img.naturalWidth,height:img.naturalHeight,complete:img.complete})));assert(images.every(x=>x.complete&&x.width===256&&x.height===288));
 const result={status:'passed',createdAt:new Date().toISOString(),browser:browser.version(),scope:'Actual game portrait components and unchanged QUBE at representative display sizes; synthetic fixture, external traffic blocked.',images,errors,output};await writeFile(resolve(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:'passed',characters:6,output}));await context.close();
}finally{await browser?.close();await server.close();}
