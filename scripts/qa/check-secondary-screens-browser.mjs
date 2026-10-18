import {settingsSections,chooseSettingsSection} from './settings-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {startSecondaryScreensFixture} from './secondary-screens-server.mjs';
const output=resolve(process.argv[2]??'scratch/secondary-screens-browser');await mkdir(output,{recursive:true});
const {server,base}=await startSecondaryScreensFixture();let browser;const results=[];
const sizes=[[320,568,'ja'],[390,844,'ja'],[375,667,'ja'],[1280,800,'en'],[390,844,'de'],[390,844,'ta']];
const fit=async(page,selector,label)=>{
 const measured=await page.locator(selector).evaluate(element=>{const rect=element.getBoundingClientRect();return{client:element.clientHeight,scroll:element.scrollHeight,top:rect.top,bottom:rect.bottom,width:document.documentElement.scrollWidth,viewportWidth:innerWidth,viewportHeight:innerHeight};});
 if(measured.scroll>measured.client+2||measured.width>measured.viewportWidth+1||measured.top< -1||measured.bottom>measured.viewportHeight+1){await page.screenshot({path:resolve(output,'failure.png')});await writeFile(resolve(output,'failure.json'),JSON.stringify({label,measured},null,2));}
 assert(measured.scroll<=measured.client+2,`${label} needs scrolling: ${JSON.stringify(measured)}`);
 assert(measured.width<=measured.viewportWidth+1,`${label} horizontal overflow`);
 assert(measured.top>=-1&&measured.bottom<=measured.viewportHeight+1,`${label} outside viewport`);return measured;
};
const save=async()=>writeFile(resolve(output,'result.json'),JSON.stringify({expectedCases:16,complete:results.length===16,pass:results.length===16,scope:'Actual settings/map/waiting components and CSS; synthetic account/progress/outcomes; all external traffic blocked. Desktop viewports, not physical Android.',results},null,2)+'\n');
try{
 browser=await chromium.launch({headless:true,...(process.env.QG_TEST_CHROMIUM?{executablePath:process.env.QG_TEST_CHROMIUM}:{})});
 for(const [width,height,lang] of sizes){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.goto(base+'/?lang='+lang,{waitUntil:'domcontentloaded',timeout:60000});await page.locator('#settings-opener').click();await page.locator('[data-game-settings]').waitFor();
  for(const [index,section] of (await settingsSections(page)).entries()){
   await chooseSettingsSection(page,section);await fit(page,'.settings-content',`settings ${index} ${width}×${height} ${lang}`);
   await page.screenshot({path:resolve(output,`settings-${index}-${width}-${lang}.png`)});
  }
  await chooseSettingsSection(page,'play');const sliders=page.getByRole('slider');assert.equal(await sliders.count(),2);
  await sliders.first().focus();await page.keyboard.press('ArrowRight');assert.equal(await sliders.first().inputValue(),'0.55');
  await page.getByRole('switch').click();assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'false');
  if(await page.locator('[data-settings-section-picker]').isVisible()){
   await page.locator('[data-settings-section-picker]').focus();await page.keyboard.press('End');assert.equal(await page.locator('[data-settings-section-picker]').inputValue(),'support');
  }else{await page.getByRole('tab').first().focus();await page.keyboard.press('End');assert.equal(await page.getByRole('tab').last().getAttribute('aria-selected'),'true');}
  await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement?.id==='settings-opener');
  await page.goto(base+'/?screen=map&lang='+lang);await page.locator('.map-screen').waitFor();
  const measured=await fit(page,'.crown-tab-panel:not([hidden])',`map ${width}×${height} ${lang}`);
  await page.screenshot({path:resolve(output,`map-${width}-${lang}.png`)});
  await page.getByRole('combobox',{name:await page.locator('.map-page-choice label').innerText(),exact:true}).selectOption('9');
  assert.equal(await page.locator('.map-tile').first().getAttribute('data-stage'),'91');
  await page.locator('.map-return-current').click();assert.equal(await page.locator('.map-tile').first().getAttribute('data-stage'),'1');
  await page.locator('.map-overview-trigger').click();assert.equal(await page.locator('[data-map-overview-tile]').count(),100);await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.activeElement?.classList.contains('map-overview-trigger'));
  assert.equal((await page.evaluate(()=>window.qaQuest)).admissions,0);
  assert.deepEqual(errors,[]);results.push({case:'settings-all-panels-keyboard-sound-map-navigation-no-scroll',width,height,lang,measured,pass:true});await context.close();await save();console.log(`Settings/map ${width}×${height} ${lang} passed`);
 }
 for(const [width,height,lang] of [[320,568,'ja'],[375,667,'ja'],[390,844,'de'],[390,844,'ta']]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.goto(base+'/?native&lang='+lang,{waitUntil:'domcontentloaded',timeout:60000});await page.locator('#settings-opener').click();
  for(const [index,section] of [[1,'appearance'],[2,'account']]){
   await chooseSettingsSection(page,section);await fit(page,'.settings-content','native page0 '+lang+' '+width);
   await page.locator('[data-settings-page-next]').click();await fit(page,'.settings-content','native page1 '+lang+' '+width);
   if(index===1)assert.equal(await page.locator('.founders-items button:visible').count(),3);
   if(index===2)assert.equal(await page.locator('[data-native-reward-settings]:visible').count(),1);
   await page.screenshot({path:resolve(output,`native-settings-${index}-${width}-${lang}.png`)});
   await page.locator('[data-settings-page-previous]').click();await fit(page,'.settings-content','native back '+lang+' '+width);
  }
  assert.deepEqual(errors,[]);results.push({case:'native-only-settings-pages-no-scroll',width,height,lang,nativeTransport:'synthetic balance only; no ad invocation',pass:true});await context.close();await save();
 }
 for(const [width,height,lang] of [[390,844,'ja'],[375,667,'ja'],[320,568,'ja'],[1280,800,'en'],[390,844,'de'],[390,844,'ta']]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),page=await context.newPage();
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.clock.install();await page.goto(base+'/?screen=waiting&lang='+lang+'&connected=0');await page.locator('[data-match-waiting=connecting]').waitFor();
  await fit(page,'.online-match-waiting','connecting '+width+' '+lang);assert.equal(await page.locator('.waiting-steps [data-complete=true]').count(),0);
  await page.evaluate(()=>window.qaWaiting.setConnected(true));await page.locator('[data-match-waiting=syncing]').waitFor();assert.equal(await page.locator('.waiting-steps [data-complete=true]').count(),1);
  await page.clock.fastForward(16000);await page.locator('.waiting-delayed').waitFor();await fit(page,'.online-match-waiting','delayed '+width+' '+lang);
  for(const reason of ['admitting','recovering','unavailable','checking']){await page.evaluate(value=>window.qaWaiting.setPreparation(value),reason);await page.locator(`[data-match-waiting=${reason}]`).waitFor();}
  await page.screenshot({path:resolve(output,`waiting-${width}-${lang}.png`)});
  assert.equal(await page.locator('.waiting-spinner').first().evaluate(node=>getComputedStyle(node).animationName),'none');
  await page.locator('.online-match-waiting footer button').click();assert.equal(await page.evaluate(()=>window.qaHome),1);
  results.push({case:'real-connection-status-delayed-guidance-home-reduced-motion-no-scroll',width,height,lang,pass:true});await context.close();await save();console.log('Waiting '+width+' '+lang+' passed');
 }
 console.log(JSON.stringify({pass:true,cases:results.length,output}));
}finally{await browser?.close();await server.close();}
