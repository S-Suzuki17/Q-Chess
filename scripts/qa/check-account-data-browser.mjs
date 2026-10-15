/** Real exported app and real password/profile/reward clients. Every account/API
 * response is synthetic and all unknown external traffic is blocked. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
const args=process.argv.slice(2),artifacts=resolve(args.find(x=>!x.startsWith('--'))||'scratch/account-data-browser');
const publicUrl=args.find(x=>x.startsWith('--public-url='))?.slice(13);
const broken=args.includes('--expect-broken-config'),target=args.find(x=>x.startsWith('--target='))?.slice(9)||'web';
assert(['web','android'].includes(target));
const root=resolve('out'),mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg'};
let server,browser;
const version=await readFile('src/config/currentTerms.ts','utf8');
const termsVersion=version.match(/CURRENT_TERMS_VERSION\s*=\s*'([^']+)'/)[1],termsDate=version.match(/CURRENT_TERMS_EFFECTIVE_DATE[^=]*=\s*'([^']+)'/)[1];
const progress={version:2,stars:{},ascensions:[],stageStars:[],board:'standard',piece:'standard',effect:'standard',music:'standard',avatar:'standard'};
const results=[];
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
 const scenarios=broken?[{name:'published-password-missing-config',width:390}]:[
  {name:'password-session-balances',width:390},
  {name:'password-persistent-reload',width:1280,persistent:true,reload:true},
  {name:'password-zero-balances',width:390,zero:true},
  {name:'password-reauthenticated-balance-refresh',width:390,reauthenticate:true},
  {name:'password-data-outage-online-retry',width:390,outage:true},
 ];
 for(const scenario of scenarios){
  const userId='AccountDataFixture',password='synthetic-password-17';
  const profile={id:userId,name:'Fixture player',rating:1234,rating_10s:1122,rating_3m:1233,rating_10m:1344,avatar_url:null};
  const proof={userId,token:'ranked_'+'z'.repeat(43),expiresAt:Date.now()+3600000};
  const tickets=scenario.zero?{ranked:0,hint:0}:{ranked:7,hint:3};
  let outage=!!scenario.outage;
  const context=await browser.newContext({viewport:{width:scenario.width,height:844},serviceWorkers:'block'});
  const calls=[],errors=[];
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
   if(url.pathname==='/auth/ranked-session'&&method==='POST'){
    assert.deepEqual(request.postDataJSON(),{username:userId,password,keepLoggedIn:!!scenario.persistent});
    return respond(200,{...proof,serverNow:Date.now()});
   }
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
  await context.addInitScript(()=>localStorage.setItem('qg_language','ja'));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('.title-tutorial').getAttribute('href'),target==='android'?'https://q-gambit.com/rules/':'/rules/','Export must render the selected distribution target');
  await page.getByRole('button',{name:'ログイン',exact:true}).click();
  await page.getByLabel('アカウント名',{exact:true}).fill(userId);
  await page.locator('input[name="password"]').fill(password);
  if(scenario.persistent)await page.locator('#keepLoggedIn').check();
  await page.locator('.title-auth-submit').click();
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
    await page.evaluate(()=>window.dispatchEvent(new Event('qg-ranked-session-change')));
    await check();
   }
   if(scenario.reload){await page.reload();await page.locator('.lobby-studio').waitFor();await check();}
   if(scenario.outage)assert(calls.filter(x=>x.path==='/rewards/daily-login/claim').length>=2,'Failed daily claim must retry when online');
   assert.deepEqual(errors,[]);
  }
  await page.screenshot({path:resolve(artifacts,scenario.name+'.png'),fullPage:true});
  results.push({name:scenario.name,target,passed:true,reproduced:broken,syntheticAccount:true,liveMutations:0,calls});
  await writeFile(resolve(artifacts,'result.json'),JSON.stringify({target,source:publicUrl||'local exported app',results},null,2)+'\n');
  await context.close();
 }
 await writeFile(resolve(artifacts,'result.json'),JSON.stringify({target,source:publicUrl||'local exported app',results},null,2)+'\n');
 console.log(JSON.stringify({target,passed:results.length,reproduced:broken,liveMutations:0}));
}finally{await browser?.close();await new Promise(done=>server?server.close(done):done());}
