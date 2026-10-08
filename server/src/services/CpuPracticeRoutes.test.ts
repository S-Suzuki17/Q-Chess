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

describe('retired paid practice API and historical PostgreSQL-compatible receipts',()=>{
    let fixture:Awaited<ReturnType<typeof createCpuPracticeFixture>>,server:http.Server,base:string,token:string;
    let enabled=true,busy=false;
    let search=(state:Parameters<typeof getAllConcreteMoves>[0],_signal:AbortSignal)=>Promise.resolve(getAllConcreteMoves(state)[0]??null);
    let practice:CpuPracticeService;
    beforeAll(async()=>{
        fixture=await createCpuPracticeFixture();
        const auth=new RankedAuth(async()=>true);token=(await auth.issueLegacySession('Alice','password'))!.token;
        practice=new CpuPracticeService(fixture.client as never,()=>enabled,(state,_level,signal)=>search(state,signal),()=> 'buy_cpu_hint');
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
    it('recovers a historical receipt after terminal state, online entry and gate-OFF with no new debit',async()=>{
        const session=await open(),id=randomUUID(),path=`/cpu-practice/sessions/${session.sessionId}/hints`;
        // This fixture intentionally retains historical SQL to seed a receipt
        // created before practice became free. New HTTP purchases are disabled.
        const first=await practice.requestHint(id,'Alice',session.sessionId,0);
        await practice.close('Alice',session.sessionId); enabled=false; busy=true;
        const before=await fixture.wallet('Alice');
        const response=await fetch(base+path+`/0/${id}`,{headers:{Authorization:`Bearer ${token}`}});
        expect(response.status).toBe(200);expect(await response.json()).toEqual(first);
        expect((await fixture.wallet('Alice')).hint_tickets).toBe(before.hint_tickets);
        expect(response.headers.get('cache-control')).toBe('no-store');
        enabled=true;busy=false;
    });
    it('refuses current online/ranked play, stale revision and finished sessions with zero debit',async()=>{
        const session=await open(),path=`/cpu-practice/sessions/${session.sessionId}/hints`;
        const before=await fixture.wallet('Alice');busy=true;
        expect((await post(path,{requestId:randomUUID(),revision:0})).status).toBe(403);busy=false;
        const stale=await post(path,{requestId:randomUUID(),revision:4});
        expect(stale.status).toBe(409);expect(await stale.json()).toEqual({code:'PRACTICE_HINTS_FREE'});
        expect((await post(`/cpu-practice/sessions/${session.sessionId}/close`,{})).status).toBe(200);
        expect((await post(path,{requestId:randomUUID(),revision:0})).status).toBe(409);
        expect((await fixture.wallet('Alice')).hint_tickets).toBe(before.hint_tickets);
    });
    it('hard-OFF rejects before authentication and database access',async()=>{
        enabled=false;
        expect((await post('/cpu-practice/sessions',{},'invalid')).status).toBe(503);enabled=true;
    });
    it('practice purchases never start a search or debit for valid repeated requests',async()=>{
        const session=await open(),before=await fixture.wallet('Alice');
        let searches=0;search=async()=>{searches++;throw new Error('must not run');};
        const requestId=randomUUID();
        for(const id of [requestId,requestId,randomUUID()]){
            const response=await post(`/cpu-practice/sessions/${session.sessionId}/hints`,{requestId:id,revision:0});
            expect(response.status).toBe(409);expect(await response.json()).toEqual({code:'PRACTICE_HINTS_FREE'});
        }
        expect(searches).toBe(0);expect(practice.isBusy('Alice')).toBe(false);
        expect((await fixture.wallet('Alice')).hint_tickets).toBe(before.hint_tickets);
        search=(state)=>Promise.resolve(getAllConcreteMoves(state)[0]??null);
    });
});
