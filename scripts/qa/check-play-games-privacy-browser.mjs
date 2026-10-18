// The actual exported privacy page, all supported languages, no live traffic.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {chromium} from 'playwright';
import {playGamesPrivacy} from '../../src/locales/playGamesPrivacy.ts';
import {textWrapping} from './text-wrapping.mjs';
const args=process.argv.slice(2),positional=args.filter(arg=>!arg.startsWith('--'));
assert(positional.length<=2&&args.every(arg=>!arg.startsWith('--')||arg.startsWith('--languages=')),'Unknown option');
const [source='out',destination='scratch/play-games-privacy']=positional;
const requested=args.find(arg=>arg.startsWith('--languages='))?.slice(12).split(',');
assert(!requested||requested.every(lang=>Object.hasOwn(playGamesPrivacy,lang)),'Unknown language');
const root=resolve(source),evidence=resolve(destination),languages=requested??Object.keys(playGamesPrivacy);
assert.equal(Object.keys(playGamesPrivacy).length,12);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),file=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
 if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port,results=[];let browser;
try{
 await mkdir(evidence,{recursive:true});
 const initial=await readFile(resolve(root,'privacy/index.html'),'utf8');
 assert(initial.includes('data-play-games-privacy')&&initial.includes(playGamesPrivacy.en),'Disclosure must be present in initial English HTML');
 browser=await chromium.launch({headless:true,...(process.env.QG_TEST_CHROMIUM?{executablePath:process.env.QG_TEST_CHROMIUM}:{})});
 for(const [width,height]of [[320,568],[390,844]])for(const lang of languages){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'}),errors=[];
  await context.routeWebSocket('**/*',socket=>socket.close());
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.addInitScript(lang=>localStorage.setItem('qg_language',lang),lang);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto(origin+'/privacy/',{waitUntil:'domcontentloaded'});
   const section=page.locator('main[lang="'+lang+'"] [data-play-games-privacy]');await section.waitFor();
   await page.evaluate(()=>document.fonts.ready);
   assert.equal(await section.locator('p').innerText(),playGamesPrivacy[lang]);
   assert.equal(await section.locator('a').getAttribute('href'),'https://support.google.com/googleplay/answer/9130646');
   const renderedFonts=[];
   if(['hi','ta'].includes(lang)){
    const devtools=await context.newCDPSession(page);
    try{
     await devtools.send('DOM.enable');await devtools.send('CSS.enable');
     const {root:documentRoot}=await devtools.send('DOM.getDocument');
     const {nodeId}=await devtools.send('DOM.querySelector',{nodeId:documentRoot.nodeId,selector:'[data-play-games-privacy] p'});
     const {fonts}=await devtools.send('CSS.getPlatformFontsForNode',{nodeId});
     renderedFonts.push(...fonts.map(font=>({family:font.familyName,postScriptName:font.postScriptName,custom:font.isCustomFont,glyphs:font.glyphCount})));
     const required=lang==='hi'?'notosansdevanagari':'notosanstamil';
     assert(fonts.some(font=>font.isCustomFont&&font.glyphCount>0&&(font.familyName+font.postScriptName).toLowerCase().replace(/[^a-z]/g,'').includes(required)),lang+' must use its bundled script font');
    }finally{await devtools.detach();}
   }
   await section.scrollIntoViewIfNeeded();
   const audit=await textWrapping(page,'[data-play-games-privacy]',lang);
   assert.equal(audit.effectiveLanguage,lang);
   assert.deepEqual(audit.broken,[],lang+' broken words');assert.deepEqual(audit.clippedWords,[],lang+' clipped words');
   assert.equal(audit.horizontalOverflow,false);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
   if(width===320&&['ja','ta','de'].includes(lang))await page.screenshot({path:resolve(evidence,lang+'-320.png')});
   results.push({lang,width,height,pass:true,fullApprovedCopy:true,renderedFonts,wordFlow:audit});
  }catch(error){await page.screenshot({path:resolve(evidence,lang+'-'+width+'-failure.png')});throw error;}
  finally{await context.close();}
 }
 assert.equal(results.length,languages.length*2);
 await writeFile(resolve(evidence,'result.json'),JSON.stringify({pass:true,complete:true,source:root,initialHtml:true,cases:results.length,languages:languages.length,liveMutations:0,results},null,2)+'\n');
 console.log(JSON.stringify({pass:true,cases:results.length,languages:languages.length,initialHtml:true,liveMutations:0}));
}finally{await browser?.close();await new Promise(done=>{server.close(done);server.closeAllConnections();});}
