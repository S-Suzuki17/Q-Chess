import {afterEach,describe,it,expect,vi} from 'vitest';
import express from 'express';
import type {Server} from 'node:http';
import {RankedAuth} from './RankedAuth';
import {createFoundersRewardRouter} from './FoundersRewardRoutes';
const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(resolve=>{s.closeAllConnections();s.close(()=>resolve());})));});
async function fixture(enabled=true){
 const auth=new RankedAuth(async()=>true),session=await auth.issueLegacySession('alice','fixture-only');
 const store={verifyUser:vi.fn(async():Promise<string|null>=>null),owned:vi.fn(async()=>true),receiptOwner:vi.fn(async():Promise<string|null>=>null),grant:vi.fn(async()=>'granted' as const)};
 const play={verify:vi.fn(async()=>({purchaseState:0,consumptionState:0})),consume:vi.fn(async()=>{})};
 const app=express();app.use(createFoundersRewardRouter(auth,store,enabled?play:null));
 const server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});servers.push(server);
 const address=server.address();if(!address||typeof address==='string')throw new Error();
 const send=(path='',body?:unknown,token:string|null=session?.token??null)=>fetch('http://127.0.0.1:'+address.port+'/rewards/founders'+path,{method:body===undefined?'GET':'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
 return{send,store,play};
}
describe('founders reward API boundaries',()=>{
 it('requires authentication and cannot override owner',async()=>{
  const f=await fixture();expect((await f.send('',undefined,null)).status).toBe(401);
  expect((await f.send('?userId=bob')).status).toBe(400);
  expect((await f.send('/claim',{purchaseToken:'valid-token-0123456789',userId:'bob'})).status).toBe(400);
  const r=await f.send();expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');
  expect(await r.json()).toEqual({userId:'alice',owned:true,enabled:true});expect(f.store.owned).toHaveBeenCalledWith('alice');
 });
 it('accepts verified OAuth but rejects guest or forged identity',async()=>{
  const f=await fixture();f.store.verifyUser.mockResolvedValue('oauth-user');
  expect((await f.send('',undefined,'valid.jwt.token')).status).toBe(200);expect(f.store.owned).toHaveBeenCalledWith('oauth-user');
  f.store.verifyUser.mockResolvedValue('GUEST-forged');expect((await f.send('',undefined,'valid.jwt.token')).status).toBe(401);
 });
 it('can restore existing ownership while delivery is disabled',async()=>{
  const f=await fixture(false);expect(await(await f.send()).json()).toMatchObject({owned:true,enabled:false});
  expect((await f.send('/claim',{purchaseToken:'valid-token-0123456789'})).status).toBe(503);expect(f.play.verify).not.toHaveBeenCalled();
 });
 it('grants only verified proof, limits body size, and conceals upstream secrets',async()=>{
  const f=await fixture();expect((await f.send('/claim',{purchaseToken:'valid-token-0123456789'})).status).toBe(200);
  expect(f.store.grant).toHaveBeenCalledWith('alice',expect.stringMatching(/^[0-9a-f]{64}$/));
  expect((await f.send('/claim','x'.repeat(7000))).status).toBe(413);
  expect((await f.send('/claim','{invalid')).status).toBe(400);
  f.play.verify.mockRejectedValue(new Error('private key and purchase token'));
  const response=await f.send('/claim',{purchaseToken:'valid-token-0123456789'});expect(response.status).toBe(503);expect(await response.text()).not.toContain('private');
 });
 it('bounds repeated requests',async()=>{
  const f=await fixture();for(let i=0;i<15;i++)expect((await f.send()).status).toBe(200);
  expect((await f.send()).status).toBe(429);
 });
});
