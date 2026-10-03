import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createCpuPracticeFixture } from '../../../scripts/qa/cpu-practice-fixture.mjs';
import { RankedAuth } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { CpuPracticeService } from './CpuPracticeService';
import { createCpuPracticeRouter } from './CpuPracticeRoutes';
import { getAllConcreteMoves } from '../quantum-engine/ai/random';

describe('verified CPU practice HTTP API with actual PostgreSQL',()=>{
    let fixture:Awaited<ReturnType<typeof createCpuPracticeFixture>>,server:http.Server,base:string,token:string;
    let enabled=true,busy=false;
    let search=(state:Parameters<typeof getAllConcreteMoves>[0],_signal:AbortSignal)=>Promise.resolve(getAllConcreteMoves(state)[0]??null);
    let practice:CpuPracticeService;
    beforeAll(async()=>{
        fixture=await createCpuPracticeFixture();
        const auth=new RankedAuth(async()=>true);token=(await auth.issueLegacySession('Alice','password'))!.token;
        practice=new CpuPracticeService(fixture.client as never,true,(state,_level,signal)=>search(state,signal));
        const app=express();app.use(createCpuPracticeRouter(auth,practice,async()=>null,new AccountWriteGate(),()=>busy,()=>enabled));
        server=http.createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
        base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    },15000);
    afterAll(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await fixture.db.close();});
    const post=(path:string,body:unknown,proof=token)=>fetch(base+path,{method:'POST',
        headers:{Authorization:`Bearer ${proof}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const open=async()=>{const response=await post('/cpu-practice/sessions',{sessionId:randomUUID(),playerSide:'white',level:1,seconds:600});
        expect(response.status).toBe(200);return response.json();};
    it('rejects unauthenticated IDs and board/mode/history forgery before consuming',async()=>{
        expect((await post('/cpu-practice/sessions',{},'GUEST-fake')).status).toBe(401);
        expect((await post('/cpu-practice/sessions',{sessionId:randomUUID(),playerSide:'white',level:1,seconds:600,mode:'ranked'})).status).toBe(400);
        const session=await open();const before=await fixture.wallet('Alice');
        const response=await post(`/cpu-practice/sessions/${session.sessionId}/hints`,{requestId:randomUUID(),revision:0,moveHistory:[],pool:'white'});
        expect(response.status).toBe(400);expect((await fixture.wallet('Alice')).hint_tickets).toBe(before.hint_tickets);
    });
    it('delivers and retrieves the identical receipt without an extra ticket',async()=>{
        const session=await open(),id=randomUUID(),path=`/cpu-practice/sessions/${session.sessionId}/hints`;
        const first=await (await post(path,{requestId:id,revision:0})).json();
        const before=await fixture.wallet('Alice');
        const response=await fetch(base+path+`/0/${id}`,{headers:{Authorization:`Bearer ${token}`}});
        expect(response.status).toBe(200);expect(await response.json()).toEqual(first);
        expect((await fixture.wallet('Alice')).hint_tickets).toBe(before.hint_tickets);
        expect(response.headers.get('cache-control')).toBe('no-store');
    });
    it('refuses current online/ranked play, stale revision and finished sessions with zero debit',async()=>{
        const session=await open(),path=`/cpu-practice/sessions/${session.sessionId}/hints`;
        const before=await fixture.wallet('Alice');busy=true;
        expect((await post(path,{requestId:randomUUID(),revision:0})).status).toBe(403);busy=false;
        expect((await post(path,{requestId:randomUUID(),revision:4})).status).toBe(409);
        expect((await post(`/cpu-practice/sessions/${session.sessionId}/close`,{})).status).toBe(200);
        expect((await post(path,{requestId:randomUUID(),revision:0})).status).toBe(422);
        expect((await fixture.wallet('Alice')).hint_tickets).toBe(before.hint_tickets);
    });
    it('hard-OFF rejects before authentication and database access',async()=>{
        enabled=false;
        expect((await post('/cpu-practice/sessions',{},'invalid')).status).toBe(503);enabled=true;
    });
    it('a real HTTP disconnect during search prevents the debit transaction',async()=>{
        const session=await open(),before=await fixture.wallet('Alice');
        let entered!:()=>void,cancelled!:()=>void,finish!:()=>void;
        const started=new Promise<void>(resolve=>{entered=resolve;});
        const stopped=new Promise<void>(resolve=>{cancelled=resolve;});
        search=(state,signal)=>{entered();signal.addEventListener('abort',cancelled,{once:true});
            return new Promise(resolve=>{finish=()=>resolve(getAllConcreteMoves(state)[0]??null);});};
        const controller=new AbortController();
        const pending=fetch(base+`/cpu-practice/sessions/${session.sessionId}/hints`,{method:'POST',
            headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
            body:JSON.stringify({requestId:randomUUID(),revision:0}),signal:controller.signal});
        await started;controller.abort();await expect(pending).rejects.toThrow();await stopped;finish();
        for(let attempt=0;attempt<30&&practice.isBusy('Alice');attempt++)await new Promise(resolve=>setTimeout(resolve,10));
        expect(practice.isBusy('Alice')).toBe(false);expect((await fixture.wallet('Alice')).hint_tickets).toBe(before.hint_tickets);
        search=(state)=>Promise.resolve(getAllConcreteMoves(state)[0]??null);
    });
});
