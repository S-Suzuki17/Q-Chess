import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RankedAuth } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { createCurrentTermsRouter } from './AccountCurrentTermsRoutes';
import { createAccountTermsRouter } from './AccountTermsRoutes';
import { CURRENT_TICKET_TERMS_VERSION, parseCurrentTerms } from './AccountCurrentTerms';
let server:http.Server, base:string, token:string, auth:RankedAuth;
const value={userId:'Alice',currentVersion:CURRENT_TICKET_TERMS_VERSION,effectiveDate:'2026-10-03',effective:true,consent:null as {version:string;acceptedAt:string}|null};
const current={verifyUser:vi.fn(),blocked:vi.fn(),read:vi.fn(),accept:vi.fn()};
const legacy={verifyUser:vi.fn(),blocked:vi.fn(),read:vi.fn(),accept:vi.fn()};
const options=(body?:unknown,proof=token)=>({headers:{Authorization:`Bearer ${proof}`,'Content-Type':'application/json'},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
beforeEach(async()=>{
 vi.resetAllMocks(); current.blocked.mockResolvedValue(false);legacy.blocked.mockResolvedValue(false);
 current.read.mockResolvedValue({...value});current.accept.mockResolvedValue({...value,consent:{version:CURRENT_TICKET_TERMS_VERSION,acceptedAt:new Date().toISOString()}});
 legacy.read.mockResolvedValue({version:'2026-09-25.1',acceptedAt:'2026-09-25T12:00:00Z'});
 auth=new RankedAuth(async(id,password)=>id==='Alice'&&password==='right'); token=(await auth.issueLegacySession('Alice','right'))!.token;
 const app=express(),gate=new AccountWriteGate();app.use(createAccountTermsRouter(auth,legacy,gate));app.use(createCurrentTermsRouter(auth,current,gate));
 server=http.createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));});
it('keeps the exact legacy GET/POST contract independently of pending current terms',async()=>{
 current.read.mockResolvedValue({...value,effective:false,effectiveDate:null});
 for(const body of [undefined,{version:'2026-09-25.1',accepted:true}]) {
  const res=await fetch(base+'/account/terms',options(body)); expect(res.status).toBe(200);
  expect(await res.json()).toEqual({userId:'Alice',currentVersion:'2026-09-25.1',consent:{version:'2026-09-25.1',acceptedAt:'2026-09-25T12:00:00Z'}});
 }
 expect(legacy.accept).toHaveBeenCalledExactlyOnceWith('Alice',false);expect(current.accept).not.toHaveBeenCalled();
});
it('reports old-only consent as absent without changing the legacy record',async()=>{
 const res=await fetch(base+'/account/current-terms',options());expect(res.status).toBe(200);expect(await res.json()).toEqual(value);
 expect(res.headers.get('cache-control')).toBe('no-store');expect(current.accept).not.toHaveBeenCalled();expect(legacy.accept).not.toHaveBeenCalled();
});
it('requires exact new version and explicit consent, refusing client identity or timestamp',async()=>{
 for(const body of [{version:'2026-09-25.1',accepted:true},{version:CURRENT_TICKET_TERMS_VERSION,accepted:false},
 {version:CURRENT_TICKET_TERMS_VERSION,accepted:true,userId:'Bob'},{version:CURRENT_TICKET_TERMS_VERSION,accepted:true,acceptedAt:'2026-01-01'},[]])
  expect((await fetch(base+'/account/current-terms',options(body))).status).toBe(400);
 expect(current.accept).not.toHaveBeenCalled();
 expect((await fetch(base+'/account/current-terms',options({version:CURRENT_TICKET_TERMS_VERSION,accepted:true}))).status).toBe(200);
 expect(current.accept).toHaveBeenCalledExactlyOnceWith('Alice',false);
});
it('refuses acceptance until the actual publication date is effective',async()=>{
 current.read.mockResolvedValue({...value,effective:false,effectiveDate:null});
 expect((await fetch(base+'/account/current-terms',options({version:CURRENT_TICKET_TERMS_VERSION,accepted:true}))).status).toBe(409);
 expect(current.accept).not.toHaveBeenCalled();
});
it('rejects forged auth, foreign query selectors, deleting account and OAuth revocation',async()=>{
 expect((await fetch(base+'/account/current-terms',options(undefined,'forged'))).status).toBe(401);
 expect((await fetch(base+'/account/current-terms?userId=Bob',options())).status).toBe(400);
 current.blocked.mockResolvedValueOnce(true);expect((await fetch(base+'/account/current-terms',options())).status).toBe(423);
 current.verifyUser.mockResolvedValueOnce('Alice').mockResolvedValueOnce(null);
 expect((await fetch(base+'/account/current-terms',options(undefined,'valid.jwt.token'))).status).toBe(401);
 expect(current.accept).not.toHaveBeenCalled();
});
it('rejects inconsistent SQL data rather than crediting or accepting locally',()=>{
 for(const bad of [{...value,userId:'Bob'},{...value,currentVersion:'2026-09-25.1'},{...value,effectiveDate:null},{...value,effectiveDate:'2026-02-30'},
 {...value,consent:{version:CURRENT_TICKET_TERMS_VERSION,acceptedAt:'invalid'}}]) expect(()=>parseCurrentTerms(bad,'Alice')).toThrow('TERMS_UNAVAILABLE');
});
