import {expect,it,vi} from 'vitest';
import {CHAMPIONSHIP_REWARDS} from '../config/championshipRewards';
import {createVictoryPlan,renderVictoryFrame,startVictoryPlayback} from './victoryScene';
import {fragmentAt} from './checkmate/timeline';
import {atmosphereAt} from './checkmate/atmosphere';
import {victoryIntensity} from './checkmate/intensity';
import {trailAt} from './checkmate/trails';
import {victoryFinishName} from '../locales/victoryFinishNames';
import {victoryText} from '../locales/victoryText';
import {coronationAt,createCoronationGeometry} from './checkmate/coronation';
import {musicMilestoneText} from '../locales/musicMilestoneText';
import {LANGUAGES} from '../locales/dict';
const effects=CHAMPIONSHIP_REWARDS.filter(r=>r.kind==='effect');
it('authors deterministic unique plans for all 20 rewards with bounded mobile particles',()=>{
 expect(new Set(effects.map(p=>JSON.stringify(createVictoryPlan(p)))).size).toBe(20);
 for(const effect of effects){
  expect(createVictoryPlan(effect)).toEqual(createVictoryPlan(effect));
  const plan=createVictoryPlan(effect,true);expect(plan.particles.length).toBeLessThanOrEqual(12);
  expect(plan.particles.length+plan.ornaments.length+plan.trails.length).toBeLessThanOrEqual(64);
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
 stop();expect(cancel).not.toHaveBeenCalled();
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
  expect(plan.ornaments.length).toBeLessThanOrEqual(44);
  expect(plan.trails.length).toBeLessThanOrEqual(8);
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
   expect(after.ornaments.length).toBeGreaterThanOrEqual(before.ornaments.length);
   expect(after.intensity.reach).toBeGreaterThan(before.intensity.reach);
   expect(after.intensity.scale).toBeGreaterThan(before.intensity.scale);
   expect(after.intensity.bursts).toBeGreaterThanOrEqual(before.intensity.bursts);
   expect(after.trails.length).toBeGreaterThanOrEqual(before.trails.length);
  }
  expect(plans.at(-1)!.ornaments.length/plans[0].ornaments.length).toBeGreaterThan(2);
  expect(plans[0].trails).toHaveLength(0);
  expect(plans.at(-1)!.intensity.bursts).toBe(5);
 }
});
it('bounds and expires all new depth fragments and trails, including archived stage inputs',()=>{
 for(const stage of [NaN,-1,1,20,21,40,41,60,61,80,81,100,1000]){
  const power=victoryIntensity({requiredWins:stage},true);
  expect(Object.values(power).every(Number.isFinite)).toBe(true);
  expect(power.ornamentCount).toBeLessThanOrEqual(44);
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

it('uses four authored silhouettes and richer tier geometry rather than particle escalation',()=>{
 for(const motif of ['rings','shards','starfall','corona'] as const){
  const early=createCoronationGeometry(motif,victoryIntensity({requiredWins:1}));
  const late=createCoronationGeometry(motif,victoryIntensity({requiredWins:100}));
  expect(late.orbitCount).toBeGreaterThan(early.orbitCount);
  expect(late.facets.length).toBeGreaterThan(early.facets.length);
  expect(late.cometCount).toBeGreaterThan(early.cometCount);
  expect(late.fanCount).toBeGreaterThan(early.fanCount);
 }
 for(const compact of [false,true])for(const stage of [-10,1,20,40,60,80,100,500,NaN]){
  const intensity=victoryIntensity({requiredWins:stage},compact);
  expect(intensity.ornamentCount+intensity.chipCount+intensity.trailCount).toBeLessThanOrEqual(compact?64:120);
 }
});
it('gathers, reveals, holds completely still, and settles inside exactly three seconds',()=>{
 expect(coronationAt(.2).phase).toBe('gather');
 expect(coronationAt(.6).phase).toBe('reveal');
 expect(coronationAt(1.2).phase).toBe('hold');
 expect(coronationAt(2.31).phase).toBe('settle');
 expect(coronationAt(3).opacity).toBe(0);
 for(const t of [1.2,1.6,2.299]){
  expect(coronationAt(t).orbit).toBe(0);
  expect(coronationAt(t).pulse).toBe(0);
  expect(coronationAt(t).reveal).toBe(1);
 }
 expect(coronationAt(0,true)).toEqual(coronationAt(3,true));
 expect(coronationAt(3,true).opacity).toBe(1);
});
it('cancels hidden RAF entirely and resumes without counting hidden elapsed time',()=>{
 let clock=0,hidden=false,callback:(n:number)=>void=()=>{},visibility=()=>{};
 let id=0;const cancel=vi.fn(),draw=vi.fn(),unobserve=vi.fn();
 const request=vi.fn((cb:(n:number)=>void)=>{callback=cb;return ++id;});
 const stop=startVictoryPlayback({duration:3,draw,request,cancel,now:()=>clock,hidden:()=>hidden,reduced:()=>false,
  observeVisibility:cb=>{visibility=cb;return unobserve;}});
 clock=100;callback(clock);expect(draw).toHaveBeenLastCalledWith(.1,false);
 hidden=true;visibility();expect(cancel).toHaveBeenLastCalledWith(2);
 const requests=request.mock.calls.length;clock=10000;visibility();expect(request).toHaveBeenCalledTimes(requests);
 hidden=false;visibility();expect(request).toHaveBeenCalledTimes(requests+1);
 clock=10100;callback(clock);expect(draw).toHaveBeenLastCalledWith(.2,false);
 stop();expect(cancel).toHaveBeenLastCalledWith(4);expect(unobserve).toHaveBeenCalledOnce();
 callback(11000);expect(draw).toHaveBeenCalledTimes(2);
});
it('does not allocate an animation frame when mounted hidden, and cleans up once after completion',()=>{
 let hidden=true,clock=0,visibility=()=>{},callback:(n:number)=>void=()=>{};
 const request=vi.fn((cb:(n:number)=>void)=>{callback=cb;return 1;}),unobserve=vi.fn(),draw=vi.fn();
 const stop=startVictoryPlayback({duration:3,draw,request,cancel:vi.fn(),now:()=>clock,hidden:()=>hidden,reduced:()=>false,
  observeVisibility:cb=>{visibility=cb;return unobserve;}});
 expect(request).not.toHaveBeenCalled();hidden=false;clock=5000;visibility();callback(8000);
 expect(draw).toHaveBeenCalledWith(3,true);expect(unobserve).toHaveBeenCalledOnce();
 visibility();stop();expect(request).toHaveBeenCalledOnce();expect(unobserve).toHaveBeenCalledOnce();
});
