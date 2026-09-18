import {describe,it,expect,vi} from 'vitest';
import {createRewardFlow} from '../rewardFlow';
const intentId='00000000-0000-4000-8000-000000000001';
function setup(){
 const request=vi.fn(async(_user:string,path:string,_body?:unknown):Promise<Record<string,unknown>>=>path==='/ads/reward'?{intentId}:{status:'credited'});
 const show=vi.fn(async()=> 'earned'),wait=vi.fn(async()=>{}),enabled=vi.fn(()=>true);
 return{request,show,wait,enabled,run:createRewardFlow({request,show,wait,enabled})};
}
describe('reward confirmation flow',()=>{
 it('does nothing while disabled',async()=>{const f=setup();f.enabled.mockReturnValue(false);expect(await f.run('alice','hint')).toBe('unavailable');expect(f.request).not.toHaveBeenCalled();});
 it('returns credited only after server confirmation and sends Google no account identifier',async()=>{
  const f=setup();expect(await f.run('alice','hint')).toBe('credited');
  expect(f.show).toHaveBeenCalledWith('hint',{userId:intentId,intentId});
  expect(f.request).toHaveBeenLastCalledWith('alice',`/ads/reward/${intentId}`);
 });
 it('does not poll for grants after an incomplete view',async()=>{
  const f=setup();f.show.mockResolvedValue('dismissed');expect(await f.run('alice','hint')).toBe('cancelled');expect(f.request).toHaveBeenCalledTimes(1);
 });
 it('keeps completed viewing pending when confirmation loses connectivity',async()=>{
  const f=setup();f.request.mockResolvedValueOnce({intentId}).mockRejectedValue(new Error('offline'));
  expect(await f.run('alice','online')).toBe('pending');
 });
 it('bounds polling, without pretending a timeout is proof of reward',async()=>{
  const f=setup();f.request.mockResolvedValueOnce({intentId}).mockResolvedValue({status:'pending'});
  expect(await f.run('alice','hint')).toBe('pending');expect(f.wait).toHaveBeenCalledTimes(4);expect(f.request).toHaveBeenCalledTimes(6);
 });
 it('serializes intent creation across categories and releases the lock on failure',async()=>{
  const f=setup();let release!:(value:Record<string,unknown>)=>void;
  f.request.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  const first=f.run('alice','hint');expect(await f.run('alice','online')).toBe('busy');expect(f.request).toHaveBeenCalledTimes(1);
  release({intentId:'invalid'});expect(await first).toBe('unavailable');expect(await f.run('alice','online')).toBe('credited');
 });
});
