import {afterEach,describe,it,expect,vi} from 'vitest';
import express from 'express';
import type {Server} from 'node:http';
import {RankedAuth} from './RankedAuth';
import {AdMobVerification} from './AdMobVerification';
import {createAdRewardRouter} from './AdRewardRoutes';
const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(resolve=>{s.closeAllConnections();s.close(()=>resolve());})));});
async function fixture(enabled=true,ready=true){
 const auth=new RankedAuth(async()=>true),id='00000000-0000-4000-8000-000000000001';
 const store={ready:vi.fn(async()=>ready),verifyUser:vi.fn(async()=>null),balance:vi.fn(async()=>({hint:3,online:3})),intent:vi.fn(async()=>id),status:vi.fn(async()=>'pending' as const),credit:vi.fn(async():Promise<'credited'|'duplicate'|'ignored'>=>'credited')};
 const verifier=new AdMobVerification();const verify=vi.spyOn(verifier,'verifyQuery').mockResolvedValue(null);
 const app=express();app.use(createAdRewardRouter(auth,store,verifier,()=>enabled));
 const server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});servers.push(server);
 const address=server.address();if(!address||typeof address==='string')throw Error('address');
 const session=await auth.issueLegacySession('alice','fixture');
 const send=(path:string,body?:unknown,token=session?.token)=>fetch(`http://127.0.0.1:${address.port}${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return{store,verify,send,id};
}
describe('authenticated advertisement APIs',()=>{
 it('refuses new offers while OFF but preserves owner recovery, balances and independently verified settlement',async()=>{
  const f=await fixture(false);expect((await f.send('/ads/reward',{kind:'hint'})).status).toBe(503);expect(f.store.intent).not.toHaveBeenCalled();
  expect((await f.send('/ads/allowance')).status).toBe(200);expect((await f.send('/ads/reward/'+f.id)).status).toBe(200);
  f.verify.mockResolvedValue({kind:'hint',intentId:f.id,transactionId:'abcdefgh',timestamp:Date.now(),evidenceSha256:'a'.repeat(64)});
  expect((await f.send('/ads/admob/ssv?x=1')).status).toBe(200);expect(f.store.credit).toHaveBeenCalledOnce();
 });
 it('keeps every operation unavailable on a missing or incompatible database protocol',async()=>{
  const f=await fixture(true,false);for(const path of ['/ads/allowance','/ads/reward/'+f.id,'/ads/admob/ssv?x=1'])expect((await f.send(path)).status).toBe(503);
  expect((await f.send('/ads/reward',{kind:'hint'})).status).toBe(503);expect(f.store.intent).not.toHaveBeenCalled();expect(f.store.credit).not.toHaveBeenCalled();
 });
 it('binds identity from auth, never an override in the body or query',async()=>{
  const f=await fixture();expect((await f.send('/ads/reward',{kind:'hint'},'forged')).status).toBe(401);
  expect((await f.send('/ads/reward',{kind:'hint',userId:'bob'})).status).toBe(400);
  expect((await f.send('/ads/allowance?userId=bob')).status).toBe(400);
  expect((await f.send('/ads/reward',{kind:'hint'})).status).toBe(200);expect(f.store.intent).toHaveBeenCalledWith('alice','hint');
  await f.send('/ads/reward/'+f.id);expect(f.store.status).toHaveBeenCalledWith('alice',f.id);
 });
 it('never grants a reward from a client earned flag',async()=>{
  const f=await fixture();expect((await f.send('/ads/reward',{kind:'hint',earned:true})).status).toBe(400);
  expect((await f.send('/ads/admob/ssv?unverified=1')).status).toBe(400);expect(f.store.credit).not.toHaveBeenCalled();
 });
 it.each([true,false])('acknowledges a verified console probe without any reward write when offers enabled=%s',async enabled=>{
  const f=await fixture(enabled);f.verify.mockResolvedValue({kind:'console-test'});
  expect((await f.send('/ads/admob/ssv?setup=1')).status).toBe(200);
  expect(f.store.credit).not.toHaveBeenCalled();expect(f.store.intent).not.toHaveBeenCalled();
 });
 it('forwards only verified evidence, preserves original bytes, and returns failure on storage error',async()=>{
  const f=await fixture();const reward={kind:'hint' as const,intentId:f.id,transactionId:'abcdefgh',timestamp:Date.now(),evidenceSha256:'a'.repeat(64)};f.verify.mockResolvedValue(reward);
  expect((await f.send('/ads/admob/ssv?custom_data=a%2Fb&signature=abc')).status).toBe(200);
  expect(f.verify).toHaveBeenCalledWith('custom_data=a%2Fb&signature=abc');expect(f.store.credit).toHaveBeenCalledWith(reward);
  f.store.credit.mockRejectedValue(new Error('private database detail'));const response=await f.send('/ads/admob/ssv?x=1');expect(response.status).toBe(503);expect(await response.text()).not.toContain('private');
 });
 it('acknowledges valid signed unknown nonces and duplicates without treating acknowledgement as another grant',async()=>{
  const f=await fixture();f.verify.mockResolvedValue({kind:'hint',intentId:f.id,transactionId:'abcdefgh',timestamp:Date.now(),evidenceSha256:'a'.repeat(64)});
  for(const status of ['ignored','duplicate'] as const){f.store.credit.mockResolvedValue(status);expect((await f.send('/ads/admob/ssv?x=1')).status).toBe(200);}
 });
});
