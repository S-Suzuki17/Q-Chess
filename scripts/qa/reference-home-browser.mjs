/** Actual static Home and its navigation; every external transport is isolated. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('out'),output=resolve(process.argv[2]??'scratch/reference-home');await mkdir(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.mp3':'audio/mpeg','.webm':'video/webm'};
const server=createServer(async(req,res)=>{const pathname=decodeURIComponent(new URL(req.url??'/','http://localhost').pathname),file=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
const terms=await readFile('src/config/currentTerms.ts','utf8'),version=/CURRENT_TERMS_VERSION\s*=\s*'([^']+)'/.exec(terms)[1],effective=/CURRENT_TERMS_EFFECTIVE_DATE[^=]*=\s*'([^']+)'/.exec(terms)[1];
const user={id:'QA_ReferenceHomeOnly',name:'Reference QA',type:'registered'},proof={userId:user.id,token:'ranked_'+'a'.repeat(43),expiresAt:Date.now()+3600000};
const progress={version:2,stars:{},ascensions:[],stageStars:[],board:'walnut',piece:'boxwood',effect:'standard',music:'standard',avatar:'standard'};
const records=Array.from({length:3},(_,index)=>({id:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,created_at:new Date(Date.now()-index*3600000).toISOString(),white_id:user.id,black_id:'ai',white_player:user.name,black_player:'Seia',mode:'cpu',winner:'white_wins',time_control:'10m',moves:[],total_moves:0}));
let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.QG_TEST_CHROMIUM});
 for(const[width,height,lang,textScale,guest]of [[375,812,'ja',1,false],[390,844,'ja',1,false],[320,568,'ja',1,false],[844,390,'en',1,false],[1280,800,'en',1,false],[375,812,'de',2,false],[375,812,'ja',1,true]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],remote=[];
  page.on('pageerror',error=>errors.push(error.message));await context.routeWebSocket('**/*',socket=>socket.close());
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin===origin)return route.continue();remote.push({method:route.request().method(),path:url.pathname});
   if(url.pathname==='/auth/ranked-session/status')return route.fulfill({json:{userId:user.id,expiresAt:proof.expiresAt,serverNow:Date.now()}});
   if(url.pathname==='/account/current-terms')return route.fulfill({json:{userId:user.id,currentVersion:version,effectiveDate:effective,effective:true,consent:{version,acceptedAt:new Date().toISOString()}}});
   if(url.pathname==='/account/progress')return route.fulfill({json:{userId:user.id,revision:0,progress,saved:true}});
   if(url.pathname==='/game-records')return route.fulfill({json:{records}});
   if(url.pathname==='/rest/v1/profiles')return route.fulfill({json:url.searchParams.has('order')?[{id:user.id,name:user.name,rating_10m:1273,rating_3m:1351,rating_10s:1197}]:{id:user.id,name:user.name,rating_10m:1273,rating_3m:1351,rating_10s:1197}});
   if(url.pathname==='/membership/stripe/status')return route.fulfill({json:{userId:user.id,enabled:true,active:false,canManageBilling:false,cancelAtPeriodEnd:false,periodEnd:null,lastGrantUtcDay:null,tickets:{ranked:0,hint:0},availableCheckoutSkus:[]}});
   return route.fulfill({status:503,json:{code:'UNAVAILABLE'}});
  });
  await context.addInitScript(({user,proof,lang,guest})=>{localStorage.setItem('qg_language',lang);if(!guest){localStorage.setItem('qg_last_user',JSON.stringify(user));localStorage.setItem('qg_ranked_session_v1',JSON.stringify(proof));}localStorage.setItem('qchess_is2DView','true');localStorage.setItem('qg_sound_config',JSON.stringify({masterMute:true,bgmVolume:0,seVolume:0}));},{user,proof,lang,guest});
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  if(guest){await page.locator('.app-corner-controls button').waitFor();assert(await page.locator('.app-corner-controls button').isVisible(),'Title settings preserved');await page.getByRole('button',{name:'ゲストとしてプレイ',exact:true}).click();}
  const lobby=page.locator('.lobby-reference');await lobby.waitFor();
  if(guest){assert.equal(await page.locator('[data-terms-gate]').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('qg_guest_terms')),null);assert(!remote.some(request=>request.path==='/account/current-terms'));}
  if(!guest)await page.locator('.lobby-rating strong').filter({hasText:'1273'}).waitFor();
  assert.equal(await page.locator('.app-corner-controls button:visible').count(),0,'Global home settings is hidden');assert.equal(await page.locator('.lobby-home-tools button:visible').count(),1);
  assert.equal((await page.locator('[data-free-match-tickets]').textContent()).trim(),'—');assert.equal((await page.locator('[data-free-hint-tickets]').textContent()).trim(),'—');
  if(textScale===2)await page.evaluate(()=>{const nodes=[...document.querySelectorAll('.lobby-reference *')].filter(node=>[...node.childNodes].some(child=>child.nodeType===3&&child.textContent.trim())).map(node=>[node,parseFloat(getComputedStyle(node).fontSize)]);for(const[node,size]of nodes)node.style.fontSize=`${size*2}px`;});
  const layout=await lobby.evaluate(node=>{const r=node.getBoundingClientRect();return{width:node.clientWidth,scrollWidth:node.scrollWidth,offenders:[...node.querySelectorAll('*')].filter(child=>{const b=child.getBoundingClientRect();return b.width&&b.right>r.right+1;}).map(child=>({tag:child.tagName,cls:typeof child.className==='string'?child.className:child.getAttribute('class'),text:child.textContent?.slice(0,70),right:child.getBoundingClientRect().right})).slice(0,12)};});
  await writeFile(resolve(output,`home-layout-${width}-${lang}-${textScale}${guest?'-guest':''}.json`),JSON.stringify(layout,null,2)+'\n');
  await page.screenshot({path:resolve(output,`home-debug-${width}-${lang}-${textScale}.png`)});
  assert(layout.scrollWidth<=layout.width+1,JSON.stringify(layout));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:resolve(output,`home-${width}x${height}-${lang}-${textScale}${guest?'-guest':''}.png`)});
  const settings=page.locator('.lobby-home-tools button');await settings.click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});assert(await settings.evaluate(node=>document.activeElement===node));
  await page.locator('.lobby-play-action').click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
  for(const index of guest?[1,2,3]:[0,1,2,3]){const action=page.locator('.lobby-mode-grid button').nth(index);await action.click();await page.getByRole('dialog').waitFor();if(index===3){const join=page.getByRole('dialog');assert(await join.locator('button[type="submit"]').isDisabled());await join.getByRole('textbox').fill('abc123');assert(await join.locator('button[type="submit"]').isEnabled());}await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});assert(await action.evaluate(node=>document.activeElement===node));}
  await page.locator('.lobby-shortcuts button').first().click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
  await page.locator('.lobby-bottom-navigation button').nth(1).click();const history=page.locator('.lobby-reference>.fixed').filter({has:page.locator('h3')});await history.waitFor();await history.locator('header button, h3+button').first().click();await history.waitFor({state:'detached'});
  await page.locator('.lobby-bottom-navigation button').nth(2).click();const ranking=page.locator('.lobby-reference>.fixed').filter({has:page.locator('h3')});await ranking.waitFor();await ranking.locator('h3+button').first().click();await ranking.waitFor({state:'detached'});
  await page.locator('.lobby-library summary').click();await page.locator('[data-lobby-cosmetic="board"] button').click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
  await page.locator('[data-lobby-music]').first().getByRole('button').click();await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('dialog').locator('audio').getAttribute('autoplay'),null);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
  await page.locator('.lobby-bottom-navigation button').first().click();assert.equal(await page.locator('.lobby-library').getAttribute('open'),null);
  await page.locator('.lobby-campaign-action').click();if(guest){await page.getByRole('button',{name:'ログインしてプレイ',exact:true}).waitFor();assert.equal(await page.locator('.crown-encounter').count(),0);}else{await page.locator('.crown-reference .campaign-primary').waitFor();await page.locator('.campaign-header button').first().click();await lobby.waitFor();}
  assert.deepEqual(errors,[]);assert(!remote.some(request=>/claim|checkout|purchase|spend/.test(request.path)));
  results.push({width,height,lang,textScale,guest,pass:true,checks:['real1273 profile or guest unknown','unknown/off ticket counts are not0','one Home settings; Title preserved','play/mode/CPU setup cancel and focus','history/ranking navigation','equipment and music previews','Crown membership gate'],productionWrites:false});await context.close();
 }
 await writeFile(resolve(output,'home-result.json'),JSON.stringify({pass:true,results,limits:'Actual Android static export; network/WebSocket blocked or synthetic, no live accounts or physical Android performance certification.'},null,2)+'\n');console.log('Reference Home: 7 passed');
}finally{await browser?.close();await new Promise(done=>server.close(done));}
