import express from 'express';import http from 'node:http';import type {AddressInfo} from 'node:net';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {RankedAuth} from './RankedAuth';import {AccountWriteGate} from './AccountDeletion';
import {CURRENT_TERMS_VERSION,createAccountTermsStore} from './AccountTerms';import {createAccountTermsRouter} from './AccountTermsRoutes';
import {TERMS_VERSION,TERMS_SECTIONS,TERMS_ENGLISH} from '../../../src/config/terms';
let server:http.Server,base:string,auth:RankedAuth,token:string,gate:AccountWriteGate;
const store={verifyUser:vi.fn(),blocked:vi.fn(),read:vi.fn(),accept:vi.fn()};
const consent={version:CURRENT_TERMS_VERSION,acceptedAt:'2026-09-24T18:00:00Z'};
const valid=()=>({version:CURRENT_TERMS_VERSION,accepted:true});
const options=(body:unknown,bearer=token)=>({method:'POST',headers:{Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
beforeEach(async()=>{vi.resetAllMocks();store.verifyUser.mockResolvedValue(null);store.blocked.mockResolvedValue(false);store.read.mockResolvedValue(consent);store.accept.mockResolvedValue(undefined);
    auth=new RankedAuth(async()=>true);token=(await auth.issueLegacySession('Alice','correct'))!.token;gate=new AccountWriteGate();
    const app=express();app.use(createAccountTermsRouter(auth,store,gate));server=http.createServer(app);await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;});
afterEach(async()=>{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));});
it('uses the same approved version in API and both complete document languages',()=>{expect(CURRENT_TERMS_VERSION).toBe(TERMS_VERSION);expect(TERMS_SECTIONS).toHaveLength(10);expect(TERMS_ENGLISH).toHaveLength(10);});
it('requires live identity and rejects caller-chosen owners, dates and old terms',async()=>{
    for(const bad of ['Alice','GUEST-Alice','bad.jwt.token'])expect((await fetch(base+'/account/terms',options(valid(),bad))).status).toBe(401);
    for(const bad of [{...valid(),userId:'Bob'},{...valid(),acceptedAt:'2000-01-01'},{...valid(),accepted:false},{...valid(),version:'2025-01-01.1'},null])expect((await fetch(base+'/account/terms',options(bad))).status).toBe(400);
    expect((await fetch(base+'/account/terms?userId=Bob',{headers:{Authorization:`Bearer ${token}`}})).status).toBe(400);expect(store.accept).not.toHaveBeenCalled();
});
it('saves only the verified legacy owner and never permits profile recreation',async()=>{
    const res=await fetch(base+'/account/terms',options(valid()));expect(res.status).toBe(200);expect(await res.json()).toEqual({userId:'Alice',currentVersion:CURRENT_TERMS_VERSION,consent});expect(store.accept).toHaveBeenCalledWith('Alice',false);
});
it('allows a verified OAuth owner to initialize their own missing profile',async()=>{
    store.verifyUser.mockResolvedValue('VerifiedOAuth');const res=await fetch(base+'/account/terms',options(valid(),'verified.live.jwt'));
    expect(res.status).toBe(200);expect(store.accept).toHaveBeenCalledWith('VerifiedOAuth',true);
});
it('requires a fresh acceptance when no current-version record exists',async()=>{
    store.read.mockResolvedValue(null);const res=await fetch(base+'/account/terms',{headers:{Authorization:`Bearer ${token}`}});
    expect(await res.json()).toMatchObject({currentVersion:CURRENT_TERMS_VERSION,consent:null});
    expect((await fetch(base+'/account/terms',options(valid()))).status).toBe(503);
});
it('blocks deletion races and revoked tokens; never reports failed storage as success',async()=>{
    gate.reserve('Alice',false);expect((await fetch(base+'/account/terms',options(valid()))).status).toBe(423);gate.release('Alice');
    store.accept.mockRejectedValue(new Error('private detail'));const failure=await fetch(base+'/account/terms',options(valid()));expect(failure.status).toBe(503);expect(await failure.text()).not.toContain('private detail');expect(gate.blocked('Alice')).toBe(false);
    auth.revokeUserSessions('Alice');expect((await fetch(base+'/account/terms',options(valid()))).status).toBe(401);
});
it('bounds the request body and consent rate',async()=>{
    expect((await fetch(base+'/account/terms',options({...valid(),junk:'x'.repeat(2000)}))).status).toBe(413);
    for(let i=0;i<19;i++)expect((await fetch(base+'/account/terms',{headers:{Authorization:`Bearer ${token}`}})).status).toBe(200);
    const limited=await fetch(base+'/account/terms',{headers:{Authorization:`Bearer ${token}`}});expect(limited.status).toBe(429);expect(limited.headers.get('Retry-After')).toBe('60');
});
it('storage uses an idempotent insert with no writable timestamp or update access',async()=>{
    const upsert=vi.fn().mockResolvedValue({error:null}),ensure=vi.fn();const client={from:vi.fn(()=>({upsert}))};
    await createAccountTermsStore(client as never,store.verifyUser,store.blocked,ensure).accept('Alice',false);
    expect(ensure).toHaveBeenCalledWith('Alice',false);expect(upsert).toHaveBeenCalledWith({user_id:'Alice',version:CURRENT_TERMS_VERSION},{onConflict:'user_id,version',ignoreDuplicates:true});
});
