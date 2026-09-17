// Read-only public smoke: ephemeral guest context, no matches, accounts or save fixtures.
import assert from 'node:assert/strict';
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const base='https://q-gambit-seven.vercel.app';
const output=resolve('../../outputs/crown-circuit-sep17');
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext({viewport:{width:360,height:800},reducedMotion:'reduce'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 await context.addInitScript(()=>{
  localStorage.setItem('qg_language','ja');
  localStorage.setItem('qg_sound_config',JSON.stringify({bgmVolume:0,seVolume:0,masterMute:true}));
 });
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.setDefaultTimeout(30000);
 const response=await page.goto(base);
 assert(response?.ok());
 const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
 const indexHash=hash(await response.body());
 assert.equal(indexHash,hash(await readFile('out/index.html')),'Public index must match the verified build');
 await page.locator('.title-play').click();
 assert((await page.locator('.lobby-campaign-action').innerText()).includes('クラウン・サーキット'));
 await page.locator('.lobby-campaign-action').click();
 await page.locator('[data-preview-reward="champion-board-001"]').click();
 await page.locator('dialog [data-graphics-state="ready"]').waitFor();
 assert(await page.locator('[data-testid="preview-equip"]').isDisabled());
 await mkdir(output,{recursive:true});
 await page.screenshot({path:resolve(output,'public-preview-360.png')});
 await page.locator('.reward-preview-dialog header button').click();
 assert(await page.locator('[data-music="midnight"]').isDisabled());
 const audioHashes={};
 for(const id of ['midnight','coronation','astral']) {
  const audio=await context.request.get(base+'/audio/rewards/'+id+'.wav');
  assert(audio.ok());
  const digest=hash(await audio.body());
  assert.equal(digest,hash(await readFile('public/audio/rewards/'+id+'.wav')));
  audioHashes[id]=digest;
 }
 assert.deepEqual(errors,[]);
 const result={url:base,checkedAt:new Date().toISOString(),passed:true,indexHash,audioHashes,errors,
  scenarios:['published-build-byte-match','Crown-Circuit-title','unearned-3d-preview','locked-equip','locked-music','three-published-music-byte-matches'],writes:'Ephemeral browser storage only; no match or account created.'};
 await writeFile(resolve(output,'public-results.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
} finally {await browser.close();}
