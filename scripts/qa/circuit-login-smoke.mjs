import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const base=process.argv[2]??'http://127.0.0.1:3100';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Local fixtures only');
const output=resolve('../../outputs/circuit-login');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
let page;
try{
    for(const viewport of [{width:1440,height:1000},{width:360,height:800}]){
        const context=await browser.newContext({viewport,reducedMotion:'reduce'});
        let releaseLogin;
        const delayedLogin=new Promise(resolve=>{releaseLogin=resolve;});
        let holdLogin=true;
        await context.route('**/*',async route=>{
            const req=route.request(),url=new URL(req.url());
            if(url.origin===new URL(base).origin)return route.continue();
            // No traffic, real credentials or writes reach Supabase or game servers.
            if(url.pathname==='/rest/v1/rpc/login_user'){
                const accepted=req.postDataJSON()?.p_id==='qatest';
                if(accepted&&holdLogin)await delayedLogin;
                return route.fulfill({json:accepted});
            }
            if(url.pathname==='/rest/v1/profiles'){
                const profile={id:'qatest',name:'QA Player',rating_10m:1500,rating_3m:1400,rating_10s:1300};
                return route.fulfill({json:req.headers().accept?.includes('vnd.pgrst.object')?profile:[profile]});
            }
            if(url.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});
            return route.abort();
        });
        await context.addInitScript(()=>{
            localStorage.setItem('qg_language','ja');
            localStorage.setItem('qg_sound_config',JSON.stringify({bgmVolume:0,seVolume:0,masterMute:true}));
            if(!localStorage.getItem('qa-circuit-seeded')){
                localStorage.setItem('qa-circuit-seeded','1');
                localStorage.setItem('qg_last_user',JSON.stringify({id:'GUEST-QA',name:'Guest QA',type:'guest'}));
                localStorage.setItem('qg_campaign_v1',JSON.stringify({version:2,stars:{},ascensions:[],stageStars:[3,2],board:'standard',piece:'standard',effect:'standard',music:'standard',avatar:'standard'}));
            }
        });
        page=await context.newPage();page.setDefaultTimeout(25000);
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.goto(base);await page.locator('.lobby-campaign-action').waitFor();
        const saved=await page.evaluate(()=>localStorage.getItem('qg_campaign_v1'));
        await page.getByRole('button',{name:'練習',exact:true}).click();
        await page.locator('[data-time-control="10m"]').click();
        await page.locator('.match-layout').waitFor();
        await page.locator('.match-intro[open]').waitFor({state:'detached',timeout:15000});
        await page.getByRole('button',{name:'ホームに戻る',exact:true}).click();
        await page.getByRole('button',{name:'戻る',exact:true}).click();
        await page.locator('.lobby-campaign-action').waitFor();
        await page.locator('.lobby-campaign-action').click();
        await page.locator('[data-testid="circuit-login-gate"]').waitFor();
        assert.equal(await page.locator('[data-stage]').count(),0);
        assert.equal(await page.locator('.match-layout').count(),0);
        assert.equal(await page.evaluate(()=>localStorage.getItem('qg_campaign_v1')),saved);
        await page.screenshot({path:resolve(output,`guest-gate-${viewport.width}.png`)});
        await page.locator('.campaign-login-gate .campaign-primary').click();
        await page.locator('form input[type="password"]').waitFor();
        await page.locator('form input[type="text"]').fill('wrong');
        await page.locator('form input[type="password"]').fill('fixture-password-not-real');
        await page.locator('form button[type="submit"]').click();
        await page.getByText('アカウント名またはパスワードが間違っています。',{exact:true}).waitFor();
        assert.equal(await page.locator('.campaign-screen').count(),0);
        await page.locator('form input[type="text"]').fill('qatest');
        const pendingLogin=page.waitForRequest(request=>new URL(request.url()).pathname==='/rest/v1/rpc/login_user');
        await page.locator('form button[type="submit"]').click();
        await pendingLogin;
        await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'qg_last_user',newValue:null})));
        holdLogin=false;releaseLogin();
        await page.waitForFunction(()=>document.querySelector('form button[type="submit"]')?.disabled===false);
        assert.equal(await page.locator('.campaign-screen').count(),0,'A late RPC cannot restore a revoked login');
        assert.equal(await page.evaluate(()=>localStorage.getItem('qg_campaign_v1')),saved);
        await page.locator('form button[type="submit"]').click();
        await page.locator('.campaign-screen').waitFor();
        assert.equal(await page.locator('[data-stage]').count(),10);
        assert.equal(await page.locator('.campaign-screen').getAttribute('data-circuit-stage'),'3');
        assert.equal(await page.evaluate(()=>localStorage.getItem('qg_campaign_v1')),saved);
        await page.locator('[data-stage="1"]').click();
        await page.locator('.campaign-boss-card .campaign-primary').click();
        await page.locator('.match-layout').waitFor();
        await page.evaluate(async()=>{
            const oldValue=localStorage.getItem('qg_last_user');
            const newValue=JSON.stringify({...JSON.parse(oldValue),name:'Appearance update in another tab'});
            window.dispatchEvent(new StorageEvent('storage',{key:'qg_last_user',oldValue,newValue}));
            await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        });
        assert.equal(await page.locator('.match-layout').count(),1,'Appearance-only updates must not interrupt a match');
        await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'qg_last_user',newValue:null})));
        await page.locator('[data-testid="circuit-login-gate"]').waitFor();
        assert.equal(await page.locator('.match-layout').count(),0);
        assert.equal(await page.evaluate(()=>localStorage.getItem('qg_campaign_v1')),saved);
        // A remembered registered profile is display data, not proof after reload.
        await page.reload();await page.locator('.lobby-campaign-action').click();
        await page.locator('[data-testid="circuit-login-gate"]').waitFor();
        assert.equal(await page.locator('[data-stage]').count(),0);
        assert.deepEqual(errors,[]);
        results.push({viewport,pass:true,guestBlocked:true,guestPracticePlayable:true,failedLoginBlocked:true,staleLoginRecoverable:true,legacyLoginAccepted:true,stageStartsAfterLogin:true,appearanceUpdateKeepsMatch:true,crossTabRevocation:true,cachedIdentityBlocked:true,savePreserved:true});
        console.log(`PASS Circuit login ${viewport.width}`);
        await context.close();
    }
    // Supabase callback/session integration is mocked, not a live OAuth login.
    for(const anonymous of [false,true]){
        const context=await browser.newContext({viewport:{width:360,height:800},reducedMotion:'reduce'});
        const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'qa@example.invalid',user_metadata:{name:'OAuth QA'},app_metadata:{provider:'google'},is_anonymous:anonymous};
        let userChecks=0;
        await context.route('**/*',async route=>{
            const req=route.request(),url=new URL(req.url());
            if(url.origin===new URL(base).origin)return route.continue();
            if(url.pathname==='/auth/v1/user'){userChecks++;return route.fulfill({json:user});}
            if(url.pathname==='/rest/v1/profiles')return route.fulfill({json:{id:user.id,name:'OAuth QA',rating_10m:1500}});
            if(url.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});
            return route.abort();
        });
        await context.addInitScript(({id})=>{
            localStorage.setItem('qg_language','ja');
            localStorage.setItem('qg_sound_config',JSON.stringify({bgmVolume:0,seVolume:0,masterMute:true}));
            // Even a registered cached identity cannot authorize an anonymous session.
            localStorage.setItem('qg_last_user',JSON.stringify({id,name:'Cached OAuth QA',type:'registered'}));
        },{id:user.id});
        const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
        const token=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),role:'authenticated'})}.local-fixture-only`;
        page=await context.newPage();page.setDefaultTimeout(25000);
        await page.goto(`${base}/#access_token=${token}&refresh_token=fixture-refresh-token&expires_in=3600&token_type=bearer`);
        await page.locator('.lobby-campaign-action').waitFor();
        if(!anonymous)await page.locator('.lobby-campaign-action small').waitFor({state:'detached'});
        await page.locator('.lobby-campaign-action').click();
        await page.locator(anonymous?'[data-testid="circuit-login-gate"]':'.campaign-screen').waitFor();
        assert(userChecks>=1,'Session identity must be checked, not accepted from display cache');
        results.push({authFixture:anonymous?'anonymous-denied':'supabase-verified',pass:true,userChecks});
        console.log(`PASS ${anonymous?'anonymous denied':'verified session'}`);
        await context.close();
    }
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});throw error;}
finally{await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));await browser.close();}
