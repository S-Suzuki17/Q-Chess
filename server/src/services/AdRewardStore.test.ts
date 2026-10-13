import {describe,expect,it,vi} from 'vitest';
import {createAdRewardStore} from './AdRewardStore';
const intentId='00000000-0000-4000-8000-000000000001';
function fixture(protocol=2){
 const rpc=vi.fn((name:string,args?:Record<string,unknown>)=>({abortSignal:async()=>({data:name==='ad_ticket_reward_protocol'?protocol:name==='ad_ticket_reward_balance'?{hint:67,online:23}:name==='create_ad_ticket_reward'?intentId:name==='ad_ticket_reward_status'?'credited':{status:'credited'},error:null})}));
 const from=vi.fn(()=>{throw new Error('Obsolete table access forbidden');});
 return{rpc,from,store:createAdRewardStore({rpc,from} as never,async()=>null)};
}
describe('verified free-ticket reward storage contract',()=>{
 it('requires the installed ticket protocol and never falls back to old daily allowances',async()=>{
  expect(await fixture(1).store.ready()).toBe(false);const f=fixture();expect(await f.store.ready()).toBe(true);
  expect(await f.store.balance('Guestly')).toEqual({hint:67,online:23});
  expect(await f.store.intent('Guestly','hint')).toBe(intentId);expect(await f.store.status('Guestly',intentId)).toBe('credited');
  expect(await f.store.credit({kind:'hint',intentId,transactionId:'abcdefgh',timestamp:Date.now(),evidenceSha256:'a'.repeat(64)})).toBe('credited');
  expect(f.from).not.toHaveBeenCalled();expect(f.rpc.mock.calls.map(([name])=>name)).not.toContain('ad_credit');
  expect(f.rpc).toHaveBeenCalledWith('ad_ticket_reward_balance',{p_user_id:'Guestly'});
 });
 it('does not invent a usable protocol or balance when the backend fails or returns unsafe quantities',async()=>{
  const f=fixture();f.rpc.mockImplementation(()=>({abortSignal:async()=>({data:null,error:{code:'42883'}})}));
  expect(await f.store.ready()).toBe(false);await expect(f.store.balance('Alice')).rejects.toThrow('unavailable');
  const unsafe=fixture();unsafe.rpc.mockImplementation(()=>({abortSignal:async()=>({data:{hint:9007199254740992,online:3},error:null})}));
  await expect(unsafe.store.balance('Alice')).rejects.toThrow('unavailable');
 });
});
