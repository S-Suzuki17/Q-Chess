import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {startSecondaryScreensFixture} from './secondary-screens-server.mjs';
import {walkTutorial} from './tutorial-walkthrough.mjs';
const output=resolve(process.argv[2]??'scratch/learning-layout-browser');await mkdir(output,{recursive:true});
const {server,base}=await startSecondaryScreensFixture();let browser;const results=[];
const requestedCase=process.argv.find(arg=>arg.startsWith('--case='))?.slice(7);
const cases=(process.argv.includes('--zoom-only')?[[375,667,'ta',true]]:[[390,844,'ja'],[320,568,'ja'],[844,390,'en'],[1280,800,'en'],[390,844,'de'],[320,568,'ta']]).filter(([width,height,lang])=>!requestedCase||requestedCase===`${lang}:${width}x${height}`);
assert(cases.length,'Unknown learning layout case');
const save=async()=>writeFile(resolve(output,'result.json'),JSON.stringify({expectedCases:cases.length,complete:results.length===cases.length,pass:results.length===cases.length,scope:'Real learning pages and 25 engine-backed lessons, 2D default and 3D failure recovery; external traffic blocked. Browser viewports only; not physical Android.',results},null,2)+'\n');
try{
 browser=await chromium.launch({headless:true,...(process.env.QG_TEST_CHROMIUM?{executablePath:process.env.QG_TEST_CHROMIUM}:{})});
 for(const [width,height,lang,textScale200]of cases){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await context.routeWebSocket('**/*',socket=>socket.close());
  await context.route('**/*',route=>new URL(route.request().url()).origin===base&&!new URL(route.request().url()).pathname.endsWith('.glb')?route.continue():route.fulfill({status:503,json:{code:'LOCAL_QA_BLOCKED'}}));
  await context.addInitScript(value=>localStorage.setItem('qg_language',value),lang);
  try{
   for(const screen of textScale200?[]:['guide','rules']){
    await page.goto(base+'/?screen='+screen+'&lang='+lang,{waitUntil:'domcontentloaded',timeout:60000});await page.locator('.game-page h1').waitFor();
    assert(await page.locator('.game-page h1').evaluate(element=>element.scrollWidth<=element.clientWidth+1),'heading clipped');
    assert(await page.locator('.game-page').evaluate(element=>element.scrollWidth<=element.clientWidth+1),'horizontal overflow');
    await page.locator('.game-page').focus();await page.keyboard.press('End');
    await page.waitForFunction(()=>{const page=document.querySelector('.game-page');return page.scrollTop>=page.scrollHeight-page.clientHeight-2;});
    const bottom=await page.locator('.game-page-links').last().evaluate(element=>element.getBoundingClientRect().bottom);assert(bottom<=height+1,'last navigation clipped');
    if(screen==='guide'){
     await page.locator('.reading-section-picker select').selectOption('practice');
     await page.waitForFunction(()=>{const heading=document.querySelector('#practice-heading');return heading.getBoundingClientRect().top>=0&&heading.getBoundingClientRect().bottom<innerHeight;});
    }
    await page.screenshot({path:resolve(output,`${screen}-${width}-${lang}.png`)});
   }
   await page.goto(base+'/?screen=tutorial&lang='+lang,{waitUntil:'domcontentloaded',timeout:60000});await page.locator('[data-tutorial-step="0"]').waitFor();await page.locator('.board-render-fallback [data-square="e2"]').waitFor();
   await page.getByRole('button',{name:'3D',exact:true}).click();await page.locator('.tutorial-spatial-board .board-render-fallback [data-square="e2"]').waitFor();await page.getByRole('button',{name:'2D',exact:true}).click();await page.locator('.tutorial-flat-board [data-square="e2"]').waitFor();
   if(textScale200)await page.addStyleTag({content:'.tutorial-copy-space{font-size:24px!important;line-height:1.6!important}.tutorial-heading h2{font-size:34px!important}.tutorial-actions button,.tutorial-course-picker select,.tutorial-command strong{font-size:20px!important}'});
   const tutorialResult=await walkTutorial(page,{readAllCopy:true,checkRecovery:true,strictFit:!textScale200,onLesson:async({id})=>{
    if(['pawn-step','castle','promotion','quantum-mate'].includes(id))await page.screenshot({path:resolve(output,`tutorial-${id}-${width}-${lang}.png`)});
   }});
   await page.locator('[data-qa-home]').waitFor();
   const unexpected=errors.filter(error=>!/^Could not load \/models\/.*\.glb:/.test(error));assert.deepEqual(unexpected,[]);
   results.push({width,height,lang,textScale200:!!textScale200,...tutorialResult,allCopyPagesReadWithoutLoss:true,controlsInsideViewport:!textScale200,enlargedTextOverflowFallback:!!textScale200,guideEndReachableByKeyboard:!textScale200,guideSectionNavigation:!textScale200,pass:true});await save();console.log(`Learning ${width}×${height} ${lang} passed`);
  }catch(error){await page.screenshot({path:resolve(output,`failure-${width}-${lang}.png`)});throw error;}finally{await context.close();}
 }
}finally{await browser?.close();await server.close();}
