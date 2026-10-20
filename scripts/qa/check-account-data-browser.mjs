import {settingsSections,chooseSettingsSection} from './settings-navigation.mjs';
import {textWrapping} from './text-wrapping.mjs';
/** Real exported app and real Google-session/profile/reward clients. Every account/API
 * response is synthetic and all unknown external traffic is blocked. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
const args=process.argv.slice(2),artifacts=resolve(args.find(x=>!x.startsWith('--'))||'scratch/account-data-browser');
const publicUrl=args.find(x=>x.startsWith('--public-url='))?.slice(13);
const broken=args.includes('--expect-broken-config'),target=args.find(x=>x.startsWith('--target='))?.slice(9)||'web';
const secondaryScreens=args.includes('--secondary-screens');
const only=args.find(x=>x.startsWith('--only='))?.slice(7);
const homeLanguages=args.find(x=>x.startsWith('--home-languages='))?.slice(17).split(',')??[];
assert(['web','android'].includes(target));
const root=resolve('out'),mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg'};
let server,browser,activePage,activeScenario,activeCalls,activeErrors;
const version=await readFile('src/config/currentTerms.ts','utf8');
const termsVersion=version.match(/CURRENT_TERMS_VERSION\s*=\s*'([^']+)'/)[1],termsDate=version.match(/CURRENT_TERMS_EFFECTIVE_DATE[^=]*=\s*'([^']+)'/)[1];
const progress={version:2,stars:{},ascensions:[],stageStars:[],board:'standard',piece:'standard',effect:'standard',music:'standard',avatar:'standard'};
const results=[],homeTextChecks=[];
await mkdir(artifacts,{recursive:true});
try{
 let origin=publicUrl;
 if(!origin){
  server=createServer(async(req,res)=>{
   const pathname=decodeURIComponent(new URL(req.url,'http://fixture').pathname);
   const file=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
   if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
   try{res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));origin='http://127.0.0.1:'+server.address().port;
 }
 browser=await chromium.launch({headless:true,...(process.env.QG_TEST_CHROMIUM?{executablePath:process.env.QG_TEST_CHROMIUM}:{})});
 const allScenarios=broken?[{name:'published-password-missing-config',width:390}]:[
  {name:'google-entry',width:320,entry:true},
  {name:'google-first-setup-balances',width:390,setup:true},
  {name:'google-persistent-reload',width:1280,persistent:true,reload:true},
  {name:'google-zero-balances',width:390,zero:true},
  {name:'google-reauthenticated-balance-refresh',width:390,reauthenticate:true},
  {name:'google-data-outage-online-retry',width:390,outage:true},
  ...(secondaryScreens?[
   {name:'secondary-390',width:390,height:844,secondary:true},{name:'secondary-375',width:375,height:667,secondary:true},
   {name:'secondary-320',width:320,height:568,secondary:true},{name:'secondary-desktop',width:1280,height:800,secondary:true},
  ]:[]),
 ];
 const scenarios=only?allScenarios.filter(scenario=>scenario.name===only):allScenarios;
 assert(scenarios.length,'Unknown scenario: '+only);
 for(const scenario of scenarios){
  activeScenario=scenario.name;
  const userId='GoogleFixture',password='synthetic-password-17';
  const profile={id:userId,name:'Fixture player',rating:1234,rating_10s:1122,rating_3m:1233,rating_10m:1344,avatar_url:null};
  const authId='11111111-1111-4111-8111-111111111111',expiresAt=Math.floor(Date.now()/1000)+3600;
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const jwt=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:authId,session_id:authId,exp:expiresAt,amr:[{method:'oauth',timestamp:expiresAt-3600}]})+'.synthetic';
  const authUser={id:authId,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',is_anonymous:false,app_metadata:{provider:'google',providers:['google']},user_metadata:{},identities:[{provider:'google'}],created_at:'2026-10-20T00:00:00Z'};
  const savedSession={access_token:jwt,refresh_token:'synthetic-refresh',expires_at:expiresAt,expires_in:3600,token_type:'bearer',user:authUser};
  const proof={userId,token:jwt,expiresAt:expiresAt*1000};
  let setupComplete=!scenario.setup;
  const googleAccount={authId,userId,username:userId,name:profile.name};
  const tickets=scenario.zero?{ranked:0,hint:0}:{ranked:7,hint:3};
  let outage=!!scenario.outage;
  const context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height??844},serviceWorkers:'block'});
  const calls=activeCalls=[],errors=activeErrors=[];
  const originUrl=new URL(origin);
  await context.routeWebSocket('**/*',socket=>socket.close());
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),method=request.method();
   const api=/^\/(?:auth|account|rewards|membership|commerce|game-records|service|rest)\//.test(url.pathname)||url.pathname==='/game-records';
   if(url.origin===originUrl.origin&&method==='GET'&&!api)return route.continue();
   const headers={'Access-Control-Allow-Origin':originUrl.origin,'Access-Control-Allow-Headers':'Content-Type,Authorization,apikey,x-client-info,prefer,x-supabase-api-version,x-qg-protocol,x-qg-platform,x-qg-build','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
   const respond=(status,json)=>route.fulfill({status,headers,...(json===undefined?{body:''}:{json})});
   if(method==='OPTIONS')return respond(204);
   calls.push({host:url.hostname,path:url.pathname,method});
   if(url.hostname==='placeholder.supabase.co')return respond(503,{code:'UNAVAILABLE'});
   if(url.pathname==='/auth/google/account')return respond(200,{authId,account:setupComplete?googleAccount:null,termsVersion});
   if(url.pathname==='/auth/google/setup'){
    assert.deepEqual(request.postDataJSON(),{username:userId,password,accepted:true,termsVersion});
    assert.equal(request.headers().authorization,'Bearer '+jwt);setupComplete=true;
    return respond(200,{authId,account:googleAccount,termsVersion});
   }
   if(url.pathname==='/auth/v1/user')return respond(200,authUser);
   if(url.pathname==='/auth/v1/token')return respond(200,savedSession);
   if(url.pathname==='/auth/ranked-session'&&method==='POST')throw new Error('Password sign-in must not be called');
   if(url.pathname==='/service/status')return respond(200,{maintenance:false,minimumAndroidBuild:0,minimumProtocol:0,announcement:{},revision:'fixture',serverTime:Date.now()});
   if(url.pathname==='/rest/v1/profiles'){
    assert(!url.searchParams.get('select')?.includes('password'));
    return outage?respond(503,{message:'Fixture outage'}):respond(200,profile);
   }
   if(url.pathname==='/rest/v1/active_matches')return respond(200,[]);
   if(url.pathname==='/auth/ranked-session/status')return respond(200,{userId,expiresAt:proof.expiresAt,serverNow:Date.now()});
   if(url.pathname==='/auth/ranked-session/revoke')return respond(204);
   const authorized=request.headers().authorization==='Bearer '+proof.token;
   if(!authorized)return respond(401,{code:'AUTH_REQUIRED'});
   if(url.pathname==='/account/current-terms')return respond(200,{userId,currentVersion:termsVersion,effectiveDate:termsDate,effective:true,consent:{version:termsVersion,acceptedAt:'2026-10-13T00:00:00Z'}});
   if(url.pathname==='/account/progress')return respond(200,{userId,revision:1,progress,saved:method==='POST'});
   if(url.pathname==='/game-records')return respond(200,{records:[]});
   if(url.pathname==='/rewards/daily-login'||url.pathname==='/rewards/daily-login/claim'){
    if(outage)return respond(503,{code:'REWARD_UNAVAILABLE'});
    return respond(200,{userId,enabled:true,streakDays:1,rewardPolicyVersion:2,tickets,lastClaimUtcDay:new Date().toISOString().slice(0,10),currentUtcDay:new Date().toISOString().slice(0,10),...(method==='POST'?{credited:{ranked:0,hint:0}}:{})});
   }
   if(url.pathname==='/membership/stripe/status')return respond(200,{userId,enabled:true,active:false,canManageBilling:false,cancelAtPeriodEnd:false,periodEnd:null,lastGrantUtcDay:null,tickets:{ranked:0,hint:0},availableCheckoutSkus:[]});
   return respond(503,{code:'UNAVAILABLE'});
  });
  await context.addInitScript(session=>{
   localStorage.setItem('qg_language','ja');
   if(session)localStorage.setItem('sb-gtxbvbsplfkkjlmnqath-auth-token',JSON.stringify(session));
  },scenario.entry?null:savedSession);
  const page=activePage=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  if(scenario.entry){
   await page.getByRole('button',{name:'Googleでログイン・新規登録',exact:true}).click();
   await page.getByRole('button',{name:'Googleで続ける',exact:true}).waitFor();
   assert.equal(await page.locator('.title-auth-dialog input[type="password"]').count(),0);
   assert(!/Discord/i.test(await page.locator('.title-auth-dialog').innerText()));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:resolve(artifacts,scenario.name+'.png')});
   results.push({name:scenario.name,target,passed:true,liveMutations:0});await context.close();continue;
  }
  if(scenario.setup){
   await page.locator('[data-google-setup]').waitFor();
   assert.equal(await page.getByRole('button',{name:'設定して同意する',exact:true}).isEnabled(),false);
   await page.screenshot({path:resolve(artifacts,'google-first-setup-form.png'),fullPage:true});
   await page.getByLabel('ユーザー名',{exact:true}).fill(userId);
   await page.getByLabel('新しいQ-Gambit用パスワード',{exact:true}).fill(password);
   await page.getByLabel('パスワードの確認',{exact:true}).fill(password);
   await page.locator('input[type="checkbox"][required]').check();
   await page.getByRole('button',{name:'設定して同意する',exact:true}).click();
  }
  await page.locator('.lobby-studio').waitFor();
  if(broken){
   await page.waitForTimeout(1500);
   assert.equal((await page.locator('.lobby-rating strong').innerText()).trim(),'—');
   assert.equal(await page.locator('[data-free-match-tickets]').innerText(),'—');
   assert(calls.some(x=>x.host==='placeholder.supabase.co'&&x.path==='/rest/v1/profiles'));
   assert(!calls.some(x=>x.path==='/rewards/daily-login'));
  }else{
   if(scenario.outage){
    await page.waitForTimeout(500);outage=false;
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));
   }
   const check=async()=>{
    await page.waitForFunction(()=>document.querySelector('.lobby-rating strong')?.textContent?.trim()==='1344',{},{timeout:8000});
    await page.waitForFunction(({ranked,hint})=>document.querySelector('[data-free-match-tickets]')?.textContent===String(ranked)&&document.querySelector('[data-free-hint-tickets]')?.textContent===String(hint),tickets,{timeout:8000});
    assert(!calls.some(x=>x.host==='placeholder.supabase.co'));
   };
   await check();
   if(scenario.reauthenticate){
    tickets.ranked=11;tickets.hint=4;
    await page.reload();await page.locator('.lobby-studio').waitFor();
    await check();
   }
   if(scenario.reload){await page.reload();await page.locator('.lobby-studio').waitFor();assert.equal(await page.locator('.title-auth-dialog').count(),0);await check();}
   if(scenario.outage)assert(calls.filter(x=>x.path==='/rewards/daily-login/claim').length>=2,'Failed daily claim must retry when online');
   assert.deepEqual(errors,[]);
  }
  if(homeLanguages.length&&scenario.name==='google-first-setup-balances'){
   for(const [width,height]of [[320,568],[390,844]])for(const lang of homeLanguages){
    await page.setViewportSize({width,height});
    await page.evaluate(()=>window.dispatchEvent(new Event('qg-open-settings')));
    await page.locator('.settings-language select').selectOption(lang);
    await page.keyboard.press('Escape');
    await page.waitForFunction(language=>document.documentElement.lang===language,lang);
    await page.evaluate(()=>document.fonts.ready);
    const check={lang,width,height,...await textWrapping(page,'.lobby-studio',lang)};
    check.pass=!check.broken.length&&!check.clippedWords.length&&!check.horizontalOverflow;homeTextChecks.push(check);
    if(!check.pass)await page.screenshot({path:resolve(artifacts,`home-${lang}-${width}-failure.png`),fullPage:true});
    assert(check.pass,'Home text: '+JSON.stringify(check));
   }
  }
  await page.screenshot({path:resolve(artifacts,scenario.name+'.png'),fullPage:true});
  if(scenario.secondary){
   const fits=async selector=>{
    const measured=await page.locator(selector).evaluate(element=>({height:element.clientHeight,scroll:element.scrollHeight,width:element.clientWidth,scrollWidth:element.scrollWidth}));
    if(measured.scroll>measured.height+2||measured.scrollWidth>measured.width+1)await page.screenshot({path:resolve(artifacts,scenario.name+'-failure.png')});
    assert(measured.scroll<=measured.height+2&&measured.scrollWidth<=measured.width+1,`${selector}: ${JSON.stringify(measured)}`);
   };
   await page.evaluate(()=>window.dispatchEvent(new Event('qg-open-settings')));await page.locator('[data-game-settings]').waitFor();
   for(const [index,section] of (await settingsSections(page)).entries()){
    await chooseSettingsSection(page,section);await fits('.settings-content');await page.screenshot({path:resolve(artifacts,`${scenario.name}-settings-${index}.png`)});
   }
   await page.keyboard.press('Escape');await page.locator('.lobby-campaign-action').click();await page.locator('.map-screen').waitFor();
   await fits('#crown-main-panel-challenge');await page.screenshot({path:resolve(artifacts,scenario.name+'-map.png')});
   await page.locator('#crown-main-tab-collection').click();
   for(const category of ['board','piece','avatar','effect','music']){
    await page.locator('#crown-category-tab-'+category).click();await fits('#crown-main-panel-collection');
    await page.screenshot({path:resolve(artifacts,scenario.name+'-collection-'+category+'.png')});
   }
   assert.deepEqual(errors,[]);
  }
  results.push({name:scenario.name,target,passed:true,reproduced:broken,secondaryScreens:!!scenario.secondary,syntheticAccount:true,liveMutations:0,calls});
  await writeFile(resolve(artifacts,'result.json'),JSON.stringify({target,source:publicUrl||'local exported app',only:only??null,expectedCases:scenarios.length,complete:results.length===scenarios.length,pass:results.length===scenarios.length,homeTextChecks,results},null,2)+'\n');
  await context.close();
 }
 await writeFile(resolve(artifacts,'result.json'),JSON.stringify({target,source:publicUrl||'local exported app',only:only??null,expectedCases:scenarios.length,complete:results.length===scenarios.length,pass:results.length===scenarios.length,homeTextChecks,results},null,2)+'\n');
 console.log(JSON.stringify({target,passed:results.length,reproduced:broken,liveMutations:0}));
}catch(error){
 await activePage?.screenshot({path:resolve(artifacts,'failure-'+activeScenario+'.png'),fullPage:true}).catch(()=>{});
 const observed=await activePage?.evaluate(()=>({rating:document.querySelector('.lobby-rating strong')?.textContent,ranked:document.querySelector('[data-free-match-tickets]')?.textContent,hint:document.querySelector('[data-free-hint-tickets]')?.textContent})).catch(()=>null);
 await writeFile(resolve(artifacts,'result.json'),JSON.stringify({target,source:publicUrl||'local exported app',only:only??null,complete:false,pass:false,failedScenario:activeScenario,error:String(error),observed,calls:activeCalls,errors:activeErrors,liveMutations:0,homeTextChecks,results},null,2)+'\n');
 throw error;
}finally{await browser?.close();await new Promise(done=>server?server.close(done):done());}
