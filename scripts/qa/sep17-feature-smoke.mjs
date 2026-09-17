import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const base=process.argv[2]??'http://127.0.0.1:3100';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Local fixtures only');
const output=resolve('../../outputs/sep17-features');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
let page;
try{
 for(const viewport of [{width:1440,height:1000},{width:360,height:800}]){
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});
  let accepted=false,offline=false;
  const profiles=[
   {id:'qa-user',name:'QA Player',rating_10s:1234,rating_3m:1356,rating_10m:1478},
   {id:'friend-a',name:'Long Friend Name / 長い表示名のテスト',rating_10s:1081,rating_3m:1192,rating_10m:1303},
   {id:'friend-b',name:'New Friend',rating_10s:990,rating_3m:1100,rating_10m:1200},
  ];
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===new URL(base).origin)return route.continue();
   if(url.pathname==='/rest/v1/friends'){
    if(offline)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Offline fixture'})});
    if(request.method()==='PATCH'){accepted=true;return route.fulfill({json:[{id:'incoming'}]});}
    return route.fulfill({json:[{id:'a',user_id:'qa-user',friend_id:'friend-a',status:'accepted'},{id:'reverse',user_id:'friend-a',friend_id:'qa-user',status:'accepted'},{id:'incoming',user_id:'friend-b',friend_id:'qa-user',status:accepted?'accepted':'pending'}]});
   }
   if(url.pathname==='/rest/v1/profiles'){
    const rows=profiles.filter(profile=>!url.searchParams.has('id')||url.searchParams.get('id').includes(profile.id));
    return route.fulfill({json:request.headers().accept?.includes('vnd.pgrst.object')?rows[0]:rows});
   }
   if(url.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});
   return route.abort();
  });
  await context.addInitScript(()=>{
   localStorage.setItem('qg_language','ja');
   localStorage.setItem('qg_last_user',JSON.stringify({id:'qa-user',name:'QA Player',type:'registered'}));
   localStorage.setItem('qg_sound_config',JSON.stringify({bgmVolume:0,seVolume:0,masterMute:true}));
  });
  page=await context.newPage();page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('.lobby-campaign-action').waitFor();
  assert.equal(await page.locator('[data-settings-panel]').count(),0);
  await page.getByRole('button',{name:'⚙️ 設定',exact:true}).click();
  await page.locator('[data-settings-panel="friends"]').click();
  await page.locator('[data-friend-id="friend-a"]').waitFor();
  assert.equal(await page.locator('.friend-card').count(),1);
  assert.deepEqual(await page.locator('[data-friend-id="friend-a"] dd').allTextContents(),['1081','1192','1303']);
  await page.getByRole('button',{name:'承認',exact:true}).click();
  await page.locator('[data-friend-id="friend-b"]').waitFor();
  assert.equal(await page.locator('.friend-card').count(),2);
  assert(await page.locator('.friends-panel').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
  await page.screenshot({path:resolve(output,'friends-'+viewport.width+'.png')});
  await page.keyboard.press('Escape');
  offline=true;await page.locator('[data-settings-panel="friends"]').click();
  await page.locator('.friend-error').waitFor();offline=false;
  await page.locator('.friend-error button').click();
  await page.locator('[data-friend-id="friend-a"]').waitFor();
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await page.locator('.lobby-campaign-action').click();
  assert.equal(await page.locator('[data-stage]').count(),10);
  assert.match(await page.locator('[data-stage="1"]').innerText(),/10分/);
  assert.match(await page.locator('[data-stage="2"]').innerText(),/3分/);
  assert.match(await page.locator('[data-stage="3"]').innerText(),/一手10秒/);
  await page.locator('[data-stage="2"]').click();
  assert(await page.locator('.campaign-boss-card .campaign-primary').isDisabled());
  await page.locator('[data-stage="1"]').click();
  // Exercise all five actual sculpted GLB-derived forms, not just catalogue art.
  if(viewport.width>700){
   const seen=new Set();
   for(const grade of ['1','2','3']){
    await page.locator('.championship-collection select').selectOption(grade);
    const forms=await page.locator('[data-piece-form]').evaluateAll(nodes=>nodes.map(n=>({form:n.dataset.pieceForm,id:n.dataset.championshipReward})));
    for(const {form,id} of forms){
     if(seen.has(form))continue;
     await page.locator('[data-preview-reward="'+id+'"]').click();
     await page.locator('dialog [data-graphics-state="ready"]').waitFor({timeout:45000});
     await page.locator('dialog').screenshot({path:resolve(output,'form-'+form+'.png')});
     await page.keyboard.press('Escape');seen.add(form);
    }
   }
   assert.equal(seen.size,5);
   await page.locator('.championship-collection select').selectOption('1');
  }
  const before=await page.evaluate(()=>localStorage.getItem('qg_campaign_v1'));
  await page.locator('[data-preview-reward="avatar-frame-01"]').click();
  assert(await page.locator('[data-testid="preview-equip"]').isDisabled());
  assert.equal(await page.locator('dialog canvas').count(),0);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>localStorage.getItem('qg_campaign_v1')),before);
  await page.locator('.championship-collection select').selectOption('10');
  for(const finish of ['wood','neon']){
   await page.locator('[data-preview-reward="champion-board-reference-'+finish+'"]').click();
   await page.locator('dialog [data-graphics-state="ready"]').waitFor({timeout:45000});
   assert(await page.locator('[data-testid="preview-equip"]').isDisabled(),'Endgame glass set must remain locked');
   await page.locator('dialog').screenshot({path:resolve(output,finish+'-preview-'+viewport.width+'.png')});
   assert.equal(await page.locator('dialog .board-3d').getAttribute('data-camera'),'fixed');
   await page.keyboard.press('Escape');
  }
  // All-progress fixtures are local QA, not earned victories or cloud writes.
  await page.evaluate(()=>{
   localStorage.setItem('qg_campaign_v1',JSON.stringify({version:2,stars:{},ascensions:[],stageStars:Array(100).fill(3),board:'champion-board-reference-neon',piece:'neonglass',effect:'standard',music:'standard',avatar:'avatar-frame-15'}));
  });
  await page.reload();await page.locator('.lobby-campaign-action').click();
  await page.locator('.championship-collection select').selectOption('10');
  await page.locator('.championship-collection').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.championship-reward').count(),10);
  assert.equal(await page.locator('[data-preview-reward^="champion-music-"]').count(),0);
  await page.screenshot({path:resolve(output,'collection-'+viewport.width+'.png')});
  // Start stage 100 (10 min); verify the opening overlay and frame.
  await page.locator('.campaign-boss-card .campaign-primary').click();
  await page.locator('.match-intro[open]').waitFor();
  assert.equal(await page.locator('.match-intro [data-avatar-frame="avatar-frame-15"]').count(),1);
  assert.deepEqual(await page.locator('.match-clock').allTextContents(),['10:00','10:00']);
  await page.waitForTimeout(250);
  assert.deepEqual(await page.locator('.match-clock').allTextContents(),['10:00','10:00']);
  await page.screenshot({path:resolve(output,'intro-'+viewport.width+'.png')});
  await page.locator('.match-intro[open]').waitFor({state:'detached',timeout:15000});
  await page.waitForTimeout(1200);
  assert.notEqual((await page.locator('.match-clock').allTextContents())[1],'10:00');
  await page.locator('[data-graphics-state="ready"]').waitFor({timeout:45000});
  await page.screenshot({path:resolve(output,'neon-match-'+viewport.width+'.png')});
  await page.getByRole('button',{name:'2D',exact:true}).click();
  await page.locator('.board-2d').waitFor();assert.equal(await page.locator('[data-square]').count(),64);
  await page.getByRole('button',{name:'3D',exact:true}).click();
  await page.locator('[data-graphics-state="ready"]').waitFor({timeout:45000});
  const lost=await page.locator('.board-webgl-layer canvas').evaluate(canvas=>{
   const extension=canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
   if(!extension)return false;extension.loseContext();return true;
  });
  assert(lost);await page.locator('.board-render-fallback .board-2d').waitFor();
  assert.equal(await page.locator('.board-render-fallback [data-square]').count(),64);
  assert.deepEqual(errors,[]);
  results.push({viewport,pass:true,friendRatings:true,acceptanceFixture:true,networkRetry:true,stageControls:true,framePreviewNoMutation:true,referencePreviews:2,introClockFrozen:true,contextLossFallback:true});
  console.log('PASS features '+viewport.width);
  await context.close();
 }
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});throw error;}
finally{await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));await browser.close();}
