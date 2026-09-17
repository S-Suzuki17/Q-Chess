import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const base=process.argv[2]??'http://127.0.0.1:3100';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Local QA only');
const output=resolve('../../outputs/crown-circuit-sep17');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
try {
 for(const viewport of [{width:1440,height:960},{width:360,height:800}]) {
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  await context.addInitScript(()=>{
   localStorage.setItem('qg_language','ja');
   localStorage.setItem('qg_sound_config',JSON.stringify({bgmVolume:0,seVolume:0,masterMute:true}));
   // Observe actual audio objects, including those not attached to the DOM.
   const NativeAudio=window.Audio;
   window.__qaAudio=[];
   window.Audio=class extends NativeAudio {constructor(...args){super(...args);window.__qaAudio.push(this);}};
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  await page.locator('.title-play').click();
  assert.equal(await page.locator('.lobby-campaign-action').innerText(),'♛\nクラウン・サーキット');
  await page.locator('.lobby-campaign-action').click();
  await page.locator('[data-equipment="board-standard"]:enabled').waitFor();
  assert((await page.locator('.campaign-medal-help').innerText()).includes('持ち時間を半分以上残して勝利'));
  const before=await page.evaluate(()=>localStorage.getItem('qg_campaign_v1'));
  for(const [id,kind] of [['jade','piece'],['obsidian','board'],['champion-board-001','board'],['champion-effect-003','effect']]) {
   await page.locator('[data-preview-reward="'+id+'"]').click();
   await page.locator('dialog.reward-preview-dialog[open]').waitFor();
   await page.locator('dialog [data-graphics-state="ready"]').waitFor();
   assert(await page.locator('[data-testid="preview-equip"]').isDisabled());
   assert(await page.locator('dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1));
   if(kind==='effect') {
    await page.locator('.reward-preview-dialog footer button').first().click();
    await page.locator('[data-victory-effect="'+id+'"]').waitFor();
   } else assert.equal(await page.locator('dialog .board-3d').getAttribute('data-'+(kind==='piece'?'piece':'board')+'-finish'),id);
   await page.screenshot({path:resolve(output,id+'-'+viewport.width+'.png')});
   await page.locator('.reward-preview-dialog header button').click();
   assert.equal(await page.evaluate(()=>localStorage.getItem('qg_campaign_v1')),before);
  }
  assert(await page.locator('[data-music="midnight"]').isDisabled());
  assert.equal(await page.locator('[data-preview-reward="midnight"]').count(),0);
  await page.locator('.campaign-boss-card .campaign-primary').click();
  await page.locator('[data-graphics-state="ready"]').waitFor();
  await page.locator('.match-resign').click();
  await page.getByRole('button',{name:'リザインする',exact:true}).click();
  await page.locator('dialog.campaign-result[open]').waitFor();
  assert.equal(await page.locator('dialog[open]').count(),1);
  assert.equal(await page.locator('[data-testid="checkmate-celebration"]').count(),0);
  assert(!(await page.locator('dialog').innerText()).match(/王手|詰み|投了/));
  await page.screenshot({path:resolve(output,'result-'+viewport.width+'.png')});
  await page.getByRole('button',{name:'戻る',exact:true}).click();
  // Explicit old-save fixture: verifies migration/equipment, not a claimed tournament victory.
  await page.evaluate(()=>localStorage.setItem('qg_campaign_v1',JSON.stringify({version:1,stars:{nox:3,ember:3,oracle:3,sovereign:3},board:'slate',piece:'jade'})));
  await page.reload();
  await page.locator('.lobby-campaign-action').click();
  await page.locator('[data-music="coronation"]:enabled').click();
  assert(await page.locator('[data-music="astral"]').isDisabled());
  await page.reload();
  await page.locator('.lobby-campaign-action').click();
  await page.locator('[data-music="coronation"][aria-pressed="true"]').waitFor();
  await page.locator('.campaign-boss-card .campaign-primary').click();
  await page.locator('[data-graphics-state="ready"]').waitFor();
  const audio=await page.evaluate(async()=>{
   const track=window.__qaAudio.findLast(audio=>audio.src.endsWith('/coronation.wav'));
   if(!track) throw new Error('Reward track not selected');
   await new Promise((resolve,reject)=>{
    if(track.readyState>=1) return resolve();
    track.addEventListener('loadedmetadata',resolve,{once:true});
    track.addEventListener('error',()=>reject(new Error('Cannot decode reward WAV')),{once:true});
    track.load();
   });
   return {src:track.src,duration:track.duration,paused:track.paused};
  });
  assert(audio.duration>40&&audio.duration<45,JSON.stringify(audio));
  assert(audio.paused,'Muted reward track must stay paused');
  assert.deepEqual(errors,[]);
  results.push({viewport,passed:true,audio,scenarios:['renamed-hub','clock-star-copy','locked-3d-board-preview','locked-material-preview','locked-effect-preview','no-save-mutation','no-locked-music-preview','single-result-dialog','chess-terminology','old-save-migration','music-equipped-persisted-decoded-muted']});
  console.log('PASS Crown Circuit '+viewport.width+'x'+viewport.height);
  await context.close();
 }
} finally {
 await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));
 await browser.close();
}
