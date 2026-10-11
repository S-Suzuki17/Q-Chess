/** Real entry UI + registration router + RankedAuth, ephemeral password verifier.
 * No Supabase Auth, DB, OAuth, payment or network beyond this loopback fixture. */
import assert from 'node:assert/strict';
import {scryptSync,timingSafeEqual} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import express from '../../server/node_modules/express/index.js';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const boundaryOnly=process.argv.includes('--name-boundary-only');
const formTextOnly=process.argv.includes('--form-text-only');
const root=process.cwd(),fixture=resolve('scripts/qa/fixtures/account-registration'),stub=resolve(fixture,'stubs.tsx'),output=resolve(formTextOnly?'scratch/multi-review-auth-text':boundaryOnly?'scratch/multi-review-auth':'scratch/account-registration-results');
await mkdir(output,{recursive:true});
const app=express(),accounts=new Map(),results=[];let unavailable=false,loginUnavailable=false;
const hash=password=>scryptSync(password,'synthetic-fixture-only',32);
accounts.set('OldName',{hash:hash('legacy-password-17')});
const server=await createServer({configFile:false,root:fixture,publicDir:resolve('public'),
 server:{host:'127.0.0.1',port:4197,strictPort:true,fs:{allow:[root]}},
 resolve:{alias:[{find:'next/link',replacement:stub},{find:/^\.\/CommunityFeed$/,replacement:stub}]},
 define:{'process.env.NEXT_PUBLIC_SERVER_URL':JSON.stringify('http://127.0.0.1:4197'),'process.env':{}},
 plugins:[{name:'local-auth-api',configureServer(vite){vite.middlewares.use('/auth',(req,res)=>{req.url='/auth'+req.url;app(req,res);});}}]});
const {createAccountSecurityRouter}=await server.ssrLoadModule(resolve('server/src/services/AccountSecurityRoutes.ts'));
const {RankedAuth}=await server.ssrLoadModule(resolve('server/src/services/RankedAuth.ts'));
const {AccountWriteGate}=await server.ssrLoadModule(resolve('server/src/services/AccountDeletion.ts'));
const auth=new RankedAuth(async(id,password)=>{if(loginUnavailable)throw Error('fixture outage');const row=accounts.get(id);return !!row&&timingSafeEqual(row.hash,hash(password));});
app.use(createAccountSecurityRouter(auth,{ready:async()=>!unavailable,verifyUser:async()=>null,restricted:async()=>false,
 register:async(id,password,email)=>{if(accounts.has(id))return false;accounts.set(id,{hash:hash(password),email});return true;},signOutAll:async()=>{}},new AccountWriteGate(),()=>{}));
app.use(express.json({limit:'2kb'}));
app.post('/auth/ranked-session',async(req,res)=>{try{const proof=await auth.issueLegacySession(req.body.username,req.body.password,req.body.keepLoggedIn===true);if(!proof)return res.status(401).json({code:'AUTH_FAILED'});res.json({...proof,serverNow:Date.now()});}catch{res.status(503).json({code:'UNAVAILABLE'});}});
await server.listen();const base='http://127.0.0.1:4197';let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.QG_TEST_CHROMIUM});
 for(const viewport of formTextOnly?[{width:390,height:844}]:[{width:390,height:844},{width:1280,height:720}]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const open=async(mode)=>{await page.goto(base);await page.locator(`[data-entry-mode="select"]`).waitFor();await page.getByRole('button',{name:mode==='register'?'アカウント作成':'ログイン',exact:true}).click();};
  const fill=async(name,password,email)=>{await page.getByLabel('アカウント名',{exact:true}).fill(name);await page.locator('input[name="password"]').fill(password);if(email!==undefined)await page.getByLabel('メールアドレス',{exact:true}).fill(email);};
  const submit=()=>page.locator('form button[type="submit"]').click();
  if(formTextOnly){
   for(const factor of [2,4]){
    await open('register');
    const scaleNewText=()=>page.evaluate(factor=>{
     for(const el of document.querySelectorAll('form input,form label,form button,form p,form span')){
      if(el.dataset.qaFontBase)continue;
      const style=getComputedStyle(el),base=parseFloat(style.fontSize);el.dataset.qaFontBase=String(base);
      el.style.setProperty('font-size',`${base*factor}px`,'important');
      const line=parseFloat(style.lineHeight);if(Number.isFinite(line))el.style.setProperty('line-height',`${line*factor}px`,'important');
     }
    },factor);
    await scaleNewText();
    const reach=async(selector)=>{
     const control=page.locator(selector);await control.scrollIntoViewIfNeeded();
     const bounds=await control.boundingBox();assert(bounds&&bounds.x>=-1&&bounds.x+bounds.width<=viewport.width+1&&bounds.y<viewport.height&&bounds.y+bounds.height>0,`${selector} remains reachable at ${factor}x`);
    };
    for(const selector of ['input[name="email"]','input[name="username"]','input[name="password"]','#keepLoggedIn','form button[type="submit"]','form>button:last-child'])await reach(selector);
    const name=`TextScale${factor}`;
    await fill(name,'short','scale@example.test');await submit();await page.getByRole('alert').waitFor();await scaleNewText();await reach('[role="alert"]');
    const layout=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,formWidth:document.querySelector('form').getBoundingClientRect().width,fonts:[...document.querySelectorAll('form input,form label,form button')].map(el=>({base:Number(el.dataset.qaFontBase),actual:parseFloat(getComputedStyle(el).fontSize)}))}));
    assert(layout.scrollWidth<=layout.viewport+1,'no horizontal page overflow');
    for(const font of layout.fonts)assert(Math.abs(font.actual-font.base*factor)<.1);
    await page.screenshot({path:resolve(output,`form-text-${factor}x.png`),fullPage:true});
    const cancel=page.locator('form>button:last-child');await cancel.click();await page.locator('[data-entry-mode="select"]').waitFor();
    await open('register');await scaleNewText();await fill(name,'correct-horse-17','scale@example.test');await submit();await page.locator('[data-authenticated]').waitFor();assert.equal(await page.locator('[data-authenticated]').innerText(),name);
    results.push({viewport,factor,method:'Only registration form elements: computed font-size and numeric line-height multiplied; excludes hero, native zoom and physical keyboard',layout,inputsSubmitAlertCancelReachable:true,validRegistration:true});
   }
   assert.deepEqual(errors,[]);await context.close();continue;
  }
  if(boundaryOnly){
   await open('register');const id='LongAccountName';
   const input=page.getByLabel('アカウント名',{exact:true});
   await input.focus();await page.keyboard.insertText(' '+id+' ');
   assert.equal(await input.inputValue(),' '+id+' ');
   await page.locator('input[name="password"]').fill('correct-horse-17');
   await page.getByLabel('メールアドレス',{exact:true}).fill('boundary@example.test');
   await submit();await page.locator('[data-authenticated]').waitFor();
   assert.equal(await page.locator('[data-authenticated]').innerText(),id);
   assert(accounts.has(id));assert(!accounts.has(id.slice(0,-1)));
   await page.getByRole('button',{name:'Local sign out'}).click();
   await page.getByRole('button',{name:'ログイン',exact:true}).click();
   await fill(id,'correct-horse-17');await submit();
   await page.locator('[data-authenticated]').waitFor();
   assert.equal(await page.locator('[data-authenticated]').innerText(),id);
   await page.screenshot({path:resolve(output,`boundary-login-${viewport.width}.png`),fullPage:true});
   accounts.delete(id);
   await open('register');await fill('LongAccountNameX','correct-horse-17','invalid@example.test');
   await submit();await page.getByRole('alert').waitFor();assert(!accounts.has('LongAccountNameX'));
   assert.deepEqual(errors,[]);results.push({viewport,padded15CharacterRegistration:true,exactNameRelogin:true,overlongNameRejected:true});
   await context.close();continue;
  }
  await open('register');const id='New'+viewport.width;
  await fill(id,'correct-horse-17','invalid-email');await submit();assert.equal(await page.locator('input[type="email"]').evaluate(el=>el.validity.valid),false);assert(!accounts.has(id));
  await fill('a','correct-horse-17','new@example.test');await submit();await page.getByRole('alert').waitFor();assert(!accounts.has('a'));

  await fill(id,'short','new@example.test');await submit();await page.getByRole('alert').waitFor();assert(!accounts.has(id));
  await fill(' '+id+' ','correct-horse-17',' NEW'+viewport.width+'@example.test ');await submit();await page.locator('[data-authenticated]').waitFor();assert.equal(await page.locator('[data-authenticated]').innerText(),id);assert.equal(accounts.get(id).email,'new'+viewport.width+'@example.test');
  assert(!(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).includes('correct-horse'));
  await page.getByRole('button',{name:'Local sign out'}).click();await page.getByRole('button',{name:'ログイン',exact:true}).click();assert.equal(await page.locator('input[type="email"]').count(),0);
  await fill(id,'incorrect-password');await submit();await page.getByRole('alert').waitFor();assert((await page.getByRole('alert').innerText()).includes('違います'));
  await fill(id,'correct-horse-17');await submit();await page.locator('[data-authenticated]').waitFor();
  await open('login');await fill('OldName','legacy-password-17');await submit();await page.locator('[data-authenticated]').waitFor();assert.equal(await page.locator('[data-authenticated]').innerText(),'OldName');
  await open('register');await fill(id,'correct-horse-17','dup@example.test');await submit();await page.getByRole('alert').waitFor();assert.equal(accounts.get(id).email,'new'+viewport.width+'@example.test');
  unavailable=true;await fill('Outage'+viewport.width,'correct-horse-17','outage@example.test');await submit();await page.getByRole('alert').waitFor();assert(!accounts.has('Outage'+viewport.width));unavailable=false;
  loginUnavailable=true;await open('register');await fill('Retry'+viewport.width,'correct-horse-17','retry@example.test');await submit();await page.locator('[data-entry-mode="login"]').waitFor();assert.equal(await page.locator('input[name="password"]').inputValue(),'');loginUnavailable=false;
  await fill('Retry'+viewport.width,'correct-horse-17');await submit();await page.locator('[data-authenticated]').waitFor();
  await open('register');await fill('Review'+viewport.width,'correct-horse-17','review@example.test');await page.screenshot({path:resolve(output,`registration-${viewport.width}.png`),fullPage:true});
  assert.deepEqual(errors,[]);results.push({viewport,registration:true,relogin:true,legacyLogin:true,invalidPassword:true,invalidEmail:true,invalidName:true,duplicate:true,outage:true,registeredLoginRetry:true,noStoredPassword:true});await context.close();
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify({scope:'Real UI, real registration router and RankedAuth; ephemeral scrypt verifier; no live provider',results},null,2));console.log(JSON.stringify({passed:results.length,output}));
}finally{await browser?.close();await server.close();}
