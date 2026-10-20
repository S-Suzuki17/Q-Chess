import assert from 'node:assert/strict';
import {mkdir,copyFile,unlink,writeFile} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {createRequire} from 'node:module';
import http from 'node:http';
import {chromium} from 'playwright';
import {walkTutorial,readTutorialPages} from './tutorial-walkthrough.mjs';
const require=createRequire(import.meta.url);
const {historicalCommerceDatabase,applyMigrations,releaseCommerceMigrations}=require('../../server/dist/services/fixtures/commerceDatabaseFixture.js');
const {RankedAuth}=require('../../server/dist/services/RankedAuth.js');
const {AccountWriteGate}=require('../../server/dist/services/AccountDeletion.js');
const {createLearningRouter}=require('../../server/dist/services/LearningRoutes.js');
const {parseLearningProgress,parseLearningReceipt}=require('../../server/dist/learning/protocol.js');
const {generateWeeklyProblems,learningWeek,mateSolutions}=require('../../server/dist/learning/weeklyProblems.js');
const express=require('../../server/node_modules/express');
const root=resolve('.'),origin=process.env.QG_TEST_NEXT_ORIGIN??'http://127.0.0.1:4317';
assert.equal(new URL(origin).hostname,'127.0.0.1','Only the local Next server may be tested');
const route=resolve(root,'src/app/learning-review-local/page.tsx');
const output=resolve(root,'scratch/learning-browser');
await mkdir(output,{recursive:true});
await mkdir(dirname(route),{recursive:true});
// COPYFILE_EXCL preserves any existing user route.
await copyFile(resolve(root,'scripts/qa/fixtures/learning/page.tsx'),route,1);
let db,server,browser;
try{
 db=await historicalCommerceDatabase();
 await applyMigrations(db,[...releaseCommerceMigrations,'20261008054904_match_hint_tickets_and_free_practice.sql',
  '20261013115237_play_commerce_terms_release.sql','20261020111637_learning_rewards_and_weekly_problems.sql']);
 await db.exec(`insert into public.profiles(id,name) values('LearningQA','LearningQA');
  insert into public.account_terms_consents(user_id,version) select 'LearningQA',version from public.current_terms_policy where singleton;
  set role service_role`);
 const query=async(sql,args=[])=> (await db.query(sql,args)).rows[0]?.result;
 const set=await generateWeeklyProblems(Date.parse(learningWeek(Date.now()).opensAt));
 await query('select public.publish_learning_week($1,$2) as result',[set.week,JSON.stringify(set.problems)]);
 const store={
  verifyUser:async()=>null,blocked:async()=>false,hasCurrentTerms:async()=>true,
  week:async week=>week===set.week?set:null,
  progress:async(user,week)=>parseLearningProgress(await query('select public.learning_progress($1,$2) as result',[user,week])),
  complete:async(user,body)=>parseLearningReceipt(await query('select public.complete_learning($1,$2,$3,$4,$5) as result',
   [user,body.kind,body.kind==='tutorial'?body.lessonId:null,body.kind==='weekly'?body.week:null,body.kind==='weekly'?body.problemId:null]),user),
 };
 const auth=new RankedAuth(async(id,pw)=>id==='LearningQA'&&pw==='local-only');
 const proof=await auth.issueLegacySession('LearningQA','local-only');
 const app=express();app.use(createLearningRouter(auth,store,new AccountWriteGate(),()=>true));
 server=http.createServer(app);await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const api=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true});
 const errors=[],results=[];
 let lostResponse=true;
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 await context.addInitScript(proof=>{
  sessionStorage.setItem('qg_ranked_session_v1',JSON.stringify(proof));
  localStorage.setItem('qg_terms_consent_v1_2026-10-13.1_LearningQA','true');
  localStorage.setItem('qg_sound_config',JSON.stringify({muted:true,bgmVolume:0,sfxVolume:0}));
 },proof);
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===origin)return route.continue();
  if(url.origin==='https://q-chess.onrender.com'&&['/learning','/learning/complete'].includes(url.pathname)){
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{
    'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
   const response=await fetch(api+url.pathname,{method:request.method(),headers:request.headers(),
    ...(request.method()==='POST'?{body:request.postData()}: {})});
   const body=await response.text();
   if(lostResponse&&url.pathname.endsWith('/complete')){lostResponse=false;await route.abort();return;}
   return route.fulfill({status:response.status,contentType:'application/json',body,headers:{'Access-Control-Allow-Origin':'*'}});
  }
  await route.abort();
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 // Lost response after a committed credit, followed by a full browser reload and proof retry.
 await page.goto(origin+'/learning-review-local?lang=ja');await page.locator('dialog.tutorial-shell').waitFor();
 await page.locator('[data-square="e2"]').click();await page.locator('[data-square="e3"]').click();
 await page.getByRole('button',{name:'受け取りを再試行'}).waitFor();
 assert.equal((await store.progress('LearningQA',set.week)).tickets.ranked,1);
 await page.reload();await page.getByRole('button',{name:'受け取りを再試行'}).waitFor({state:'detached'});
 await page.waitForFunction(()=>!localStorage.getItem('qg_learning_pending_v1:LearningQA'));
 assert.equal((await store.progress('LearningQA',set.week)).tickets.ranked,1);
 results.push('Committed response loss/reload recovers without a second ticket');
 await walkTutorial(page,{strictFit:true,readAllCopy:true,progressKey:'qg_tutorial_course_v2:LearningQA'});
 let progress=await store.progress('LearningQA',set.week);
 assert.equal(progress.tutorial.length,25);assert.deepEqual(progress.tickets,{ranked:13,hint:12});
 results.push('All 25 tutorial lessons through the real authenticated HTTP and SQL reward paths');
 await page.goto(origin+'/learning-review-local?mode=weekly&lang=ja');
 await page.locator('.weekly-board [data-square]').first().waitFor();
 for(let i=0;i<10;i++){
  const problem=set.problems[i],move=mateSolutions(problem.state)[0],piece=problem.state.pieces.find(p=>p.id===move.pieceId);
  const square=p=>String.fromCharCode(97+p.col)+(8-p.row);
  await page.locator(`.weekly-board [data-square="${square(piece.position)}"]`).click();
  await page.locator(`.weekly-board [data-square="${square(move.target)}"]`).click();
  await page.locator('[data-weekly-next]:not([disabled])').waitFor();
  if(i===4)await page.screenshot({path:resolve(output,'weekly-five-desktop.png')});
  if(i<9)await page.locator('[data-weekly-next]').click();
 }
 assert.deepEqual((await page.evaluate(()=>window.learningAds)).map(key=>Number(key.split(':').at(-1))),[5,10]);
 progress=await store.progress('LearningQA',set.week);
 assert.deepEqual(progress.tickets,{ranked:14,hint:12});assert.equal(progress.weeklyRewarded,true);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(output,'weekly-complete-mobile.png')});
 await page.reload();await page.locator('.weekly-success').waitFor();
 assert.equal((await page.evaluate(()=>window.learningAds??[])).length,0);
 results.push('All 10 weekly problems; ad callbacks only at 5/10; final reward and reload idempotency');
 // Actual Next/font definitions, keyboard input and all explanation pages at compact widths.
 for(const lang of ['ja','en','zh','de','fr','es','pt','ru','tr','pl','hi','ta']){
  await page.setViewportSize({width:320,height:568});
  await page.goto(origin+`/learning-review-local?lang=${lang}&guest=1`);
  const tutorial=page.locator('dialog.tutorial-shell');await tutorial.waitFor();await page.evaluate(()=>document.fonts.ready);
  for(const index of [0,9,23]){
   await tutorial.locator('select').selectOption(String(index));await readTutorialPages(page,tutorial,{strictFit:true});
  }
  if(lang==='ja'||lang==='hi'||lang==='ta')await page.screenshot({path:resolve(output,`tutorial-${lang}-320.png`)});
 }
 await page.goto(origin+'/learning-review-local?lang=ja&guest=1');
 await walkTutorial(page,{strictFit:true,readAllCopy:true,checkRecovery:true});
 results.push('25 guest lessons at 320×568; all 12 languages with real fonts and paged text');
 // MatchLayout + the actual board/engine: open the explanation, then play the shown move.
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  await page.goto(origin+'/learning-review-local?mode=hint&lang=ja');
  await page.locator('.match-hint-action').click();
  const explanation=page.getByTestId('hint-explanation');
  await explanation.locator('summary').click();
  await explanation.locator('dl').waitFor();
  assert.match(await explanation.innerText(),/ナイト/);
  assert(await page.locator('.advice-manual').isVisible());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:resolve(output,`hint-${viewport.width}.png`)});
  await page.locator('[data-square="e2"]').click();await page.locator('[data-square="f4"]').click();
  await explanation.waitFor({state:'detached'});
  assert.equal(await page.locator('.match-hint-action').isDisabled(),true);
 }
 results.push('Hint explanation opens on desktop/mobile; the shown move plays on the actual engine');
 // The real title and lobby entries, with all external API requests blocked.
 await page.goto(origin+'/');
 await page.locator('[data-open-tutorial]').click();
 await page.locator('dialog.tutorial-shell').waitFor();
 await page.keyboard.press('Escape');
 await page.locator('dialog.tutorial-shell').waitFor({state:'detached'});
 assert.equal(await page.locator('[data-open-tutorial]').evaluate(el=>el===document.activeElement),true);
 await page.locator('.title-play').click();
 await page.locator('[data-open-weekly]').click();
 await page.locator('dialog.weekly-problems').waitFor();
 assert.equal(await page.locator('.weekly-board').count(),0);
 await page.keyboard.press('Escape');
 await page.locator('dialog.weekly-problems').waitFor({state:'detached'});
 assert.equal(await page.locator('[data-open-weekly]').evaluate(el=>el===document.activeElement),true);
 results.push('Real title/lobby entry points, guest sign-in notice and keyboard focus restoration');
 assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'result.json'),JSON.stringify({results,errors,tickets:progress.tickets,
  boundaries:'Loopback API and embedded PostgreSQL only; ads are simulated callbacks. Desktop Chromium emulation, not an Android device.'},null,2));
 console.log(JSON.stringify({results,output}));
}finally{
 await browser?.close();
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 await db?.close();
 // Remove only the fixture route created exclusively above; leave the directory and user files alone.
 assert(route.startsWith(resolve(root,'src/app')+sep)&&route.endsWith('learning-review-local'+sep+'page.tsx'));
 await unlink(route);
 // Next dev may retain the generated type for a removed fixture route.
 const generated=resolve(root,'.next/dev/types/app/learning-review-local/page.ts');
 assert(generated.startsWith(resolve(root,'.next')+sep));
 await unlink(generated).catch(error=>{if(error.code!=='ENOENT')throw error;});
}
