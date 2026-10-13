import {afterEach,describe,it,expect,vi} from 'vitest';
import express from 'express';
import type {Server} from 'node:http';
import {RankedAuth} from './RankedAuth';
import {AccountWriteGate} from './AccountDeletion';
import {createPlayCommerceRouter} from './PlayCommerceRoutes';
import {createPlayNotificationRouter} from './PlayCommerceNotifications';
import {PlayCommerceError} from './PlayCommerceValues';
import type {PlayCommerceStore} from './PlayCommerceStore';
import type {PlayCommerceService} from './PlayCommerceService';
const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(resolve=>{s.closeAllConnections();s.close(()=>resolve());})));});
async function fixture(enabled=true){
 const auth=new RankedAuth(async()=>true),gate=new AccountWriteGate();
 const store={ready:vi.fn(async()=>true),verifyUser:vi.fn(async()=>null),status:vi.fn(async()=>({userId:'alice',enabled:true})),intent:vi.fn(async()=>({userId:'alice',sku:'hints_13'})),cancelIntent:vi.fn(async()=>{})};
 const service={configured:vi.fn(()=>true),receipt:vi.fn(async()=>({userId:'alice',credited:13})),notification:vi.fn(async()=>{})},identity=vi.fn(async()=>true);
 const app=express();app.use(createPlayNotificationRouter(service as unknown as PlayCommerceService,identity));app.use(createPlayCommerceRouter(auth,store as unknown as PlayCommerceStore,service as unknown as PlayCommerceService,gate,()=>enabled));
 const server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});servers.push(server);
 const address=server.address();if(!address||typeof address==='string')throw Error('address');
 const session=await auth.issueLegacySession('alice','fixture');
 const send=(path:string,body?:unknown,token=session?.token)=>fetch(`http://127.0.0.1:${address.port}${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return{store,service,identity,gate,send};
}
const receipt={sku:'hints_13',purchaseToken:'local-fixture-purchase-token'};
const notification=(notice:unknown,extra={})=>({message:{messageId:'1234',data:Buffer.from(JSON.stringify({packageName:'com.qgambit.app',oneTimeProductNotification:notice,...extra})).toString('base64')}});
describe('Play HTTP authority and recovery boundaries',()=>{
 it('sales OFF rejects intents but preserves receipt settlement, status and cancellation',async()=>{
  const f=await fixture(false);expect((await f.send('/commerce/play/intent',{sku:'hints_13'})).status).toBe(503);expect(f.store.intent).not.toHaveBeenCalled();
  expect(await (await f.send('/commerce/play/status')).json()).toMatchObject({enabled:false,ready:true});
  expect((await f.send('/commerce/play/receipt',receipt)).status).toBe(200);expect(f.service.receipt).toHaveBeenCalledWith('hints_13',receipt.purchaseToken,'alice');
  expect((await f.send('/commerce/play/intent/cancel',{intentId:'a'.repeat(64)})).status).toBe(200);expect(f.store.cancelIntent).toHaveBeenCalledWith('alice','a'.repeat(64));
 });
 it('never accepts a client owner, quantity or unverified session',async()=>{
  const f=await fixture();expect((await f.send('/commerce/play/receipt',receipt,'forged')).status).toBe(401);
  for(const extra of [{userId:'bob'},{quantity:166},{test:false}])expect((await f.send('/commerce/play/receipt',{...receipt,...extra})).status).toBe(400);
  expect((await f.send('/commerce/play/status?userId=bob')).status).toBe(400);expect(f.service.receipt).not.toHaveBeenCalled();
 });
 it('deletion ingress barrier rejects purchase writes, and releases after a failed receipt',async()=>{
  const f=await fixture();f.gate.reserve('alice',false);expect((await f.send('/commerce/play/receipt',receipt)).status).toBe(409);f.gate.release('alice');
  f.service.receipt.mockRejectedValueOnce(new Error('private provider token'));const r=await f.send('/commerce/play/receipt',receipt);expect(r.status).toBe(503);expect(await r.text()).not.toContain('private');expect(()=>f.gate.reserve('alice',false)).not.toThrow();
 });
 it('missing schema/configuration cannot advertise readiness or enabled sales',async()=>{
  const f=await fixture();f.store.ready.mockResolvedValue(false);expect(await (await f.send('/commerce/play/status')).json()).toEqual({userId:'alice',enabled:false,ready:false});
  f.store.ready.mockResolvedValue(true);f.service.configured.mockReturnValue(false);expect(await (await f.send('/commerce/play/status')).json()).toMatchObject({enabled:false,ready:false});
 });
 it('validates OIDC before accepting notifications and rejects foreign package data',async()=>{
  const f=await fixture(),body=notification({sku:'qg_hints_13',purchaseToken:receipt.purchaseToken});f.identity.mockResolvedValueOnce(false);
  expect((await f.send('/commerce/play/rtdn',body,'a.b.c')).status).toBe(401);expect(f.service.notification).not.toHaveBeenCalled();
  expect((await f.send('/commerce/play/rtdn',notification({sku:'qg_hints_13',purchaseToken:receipt.purchaseToken},{packageName:'other.app'}),'a.b.c')).status).toBe(400);
  expect((await f.send('/commerce/play/rtdn',body,'a.b.c')).status).toBe(204);expect(f.service.notification).toHaveBeenCalledWith('hints_13',receipt.purchaseToken,undefined);
 });
 it('notification retry remains possible on database failure; retired owners are terminal',async()=>{
  const f=await fixture(false),body=notification({sku:'qg_hints_13',purchaseToken:receipt.purchaseToken});
  f.service.notification.mockRejectedValueOnce(new Error('database'));expect((await f.send('/commerce/play/rtdn',body,'a.b.c')).status).toBe(503);
  f.service.notification.mockRejectedValueOnce(new PlayCommerceError('RETIRED'));expect((await f.send('/commerce/play/rtdn',body,'a.b.c')).status).toBe(204);
 });
 it('void notifications pass the immutable order ID for independent canonical verification',async()=>{
  const f=await fixture(),id='GPA.1234-5678-9012-34567..0';
  const body={message:{messageId:'5',data:Buffer.from(JSON.stringify({packageName:'com.qgambit.app',voidedPurchaseNotification:{purchaseToken:receipt.purchaseToken,orderId:id}})).toString('base64')}};
  expect((await f.send('/commerce/play/rtdn',body,'a.b.c')).status).toBe(204);expect(f.service.notification).toHaveBeenCalledWith(null,receipt.purchaseToken,id);
 });
});
