import express from 'express';import http from 'node:http';import type {AddressInfo} from 'node:net';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {RankedAuth} from './RankedAuth';import {AccountWriteGate} from './AccountDeletion';
import {parseSavedProgress} from './AccountProgress';import {createAccountProgressRouter} from './AccountProgressRoutes';
const fresh=()=>({version:2,stars:{},ascensions:[],stageStars:[],board:'standard',piece:'standard',effect:'standard',music:'standard',avatar:'standard'});
let server:http.Server,base:string,auth:RankedAuth,token:string,gate:AccountWriteGate;
const store={verifyUser:vi.fn(),blocked:vi.fn(),read:vi.fn(),save:vi.fn()};
const options=(body:unknown,bearer=token)=>({method:'POST',headers:{Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
beforeEach(async()=>{vi.resetAllMocks();store.verifyUser.mockResolvedValue(null);store.blocked.mockResolvedValue(false);store.read.mockResolvedValue({revision:0,progress:null});store.save.mockResolvedValue(true);
    auth=new RankedAuth(async()=>true);token=(await auth.issueLegacySession('Alice','correct'))!.token;gate=new AccountWriteGate();
    const app=express();app.use(createAccountProgressRouter(auth,store,gate));server=http.createServer(app);await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;});
afterEach(async()=>{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));});
it('validates compact contiguous progress without accepting entitlements or unknown owner fields',()=>{
    expect(parseSavedProgress(fresh())).toEqual(fresh());
    for(const change of [{foundersOwned:true},{stageStars:[3,0,3]},{stageStars:Array(101).fill(3)},{stars:{sovereign:3}},{ascensions:[{nox:1}]},{avatar:'https://evil.test/avatar'},{userId:'Bob'}])expect(parseSavedProgress({...fresh(),...change})).toBeNull();
});
it('never accepts a forged identity or a client-selected owner',async()=>{
    for(const bad of ['GUEST-Alice','Alice','bad.jwt.token'])expect((await fetch(base+'/account/progress',options({revision:0,progress:fresh()},bad))).status).toBe(401);
    expect((await fetch(base+'/account/progress',options({revision:0,progress:fresh(),userId:'Bob'}))).status).toBe(400);
    expect((await fetch(base+'/account/progress?userId=Bob',{headers:{Authorization:`Bearer ${token}`}})).status).toBe(400);expect(store.save).not.toHaveBeenCalled();
});
it('passes only the verified owner to storage and returns conflicts without a false saved flag',async()=>{
    store.save.mockResolvedValue(false);store.read.mockResolvedValue({revision:2,progress:{...fresh(),stageStars:[3]}});
    const response=await fetch(base+'/account/progress',options({revision:1,progress:fresh()}));
    expect(await response.json()).toMatchObject({userId:'Alice',saved:false,revision:2});expect(store.save).toHaveBeenCalledWith('Alice',1,fresh());expect(gate.blocked('Alice')).toBe(false);
});
it('blocks a deletion race and releases operation leases after an upstream failure',async()=>{
    gate.reserve('Alice',false);expect((await fetch(base+'/account/progress',options({revision:0,progress:fresh()}))).status).toBe(423);gate.release('Alice');
    store.save.mockRejectedValue(new Error('secret'));const res=await fetch(base+'/account/progress',options({revision:0,progress:fresh()}));expect(res.status).toBe(503);expect(await res.text()).not.toContain('secret');expect(gate.blocked('Alice')).toBe(false);
});
