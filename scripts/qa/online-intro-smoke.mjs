// No server is launched: its module only constructs the fixture state. All HTTP
// writes/external traffic and all WebSockets are intercepted, never forwarded.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
const {GameEngine}=require('../../server/dist/game/GameEngine.js');
const {createInitialBoard}=require('../../server/dist/game/quantumChess.js');
const base=process.argv[2]??'http://127.0.0.1:3101';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Local fixtures only');
const output=resolve('../../outputs/online-intro');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),results=[];
try {
    for(const scenario of [
        {width:1440,height:1000,kind:'snapshot',tc:'10m',seconds:600,white:1800,black:2400},
        {width:360,height:800,kind:'snapshot',tc:'3m',seconds:180,white:1500,black:2250},
        {width:320,height:720,kind:'legacy',tc:'10s',seconds:10,white:1200,black:2100},
        {width:390,height:844,kind:'new-user',tc:'10m',seconds:600,white:1000,black:1000},
        {width:360,height:800,kind:'unavailable',tc:'10m',seconds:600,white:null,black:null},
    ]) {
        const context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height},reducedMotion:'reduce'});
        const engine=new GameEngine('intro-qa','qa-white','qa-black',createInitialBoard(),scenario.seconds,{host:'White QA',joiner:'Black QA'},4000,true);
        if(scenario.kind!=='legacy'&&scenario.kind!=='unavailable') {
            engine.setPlayerRating('host',scenario.white);engine.setPlayerRating('joiner',scenario.black);
        }
        engine.setPlayerAppearance('host',undefined,'avatar-frame-15');engine.setPlayerAppearance('joiner',undefined,'avatar-frame-10');
        let acknowledged=false,profileRequestAt=0,profileResponseAt=0;
        const snapshots=[];
        await context.routeWebSocket('**/*',ws=>{
            if(!new URL(ws.url()).pathname.startsWith('/socket.io/')){ws.close();return;}
            const send=(event,data)=>ws.send('42'+JSON.stringify([event,data]));
            ws.send('0'+JSON.stringify({sid:'qa-engine',upgrades:[],pingInterval:25000,pingTimeout:20000,maxPayload:1000000}));
            ws.onMessage(raw=>{
                const message=String(raw);
                if(message.startsWith('40')){ws.send('40'+JSON.stringify({sid:'qa-socket'}));send('queue_stats',{});return;}
                if(!message.startsWith('42'))return;
                const [event,data]=JSON.parse(message.slice(2));
                if(event==='join_queue')send('match_found',{matchId:'intro-qa',hostId:'qa-white',joinerId:'qa-black',timeControl:scenario.seconds});
                if(event==='connect_match'||event==='request_sync') {
                    const state=engine.getPublicState('qa-white');snapshots.push(state);
                    send('match_start',state);send('sync_state',state);
                }
                if(event==='ping')send('pong',{clientTime:data.clientTime,serverTime:Date.now()});
                if(event==='intro_ready') {
                    acknowledged=true;engine.acknowledgeIntro('qa-white');engine.acknowledgeIntro('qa-black');
                    send('sync_state',engine.getPublicState('qa-white'));
                }
            });
        });
        await context.route('**/*',async route=>{
            const request=route.request(),url=new URL(request.url());
            if(request.method()!=='GET')return route.abort();
            if(url.origin===new URL(base).origin)return route.continue();
            if(url.pathname==='/rest/v1/profiles') {
                const pair=url.searchParams.get('id')?.startsWith('in.');
                if(pair) {
                    profileRequestAt=Date.now();
                    // New snapshots must display despite failed REST; legacy waits
                    // for the real response instead of spending its intro countdown.
                    if(scenario.kind==='legacy')await new Promise(resolve=>setTimeout(resolve,900));
                    else return route.fulfill({status:503,json:{message:'Read unavailable fixture'}});
                    profileResponseAt=Date.now();
                }
                const rows=[{id:'qa-white',name:'White QA',rating_10m:scenario.white,rating_3m:scenario.white,rating_10s:scenario.white},{id:'qa-black',name:'Black QA',rating_10m:scenario.black,rating_3m:scenario.black,rating_10s:scenario.black}];
                return route.fulfill({json:request.headers().accept?.includes('vnd.pgrst.object')?rows[0]:rows});
            }
            if(url.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});
            return route.abort();
        });
        await context.addInitScript(()=>{
            localStorage.setItem('qg_language','ja');
            // This test isolates the intro, not board GPU startup performance.
            localStorage.setItem('qchess_is2DView','true');
            localStorage.setItem('qg_last_user',JSON.stringify({id:'qa-white',name:'White QA',type:'registered'}));
            sessionStorage.setItem('qg_ranked_session_v1',JSON.stringify({token:'ranked_'+'a'.repeat(43),userId:'qa-white',expiresAt:Date.now()+3600000}));
            localStorage.setItem('qg_sound_config',JSON.stringify({bgmVolume:0,seVolume:0,masterMute:true}));
            localStorage.setItem('qg_campaign_v1',JSON.stringify({version:2,stars:{},ascensions:[],stageStars:Array(100).fill(3),board:'standard',piece:'standard',effect:'standard',music:'standard',avatar:'avatar-frame-15'}));
        });
        const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.goto(base);
        await page.getByRole('button',{name:'対局する',exact:true}).click();
        await page.getByRole('button',{name:/ランダム対局/}).click();
        await page.locator(`[data-time-control="${scenario.tc}"]`).click();
        const intro=page.locator('.match-intro[open]');
        await intro.waitFor({timeout:15000});
        const expected=scenario.kind==='snapshot'?(scenario.tc==='10m'?['bishop','king']:['knight','queen']):scenario.kind==='legacy'?['pawn','rook']:['none','none'];
        assert.deepEqual(await intro.locator('[data-intro-badge]').evaluateAll(nodes=>nodes.map(node=>node.dataset.introBadge)),expected);
        assert.equal(await intro.locator('canvas').count(),0);
        for(const rating of [scenario.white,scenario.black])if(rating!==null)assert((await intro.innerText()).includes(String(rating)));
        if(scenario.kind==='legacy')assert(profileResponseAt>=profileRequestAt+850,'Legacy intro waits for profile response');
        const clocks=await page.locator('.match-clock').allTextContents();
        await page.waitForTimeout(250);
        assert.deepEqual(await page.locator('.match-clock').allTextContents(),clocks,'Clock must stay paused during intro');
        assert(!acknowledged,'No early acknowledgement while badges are shown');
        assert(await intro.evaluate(node=>node.scrollWidth<=node.clientWidth+1));
        await intro.screenshot({path:resolve(output,`${scenario.kind}-${scenario.width}.png`)});
        await intro.locator('button').click();
        await intro.waitFor({state:'detached'});
        await page.waitForFunction(()=>!document.querySelector('.match-intro[open]'));
        assert(acknowledged);
        assert(snapshots.length>0);
        assert.deepEqual(errors,[]);
        results.push({scenario,pass:true,badges:expected,clockPaused:true});
        await context.close();
    }
}catch(error){results.push({pass:false,error:error.message});throw error;}
finally{await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));await browser.close();}
console.log(`Online intro QA: ${results.length} scenarios passed.`);
