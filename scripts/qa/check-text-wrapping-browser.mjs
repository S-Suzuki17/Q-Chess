import {settingsSections,chooseSettingsSection} from './settings-navigation.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {startSecondaryScreensFixture} from './secondary-screens-server.mjs';

import {textWrapping} from './text-wrapping.mjs';
export {textWrapping} from './text-wrapping.mjs';

if(process.argv[1]?.endsWith('check-text-wrapping-browser.mjs')){
 const output=resolve(process.argv[2]??'scratch/text-wrapping-browser'),observe=process.argv.includes('--observe'),native=process.argv.includes('--native-only');await mkdir(output,{recursive:true});
 const languages=process.argv.find(arg=>arg.startsWith('--languages='))?.slice(12).split(',')??['ja','en','zh','de','fr','es','pt','ru','tr','pl','hi','ta'];
 const screens=process.argv.find(arg=>arg.startsWith('--screens='))?.slice(10).split(',')??['settings','waiting','map','guide','rules','tutorial'];
 if(!screens.length||screens.some(screen=>!['settings','waiting','map','guide','rules','tutorial'].includes(screen)))throw new Error('Unknown screen selection.');
 const viewports=process.argv.find(arg=>arg.startsWith('--viewports='))?.slice(12).split(',').map(value=>value.split('x').map(Number))??[[320,568],[390,844]];
 if(viewports.some(pair=>pair.length!==2||pair.some(value=>!Number.isFinite(value)||value<280)))throw new Error('Invalid viewport selection.');
 const expectedCases=languages.length*viewports.length;
 const {server,base}=await startSecondaryScreensFixture();let browser;const results=[];
 try{
  browser=await chromium.launch({headless:true,...(process.env.QG_TEST_CHROMIUM?{executablePath:process.env.QG_TEST_CHROMIUM}:{})});
  for(const lang of languages)for(const [width,height]of viewports){
   const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),page=await context.newPage();
   await context.routeWebSocket('**/*',socket=>socket.close());
   await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   await page.addInitScript(language=>localStorage.setItem('qg_language',language),lang);
   const checks=[];
   const record=async(screen,selector)=>{
    await page.evaluate(()=>document.fonts.ready);
    const check={screen,...await textWrapping(page,selector,lang)};
    const compact=screen.startsWith('settings')?'.settings-content':(screen==='map'||screen.startsWith('collection-'))?'.crown-tab-panel:not([hidden])':screen==='waiting'?'.online-match-waiting':screen==='tutorial'?'.tutorial-shell':null;
    if(compact)check.fit=await page.locator(compact).evaluate(element=>{
     const rect=element.getBoundingClientRect();return {needsScrolling:element.scrollHeight>element.clientHeight+2,outsideViewport:rect.top< -1||rect.bottom>innerHeight+1};
    });
    checks.push(check);
    if(check.broken.length||check.clippedWords.length||check.horizontalOverflow||check.fit?.needsScrolling||check.fit?.outsideViewport)await page.screenshot({path:resolve(output,`${screen}-${lang}-${width}.png`)});
   };
   if(screens.includes('settings')){
   await page.goto(base+'/?'+(native?'native&':'')+'lang='+lang,{waitUntil:'domcontentloaded',timeout:60000});await page.locator('#settings-opener').click();
   for(const [index,section] of (await settingsSections(page)).entries()){
    console.log(`${lang} ${width}: checking settings ${section}`);await chooseSettingsSection(page,section);await record('settings-'+index,'.game-settings');
    if(native&&await page.locator('[data-settings-page-next]').isVisible()){await page.locator('[data-settings-page-next]').click();await record('settings-'+index+'-extra','.game-settings');}
   }
   }
   for(const [screen,selector]of (native?[]:[['waiting','.online-match-waiting'],['map','.map-screen'],['guide','.game-page'],['rules','.game-page'],['tutorial','.tutorial-shell']])){
    if(!screens.includes(screen))continue;
    console.log(`${lang} ${width}: checking ${screen}`);await page.goto(base+'/?screen='+screen+'&lang='+lang,{waitUntil:'domcontentloaded',timeout:60000});await page.locator(selector).waitFor();
    await record(screen,selector);
    if(screen==='map'){
     await page.locator('#crown-main-tab-collection').click();
     for(const category of ['board','piece','avatar','effect','music']){
      await page.locator('#crown-category-tab-'+category).click();await record('collection-'+category,'.map-screen');
     }
    }
   }
   const violations=checks.flatMap(check=>[...check.broken.map(item=>({screen:check.screen,...item})),...check.clippedWords.map(item=>({screen:check.screen,clipped:true,...item})),...(check.horizontalOverflow?[{screen:check.screen,horizontalOverflow:true}]:[]),...(check.fit?.needsScrolling||check.fit?.outsideViewport?[{screen:check.screen,...check.fit}]:[])]);
   results.push({lang,width,height,nativeFixture:native,pass:violations.length===0,violations,checks});await context.close();
   await writeFile(resolve(output,'result.json'),JSON.stringify({scope:'Real component text, word boundaries from Intl.Segmenter; native automatic hyphenation recorded separately. Compact controls must fit; long articles retain scrolling. External requests blocked; browser viewports only.',observationOnly:observe,screens,expectedCases,complete:results.length===expectedCases,pass:results.length===expectedCases&&results.every(result=>result.pass),results},null,2)+'\n');
   console.log(`${lang} ${width}: ${violations.length} wrapping/fit issues`);
  }
  if(!observe&&results.some(result=>result.violations.length))process.exitCode=1;
 }finally{await browser?.close();await server.close();}
}
