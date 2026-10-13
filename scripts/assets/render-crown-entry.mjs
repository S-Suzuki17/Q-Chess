// Original procedural light/motes and audio. No sampled, downloaded or AI bitmap assets.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
if(!process.env.QG_FFMPEG||!process.env.QG_TEST_CHROMIUM)throw new Error('Set QG_FFMPEG and QG_TEST_CHROMIUM to existing local tools.');
const output=resolve('public/assets/crown-entry');await mkdir(output,{recursive:true});
const seconds=1.8,fps=30,width=640,height=360;
const args=['-hide_banner','-loglevel','error','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-an','-c:v','libvpx','-b:v','450k','-crf','18','-threads','2','-auto-alt-ref','0','-y',resolve(output,'chamber-light.webm')];
const encoder=spawn(process.env.QG_FFMPEG,args,{windowsHide:true,stdio:['pipe','ignore','pipe']});let stderr='';encoder.stderr.on('data',chunk=>{stderr+=chunk;});const finished=once(encoder,'close');let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.QG_TEST_CHROMIUM});const page=await browser.newPage();
 await page.setContent(`<canvas width="${width}" height="${height}"></canvas>`);
 for(let frame=0;frame<seconds*fps;frame++){
  const jpg=await page.evaluate(({frame,fps,width,height,seconds})=>{
   const c=document.querySelector('canvas'),ctx=c.getContext('2d'),t=frame/fps,env=Math.sin(Math.PI*Math.min(1,t/seconds))**1.6;
   ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);ctx.globalCompositeOperation='screen';
   const smooth=x=>x*x*(3-2*x),seed=n=>{const v=Math.sin(n*91.17+1709.23)*13517.971;return v-Math.floor(v);};
   const cx=width*(.35+.14*smooth(t/seconds)),cy=height*.45;
   const halo=ctx.createRadialGradient(cx,cy,0,cx,cy,width*.44);halo.addColorStop(0,`rgba(178,153,100,${env*.17})`);halo.addColorStop(.35,`rgba(99,137,128,${env*.08})`);halo.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=halo;ctx.fillRect(0,0,width,height);
   for(let i=0;i<3;i++){
    const x=cx-80+i*74+t*32,g=ctx.createLinearGradient(x-30,0,x+50,0);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.5,`rgba(184,153,101,${env*(.08+i*.015)})`);g.addColorStop(1,'rgba(0,0,0,0)');ctx.save();ctx.translate(x,0);ctx.rotate(-.25);ctx.fillStyle=g;ctx.fillRect(-80,-30,180,height*1.5);ctx.restore();
   }
   for(let i=0;i<48;i++){
    const x=seed(i+1)*width+t*(seed(i+74)-.5)*16,y=seed(i+41)*height-t*(12+seed(i+83)*20),r=.6+seed(i+103)*1.5;
    ctx.globalAlpha=env*(.13+seed(i+204)*.52);ctx.fillStyle=i%3?'#d4b57f':'#a8cfce';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=6;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
   }
   ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.globalCompositeOperation='source-over';return c.toDataURL('image/jpeg',.9).split(',')[1];
  },{frame,fps,width,height,seconds});
  if(!encoder.stdin.write(Buffer.from(jpg,'base64')))await once(encoder.stdin,'drain');
 }
 encoder.stdin.end();const[code]=await finished;if(code!==0)throw new Error(`FFmpeg encode failed (${code}): ${stderr}`);
}finally{await browser?.close();if(encoder.exitCode===null)encoder.kill();}
// Restrained airy approach, low impact and three original harmonics aligned to the reveal.
const rate=22050,count=Math.round(rate*seconds),pcm=Buffer.alloc(count*2);let peak=0;
for(let i=0;i<count;i++){
 const t=i/rate,noise=(Math.sin(i*13.171+41)*7217.171)%1;
 let s=.015*noise*Math.sin(Math.PI*Math.min(t/.7,1))**2*Math.exp(-t*4);
 for(const[f,start,amp]of[[110,.18,.048],[329.63,.28,.026],[493.88,.36,.021],[659.25,.45,.015]]){const u=Math.max(0,t-start);s+=amp*Math.sin(2*Math.PI*f*u)*(1-Math.exp(-u*100))*Math.exp(-u*(f<200?12:3.3))*(t>=start);}
 s*=Math.min(t/.025,1)*Math.min((seconds-t)/.15,1);peak=Math.max(peak,Math.abs(s));pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,s))*32767),i*2);
}
const wav=Buffer.alloc(44);wav.write('RIFF');wav.writeUInt32LE(pcm.length+36,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);await writeFile(resolve(output,'chamber-entry.wav'),Buffer.concat([wav,pcm]));
const files=await Promise.all(['chamber-light.webm','chamber-entry.wav'].map(async name=>({name,bytes:(await stat(resolve(output,name))).size,sha256:createHash('sha256').update(await readFile(resolve(output,name))).digest('hex')})));
const result={createdAt:new Date().toISOString(),source:'Original deterministic Canvas2D/PCM authoring in scripts/assets/render-crown-entry.mjs',externalApplication:'FFmpeg n7.0.1-playwright-build-1011',video:{codec:'VP8',width,height,fps,seconds,frames:seconds*fps,audio:false,loop:false},audio:{codec:'PCM signed 16-bit mono',rate,seconds,peakDbfs:20*Math.log10(peak)},files};await writeFile(resolve(output,'creation.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
