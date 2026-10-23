import {describe,expect,it,vi} from 'vitest';
import {createCircuitResultTransition} from './circuitResultAd';
describe('optional circuit result advertisements',()=>{
 it('keeps the result in place until close and ignores simultaneous result actions',async()=>{
  let close!:()=>void;const show=vi.fn(()=>new Promise<void>(r=>{close=r;}));
  const transition=createCircuitResultTransition(show),next=vi.fn(),retry=vi.fn();
  const first=transition('completed-run','Alice',()=>true,next);
  expect(next).not.toHaveBeenCalled();expect(await transition('completed-run','Alice',()=>true,retry)).toBe(false);
  close();expect(await first).toBe(true);expect(next).toHaveBeenCalledOnce();expect(retry).not.toHaveBeenCalled();
  await transition('completed-run','Alice',()=>true,next);expect(show).toHaveBeenCalledOnce();
  show.mockImplementation(async()=>{});await transition('next-run','Alice',()=>true,next);expect(show).toHaveBeenCalledTimes(2);
 });
 it('allows navigation on ad failure and never requests an ad for invalid runs',async()=>{
  const show=vi.fn(async()=>{throw Error('no fill');}),next=vi.fn();const transition=createCircuitResultTransition(show);
  expect(await transition('','Alice',()=>true,next)).toBe(false);
  expect(await transition('run','Alice',()=>false,next)).toBe(false);expect(show).not.toHaveBeenCalled();
  expect(await transition('run','Alice',()=>true,next)).toBe(true);expect(next).toHaveBeenCalledOnce();
 });
 it('discards a late ad close after leaving or switching account',async()=>{
  let close!:()=>void,allowed=true;const show=()=>new Promise<void>(r=>{close=r;});const next=vi.fn();
  const result=createCircuitResultTransition(show)('run','Alice',()=>allowed,next);
  allowed=false;close();expect(await result).toBe(false);expect(next).not.toHaveBeenCalled();
 });
});
