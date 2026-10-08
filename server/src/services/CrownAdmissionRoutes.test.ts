import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AccountWriteGate } from './AccountDeletion';
import { createCrownAdmissionRouter } from './CrownAdmissionRoutes';
import { CrownAdmissionError, crownRankKey, parseCrownAuthorization } from '../protocol/CrownAdmission';
import type { RankedSessionAuthority } from './RankedAuth';

let server: http.Server;
afterEach(async () => { if(server)await new Promise<void>(done=>server.close(()=>done())); });
async function setup(enabled?:()=>boolean) {
    let valid=true; const gate=new AccountWriteGate();
    const auth={verifySession:vi.fn(async()=>valid?{userId:'Alice',expiresAt:Date.now()+60000}:null)} as unknown as RankedSessionAuthority;
    const store={authorize:vi.fn(async(userId:string,rankKey:string)=>({state:'authorized' as const,userId,rankKey,
        authorizationId:'00000000-0000-4000-8000-000000000001',source:'verified_ad' as const,reused:false}))};
    const verify=vi.fn(async()=>null);
    const app=express(); app.use(createCrownAdmissionRouter(auth,store,verify,gate,enabled,stage=>crownRankKey(stage,'stage_v1')));
    server=http.createServer(app); await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
    const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/crown/first-attempt`;
    const request=(body:unknown={stageId:1},suffix='')=>fetch(url+suffix,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer ranked_fixture'},body:JSON.stringify(body)});
    return {request,store,auth,verify,gate,revoke:()=>{valid=false;}};
}
describe('Crown route authority and receipt contract',()=>{
    it('is disabled by default before authentication or database access',async()=>{
        const {request,store,auth}=await setup(); expect((await request()).status).toBe(503);
        expect(auth.verifySession).not.toHaveBeenCalled(); expect(store.authorize).not.toHaveBeenCalled();
    });
    it('accepts only a stage and derives account/rank from trusted authority',async()=>{
        const {request,store}=await setup(()=>true);const response=await request();
        expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toMatchObject({userId:'Alice',rankKey:'crown:stage:v1:1'});
        for(const body of [{stageId:1,userId:'Bob'},{stageId:1,adViewed:true},{stageId:1,grantId:'x'},{stageId:1,rankKey:'arbitrary'},[],{},null,{stageId:101},{stageId:'1'}]) {
            expect((await request(body)).status).toBe(400);
        }
        expect((await request({stageId:1},'?userId=Bob')).status).toBe(400);expect(store.authorize).toHaveBeenCalledOnce();
    });
    it('rejects account guard and revoked session before writing',async()=>{
        const {request,gate,store,revoke}=await setup(()=>true);
        gate.reserve('Alice',false);expect((await request()).status).toBe(403);gate.release('Alice');
        revoke();expect((await request()).status).toBe(401);expect(store.authorize).not.toHaveBeenCalled();
    });
    it('discards an authorization reply after session revocation',async()=>{
        const {request,store,revoke}=await setup(()=>true);
        const original=store.authorize.getMockImplementation()!;
        store.authorize.mockImplementation(async(...args)=>{const receipt=await original(...args);revoke();return receipt;});
        expect((await request()).status).toBe(401);expect(store.authorize).toHaveBeenCalledOnce();
    });
    it('projects the database current-terms denial without returning an authorization',async()=>{
        const {request,store}=await setup(()=>true);
        // The real predicate/no-consumption behavior is exercised by the native
        // fixture; the route must preserve its denial rather than return a receipt.
        store.authorize.mockRejectedValue(new CrownAdmissionError('ACCOUNT_UNAVAILABLE'));
        const response=await request();expect(response.status).toBe(403);
        expect(await response.json()).toEqual({code:'ACCOUNT_UNAVAILABLE'});
    });
    it('strictly binds receipts to account and rank and strips other data',()=>{
        const row={state:'authorized',userId:'Alice',rankKey:'crown:stage:v1:1',authorizationId:'00000000-0000-4000-8000-000000000001',source:'subscription',reused:true,secret:'hidden'};
        expect(parseCrownAuthorization(row,'Alice',row.rankKey)).not.toHaveProperty('secret');
        for(const change of [{userId:'Bob'},{rankKey:'other'},{state:'adViewed'},{source:'client'},{authorizationId:'x'},{reused:1}]) {
            expect(()=>parseCrownAuthorization({...row,...change},'Alice',row.rankKey)).toThrow('CROWN_UNAVAILABLE');
        }
    });
});
