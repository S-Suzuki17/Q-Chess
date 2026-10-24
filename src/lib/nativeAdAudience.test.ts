import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
beforeEach(()=>{vi.resetModules();const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)});});
afterEach(()=>vi.unstubAllGlobals());
describe('neutral native ad age choice',()=>{
 it('fails closed without a mounted prompt, and cancelling does not persist an age',async()=>{
  const m=await import('./nativeAdAudience');expect(await m.ensureAdAudience()).toBe(false);
  const dispose=m.registerAdAudiencePrompt(finish=>finish(null));
  expect(await m.ensureAdAudience()).toBe(false);expect(m.readAdAgeGroup()).toBeNull();dispose();
 });
 it.each(['under13','13to15','16to17','18plus'] as const)('keeps only the %s range locally after explicit selection',async choice=>{
  const m=await import('./nativeAdAudience');const show=vi.fn((finish:(value:typeof choice)=>void)=>finish(choice));
  const dispose=m.registerAdAudiencePrompt(show);
  expect(await m.ensureAdAudience()).toBe(true);expect(m.readAdAgeGroup()).toBe(choice);
  expect(await m.ensureAdAudience()).toBe(true);expect(show).toHaveBeenCalledOnce();dispose();
 });
 it('shares one pending prompt and resolves cancellation on unmount',async()=>{
  const m=await import('./nativeAdAudience');const show=vi.fn();const dispose=m.registerAdAudiencePrompt(show);
  const first=m.ensureAdAudience(),second=m.ensureAdAudience();expect(first).toBe(second);dispose();
  expect(await first).toBe(false);expect(show).toHaveBeenCalledOnce();
 });
 it('allows use for this session when local storage is unavailable',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>{throw Error();},setItem:()=>{throw Error();}});
  const m=await import('./nativeAdAudience');const dispose=m.registerAdAudiencePrompt(finish=>finish('under13'));
  expect(await m.ensureAdAudience()).toBe(true);expect(m.readAdAgeGroup()).toBe('under13');dispose();
 });
});
