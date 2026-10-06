import assert from 'node:assert/strict';
import {build,createServer} from 'vite';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),fixture=resolve(root,'scripts/qa/fixtures/crown');
const stub=resolve(fixture,'stubs.tsx');
const config={configFile:false,root:fixture,server:{host:'127.0.0.1',port:0,fs:{allow:[root]}},
    resolve:{alias:[
        ...['LocalGameBoard','RewardPreview','ChampionshipCollection','RewardArtwork'].map(name=>({find:new RegExp(`^\\./${name}$`),replacement:stub})),
        ...['useCampaignProgress'].map(name=>({find:new RegExp(`^\\.\\./hooks/${name}$`),replacement:stub})),
        ...['SoundService','stripeMembership'].map(name=>({find:new RegExp(`^\\.\\./lib/${name}$`),replacement:stub})),
        {find:/^\.\.\/config\/crownAdmission$/,replacement:stub},
    ]},define:{'process.env.NEXT_PUBLIC_SERVER_URL':JSON.stringify('http://127.0.0.1:19999'),'process.env':{}},
    optimizeDeps:{include:['react','react-dom/client','lucide-react']},
    css:{postcss:{plugins:[]}},
    build:{write:false},
};
await build(config);
if(process.argv.includes('--build-only')){console.log('PASS: Crown Campaign fixture compiles; browser interactions not run');process.exit(0);}
const server=await createServer(config);
await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`;
const output=resolve('/tmp/qg-crown-browser-results');await mkdir(output,{recursive:true});
let browser;const results=[];
try{
    browser=await chromium.launch({headless:true,...(process.env.QG_TEST_CHROMIUM?{executablePath:process.env.QG_TEST_CHROMIUM}:{})});
    for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
        const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
        let requests=0,hold=false,release;
        await context.route('**/*',async route=>{
            const url=new URL(route.request().url());if(url.origin===base)return route.continue();
            if(url.origin==='http://127.0.0.1:19999'&&url.pathname==='/crown/first-attempt'){
                if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST'}});
                requests++;const {stageId}=route.request().postDataJSON();
                if(hold)await new Promise(done=>{release=done;});
                return route.fulfill({json:{state:'authorized',userId:'CrownFixture',rankKey:`crown:stage:v1:${stageId}`,
                    authorizationId:'00000000-0000-4000-8000-000000000001',source:'verified_ad',reused:requests>1},headers:{'Access-Control-Allow-Origin':'*'}}).catch(()=>{});
            }
            return route.abort();
        });
        await context.addInitScript(()=>{
            window.qaEnabled=true;
            sessionStorage.setItem('qg_ranked_session_v1',JSON.stringify({userId:'CrownFixture',token:'ranked_fixture_crown_token_123456',expiresAt:Date.now()+600000}));
        });
        await page.goto(base);await page.locator('.campaign-primary').waitFor();
        const start=async()=>{
            const expected=await page.evaluate(()=>window.qaEnabled===true);
            const sent=expected?page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname==='/crown/first-attempt'):null;
            await page.locator('[data-stage="1"]').click();await page.locator('.campaign-boss-card .campaign-primary').click();
            if(sent)await sent;
        };
        hold=true;await start();await page.waitForFunction(()=>document.querySelector('.campaign-boss-card .campaign-primary')?.disabled);
        await page.locator('.campaign-boss-card .campaign-primary').evaluate(button=>button.click());
        await page.waitForTimeout(50);assert.equal(requests,1);
        await page.locator('[data-stage="2"]').click();hold=false;release?.();
        await page.waitForTimeout(60);assert.equal(await page.locator('[data-crown-board]').count(),0);
        await start();await page.locator('[data-crown-board]').waitFor();await page.locator('[data-leave]').click();
        results.push(`${viewport.width}: repeat click and stage switch discard stale reply; fresh retry enters`);

        hold=true;await start();await page.waitForTimeout(60);
        await page.locator('.campaign-header button').click();hold=false;release?.();
        await page.waitForTimeout(60);assert.equal(await page.locator('[data-crown-board]').count(),0);
        await page.locator('[data-reopen]').click();results.push(`${viewport.width}: Back/unmount discards stale reply`);

        hold=true;await start();await page.waitForTimeout(60);await page.evaluate(()=>window.dispatchEvent(new PopStateEvent('popstate')));
        hold=false;release?.();await page.waitForTimeout(60);assert.equal(await page.locator('[data-crown-board]').count(),0);
        results.push(`${viewport.width}: browser navigation cancels pending activation`);

        hold=true;await start();await page.waitForTimeout(60);await page.evaluate(()=>window.qaRevoke());
        hold=false;release?.();await page.locator('[data-testid="circuit-login-gate"]').waitFor();
        await page.evaluate(()=>window.qaRelogin());await page.locator('.campaign-screen').waitFor();
        assert.equal(await page.locator('[data-crown-board]').count(),0);results.push(`${viewport.width}: revoked authentication and same-account login cannot reuse stale UI continuation`);

        await page.evaluate(()=>{window.qaEnabled=false;window.qaMembershipHold=true;});const before=requests;
        await start();await page.waitForFunction(()=>!!window.qaReleaseMembership);
        await page.locator('.campaign-header button').click();await page.evaluate(()=>{window.qaMembershipHold=false;window.qaReleaseMembership();});
        await page.waitForTimeout(60);assert.equal(requests,before);assert.equal(await page.locator('[data-crown-board]').count(),0);
        await page.locator('[data-reopen]').click();await start();await page.locator('[data-crown-board]').waitFor();
        await page.locator('[data-leave]').click();results.push(`${viewport.width}: closed gate preserves legacy paid entry and cancels delayed membership lookup`);
        await page.screenshot({path:resolve(output,`campaign-${viewport.width}.png`)});
        assert.deepEqual(errors,[]);await context.close();
    }
    assert.equal(results.length,10,'Both desktop and mobile must run every entry interruption scenario');
    await writeFile(resolve(output,'result.json'),JSON.stringify({checks:results,providerValidated:false,durableSQLTest:'crown-postgres.test.mjs'},null,2));
    console.log(JSON.stringify({passed:results.length,output},null,2));
}finally{await browser?.close();await server.close();}
