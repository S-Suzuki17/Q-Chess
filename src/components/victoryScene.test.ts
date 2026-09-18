import {expect,it,vi} from 'vitest';
import {CHAMPIONSHIP_REWARDS} from '../config/championshipRewards';
import {createVictoryPlan,particleAt,renderVictoryFrame,startVictoryPlayback} from './victoryScene';
import {victoryText} from '../locales/victoryText';
import {musicMilestoneText} from '../locales/musicMilestoneText';
import {LANGUAGES} from '../locales/dict';
const effects=CHAMPIONSHIP_REWARDS.filter(r=>r.kind==='effect');
it('authors deterministic unique plans for all 20 rewards with bounded mobile particles',()=>{
 expect(new Set(effects.map(p=>JSON.stringify(createVictoryPlan(p)))).size).toBe(20);
 for(const effect of effects){
  expect(createVictoryPlan(effect)).toEqual(createVictoryPlan(effect));
  const plan=createVictoryPlan(effect,true);expect(plan.particles.length).toBeLessThanOrEqual(76);
  for(const p of plan.particles)for(const t of [0,.1,.4,.8,1.2,2,3.5]){
   const at=particleAt(p,t,plan.motif);expect(Object.values(at).every(Number.isFinite)).toBe(true);
   expect(at.alpha).toBeGreaterThanOrEqual(0);expect(at.alpha).toBeLessThanOrEqual(1);
  }
 }
});
it('renders each family throughout the shot without invalid geometry or unbalanced canvas state',()=>{
 for(const effect of effects){
  let depth=0;const gradient={addColorStop:vi.fn()};
  const ctx=new Proxy({globalAlpha:1},{get(target,key){
   if(key==='save')return()=>{depth++;};if(key==='restore')return()=>{depth--;expect(depth).toBeGreaterThanOrEqual(0);};
   if(String(key).startsWith('create'))return()=>gradient;
   if(key in target)return Reflect.get(target,key);
   return(...args:unknown[])=>{for(const n of args)if(typeof n==='number')expect(Number.isFinite(n)).toBe(true);};
  }}) as unknown as CanvasRenderingContext2D;
  for(const t of [0,.15,.4,.7,1.4,2.4,effect.duration]){renderVictoryFrame(ctx,createVictoryPlan(effect),360,280,t);expect(depth).toBe(0);}
 }
});
it('stops at completion, cancels on unmount and pauses while hidden',()=>{
 let callback:(n:number)=>void=()=>{},hidden=false;const request=vi.fn((cb:(n:number)=>void)=>{callback=cb;return 1;}),cancel=vi.fn(),draw=vi.fn();
 const stop=startVictoryPlayback({duration:.12,draw,request,cancel,now:()=>0,hidden:()=>hidden,reduced:()=>false});
 callback(60);expect(draw).toHaveBeenLastCalledWith(.06,false);
 hidden=true;callback(500);expect(draw).toHaveBeenCalledTimes(1);
 hidden=false;callback(560);expect(draw).toHaveBeenLastCalledWith(.12,true);
 const calls=request.mock.calls.length;callback(600);expect(request).toHaveBeenCalledTimes(calls);
 stop();expect(cancel).toHaveBeenCalledWith(1);
});
it('draws reduced motion once, without looping',()=>{
 const draw=vi.fn();let cb:(n:number)=>void=()=>{};
 const request=vi.fn((callback:(n:number)=>void)=>{cb=callback;return 1;});
 startVictoryPlayback({duration:3,draw,request,cancel:vi.fn(),now:()=>0,hidden:()=>false,reduced:()=>true});
 cb(16);expect(draw).toHaveBeenCalledWith(2.4,true);expect(request).toHaveBeenCalledOnce();
});
it('localizes the new families and star reward explanation in every supported language',()=>{
 for(const {code} of LANGUAGES){
  for(const key of ['rings','shards','starfall','corona','replay','collection'] as const)expect(victoryText(code,key)).toBeTruthy();
  for(const key of ['title','total','remaining','help'] as const)expect(musicMilestoneText(code,key)).toBeTruthy();
 }
});
