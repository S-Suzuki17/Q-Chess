/** Actual React Home + TitleScreen + restoration hook/socket lifecycle.
 * Unrelated game/commerce views and transports are isolated. No live auth, DB,
 * sockets, OAuth provider or production URL is contacted. */
import assert from 'node:assert/strict';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build,createServer} from 'vite';
import {chromium} from 'playwright';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const root=resolve(repo,'scripts/qa/fixtures/legacy-session'),stub=resolve(root,'stubs.tsx');
const named=new Set(['TermsGate','LevelSelect','CampaignMode','useAppPlatform','useNativeAuthLinks','useCampaignProgress','useCampaignCloud','useFoundersRewards']);
const untouched=new Set(['TitleScreen']);
const config={root,configFile:false,logLevel:'warn',define:{'process.env.NEXT_PUBLIC_SERVER_URL':JSON.stringify('https://fixture.invalid'),'process.env':{}},
    resolve:{alias:{'@':resolve(repo,'src')}},
    plugins:[{name:'isolated-auth-fixture',enforce:'pre',resolveId(source,importer){
        if(source==='next/link')return '\0fixture:Link';
        if(source==='socket.io-client')return '\0fixture:io';
        if(source.endsWith('/supabaseClient'))return '\0fixture:supabase';
        if(source.endsWith('/SoundService'))return '\0fixture:soundManager';
        if(source.endsWith('/engagementMetrics'))return '\0fixture:recordVisit';
        const name=source.split('/').at(-1);
        if(named.has(name))return '\0fixture:'+name;
        if(importer?.includes('/src/')&&source.includes('components/')&&!untouched.has(name))return '\0fixture:empty:'+name;
        if(importer?.endsWith('/TitleScreen.tsx')&&['./CommunityFeed','./AccountRecoveryPanel'].includes(source))return '\0fixture:empty:'+name;
    },load(id){
        if(!id.startsWith('\0fixture:'))return;
        const name=id.slice('\0fixture:'.length);
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
await build(config);
if(process.argv.includes('--build-only')){console.log('PASS: isolated Home auth browser fixture builds; interactions not run');process.exit(0);}
const server=await createServer(config);await server.listen();const origin=server.resolvedUrls.local[0];
let browser;const results=[];
const proof={userId:'Alice',token:'ranked_'+'a'.repeat(43),expiresAt:Date.now()+60000};
const oauth={user:{id:'oauth-fixture',is_anonymous:false,user_metadata:{name:'OAuth fixture'}},access_token:'oauth-fixture-token',expires_at:Math.floor(Date.now()/1000)+3600};
try{
    browser=await chromium.launch({headless:true});
    const setup=async({persistent=true,candidate=true,match=false,oauthIntent=false,session=null,initializationError=false,consumeCallback=true}={})=>{
        const context=await browser.newContext({viewport:{width:390,height:844}});let mode='valid',releases=[];let calls=0;
        const errors=[];
        // HTTP routing does not intercept WebSocket handshakes. All sockets are
        // mocked here, so close every real socket, including accidental traffic.
        await context.routeWebSocket('**/*', socket => socket.close());
        await context.route('**/*',async route=>{
            const url=new URL(route.request().url());if(url.origin===new URL(origin).origin)return route.continue();
            if(url.origin==='https://fixture.invalid'&&url.pathname==='/auth/ranked-session/status'){
                calls++;if(mode==='hold')await new Promise(r=>{releases.push(r);});
                if(mode==='unavailable')return route.fulfill({status:503,json:{code:'UNAVAILABLE'}});
                if(mode==='invalid')return route.fulfill({status:401,json:{code:'AUTH_REQUIRED'}});
                return route.fulfill({json:{userId:proof.userId,expiresAt:proof.expiresAt,serverNow:Date.now()}});
            }
            if(url.origin==='https://fixture.invalid'&&url.pathname==='/auth/ranked-session')return route.fulfill({json:{...proof,userId:'Bob',token:'ranked_'+'b'.repeat(43),serverNow:Date.now()}});
            if(url.pathname.endsWith('/revoke'))return route.fulfill({status:204,body:''});
            return route.abort();
        });
        await context.addInitScript(({proof,persistent,candidate,match,oauthIntent,session,initializationError,consumeCallback})=>{
            window.qa={session,initializationError,consumeCallback};localStorage.setItem('qg_language','en');
            if(!sessionStorage.getItem('qaSeeded')){
                sessionStorage.setItem('qaSeeded','1');
                localStorage.setItem('qg_last_user',JSON.stringify({id:'Alice',name:'Cached Alice',type:'registered'}));
                if(candidate)(persistent?localStorage:sessionStorage).setItem('qg_ranked_session_v1',JSON.stringify(proof));
                if(match)localStorage.setItem('qg_active_online_match',JSON.stringify({userId:'Alice',roomId:'existing-match',role:'white',matchMode:'ranked',tc:'3m',timestamp:Date.now()}));
                if(oauthIntent)sessionStorage.setItem('qg_oauth_login_intent_v1',JSON.stringify({version:1,createdAt:Date.now()}));
            }
        },{proof,persistent,candidate,match,oauthIntent,session,initializationError,consumeCallback});
        const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
        return {context,page,errors,mode:v=>{mode=v;},release:()=>{releases.splice(0).forEach(fn=>fn());},calls:()=>calls};
    };
    for(const persistent of [true,false]){
        const f=await setup({persistent});await f.page.goto(origin);await f.page.locator('[data-testid="lobby"][data-user="Alice"]').waitFor();
        assert.equal(await f.page.evaluate(()=>window.qaAccess().userId),'Alice');await f.page.reload();await f.page.locator('[data-testid="lobby"][data-user="Alice"]').waitFor();
        assert.equal(await f.page.evaluate(p=>!!(p?localStorage:sessionStorage).getItem('qg_ranked_session_v1'),persistent),true);
        assert.equal(await f.page.evaluate(p=>(p?sessionStorage:localStorage).getItem('qg_ranked_session_v1'),persistent),null);
        await f.page.getByText('Fixture Circuit',{exact:true}).click();assert.equal(await f.page.locator('[data-testid="circuit"]').getAttribute('data-granted'),'true');
        assert.deepEqual(f.errors,[]);results.push(`reload storage ${persistent?'ON':'OFF'}`);await f.context.close();
    }
    {
        const f=await setup();await f.page.addInitScript(()=>{const original=Date.now;Date.now=()=>original()+300*86400000;});
        await f.page.goto(origin);await f.page.locator('[data-testid="lobby"][data-user="Alice"]').waitFor();
        assert.equal(await f.page.evaluate(()=>window.qaAccess().userId),'Alice');results.push('fast device clock restore');await f.context.close();
    }
    {
        const f=await setup();f.mode('unavailable');await f.page.goto(origin);await f.page.getByRole('button',{name:'Retry',exact:true}).waitFor();
        assert.equal(await f.page.evaluate(()=>window.qaAccess().userId),null);assert(await f.page.evaluate(()=>localStorage.getItem('qg_ranked_session_v1')));
        f.mode('valid');await f.page.getByRole('button',{name:'Retry',exact:true}).click();await f.page.locator('[data-testid="lobby"][data-user="Alice"]').waitFor();
        results.push('503 preserves candidate and retry restores');await f.context.close();
    }
    for(const action of ['logout','switch']){
        const f=await setup();f.mode('hold');await f.page.goto(origin);await f.page.getByText('Checking your saved sign-in…',{exact:true}).waitFor();
        await f.page.evaluate(action=>action==='logout'?window.qaLogout():window.dispatchEvent(new StorageEvent('storage',{key:'qg_last_user',oldValue:JSON.stringify({id:'Alice',type:'registered'}),newValue:JSON.stringify({id:'Bob',type:'registered'})})),action);
        f.mode('valid');f.release();await f.page.waitForTimeout(80);assert.equal(await f.page.evaluate(()=>window.qaAccess().userId),null);
        assert.equal(await f.page.locator('[data-testid="lobby"]').count(),0);results.push(`late response after ${action}`);await f.context.close();
    }
    {
        const f=await setup({candidate:false});await f.page.goto(origin);await f.page.locator('main[data-screen="title"]').waitFor();
        assert.equal(await f.page.evaluate(()=>window.qaAccess().userId),null);assert.equal(f.calls(),0);results.push('cached profile never grants Circuit');await f.context.close();
    }
    {
        const f=await setup({match:true,session:oauth});await f.page.goto(origin);await f.page.locator('[data-testid="match"][data-room="existing-match"]').waitFor();
        await f.page.evaluate(session=>window.qaAuth('SIGNED_IN',session),oauth);await f.page.waitForTimeout(50);
        assert.equal(await f.page.evaluate(()=>window.qaAccess().userId),'Alice');assert.equal(await f.page.locator('[data-testid="match"]').count(),1);
        await f.page.evaluate(()=>window.qa.socket.emit('session_replaced'));assert.equal(await f.page.evaluate(()=>window.qaAccess().userId),'Alice');
        results.push('active match preserved; background OAuth and replaced socket do not log account out');await f.context.close();
    }
    {
        const f=await setup({oauthIntent:true,session:oauth});await f.page.goto(origin+'#access_token=fixture-only');await f.page.locator('[data-testid="lobby"][data-user="oauth-fixture"]').waitFor();
        assert.equal(await f.page.evaluate(()=>window.qaAccess().userId),'oauth-fixture');assert.equal(f.calls(),0);
        assert.equal(await f.page.evaluate(()=>sessionStorage.getItem('qg_oauth_login_intent_v1')),null);
        assert.equal(await f.page.evaluate(()=>localStorage.getItem('qg_ranked_session_v1')),null);
        await f.page.reload();await f.page.locator('[data-testid="lobby"][data-user="oauth-fixture"]').waitFor();
        results.push('explicit OAuth callback owns bootstrap and next reload');await f.context.close();
    }
    for(const kind of ['provider-error','back','unconsumed-code']){
        const f=await setup({oauthIntent:true,session:oauth,initializationError:kind==='provider-error',consumeCallback:kind!=='unconsumed-code'});
        const suffix=kind==='provider-error'?'#error=access_denied&error_description=Fixture+cancelled':kind==='unconsumed-code'?'?code=fixture-unconsumed':'';
        await f.page.goto(origin+suffix);await f.page.waitForFunction(()=>sessionStorage.getItem('qg_oauth_login_intent_v1')===null);
        await f.page.evaluate(session=>window.qaAuth('SIGNED_IN',session),oauth);await f.page.waitForTimeout(30);
        assert.equal(await f.page.evaluate(()=>window.qaAccess().userId),null);assert(await f.page.evaluate(()=>localStorage.getItem('qg_ranked_session_v1')));
        assert.equal(await f.page.locator('[data-testid="lobby"]').count(),0);results.push(`failed OAuth callback preserves legacy: ${kind}`);await f.context.close();
    }
    console.log(JSON.stringify({passed:results.length,results,liveServices:false},null,2));
}finally{await browser?.close();await server.close();}
