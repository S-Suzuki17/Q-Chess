/** Actual Home, TitleScreen, TermsGate, campaign subscription and proof lifecycle.
 * All auth/progress responses and sockets are synthetic. No production account,
 * provider, database, consent, match, payment or rating is accessed.
 * Usage: node scripts/qa/check-password-login-browser.mjs [evidence-directory]
 *   [--reproduce-current] (confirms the original self-aborted login, before fixing).
 */
import assert from 'node:assert/strict';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {build,createServer} from 'vite';
import {chromium} from 'playwright';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),reproduce=args.includes('--reproduce-current');
const onlyCases=args.find(arg=>arg.startsWith('--cases='))?.slice(8).split(',');
const positional=args.filter(arg=>!arg.startsWith('--'));
assert.equal(positional.length<=1,true);
assert(args.every(arg=>!arg.startsWith('--')||arg==='--reproduce-current'||arg.startsWith('--cases=')),'Unknown flag');
const evidence=resolve(positional[0]??'scratch/password-login');
const root=resolve(repo,'scripts/qa/fixtures/password-login'),stub=resolve(root,'stubs.tsx');
const named=new Set(['LevelSelect','useAppPlatform','useNativeAuthLinks','useCampaignProgress','useFoundersRewards']);
// Keep both the gate and the subscribed cloud hook real: replacing either hides
// the Home remount that cancelled password sign-in and account registration.
const realViews=new Set(['TitleScreen','TermsGate','TermsDocument']);
const config={root,configFile:false,logLevel:'warn',
 define:{'process.env.NEXT_PUBLIC_SERVER_URL':JSON.stringify('https://fixture.invalid'),'process.env':{}},
 resolve:{alias:{'@':resolve(repo,'src')}},
 plugins:[{name:'isolated-password-login',enforce:'pre',resolveId(source,importer){
  if(source==='next/link')return '\0login:Link';
  if(source==='socket.io-client')return '\0login:io';
  if(source.endsWith('/supabaseClient'))return '\0login:supabase';
  if(source.endsWith('/SoundService'))return '\0login:soundManager';
  if(source.endsWith('/engagementMetrics'))return '\0login:recordVisit';
  const name=source.split('/').at(-1);
  if(named.has(name))return '\0login:'+name;
  if(importer?.includes('/src/')&&source.includes('components/')&&!realViews.has(name))return '\0login:empty:'+name;
  if(importer?.endsWith('/TitleScreen.tsx')&&!source.endsWith('.css')&&source.startsWith('./'))return '\0login:empty:'+name;
  if(importer?.endsWith('/TermsGate.tsx')&&source==='./AccountDeletionPanel')return '\0login:empty:AccountDeletionPanel';
 },load(id){
  if(!id.startsWith('\0login:'))return;
  const name=id.slice('\0login:'.length);
  if(name.startsWith('empty:')){
   const component=name.slice(6);
   if(component==='GameBoard')return `export {GameBoard as default} from ${JSON.stringify(stub)};`;
   if(component==='SiteInformation')return `export {Empty as SiteLinks,Empty as SiteIntroduction} from ${JSON.stringify(stub)};`;
   if(component==='MemberTicketsPanel')return `export {Empty as MemberTicketClaimController} from ${JSON.stringify(stub)};`;
   return `export {Empty as default,Empty as ${component}} from ${JSON.stringify(stub)};`;
  }
  if(name==='supabase')return `export {supabase,oauthCallbackAtStartup} from ${JSON.stringify(stub)};`;
  return `export {${name}${name==='Link'?' as default':''}} from ${JSON.stringify(stub)};`;
 }}],server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[repo]}},build:{write:false}};
const termsSource=await readFile(resolve(repo,'src/config/currentTerms.ts'),'utf8');
const termsVersion=termsSource.match(/CURRENT_TERMS_VERSION\s*=\s*'([^']+)'/)[1];
const termsDate=termsSource.match(/CURRENT_TERMS_EFFECTIVE_DATE[^=]*=\s*'([^']+)'/)[1];
const progress={version:2,stars:{},ascensions:[],stageStars:[],board:'standard',piece:'standard',effect:'standard',music:'standard',avatar:'standard'};
const password='synthetic-password-17',userId='LocalLoginQA';
let scenarios=reproduce?[{name:'reproduce-four-second-password-login',width:390,authDelay:4000}]:[
 {name:'password-four-second-session',width:390,authDelay:4000},
 {name:'password-persistent-reload',width:1280,authDelay:600,persistent:true,reload:true},
 {name:'password-incorrect',width:390,authStatus:401},
 {name:'password-outage-retry',width:1280,authStatus:503,retry:true},
 {name:'registration-four-second-request',width:390,register:true,registerDelay:4000,needsTerms:true},
 {name:'leave-while-password-login-pending',width:390,authDelay:4000,leavePending:true},
 {name:'consent-required-before-lobby',width:390,needsTerms:true},
 {name:'same-account-relogin-after-match',width:1280,afterMatch:true},
 {name:'accepted-once-persists-after-reload-and-match',width:390,needsTerms:true,persistent:true,reload:true,afterMatch:true},
 {name:'relogin-rechecks-missing-server-consent',width:1280,afterMatch:true,clearSavedConsent:true},
 {name:'another-account-needs-own-consent',width:390,afterMatch:true,switchAccount:true},
 {name:'consent-read-outage-retry',width:390,termsStatus:503},
 {name:'consent-save-failure-retry',width:390,needsTerms:true,consentStatus:503,reload:true,persistent:true},
 {name:'logout-during-consent-check',width:390,termsDelay:2000,exitTerms:true},
 {name:'guest-direct-play-without-consent',width:390,guest:true},
];
if(onlyCases){assert(onlyCases.every(name=>scenarios.some(scenario=>scenario.name===name)),'Unknown case');scenarios=scenarios.filter(scenario=>onlyCases.includes(scenario.name));}
await mkdir(evidence,{recursive:true});
await build(config);
const server=await createServer(config);await server.listen();const origin=server.resolvedUrls.local[0];
let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.QG_TEST_CHROMIUM?{executablePath:process.env.QG_TEST_CHROMIUM}:{})});
 for(const scenario of scenarios){
  const context=await browser.newContext({viewport:{width:scenario.width,height:844},serviceWorkers:'block'});
  const errors=[],unexpected=[],failedRequests=[],calls=[];
  let authStatus=scenario.authStatus??200,termsStatus=scenario.termsStatus??200,consentStatus=scenario.consentStatus??200;
  let currentUserId=userId,accepted=!scenario.needsTerms,termsReads=0,consentPosts=0,progressReads=0,issued=0;
  const proofs=new Map();
  const headers={'Access-Control-Allow-Origin':new URL(origin).origin,'Access-Control-Allow-Headers':'Content-Type,Authorization'};
  const respond=async(route,status,json)=>{try{await route.fulfill({status,headers,...(json?{json}:{body:''})});}catch(error){if(!route.request().failure())throw error;}};
  await context.routeWebSocket('**/*',socket=>socket.close());
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),method=req.method();
   if(url.origin===new URL(origin).origin)return route.continue();
   if(url.origin!=='https://fixture.invalid')return route.abort();
   if(method==='OPTIONS')return respond(route,204);
   const body=req.postDataJSON();
   calls.push({path:url.pathname,method});
   if(url.pathname==='/auth/register'&&method==='POST'){
    assert(scenario.register);assert.deepEqual(body,{username:userId,password,email:'fixture@example.test'});
    await new Promise(done=>setTimeout(done,scenario.registerDelay??0));return respond(route,201,{registered:true});
   }
   if(url.pathname==='/auth/ranked-session'&&method==='POST'){
    assert.deepEqual(body,{username:currentUserId,password,keepLoggedIn:scenario.persistent===true});
    await new Promise(done=>setTimeout(done,scenario.authDelay??50));
    if(authStatus!==200)return respond(route,authStatus,{code:authStatus===401?'AUTH_FAILED':'UNAVAILABLE'});
    const proof={userId:currentUserId,token:'ranked_'+'q'.repeat(43)+'_'+(++issued),expiresAt:Date.now()+3600000};
    proofs.set('Bearer '+proof.token,proof);
    return respond(route,200,{...proof,serverNow:Date.now()});
   }
   const authorization=req.headers().authorization,proof=proofs.get(authorization);
   assert(proof,'Authenticated requests must use an issued proof');
   if(url.pathname==='/auth/ranked-session/status'&&method==='GET'){
    assert.equal(authorization,'Bearer '+proof.token);return respond(route,200,{userId:proof.userId,expiresAt:proof.expiresAt,serverNow:Date.now()});
   }
   if(url.pathname==='/auth/ranked-session/revoke'&&method==='POST')return respond(route,204);
   if(url.pathname==='/account/current-terms'){
    assert.equal(authorization,'Bearer '+proof.token);
    if(method==='GET'){
     termsReads++;await new Promise(done=>setTimeout(done,scenario.termsDelay??0));
     if(termsStatus!==200)return respond(route,termsStatus,{code:'TERMS_UNAVAILABLE'});
    }else {
     assert.equal(method,'POST');assert.deepEqual(body,{version:termsVersion,accepted:true});consentPosts++;
     if(consentStatus!==200)return respond(route,consentStatus,{code:'TERMS_UNAVAILABLE'});
     accepted=true;
    }
    return respond(route,200,{userId:proof.userId,currentVersion:termsVersion,effectiveDate:termsDate,effective:true,consent:accepted?{version:termsVersion,acceptedAt:'2026-10-11T00:00:00Z'}:null});
   }
   if(url.pathname==='/account/progress'){
    assert.equal(authorization,'Bearer '+proof.token);assert.equal(accepted,true,'Progress cannot be requested before consent');
    if(method==='GET')progressReads++;else assert.equal(method,'POST');
    return respond(route,200,{userId:proof.userId,revision:1,progress,saved:method==='POST'});
   }
   unexpected.push({path:url.pathname,method});return route.abort();
  });
  await context.addInitScript(()=>{
   localStorage.setItem('qg_language','ja');
   // A saved older version must never grant current consent.
   if(!localStorage.getItem('qg_guest_terms'))localStorage.setItem('qg_guest_terms','2026-09-25.1');
   window.qaTermsScreens=0;let displayed=false;
   new MutationObserver(()=>{
    const present=!!document.querySelector('[data-terms-checkbox]');
    if(present&&!displayed)window.qaTermsScreens++;
    displayed=present;
   }).observe(document,{childList:true,subtree:true});
  });
  const page=await context.newPage(),responseStatuses=new WeakMap();page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>responseStatuses.set(response.request(),response.status()));
  page.on('requestfailed',request=>{if(new URL(request.url()).origin==='https://fixture.invalid')failedRequests.push({path:new URL(request.url()).pathname,method:request.method(),responseStatus:responseStatuses.get(request),failure:request.failure()?.errorText});});
  const open=async()=>{await page.goto(origin);await page.locator('[data-entry-mode="select"]').waitFor();};
  const enter=async()=>{
   await page.getByRole('button',{name:scenario.register?'アカウント作成':'ログイン',exact:true}).click();
   await page.getByLabel('アカウント名',{exact:true}).fill(currentUserId);await page.locator('input[name="password"]').fill(password);
   if(scenario.register)await page.getByLabel('メールアドレス',{exact:true}).fill('fixture@example.test');
   if(scenario.persistent)await page.locator('#keepLoggedIn').check();
  };
  const submit=()=>page.locator('.title-auth-submit').click();
  await open();
  if(scenario.guest){
   await page.getByRole('button',{name:'ゲストとしてプレイ',exact:true}).click();
   await page.locator('[data-testid="lobby"]').waitFor();
   assert.equal(await page.evaluate(()=>localStorage.getItem('qg_guest_terms')),'2026-09-25.1','Unused legacy acceptance remains unchanged; guest does not read it as authority or write a new value');
   assert.equal(await page.evaluate(()=>window.qaTermsScreens),0);
   await page.getByRole('button',{name:'Fixture logout',exact:true}).click();await page.locator('[data-entry-mode="select"]').waitFor();
   await page.getByRole('button',{name:'ゲストとしてプレイ',exact:true}).click();await page.locator('[data-testid="lobby"]').waitFor();
   assert.equal(await page.evaluate(()=>window.qaTermsScreens),0);
   await page.reload();await page.locator('[data-testid="lobby"]').waitFor();
   assert.equal(await page.evaluate(()=>window.qaTermsScreens),0);
   assert.deepEqual(calls,[]);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
   results.push({name:scenario.name,passed:true,noConsentRequested:true,noGuestAcceptanceStored:true,noAccountTermsApiCalled:true});
   await page.screenshot({path:resolve(evidence,scenario.name+'.png'),fullPage:true});await context.close();continue;
  }
  await enter();const started=Date.now();await submit();
  if(reproduce){
   await page.waitForTimeout(4500);
   assert.equal(await page.locator('[data-entry-mode="login"]').count(),0,'Original pending form is remounted');
   assert.equal(await page.locator('[data-testid="lobby"]').count(),0);
   assert.equal(await page.evaluate(()=>window.qaAccess().userId),null);
   assert(failedRequests.some(request=>request.path==='/auth/ranked-session'),'Login fetch was aborted');
   results.push({name:scenario.name,reproduced:true,loginRequestAborted:true,accessNotGranted:true,elapsedMs:Date.now()-started,calls,failedRequests});
  }else if(scenario.authDelay||scenario.registerDelay){
   await page.waitForTimeout(200);
   assert.equal(await page.locator(`[data-entry-mode="${scenario.register?'register':'login'}"]`).count(),1,'Pending request must keep its original form');
   assert.equal(await page.getByLabel('アカウント名',{exact:true}).inputValue(),userId);
   assert.equal(await page.locator('.title-auth-submit').isDisabled(),true);
  }
  if(!reproduce){
   if(scenario.leavePending){
    await page.evaluate(()=>window.qaUnmount());await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>window.qaAccess().userId),null);
    assert(failedRequests.some(request=>request.path==='/auth/ranked-session'),'Leaving must still abort the pending request');
   }else if(scenario.authStatus){
    await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.qaAccess().userId),null);
    assert.equal(await page.locator('[data-entry-mode="login"]').count(),1);
    assert.equal(await page.getByLabel('アカウント名',{exact:true}).inputValue(),userId);
    if(scenario.retry){authStatus=200;await submit();}
   }
   if(scenario.termsStatus){
    await page.getByRole('alert').waitFor();assert.equal(progressReads,0);assert.equal(consentPosts,0);
    assert.equal(await page.locator('[data-terms-checkbox]').count(),0);
    termsStatus=200;await page.getByRole('button',{name:'再試行',exact:true}).click();
   }
   if(scenario.needsTerms){
    await page.locator('[data-terms-gate]').waitFor();assert.equal(progressReads,0);assert.equal(consentPosts,0);
    assert.equal(await page.locator('[data-testid="lobby"]').count(),0);
    assert.equal(await page.locator('[data-terms-accept]').isDisabled(),true);
    const document=page.locator('[data-terms-document]');
    assert((await document.textContent()).includes(termsVersion));
    assert(!(await document.textContent()).includes('2026-09-25.1'));
    await document.getByRole('combobox',{name:'Document language'}).selectOption('en');
    assert((await document.textContent()).includes('Effective: '+termsDate));
    await document.getByRole('combobox',{name:'Document language'}).selectOption('ja');
    await page.screenshot({path:resolve(evidence,scenario.name+'-current-terms.png'),fullPage:true});
    await page.locator('[data-terms-checkbox]').check();await page.locator('[data-terms-accept]').click();
    if(scenario.consentStatus){
     await page.getByRole('alert').waitFor();assert.equal(accepted,false);assert.equal(progressReads,0);
     consentStatus=200;await page.getByRole('button',{name:'再試行',exact:true}).click();
     await page.locator('[data-terms-checkbox]').waitFor();assert.equal(await page.locator('[data-terms-checkbox]').isChecked(),false);
     await page.locator('[data-terms-checkbox]').check();await page.locator('[data-terms-accept]').click();
    }
   }
   if(scenario.exitTerms){
    await page.locator('[data-terms-loading]').waitFor();await page.getByRole('button',{name:'戻る',exact:true}).click();
    await page.locator('[data-entry-mode="select"]').waitFor();await page.waitForTimeout(2300);
    assert.equal(await page.evaluate(()=>window.qaAccess().userId),null);assert.equal(progressReads,0);
    assert.equal(await page.locator('[data-testid="lobby"]').count(),0);
   }else if(!scenario.leavePending&&(!scenario.authStatus||scenario.retry)){
    await page.locator(`[data-testid="lobby"][data-user="${userId}"]`).waitFor({timeout:10000});
    assert.equal(await page.evaluate(()=>window.qaAccess().userId),userId);
    const storage=await page.evaluate(()=>({session:!!sessionStorage.getItem('qg_ranked_session_v1'),persistent:!!localStorage.getItem('qg_ranked_session_v1')}));
    assert.deepEqual(storage,{session:!scenario.persistent,persistent:!!scenario.persistent});
    assert.equal(await page.evaluate(()=>window.qaTermsScreens),scenario.needsTerms?(scenario.consentStatus?2:1):0);
    assert.equal(await page.locator('[data-terms-checkbox]').count(),0);
    if(scenario.reload){
     const postsBeforeReload=consentPosts,readsBeforeReload=termsReads;
     await page.reload();await page.locator(`[data-testid="lobby"][data-user="${userId}"]`).waitFor();
     assert.equal(termsReads,readsBeforeReload+1);assert.equal(consentPosts,postsBeforeReload);
     assert.equal(await page.evaluate(()=>window.qaTermsScreens),0,'Saved consent must not show the document during reload');
    }
    if(scenario.afterMatch){
     await page.getByRole('button',{name:'Fixture match',exact:true}).click();await page.locator('[data-testid="match"]').waitFor();
     assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qg_active_online_match')).roomId),'fixture-finished-match');
     await page.getByRole('button',{name:'Fixture finish and home',exact:true}).click();await page.locator('[data-testid="lobby"]').waitFor();
     assert.equal(await page.evaluate(()=>localStorage.getItem('qg_active_online_match')),null);
     await page.getByRole('button',{name:'Fixture logout',exact:true}).click();await page.locator('[data-entry-mode="select"]').waitFor();
     assert.equal(await page.evaluate(()=>window.qaAccess().userId),null);
     assert.deepEqual(await page.evaluate(()=>[sessionStorage.getItem('qg_ranked_session_v1'),localStorage.getItem('qg_ranked_session_v1')]),[null,null]);
     const readsBeforeRelogin=termsReads,postsBeforeRelogin=consentPosts,screensBeforeRelogin=await page.evaluate(()=>window.qaTermsScreens);
     if(scenario.clearSavedConsent||scenario.switchAccount)accepted=false;
     if(scenario.switchAccount)currentUserId='OtherLocalLoginQA';
     await enter();await submit();
     if(scenario.clearSavedConsent||scenario.switchAccount){
      await page.locator('[data-terms-checkbox]').waitFor();assert.equal(consentPosts,postsBeforeRelogin);
      assert.equal(await page.locator('[data-testid="lobby"]').count(),0);
      await page.locator('[data-terms-checkbox]').check();await page.locator('[data-terms-accept]').click();
     }
     await page.locator(`[data-testid="lobby"][data-user="${currentUserId}"]`).waitFor();
     assert.equal(termsReads,readsBeforeRelogin+1,'Signing in must read this account\'s saved current consent');
     assert.equal(consentPosts,postsBeforeRelogin+(scenario.clearSavedConsent||scenario.switchAccount?1:0));
     assert.equal(await page.evaluate(()=>window.qaTermsScreens),screensBeforeRelogin+(scenario.clearSavedConsent||scenario.switchAccount?1:0),'Saved consent must not show the document on relogin');
    }
   }
   // Explicit exit aborts its pending consent read. Logout revocation is best
   // effort/keepalive. Retrying an expected HTTP 503 can also cancel its unread
   // error body. Successful login and consent requests must not be self-aborted.
   const requiredFailures=failedRequests.filter(request=>request.path!=='/auth/ranked-session/revoke'
    && !(scenario.exitTerms&&request.path==='/account/current-terms'&&request.method==='GET')
    && !(scenario.retry&&scenario.authStatus===503&&request.path==='/auth/ranked-session'&&request.responseStatus===503)
    && !(request.path==='/account/current-terms'&&request.responseStatus===503&&(scenario.termsStatus||scenario.consentStatus)));
   if(!scenario.leavePending)assert.deepEqual(requiredFailures,[],scenario.name+': no successful login or consent request should be self-aborted');
   results.push({name:scenario.name,passed:true,elapsedMs:Date.now()-started,termsReads,consentPosts,progressReads,calls,failedRequests});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  await page.screenshot({path:resolve(evidence,scenario.name+'.png'),fullPage:true});await context.close();
 }
 const report={scope:'Real Home/TitleScreen/TermsGate/useCampaignCloud and proof lifecycle; synthetic auth and game UI; no live external requests',reproduction:reproduce,passed:results.length,results};
 await writeFile(resolve(evidence,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:results.length,reproduction:reproduce,evidence}));
}finally{await browser?.close();await server.close();}
