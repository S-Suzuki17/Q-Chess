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

it('overlaps authenticated progress/deletion reads but never returns data before the guard resolves',async()=>{
    let finish!:(blocked:boolean)=>void;store.blocked.mockImplementation(()=>new Promise<boolean>(done=>{finish=done;}));
    const result=fetch(base+'/account/progress',{headers:{Authorization:`Bearer ${token}`}});
    await vi.waitFor(()=>expect(store.read).toHaveBeenCalledWith('Alice'));
    let settled=false;void result.then(()=>{settled=true;});await new Promise(done=>setTimeout(done,10));expect(settled).toBe(false);
    finish(true);const response=await result;expect(response.status).toBe(423);expect(await response.json()).toEqual({code:'ACCOUNT_DELETING'});
});
it('blocks a deletion that starts while a progress read is pending, and fails closed on either read failure',async()=>{
    let finish!:(value:any)=>void;store.read.mockImplementationOnce(()=>new Promise(done=>{finish=done;}));
    const result=fetch(base+'/account/progress',{headers:{Authorization:`Bearer ${token}`}});
    await vi.waitFor(()=>expect(store.read).toHaveBeenCalled());gate.reserve('Alice',false);finish({revision:1,progress:fresh()});
    expect((await result).status).toBe(423);gate.release('Alice');
    store.blocked.mockRejectedValueOnce(Error('secret'));const response=await fetch(base+'/account/progress',{headers:{Authorization:`Bearer ${token}`}});
    expect(response.status).toBe(503);expect(await response.text()).not.toContain('secret');
});
