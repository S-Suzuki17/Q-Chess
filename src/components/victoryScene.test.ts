import {expect,it,vi} from 'vitest';
import {CHAMPIONSHIP_REWARDS} from '../config/championshipRewards';
import {createVictoryPlan,renderVictoryFrame,startVictoryPlayback} from './victoryScene';
import {fragmentAt} from './checkmate/timeline';
import {atmosphereAt} from './checkmate/atmosphere';
import {victoryIntensity} from './checkmate/intensity';
import {trailAt} from './checkmate/trails';
import {victoryFinishName} from '../locales/victoryFinishNames';
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
   const at=fragmentAt(p,t);expect(Object.values(at).every(Number.isFinite)).toBe(true);
   expect(at.opacity).toBeGreaterThanOrEqual(0);expect(at.opacity).toBeLessThanOrEqual(1);
  }
 }
});
it('renders each family throughout the shot without invalid geometry or unbalanced canvas state',()=>{
 for(const effect of effects){
  let depth=0;const gradient={addColorStop:vi.fn()};
  const ctx=new Proxy({globalAlpha:1},{get(target,key){
   if(key==='save')return()=>{depth++;};if(key==='restore')return()=>{depth--;if(depth<0)throw new Error('Unbalanced canvas restore');};
   if(String(key).startsWith('create'))return()=>gradient;
   if(key in target)return Reflect.get(target,key);
   return(...args:unknown[])=>{for(const n of args)if(typeof n==='number'&&!Number.isFinite(n))throw new Error('Non-finite canvas geometry');};
  }}) as unknown as CanvasRenderingContext2D;
  for(const [width,height] of [[360,280],[1280,720]])for(const t of [0,.15,.4,.7,1.4,2.4,3]){
   renderVictoryFrame(ctx,createVictoryPlan(effect,width<600),width,height,t);expect(depth).toBe(0);
  }
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
 cb(16);expect(draw).toHaveBeenCalledWith(3,true);expect(request).toHaveBeenCalledOnce();
});
it('routes all rewards through eight finishes, preserves stable IDs, and finishes every burst',()=>{
 expect(new Set(effects.map(effect=>createVictoryPlan(effect).style.id)).size).toBe(8);
 for(const effect of effects){
  const plan=createVictoryPlan(effect,true);
  expect(plan.ornaments.length).toBeLessThanOrEqual(232);
  expect(plan.trails.length).toBeLessThanOrEqual(18);
  expect(plan.duration).toBe(3);
  for(const p of plan.ornaments)expect(atmosphereAt(p,3).opacity).toBe(0);
  for(const {code} of LANGUAGES)expect(victoryFinishName(code,effect)).toBeTruthy();
  expect(createVictoryPlan(effect,true,1).ornaments).not.toEqual(createVictoryPlan(effect,true,2).ornaments);
 }
});
it('increases spectacle with each actual reward unlock, independently of material cycling',()=>{
 for(const compact of [false,true]){
  const plans=effects.map(effect=>createVictoryPlan(effect,compact));
  for(let i=1;i<plans.length;i++){
   const before=plans[i-1],after=plans[i];
   expect(after.intensity.stage).toBeGreaterThan(before.intensity.stage);
   expect(after.ornaments.length).toBeGreaterThan(before.ornaments.length);
   expect(after.intensity.reach).toBeGreaterThan(before.intensity.reach);
   expect(after.intensity.scale).toBeGreaterThan(before.intensity.scale);
   expect(after.intensity.bursts).toBeGreaterThanOrEqual(before.intensity.bursts);
   expect(after.trails.length).toBeGreaterThanOrEqual(before.trails.length);
  }
  expect(plans.at(-1)!.ornaments.length/plans[0].ornaments.length).toBeGreaterThan(3);
  expect(plans[0].trails).toHaveLength(0);
  expect(plans.at(-1)!.intensity.bursts).toBe(5);
 }
});
it('bounds and expires all new depth fragments and trails, including archived stage inputs',()=>{
 for(const stage of [NaN,-1,1,20,21,40,41,60,61,80,81,100,1000]){
  const power=victoryIntensity({requiredWins:stage},true);
  expect(Object.values(power).every(Number.isFinite)).toBe(true);
  expect(power.ornamentCount).toBeLessThanOrEqual(232);
 }
 for(const effect of effects){
  const plan=createVictoryPlan(effect);
  for(const p of plan.ornaments){
   for(const t of [0,.2,.4,.9,1.5,2.799,2.8,3])expect(Object.values(atmosphereAt(p,t)).every(Number.isFinite)).toBe(true);
   expect(atmosphereAt(p,2.8).opacity).toBe(0);
  }
  for(const trail of plan.trails){
   for(const t of [0,.2,.4,.9,1.5,2.799,2.8,3]){
    const at=trailAt(trail,t);expect(Object.values(at).every(Number.isFinite)).toBe(true);
    expect(at.opacity).toBeGreaterThanOrEqual(0);expect(at.opacity).toBeLessThanOrEqual(1);
   }
   expect(trailAt(trail,2.8).opacity).toBe(0);
  }
 }
});
it('localizes the new families and star reward explanation in every supported language',()=>{
 for(const {code} of LANGUAGES){
  for(const key of ['rings','shards','starfall','corona','replay','collection'] as const)expect(victoryText(code,key)).toBeTruthy();
  for(const key of ['title','total','remaining','help'] as const)expect(musicMilestoneText(code,key)).toBeTruthy();
 }
});
it('leaves the exact same word and board after all difficulty-dependent layers disappear',()=>{
 const calls:unknown[][]=[];
 const ctx=new Proxy({}, {get(_target,key){
  if(String(key).startsWith('create'))return(...args:unknown[])=>{calls.push([key,...args]);return {addColorStop:(...stops:unknown[])=>calls.push(['stop',...stops])};};
  return(...args:unknown[])=>{calls.push([key,...args]);};
 },set(_target,key,value){calls.push(['set',key,value]);return true;}}) as CanvasRenderingContext2D;
 const first=createVictoryPlan(effects[0]),last=createVictoryPlan(effects.at(-1)!);last.style=first.style;
 renderVictoryFrame(ctx,first,720,400,3);const expected=JSON.stringify(calls);calls.length=0;
 renderVictoryFrame(ctx,last,720,400,3);expect(JSON.stringify(calls)).toBe(expected);
});
