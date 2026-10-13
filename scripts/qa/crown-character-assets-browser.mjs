import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {startMotionFixture} from './crown-motion-server.mjs';
const output=resolve(process.argv[2]??'scratch/crown-character-assets');await mkdir(output,{recursive:true});const{server,base}=await startMotionFixture();let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.QG_TEST_CHROMIUM});
 // Verify true PNG alpha and the exact exported tile coordinates, independently of UI CSS.
 const ctx=await browser.newContext(),page=await ctx.newPage();await ctx.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());await page.goto(base+'/?view=characters');
 for(const id of ['pawn','knight','bishop','rook','queen','king']){
  const metrics=await page.evaluate(async({id,base})=>{
   const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});const full=await load(base+'/assets/crown-enemies/crown-'+id+'.png'),atlas=await load(base+'/assets/crown-enemies/crown-'+id+'-atlas.png');
   const canvas=document.createElement('canvas');canvas.width=256;canvas.height=288;const c=canvas.getContext('2d');c.drawImage(full,0,0);const f=c.getImageData(0,0,256,288).data;c.clearRect(0,0,256,288);
   for(let i=0;i<8;i++)c.drawImage(atlas,(i%3)*256,Math.floor(i/3)*288,256,288,0,0,256,288);const a=c.getImageData(0,0,256,288).data;let diff=0,foreground=0,alphaMismatch=0;
   for(let p=0;p<f.length;p+=4){if(f[p+3]>32||a[p+3]>32){foreground++;diff+=Math.abs(f[p]-a[p])+Math.abs(f[p+1]-a[p+1])+Math.abs(f[p+2]-a[p+2]);if(Math.abs(f[p+3]-a[p+3])>40)alphaMismatch++;}}
   return{id,full:{width:full.width,height:full.height},atlas:{width:atlas.width,height:atlas.height},foregroundPixels:foreground,meanChannelDifference:diff/(foreground*3),silhouetteDifferenceRatio:alphaMismatch/foreground};
  },{id,base});assert.equal(metrics.full.width,256);assert.equal(metrics.atlas.width,768);assert.equal(metrics.atlas.height,864);assert(metrics.silhouetteDifferenceRatio<.035,JSON.stringify(metrics));assert(metrics.meanChannelDifference<18,JSON.stringify(metrics));results.push({name:'full/atlas composite same geometry and color',...metrics,passed:true});
 }await ctx.close();
 for(const mode of ['full-fails','atlas-fails','full-delayed','atlas-delayed','both-fail']){
  const context=await browser.newContext({viewport:{width:1280,height:800}}),p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(url.pathname.startsWith('/assets/crown-enemies/')){
   const atlas=url.pathname.endsWith('-atlas.png');if(mode==='both-fail'||mode==='full-fails'&&!atlas||mode==='atlas-fails'&&atlas)return route.abort();if(mode==='full-delayed'&&!atlas||mode==='atlas-delayed'&&atlas)await new Promise(r=>setTimeout(r,1700));
  }return route.continue().catch(()=>{});});
  await p.addInitScript(()=>{localStorage.setItem('qg_sound_config',JSON.stringify({masterMute:true,bgmVolume:0,seVolume:0}));localStorage.setItem('qchess_is2DView','true');});
  await p.goto(base+'/?cleared=0');await p.locator('.crown-encounter .campaign-primary').waitFor();await p.locator('[data-stage="2"]').click();await p.locator('[data-stage="1"]').click();await p.waitForTimeout(300);
  const measure=()=>p.locator('.crown-enemy-silhouette .crown-character-body').evaluate(el=>{const flat=el.querySelector('svg'),full=el.querySelector('img'),layers=el.querySelector('.crown-character-layers');const shown=n=>!!n&&getComputedStyle(n).visibility!=='hidden'&&getComputedStyle(n).display!=='none'&&parseFloat(getComputedStyle(n).opacity)>0;return{variant:el.dataset.characterVariant,flat:shown(flat),full:shown(full),layers:shown(layers),frame:el.getBoundingClientRect().toJSON(),fullRect:full?.getBoundingClientRect().toJSON(),layerRect:layers?.getBoundingClientRect().toJSON()};});
  const early=await measure();assert.equal(Number(early.flat)+Number(early.full)+Number(early.layers),1,mode+' early duplicate body');if(early.fullRect&&early.layerRect){assert(Math.abs(early.fullRect.width-early.layerRect.width)<.1);assert(Math.abs(early.fullRect.height-early.layerRect.height)<.1);}
  await p.waitForTimeout(2100);const late=await measure();assert.equal(Number(late.flat)+Number(late.full)+Number(late.layers),1,mode+' late duplicate body');assert(await p.locator('.crown-encounter .campaign-primary').isEnabled());assert.deepEqual(errors,[]);await p.screenshot({path:resolve(output,mode+'.png')});results.push({name:mode,early,late,passed:true});await context.close();
 }
 const result={status:'passed',createdAt:new Date().toISOString(),browser:browser.version(),checks:results.length,results,scope:'Native PNG decode/compositing and actual portrait components; only asset responses fail/delay in isolated Chromium. No production requests.',output};await writeFile(resolve(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:result.checks,output}));
}finally{await browser?.close();await server.close();}
