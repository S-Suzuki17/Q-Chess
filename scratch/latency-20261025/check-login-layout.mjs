import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
const root=resolve(process.argv[2]||'out'),phase=process.argv[3]||'after';
const output=resolve('scratch/latency-20261025/login-layout');await mkdir(output,{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
  const file=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
  if(!file.startsWith(root+sep))throw Error('outside export');
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
try{
 for(const [width,height,lang] of [[390,844,'ja'],[320,568,'ja'],[1280,900,'en'],[390,844,'ta']]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.addInitScript(lang=>{localStorage.setItem('qg_language',lang);localStorage.setItem('qg_sound_config',JSON.stringify({masterMute:true}));},lang);
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);const login=page.locator('.title-auth-actions button');await login.waitFor();
  await page.waitForFunction(lang=>document.documentElement.lang===lang,lang);
  const geometry=await page.evaluate(()=>{
   const login=document.querySelector('.title-auth-actions button'),guest=document.querySelector('.title-play'),preview=document.querySelector('.landing-game-preview');
   const rect=node=>{const b=node.getBoundingClientRect();return{top:b.top,bottom:b.bottom,left:b.left,right:b.right};};
   return{login:rect(login),guest:rect(guest),preview:rect(preview),background:getComputedStyle(login).backgroundColor,guestBackground:getComputedStyle(guest).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth+1,firstAction:document.querySelector('.title-screen-actions button')===login};
  });
  if(phase==='after'){
   assert(geometry.firstAction);assert(geometry.login.top>=0&&geometry.login.bottom<=height,'Login is immediately reachable');
   assert(geometry.login.bottom<=geometry.guest.top);assert.notEqual(geometry.background,geometry.guestBackground);assert(!geometry.overflow);
   if(width<768)assert(geometry.login.bottom<=geometry.preview.top);
  }
  await page.screenshot({path:resolve(output,`${phase}-${width}-${lang}.png`)});
  await login.click();await page.locator('.title-auth-dialog[open]').waitFor();
  await page.locator('.title-auth-dialog > footer button').click();await page.locator('.title-auth-dialog').waitFor({state:'detached'});
  assert(await login.evaluate(element=>element===document.activeElement),'Cancel restores focus');
  assert.deepEqual(errors,[]);results.push({width,height,lang,geometry,dialogAndCancelPassed:true});await context.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(resolve(output,`${phase}.json`),JSON.stringify({phase,results},null,2));}
console.log(JSON.stringify({phase,cases:results.length,liveMutations:0,passed:true}));
