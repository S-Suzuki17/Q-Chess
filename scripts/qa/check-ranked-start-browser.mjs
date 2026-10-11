/**
 * Real exported Home/queue/OnlineGameBoard, with a compiled GameEngine fixture.
 * All remote HTTP and WebSockets terminate here. No live queue, wallet, or account
 * is mutated. Usage: node scripts/qa/check-ranked-start-browser.mjs
 *   [static-directory=out] [evidence-directory=scratch/ranked-start] [case-name]
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const {GameEngine}=require('../../server/dist/game/GameEngine.js');
const {createInitialBoard}=require('../../server/dist/game/quantumChess.js');
const [staticDirectory='out',evidenceDirectory='scratch/ranked-start',onlyCase,...extra]=process.argv.slice(2);
assert.equal(extra.length,0,'Unexpected CLI argument');
const root=resolve(staticDirectory),evidence=resolve(evidenceDirectory);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url??'/','http://localhost').pathname);
 const file=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
 if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(await readFile(file));}
 catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
const termsVersion=(await readFile('src/config/terms.ts','utf8')).match(/TERMS_VERSION='([^']+)'/)[1];
const currentTermsVersion=(await readFile('src/config/currentTerms.ts','utf8')).match(/CURRENT_TERMS_VERSION = '([^']+)'/)[1];
const currentTermsDate=(await readFile('src/config/currentTerms.ts','utf8')).match(/CURRENT_TERMS_EFFECTIVE_DATE: string \| null = '([^']+)'/)[1];
const user={id:'RankedStartQA',name:'Ranked QA',type:'registered'};
const proof={userId:user.id,token:'ranked_'+'r'.repeat(43),expiresAt:Date.now()+3600000};
const progress={version:2,stars:{},ascensions:[],stageStars:[],board:'standard',piece:'standard',effect:'standard',music:'standard',avatar:'standard'};
const scenarios=[
 {name:'human-normal',opponent:'human',side:'host',tc:'10m',seconds:600,width:1440,playMove:true,reconnect:true},
 {name:'cpu-white-10s',opponent:'cpu',side:'host',tc:'10s',seconds:10,width:1280},
 {name:'cpu-black-3m',opponent:'cpu',side:'joiner',tc:'3m',seconds:180,width:360},
 {name:'cache-quota',opponent:'human',side:'host',tc:'10m',seconds:600,width:1440,storage:'quota',playMove:true},
 {name:'cache-security',opponent:'cpu',side:'joiner',tc:'10m',seconds:600,width:1440,storage:'security'},
 {name:'cancel-cache-remove',opponent:'human',side:'host',tc:'10m',seconds:600,width:1440,storage:'remove',cancel:true},
 {name:'immediate-limit',opponent:'cpu',side:'host',tc:'10m',seconds:600,width:1440,cancel:true},
 {name:'admission-choice',opponent:'human',side:'host',tc:'10m',seconds:600,width:1440,choice:true},
 {name:'queue-shared-unavailable',opponent:'human',side:'host',tc:'10m',seconds:600,width:1440,queueError:'SHARED_MATCH_UNAVAILABLE'},
 {name:'queue-rating-unavailable',opponent:'cpu',side:'host',tc:'10m',seconds:600,width:1440,queueError:'RATING_UNAVAILABLE'},
 {name:'transport-manual-retry',opponent:'human',side:'host',tc:'10m',seconds:600,width:1440,offlineRetry:true},
 {name:'connect-auth-unavailable',opponent:'human',side:'host',tc:'10m',seconds:600,width:1440,connectError:'AUTH_UNAVAILABLE'},
 {name:'ranked-current-terms-required-10s',opponent:'cpu',side:'host',tc:'10s',seconds:10,width:1280,termsNeeded:true},
 {name:'online-current-terms-required',opponent:'human',side:'host',tc:'3m',seconds:180,width:375,mode:'random',termsNeeded:true},
 {name:'terms-check-unavailable',opponent:'human',side:'host',tc:'3m',seconds:180,width:1440,termsCheckError:true},
 {name:'terms-save-unavailable',opponent:'human',side:'host',tc:'10m',seconds:600,width:1440,termsNeeded:true,termsSaveError:true},
 {name:'terms-narrow-short',opponent:'human',side:'host',tc:'3m',seconds:180,width:320,height:520,termsNeeded:true,readDocument:true},
 {name:'terms-text-400',opponent:'human',side:'host',tc:'10m',seconds:600,width:1280,height:720,termsNeeded:true,textScale:4,readDocument:true},
 {name:'terms-cancel-before-queue',opponent:'human',side:'host',tc:'10m',seconds:600,width:1440,termsNeeded:true,termsCancel:true},
 {name:'cancel-admission-unavailable',opponent:'cpu',side:'host',tc:'10s',seconds:10,width:1280,cancel:true,cancelReason:'admission_unavailable'},
 {name:'cancel-connection-timeout',opponent:'human',side:'host',tc:'10m',seconds:600,width:1440,cancel:true,cancelReason:'connection_timeout'},
];
const selected=scenarios.filter(s=>!onlyCase||s.name===onlyCase);
assert(selected.length,'Unknown case');
const results=[];
let browser;
try{
 await mkdir(evidence,{recursive:true});
 browser=await chromium.launch({headless:true,...(process.env.QG_TEST_CHROMIUM?{executablePath:process.env.QG_TEST_CHROMIUM}:{})});
 for(let index=0;index<selected.length;index++){
  const scenario=selected[index],context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height??(scenario.width<500?800:960)},reducedMotion:'reduce',serviceWorkers:'block'});
  const matchId='00000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),opponentId=scenario.opponent==='cpu'?'ai:'+matchId:'RankedPeerQA';
  const hostId=scenario.side==='host'?user.id:opponentId,joinerId=scenario.side==='joiner'?user.id:opponentId;
  const cpu=scenario.opponent==='cpu'?{side:scenario.side==='host'?'joiner':'host',rating:1000,level:2}:undefined;
  const engine=new GameEngine(matchId,hostId,joinerId,createInitialBoard(),scenario.seconds,{host:hostId===user.id?user.name:'Opponent QA',joiner:joinerId===user.id?user.name:'Opponent QA'},4000,true);
  engine.setMatchMetadata({mode:scenario.mode??'ranked',...(cpu?{cpu}:{})});
  engine.setPlayerRating(scenario.side,1000);
  if(!cpu)engine.setPlayerRating(scenario.side==='host'?'joiner':'host',1100);
  engine.acknowledgeIntro(opponentId);
  const state=()=>engine.getPublicState(user.id);
  const pageErrors=[],protocolErrors=[],externalWrites=[],events=[];
  // Home now restores current consent. Start with valid saved consent, then
  // inject missing consent or a failed status check only at match selection.
  let termsAccepted=true,termsReads=0,termsAccepts=0,matchConsentCheck=false;
  let homeTermsReads=0,homeClaims=0;
  const syntheticClaims=[];
  let send,closeTransport,transportDenied=false,queues=0,connections=0,cancels=0,introAcks=0,choiceConfirmed=false,connectRequests=0,snapshots=0,moves=0;
  const sendSnapshot=()=>{snapshots++;send('match_start',state());send('sync_state',state());};
  await context.routeWebSocket('**/*',ws=>{
   if(!new URL(ws.url()).pathname.startsWith('/socket.io/')){ws.close();return;}
   ws.send('0'+JSON.stringify({sid:'local-ranked-start',upgrades:[],pingInterval:25000,pingTimeout:20000,maxPayload:1000000}));
   const transportSend=(event,data)=>ws.send('42'+JSON.stringify([event,data]));
   ws.onMessage(raw=>{
    try{
     const message=String(raw);
     if(message.startsWith('40')){
      const auth=JSON.parse(message.slice(2));
      assert(auth.userId===user.id&&auth.token===proof.token,'Synthetic proof is scoped to this player');
      if(scenario.offlineRetry&&!transportDenied){
       transportDenied=true;ws.send('44'+JSON.stringify({message:'Synthetic network rejection',data:{code:'CONNECTION_FAILED'}}));return;
      }
      send=transportSend;closeTransport=()=>ws.close();connections++;
      ws.send('40'+JSON.stringify({sid:'local-'+connections}));
      send('queue_stats',{});return;
     }
     if(message==='2'){ws.send('3');return;}
     if(!message.startsWith('42'))return;
     const [event,data]=JSON.parse(message.slice(2));events.push({event,matchId:data?.matchId});
     if(event==='request_shared_entitlement')send('shared_entitlement',{userId:user.id,sharedAdmissionEnabled:true,entitlement:{plan:'free',unlimitedOnlineRanked:false,noAds:false,periodEnd:null}});
     if(event==='join_queue'){
      queues++;assert.equal(data.mode,scenario.mode??'ranked');assert.equal(data.timeControl,scenario.seconds);
      if(scenario.queueError){send('queue_error',{code:scenario.queueError,message:scenario.queueError});return;}
      send('queue_joined',{mode:'ranked',timeControl:scenario.seconds,cpuFallbackAt:Date.now()+10000});
     }
     if(event==='cancel_queue')cancels++;
     if(event==='connect_match'||event==='request_sync'){
      assert.equal(data.matchId,matchId);
      if(event==='connect_match'){connectRequests++;assert.equal(data.introVersion,1);}
      if(scenario.connectError){send('queue_error',{code:scenario.connectError});return;}
      if(scenario.cancel){send('match_cancelled',{matchId,reason:scenario.cancelReason??'INSUFFICIENT_FUNDS'});return;}
      if(scenario.choice&&!choiceConfirmed){
       send('match_preparing',{matchId,reason:'admitting'});
       send('match_admission_choice_required',{matchId,dailyFreeMatches:3,ticketCost:1,verifiedAdMatches:1,verifiedAdAvailable:false});return;
      }
      send('sync_state',{...state(),matchId:'unrelated-match'});
      sendSnapshot();
     }
     if(event==='choose_match_admission'){
      assert.equal(data.matchId,matchId);assert.equal(data.source,'ticket');
      choiceConfirmed=true;sendSnapshot();
     }
     if(event==='intro_ready'){
      assert.equal(data.matchId,matchId);introAcks++;engine.acknowledgeIntro(user.id);send('sync_state',state());
     }
     if(event==='player_action'){
      const result=engine.processAction({...data,playerId:user.id});
      assert(result.success,'A UI move must pass the actual engine rules: '+(result.message??'rejected'));
      moves++;send('sync_state',state());
     }
     if(event==='ping')send('pong',{clientTime:data.clientTime,serverTime:Date.now()});
    }catch(error){protocolErrors.push(error.message);}
   });
  });
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===origin&&['GET','HEAD'].includes(request.method()))return route.continue();
   if(request.method()==='OPTIONS')return route.fulfill({status:204});
   if(url.pathname==='/account/current-terms'){
    const payload=()=>({userId:user.id,currentVersion:currentTermsVersion,effectiveDate:currentTermsDate,effective:true,
     consent:termsAccepted?{version:currentTermsVersion,acceptedAt:new Date().toISOString()}:null});
    if(request.method()==='GET'){
     termsReads++;if(matchConsentCheck&&scenario.termsCheckError)return route.fulfill({status:503,json:{code:'TERMS_UNAVAILABLE'}});
     return route.fulfill({json:payload()});
    }
    if(request.method()==='POST'){
     assert.equal(request.headers().authorization,'Bearer '+proof.token,'Consent is bound to the synthetic player');
     termsAccepts++;assert.deepEqual(request.postDataJSON(),{version:currentTermsVersion,accepted:true});
     if(scenario.termsSaveError)return route.fulfill({status:503,json:{code:'TERMS_UNAVAILABLE'}});
     termsAccepted=true;return route.fulfill({json:payload()});
    }
   }


   // Existing controllers may attempt idempotent claims after current consent.
   // Terminate only these two authenticated empty-body requests in this fixture.
   const dailyStatus=()=>({userId:user.id,enabled:true,streakDays:1,rewardPolicyVersion:1,tickets:{ranked:4,hint:0},lastClaimUtcDay:new Date().toISOString().slice(0,10),currentUtcDay:new Date().toISOString().slice(0,10)});
   const memberStatus=()=>({userId:user.id,enabled:true,active:false,canManageBilling:false,cancelAtPeriodEnd:false,periodEnd:null,lastGrantUtcDay:null,tickets:{ranked:0,hint:0},availableCheckoutSkus:[]});
   if(request.method()==='POST'&&['/rewards/daily-login/claim','/membership/stripe/daily-grant'].includes(url.pathname)){
    assert(termsAccepted,'A synthetic claim must never precede current consent');
    assert.equal(request.headers().authorization,'Bearer '+proof.token,'Claim is bound to the synthetic player');
    assert.deepEqual(request.postDataJSON(),{},'Only the established empty claim body is allowed');
    syntheticClaims.push({path:url.pathname,consentAccepted:true});
    return route.fulfill({json:url.pathname==='/rewards/daily-login/claim'?{...dailyStatus(),credited:{ranked:0,hint:0}}:memberStatus()});
   }

   if(!['GET','HEAD'].includes(request.method())){externalWrites.push({path:url.pathname,method:request.method()});return route.fulfill({status:503,json:{code:'UNAVAILABLE'}});}
   if(url.pathname==='/auth/ranked-session/status')return route.fulfill({json:{userId:user.id,expiresAt:proof.expiresAt,serverNow:Date.now()}});
   if(url.pathname==='/account/terms')return route.fulfill({json:{userId:user.id,currentVersion:termsVersion,consent:{version:termsVersion,acceptedAt:new Date().toISOString()}}});
   if(url.pathname==='/account/progress')return route.fulfill({json:{userId:user.id,revision:0,progress,saved:true}});
   if(url.pathname==='/game-records')return route.fulfill({json:{records:[]}});
   if(url.pathname==='/rewards/daily-login')return route.fulfill({json:dailyStatus()});
   if(url.pathname==='/membership/stripe/status')return route.fulfill({json:memberStatus()});
   if(url.pathname==='/rest/v1/profiles'){
    const rows=[{id:user.id,name:user.name,rating_10m:1000,rating_3m:1000,rating_10s:1000},{id:opponentId,name:'Opponent QA',rating_10m:1100,rating_3m:1100,rating_10s:1100}];
    return route.fulfill({json:request.headers().accept?.includes('vnd.pgrst.object')?rows[0]:rows});
   }
   if(url.pathname==='/system-status')return route.fulfill({json:{maintenance:false,minimumClientVersion:1}});
   return route.fulfill({status:503,json:{code:'UNAVAILABLE'}});
  });
  await context.addInitScript(({user,proof,progress,storage})=>{
   localStorage.setItem('qg_language','ja');localStorage.setItem('qg_last_user',JSON.stringify(user));
   sessionStorage.setItem('qg_ranked_session_v1',JSON.stringify(proof));
   localStorage.setItem('qchess_is2DView','true');localStorage.setItem('qg_campaign_v1',JSON.stringify(progress));
   localStorage.setItem('qg_sound_config',JSON.stringify({masterMute:true,bgmVolume:0,seVolume:0}));
   window.__rankedCacheFailures=0;
   const set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
   Storage.prototype.setItem=function(key,value){
    if(key==='qg_active_online_match'&&(storage==='quota'||storage==='security')){
     window.__rankedCacheFailures++;throw new DOMException('Isolated active match cache failure',storage==='quota'?'QuotaExceededError':'SecurityError');
    }
    return set.call(this,key,value);
   };
   Storage.prototype.removeItem=function(key){
    if(key==='qg_active_online_match'&&storage==='remove'){window.__rankedCacheFailures++;throw new DOMException('Isolated active match remove failure','SecurityError');}
    return remove.call(this,key);
   };
  },{user,proof,progress,storage:scenario.storage});
  const page=await context.newPage();page.setDefaultTimeout(6500);page.on('pageerror',error=>pageErrors.push(error.message));
  let step='restore accepted registered fixture';
  try{
   await page.goto(origin,{waitUntil:'domcontentloaded'});
   await page.locator('.lobby-studio').waitFor();
   await page.waitForLoadState('networkidle');
   homeTermsReads=termsReads;homeClaims=syntheticClaims.length;
   assert(homeTermsReads>0,'Home verified saved current consent');
   assert.equal(termsAccepts,0,'Restoring accepted Home never resubmits consent');
   assert.equal(await page.locator('[data-terms-gate]').count(),0);
   matchConsentCheck=true;
   if(scenario.termsNeeded)termsAccepted=false;
   step='queue via actual lobby';
   await page.locator('.lobby-mode-grid button').nth(scenario.mode==='random'?1:0).click();
   await page.locator('[data-time-control="'+scenario.tc+'"]').click();
   await page.locator('dialog[aria-labelledby="queue-title"][open]').waitFor();
   if(scenario.offlineRetry){
    step='recover a rejected transport with the same proof';
    await page.locator('[data-queue-error-code="CONNECTION_FAILED"]').waitFor();
    assert.equal(queues,0);
    await page.getByRole('button',{name:'再試行',exact:true}).click();
   }
   if(scenario.termsCheckError){
    step='failed consent check never queues; explicit GET retry recovers';
    await page.locator('[data-online-match-terms-retry]').waitFor();assert.equal(queues,0);assert.equal(termsAccepts,0);
    assert.equal(syntheticClaims.length,homeClaims,'Failed match consent checks cannot trigger more claims');
    scenario.termsCheckError=false;
    await page.locator('[data-online-match-terms-retry]').click();
   }
   if(scenario.termsNeeded){
    step='explicit current terms consent precedes the selected queue';
    await page.locator('[data-online-match-terms-checkbox]').waitFor();
    assert.equal(queues,0);assert.equal(choiceConfirmed,false);assert.equal(termsAccepts,0);assert.equal(syntheticClaims.length,homeClaims);
    assert.equal(await page.locator('[data-online-match-terms-accept]').isDisabled(),true);
    if(scenario.textScale)await page.evaluate(scale=>document.documentElement.style.fontSize=(16*scale)+'px',scenario.textScale);
    if(scenario.readDocument){
     await page.locator('[data-online-match-terms] summary').click();
     assert.equal(await page.locator('[data-online-match-terms] details[open]').count(),1);
     await page.screenshot({path:resolve(evidence,scenario.name+'-terms.png'),animations:'disabled'});
     const bounds=await page.locator('[data-online-match-terms]').evaluate(node=>({width:node.getBoundingClientRect().width,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth}));
     assert(bounds.width<=scenario.width,'Consent stays inside the viewport');
     assert(bounds.scrollWidth<=bounds.clientWidth+2,'Consent has no horizontal overflow');
    }

    await page.waitForTimeout(200);assert.equal(queues,0);
    if(scenario.termsCancel){
     await page.locator('[data-online-match-terms-cancel]').click();
     await page.locator('dialog[aria-labelledby="queue-title"]').waitFor({state:'detached'});
     await page.waitForTimeout(300);assert.equal(queues,0);assert.equal(termsAccepts,0);assert.equal(connectRequests,0);assert.equal(syntheticClaims.length,homeClaims);
     assert.deepEqual(pageErrors,[]);assert.deepEqual(protocolErrors,[]);assert.deepEqual(externalWrites,[]);
     await page.screenshot({path:resolve(evidence,scenario.name+'-final.png'),animations:'disabled'});
     results.push({case:scenario.name,pass:true,step,width:scenario.width,queues,homeTermsReads,homeClaims,termsReads,termsAccepts,connectRequests,syntheticClaims,pageErrors,protocolErrors,externalWrites});
     continue;
    }
    await page.locator('[data-online-match-terms-checkbox]').check();
    await page.locator('[data-online-match-terms-accept]').click();
    if(scenario.termsSaveError){
     step='failed consent save never queues or silently resubmits';
     await page.locator('[data-online-match-terms-retry]').waitFor();assert.equal(queues,0);assert.equal(termsAccepts,1);assert.equal(syntheticClaims.length,homeClaims);
     scenario.termsSaveError=false;
     await page.locator('[data-online-match-terms-retry]').click();
     await page.locator('[data-online-match-terms-checkbox]').waitFor();
     assert.equal(await page.locator('[data-online-match-terms-checkbox]').isChecked(),false);
     await page.locator('[data-online-match-terms-checkbox]').check();
     await page.locator('[data-online-match-terms-accept]').click();
    }
   }

   if(scenario.textScale)await page.evaluate(()=>document.documentElement.style.fontSize='16px');

   if(scenario.queueError){
    step='report exact prequeue failure and retry explicitly';
    await page.locator('[data-queue-error-code="'+scenario.queueError+'"]').waitFor();
    assert.equal(await page.locator('#queue-title').innerText(),'対局を開始できませんでした');
    assert.equal(connectRequests,0);
    scenario.queueError=null;
    await page.getByRole('button',{name:'再試行',exact:true}).click();
   }
   const expectedQueues=scenario.name.startsWith('queue-')?2:1;
   const queueDeadline=Date.now()+6500;
   while(queues<expectedQueues&&Date.now()<queueDeadline)await page.waitForTimeout(20);
   assert.equal(queues,expectedQueues);
   step='deliver matched room';
   const found={matchId,hostId,joinerId,timeControl:scenario.seconds,mode:scenario.mode??'ranked',...(cpu?{cpu}:{})};
   send('match_found',found);send('match_found',found);
   if(scenario.cancel){
    step='render immediate admission cancellation';
    if(scenario.cancelReason){
     await page.locator('[data-match-cancelled="'+scenario.cancelReason+'"]').waitFor();
     await page.getByText('対局を中止しました。レートは変動しません。',{exact:true}).waitFor();
    }else await page.getByRole('heading',{name:'ランク戦の対局制限に達しました',exact:true}).waitFor();
    assert.equal(await page.locator('.match-layout').count(),0);
   }else if(scenario.connectError){
    step='render admission error and retry same room';
    await page.locator('[data-match-start-error]').waitFor();
    assert.equal(await page.locator('.match-layout').count(),0);
    const requestsBeforeRetry=connectRequests;
    scenario.connectError=null;
    await page.locator('[data-match-start-retry]').click();
    await page.locator('.match-intro[open]').waitFor();
    assert(connectRequests>requestsBeforeRetry,'Retry reconnects the same matched room');
    assert.equal(queues,1,'Retry never starts a new queue');
    await page.locator('.match-intro[open]').waitFor({state:'detached'});
   }else{
    if(scenario.choice){
     step='explicit admission choice';
     await page.locator('[aria-labelledby="match-choice-title"]').waitFor();
     assert.equal(choiceConfirmed,false,'No automatic ticket choice');
     await page.getByRole('button',{name:'ランク戦チケットを1枚使う',exact:true}).click();
     assert.equal(choiceConfirmed,true);
    }
    step='initial authoritative snapshot and intro';
    const intro=page.locator('.match-intro[open]');await intro.waitFor();
    assert.equal(await page.locator('[aria-labelledby="queue-title"]').count(),0);
    assert.equal(introAcks,0,'Intro is acknowledged only after presentation');
    const clocks=await page.locator('.match-clock').allTextContents();
    await page.waitForTimeout(100);assert.deepEqual(await page.locator('.match-clock').allTextContents(),clocks);
    await intro.waitFor({state:'detached'});
    assert(introAcks>0);assert.equal(state().introPending,false);
    await page.locator('[data-square="e2"]').waitFor();
    if(scenario.playMove){
     step='first move accepted by real GameEngine';
     await page.waitForTimeout(350);
     const initialState=state(),movingPiece=initialState.pieces.find(piece=>piece.y===1&&piece.x===4&&!piece.captured);
     assert(movingPiece,'The initial e2 piece exists');
     await page.locator('[data-square="e2"]').click();
     await page.locator('[data-square="h5"]').click();
     await page.getByText('相手の手番です。駒を選んで候補を確認できます。',{exact:true}).waitFor();
     const movedState=state(),movedPiece=movedState.pieces.find(piece=>piece.id===movingPiece.id);
     assert.equal(moves,1);assert.equal(movedState.moveCount,initialState.moveCount+1);
     assert(movedState.version>initialState.version);assert.equal(movedState.turn,1);
     assert.equal(movedPiece.y,4);assert.equal(movedPiece.x,7);
     const piecePosition=await page.locator('[data-piece-overlay="token_'+movingPiece.id+'"]').evaluate(node=>({left:node.style.left,top:node.style.top}));
     assert.deepEqual(piecePosition,{left:'87.5%',top:'37.5%'});
    }
    if(scenario.reconnect){
     step='transport reconnect restores this board without new queue';
     closeTransport();
     await page.waitForTimeout(1500);
     await page.waitForFunction(()=>document.querySelector('[data-square="h5"]'));
     assert(connections>=2,'Transport reconnect performed');
     assert(connectRequests>=2,'Board requested resume');
     assert.equal(queues,1,'Resume does not queue or choose another ticket');
    }
   }
   await page.screenshot({path:resolve(evidence,scenario.name+'-final.png'),animations:'disabled'});
   assert(connectRequests>=1,'Board owns the first connect_match request');
   assert.equal(cancels,0,'Matched transition cleanup does not cancel the queue');
   assert.deepEqual(protocolErrors,[]);assert.deepEqual(pageErrors,[]);
   assert.deepEqual(externalWrites,[],'No unknown account/wallet mutations or forwarded HTTP requests');
   if(!scenario.termsNeeded)assert.equal(termsAccepts,0,'Saved current consent does not prompt or resubmit at match selection');
   const cacheFailures=await page.evaluate(()=>window.__rankedCacheFailures);
   if(scenario.storage)assert(cacheFailures>0,'Storage failure was actually injected');
   results.push({case:scenario.name,pass:true,step,width:scenario.width,opponent:scenario.opponent,side:scenario.side,timeControl:scenario.tc,queues,connections,connectRequests,cancels,introAcks,snapshots,moves,homeTermsReads,homeClaims,termsReads,termsAccepts,choiceConfirmed,cacheFailures,syntheticClaims,pageErrors,protocolErrors,externalWrites});
  }catch(error){
   const screen=await page.locator('main[data-screen]').getAttribute('data-screen').catch(()=>null);
   const status=await page.locator('[role="status"]').allTextContents().catch(()=>[]);
   await page.screenshot({path:resolve(evidence,scenario.name+'-failure.png'),fullPage:true}).catch(()=>{});
   results.push({case:scenario.name,pass:false,step,error:error.message,screen,status,queues,connections,connectRequests,cancels,introAcks,snapshots,moves,homeTermsReads,homeClaims,termsReads,termsAccepts,syntheticClaims,pageErrors,protocolErrors,externalWrites});
  }finally{await context.close();}
 }
}finally{
 await writeFile(resolve(evidence,'results.json'),JSON.stringify({staticDirectory:root,localFixtureOnly:true,results},null,2)+'\n');
 await browser?.close();await new Promise(done=>server.close(done));
}
console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length,evidence,results:results.map(r=>({case:r.case,pass:r.pass,step:r.step,pageErrors:r.pageErrors}))},null,2));
assert.equal(results.filter(r=>!r.pass).length,0,'Ranked start browser regression failed; see preserved evidence');
