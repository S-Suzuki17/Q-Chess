/** Actual Home, Google setup, consent, cloud progress and Google HTTP router.
 * Google OAuth/session delivery and persistence are synthetic; the router and
 * password hashing are real. Ephemeral store, loopback only, no live accounts. */
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import express from '../../server/node_modules/express/index.js';
import {createServer} from 'vite';
import {chromium} from 'playwright';

export async function verifyGoogleLogin(group='all') {
 const repo=process.cwd(),root=resolve('scripts/qa/fixtures/password-login'),stub=resolve(root,'stubs.tsx');
 const named=new Set(['LevelSelect','useAppPlatform','useNativeAuthLinks','useCampaignProgress','useFoundersRewards']);
 const realViews=new Set(['TitleScreen','GoogleAccountSetup','TermsGate','TermsDocument']);
 const app=express(),api=await new Promise(done=>{const listener=app.listen(0,'127.0.0.1',()=>done(listener));});
 const endpoint=`http://127.0.0.1:${api.address().port}`;
 const server=await createServer({root,configFile:false,logLevel:'warn',esbuild:{jsx:'automatic'},
  define:{'process.env.NEXT_PUBLIC_SERVER_URL':JSON.stringify(endpoint),'process.env':{}},
  resolve:{alias:{'@':resolve(repo,'src')}},
  plugins:[{name:'isolated-google-login',enforce:'pre',resolveId(source,importer){
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
    if(component==='NativeAdAudienceGate')return `export {Empty as NativeAdAudienceGate,Empty as NativeAdAudienceSettings} from ${JSON.stringify(stub)};`;
    return `export {Empty as default,Empty as ${component}} from ${JSON.stringify(stub)};`;
   }
   if(name==='supabase')return `export {supabase,oauthCallbackAtStartup} from ${JSON.stringify(stub)};`;
   return `export {${name}${name==='Link'?' as default':''}} from ${JSON.stringify(stub)};`;
  }}],server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[repo]}}});
 const {createGoogleAccountRouter}=await server.ssrLoadModule(resolve('server/src/services/GoogleAccountRoutes.ts'));
 const {GoogleAccountError,checkGooglePassword}=await server.ssrLoadModule(resolve('server/src/services/GoogleAccounts.ts'));
 const {AccountWriteGate}=await server.ssrLoadModule(resolve('server/src/services/AccountDeletion.ts'));
 const termsSource=await readFile(resolve('src/config/currentTerms.ts'),'utf8');
 const termsVersion=termsSource.match(/CURRENT_TERMS_VERSION\s*=\s*'([^']+)'/)[1];
 const termsDate=termsSource.match(/CURRENT_TERMS_EFFECTIVE_DATE[^=]*=\s*'([^']+)'/)[1];
 const password='synthetic-password-17',progress={version:2,stars:{},ascensions:[],stageStars:[],board:'standard',piece:'standard',effect:'standard',music:'standard',avatar:'standard'};
 let state;
 app.use((req,res,next)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization,X-QG-Protocol,X-QG-Platform,X-QG-Build');
  if(req.method==='OPTIONS'){res.sendStatus(204);return;}
  state.calls.push({path:req.path,method:req.method});next();
 });
 app.use(createGoogleAccountRouter({
  async verify(token){return state.sessions.has(token)?{authId:state.sessions.get(token).user.id,authenticatedAt:Date.now()}:null;},
  async read(authId){
   if(state.readHold)await state.readHold;
   if(state.readError)throw Error('Synthetic account-read outage');
   return state.accounts.get(authId)??null;
  },
  async setup(actor,username,hash,version,legacyPassword){
   state.setupRequests++;
   if(state.setupError)throw Error('Synthetic setup outage');
   assert.equal(version,termsVersion);assert(await checkGooglePassword(password,hash),'Actual router must hash the supplied password');
   if(username==='Taken')throw new GoogleAccountError('NAME_UNAVAILABLE');
   if(legacyPassword!==undefined&&!(username==='OldName'&&legacyPassword==='legacy-password-17'))throw new GoogleAccountError('LEGACY_AUTH_REQUIRED');
   const account={authId:actor.authId,userId:legacyPassword===undefined?actor.authId:'legacy-game-id',username,name:username};
   state.accounts.set(actor.authId,account);state.accepted.set(account.userId,true);return account;
  },
  async password(){return false;},async changePassword(){return false;},
 },new AccountWriteGate(),{admission:async()=>null},()=>true));
 app.use(express.json());
 app.use(async(req,res)=>{
  const session=state.sessions.get((req.headers.authorization??'').replace(/^Bearer /,''));
  const account=session&&state.accounts.get(session.user.id);
  if(!account){res.status(401).json({code:'AUTH_REQUIRED'});return;}
  if(req.path==='/auth/oauth-admission'){res.json({userId:account.userId,admitted:true});return;}
  if(req.path==='/account/current-terms'){
   if(req.method==='GET'){
    state.termsReads++;
    if(state.termsHold)await state.termsHold;
    if(state.termsError){res.status(503).json({code:'TERMS_UNAVAILABLE'});return;}
   }else{
    assert.deepEqual(req.body,{version:termsVersion,accepted:true});state.consentPosts++;
    if(state.consentError){res.status(503).json({code:'TERMS_UNAVAILABLE'});return;}
    state.accepted.set(account.userId,true);
   }
   res.json({userId:account.userId,currentVersion:termsVersion,effectiveDate:termsDate,effective:true,
    consent:state.accepted.get(account.userId)?{version:termsVersion,acceptedAt:'2026-10-20T00:00:00Z'}:null});return;
  }
  if(req.path==='/account/progress'){
   assert.equal(state.accepted.get(account.userId),true,'Progress must wait for explicit current consent');
   state.progressReads++;res.json({userId:account.userId,revision:1,progress,saved:req.method==='POST'});return;
  }
  state.unexpected.push({path:req.path,method:req.method});res.sendStatus(404);
 });
 const cases=[
  {name:'setup-validation-and-explicit-consent',group:'setup',setup:true,validation:true,width:390},
  {name:'setup-existing-account-password-and-id',group:'setup',setup:true,legacy:true,width:1280},
  {name:'setup-name-conflict-retry',group:'setup',setup:true,duplicate:true,width:390},
  {name:'setup-outage-retry',group:'setup',setup:true,setupError:true,width:1280},
  {name:'setup-text-200-percent',group:'setup',setup:true,scale:2,width:390},
  {name:'current-consent-before-cloud',group:'consent',needsTerms:true,reload:true,match:true,width:390},
  {name:'current-consent-read-outage',group:'consent',termsError:true,width:1280},
  {name:'current-consent-save-retry',group:'consent',needsTerms:true,consentError:true,width:390},
  {name:'logout-during-consent-read',group:'consent',termsPending:true,width:390},
  {name:'other-google-account-own-consent',group:'consent',switch:true,width:1280},
  {name:'saved-google-no-login-flash',group:'restoration',reload:true,width:390},
  {name:'saved-google-match-and-token-refresh',group:'restoration',savedMatch:true,width:1280},
  {name:'saved-google-outage-retry',group:'restoration',readError:true,width:390},
  {name:'cancel-pending-google-read',group:'restoration',readPending:true,width:390},
  {name:'failed-callback-rejects-saved-google',group:'restoration',badCallback:true,width:1280},
  {name:'legacy-proof-cannot-bypass-google',group:'restoration',legacyOnly:true,width:390},
  {name:'guest-without-account-consent',group:'restoration',guest:true,width:390},
 ];
 assert(['all','setup','consent','restoration'].includes(group));
 const output=resolve(`scratch/google-login-${group}`);await mkdir(output,{recursive:true});
 await server.listen();const origin=new URL(server.resolvedUrls.local[0]).origin;
 let browser;const results=[];
 try{
  browser=await chromium.launch({headless:true,...(process.env.QG_TEST_CHROMIUM?{executablePath:process.env.QG_TEST_CHROMIUM}:{})});
  for(const [index,scenario] of cases.entries()){
   if(group!=='all'&&scenario.group!==group)continue;
   const authId=`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`;
   const session={user:{id:authId,is_anonymous:false},access_token:`fixture.${index+1}.signature`,expires_at:Math.floor(Date.now()/1000)+3600};
   const account={authId,userId:'game-'+index,username:'Player'+index,name:'Player'+index};
   state={...scenario,sessions:new Map([[session.access_token,session]]),accounts:new Map(scenario.setup?[]:[[authId,account]]),
    accepted:new Map([[account.userId,!scenario.needsTerms]]),calls:[],unexpected:[],setupRequests:0,termsReads:0,consentPosts:0,progressReads:0};
   let releaseRead,releaseTerms;
   if(scenario.readPending)state.readHold=new Promise(done=>{releaseRead=done;});
   if(scenario.termsPending)state.termsHold=new Promise(done=>{releaseTerms=done;});
   const context=await browser.newContext({viewport:{width:scenario.width,height:844},serviceWorkers:'block'});
   await context.routeWebSocket('**/*',socket=>socket.close());
   await context.route('**/*',route=>[origin,endpoint].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
   await context.addInitScript(({session,scenario,account})=>{
    window.qa={nextSession:session};localStorage.setItem('qg_language','ja');
    if(!sessionStorage.getItem('qa-seeded')){
     sessionStorage.setItem('qa-seeded','true');
     if(!scenario.setup&&!scenario.legacyOnly&&!scenario.guest)localStorage.setItem('qa-google-session',JSON.stringify(session));
     if(scenario.legacyOnly){
      localStorage.setItem('qg_last_user',JSON.stringify({id:'OldName',name:'OldName',type:'registered'}));
      localStorage.setItem('qg_ranked_session_v1',JSON.stringify({userId:'OldName',token:'ranked_'+'x'.repeat(43),expiresAt:Date.now()+3600000}));
     }
     if(scenario.savedMatch){
      localStorage.setItem('qg_last_user',JSON.stringify({id:account.userId,name:account.name,type:'registered'}));
      localStorage.setItem('qg_active_online_match',JSON.stringify({userId:account.userId,roomId:'saved-match',role:'white',matchMode:'ranked',tc:'3m',timestamp:Date.now()}));
     }
     if(scenario.badCallback)sessionStorage.setItem('qg_oauth_login_intent_v1',JSON.stringify({version:1,createdAt:Date.now()}));
    }
    window.qaEntryFrames=0;
    new MutationObserver(()=>{if(document.querySelector('[data-entry-mode]'))window.qaEntryFrames++;}).observe(document,{childList:true,subtree:true});
   },{session,scenario,account});
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   const lobby=id=>page.locator(`[data-testid="lobby"][data-user="${id}"]`);
   const entry=()=>page.locator('[data-entry-mode="select"]');
   const consent=async()=>{
    await page.locator('[data-terms-checkbox]').waitFor();assert.equal(state.progressReads,0);
    assert.equal(await page.locator('[data-terms-checkbox]').isChecked(),false);
    assert.equal(await page.locator('[data-terms-accept]').isDisabled(),true);
    await page.locator('[data-terms-checkbox]').check();await page.locator('[data-terms-accept]').click();
   };
   await page.goto(origin+(scenario.badCallback?'/?error=access_denied':''));
   let expected=account.userId;
   if(scenario.setup){
    await entry().waitFor();assert.equal(await page.locator('input[type="password"],input[type="email"]').count(),0);
    await page.getByRole('button',{name:'Googleでログイン・新規登録',exact:true}).click();
    await page.getByRole('button',{name:'Googleで続ける',exact:true}).click();
    await page.locator('[data-google-setup]').waitFor();
    assert.equal(await page.evaluate(()=>window.qa.oauthOptions.provider),'google');
    const fill=async(name,pw=password)=>{await page.getByLabel('ユーザー名',{exact:true}).fill(name);await page.getByLabel('新しいQ-Gambit用パスワード',{exact:true}).fill(pw);await page.getByLabel('パスワードの確認',{exact:true}).fill(pw);};
    const agreed=page.locator('[data-google-setup] input[type="checkbox"]').last(),submit=page.getByRole('button',{name:'設定して同意する',exact:true});
    assert.equal(await agreed.isChecked(),false);assert.equal(await submit.isDisabled(),true);assert.equal(state.setupRequests,0);
    assert((await page.locator('[data-terms-document]').textContent()).includes(termsVersion));
    await agreed.check();
    if(scenario.scale)await page.locator('[data-google-setup]').evaluate((el,scale)=>{for(const node of el.querySelectorAll('label,input,button,p,summary')){const style=getComputedStyle(node);node.style.fontSize=parseFloat(style.fontSize)*scale+'px';node.style.lineHeight='1.5';}},scenario.scale);
    if(scenario.validation){
     await fill('a');await submit.click();await page.getByRole('alert').waitFor();assert.equal(state.setupRequests,0);
     await fill('NewPlayer','short');await submit.click();await page.getByRole('alert').waitFor();assert.equal(state.setupRequests,0);
     await fill('NewPlayer');await page.getByLabel('パスワードの確認',{exact:true}).fill('different-password');await submit.click();
     await page.getByText('パスワードが一致しません。',{exact:true}).waitFor();assert.equal(state.setupRequests,0);
    }
    if(scenario.legacy){
     await page.getByLabel('既存のユーザー名・パスワードのアカウントを引き継ぐ',{exact:true}).check();
     await fill('OldName');await page.getByLabel('引き継ぐアカウントの現在のパスワード',{exact:true}).fill('wrong-password');
     await submit.click();await page.getByRole('alert').waitFor();assert.equal(state.accounts.size,0);
     await page.getByLabel('引き継ぐアカウントの現在のパスワード',{exact:true}).fill('legacy-password-17');expected='legacy-game-id';
    }else{
     await fill(scenario.duplicate?'Taken':'NewPlayer');expected=authId;
     if(scenario.duplicate){await submit.click();await page.getByRole('alert').waitFor();assert.equal(state.accounts.size,0);await fill('NewPlayer');}
    }
    if(scenario.scale){await submit.scrollIntoViewIfNeeded();assert(await submit.isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
    await page.screenshot({path:resolve(output,scenario.name+'-setup.png'),fullPage:true});
    await submit.click();
    if(scenario.setupError){await page.getByRole('alert').waitFor();assert.equal(state.accounts.size,0);state.setupError=false;await submit.click();}
    await lobby(expected).waitFor();assert.equal(state.consentPosts,0,'Setup already recorded consent atomically');
    assert(!(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).includes(password),'Never store the Q-Gambit password');
   }else if(scenario.readPending){
    await page.locator('[data-google-session="checking"]').waitFor();await page.getByRole('button',{name:'キャンセル',exact:true}).click();
    releaseRead();await entry().waitFor();await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.qaAccess().userId),null);
   }else if(scenario.badCallback||scenario.legacyOnly||scenario.guest){
    await entry().waitFor();assert.equal(await page.evaluate(()=>window.qaAccess().userId),null);assert.equal(state.calls.length,0);
    if(scenario.guest){await page.getByRole('button',{name:'ゲストとしてプレイ',exact:true}).click();await page.locator('[data-testid="lobby"]').waitFor();assert.equal(state.calls.length,0);}
   }else if(scenario.termsPending){
    await page.locator('[data-terms-loading]').waitFor();await page.getByRole('button',{name:'戻る',exact:true}).click();
    releaseTerms();await entry().waitFor();await page.waitForTimeout(150);assert.equal(state.progressReads,0);assert.equal(await page.evaluate(()=>window.qaAccess().userId),null);
   }else{
    if(scenario.readError){await page.locator('[data-google-session="error"]').waitFor();assert.equal(state.progressReads,0);state.readError=false;await page.getByRole('button',{name:'再試行',exact:true}).click();}
    if(scenario.termsError){await page.getByRole('alert').waitFor();assert.equal(state.progressReads,0);state.termsError=false;await page.getByRole('button',{name:'再試行',exact:true}).click();}
    if(scenario.needsTerms){
     await consent();
     if(scenario.consentError){await page.getByRole('alert').waitFor();assert.equal(state.progressReads,0);state.consentError=false;await page.getByRole('button',{name:'再試行',exact:true}).click();await consent();}
    }
    if(scenario.savedMatch){
     await page.locator('[data-testid="match"][data-room="saved-match"]').waitFor();
     await page.evaluate(()=>window.qaRefresh());await page.waitForTimeout(150);
     assert.equal(await page.locator('[data-testid="match"][data-room="saved-match"]').count(),1);
     await page.getByRole('button',{name:'Fixture finish and home',exact:true}).click();
    }
    await lobby(expected).waitFor();assert.equal(await page.evaluate(()=>window.qaEntryFrames),0,'Saved Google login must never flash the entry UI');
    if(scenario.switch){
     const other={user:{id:authId+'-other',is_anonymous:false},access_token:`fixture.${index+100}.signature`,expires_at:session.expires_at};
     const next={authId:other.user.id,userId:'other-game',username:'OtherPlayer',name:'OtherPlayer'};
     state.sessions.set(other.access_token,other);state.accounts.set(other.user.id,next);state.accepted.set(next.userId,false);state.progressReads=0;
     await page.evaluate(other=>window.qaSwitch(other),other);await consent();await lobby(next.userId).waitFor();
    }
    if(scenario.match){await page.getByRole('button',{name:'Fixture match',exact:true}).click();await page.locator('[data-testid="match"]').waitFor();await page.getByRole('button',{name:'Fixture finish and home',exact:true}).click();await lobby(expected).waitFor();}
   }
   if(scenario.reload){const posts=state.consentPosts;await page.reload();await lobby(expected).waitFor();assert.equal(state.consentPosts,posts);assert.equal(await page.evaluate(()=>window.qaEntryFrames),0);}
   assert.deepEqual(errors,[],scenario.name);assert.deepEqual(state.unexpected,[],scenario.name);
   results.push({name:scenario.name,passed:true,setupRequests:state.setupRequests,termsReads:state.termsReads,consentPosts:state.consentPosts,progressReads:state.progressReads});
   await page.screenshot({path:resolve(output,scenario.name+'.png'),fullPage:true});await context.close();
  }
  await writeFile(resolve(output,'results.json'),JSON.stringify({scope:'Actual Home, Google setup, terms and router; synthetic OAuth and store; no live mutations',group,passed:results.length,results},null,2)+'\n');
  console.log(JSON.stringify({group,passed:results.length,output}));
 }finally{await browser?.close();await server.close();await new Promise(done=>api.close(done));}
}
