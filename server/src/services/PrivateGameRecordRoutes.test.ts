import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RankedAuth } from './RankedAuth';
import { createPrivateGameRecordRouter } from './PrivateGameRecordRoutes';

const ID='9e477b83-4213-4d82-b9dc-f7dcae5a028b';
const record=()=>({id:ID,white_id:'Alice',black_id:'ai',winner:'white_wins',mode:'cpu',cpu_level:3,time_control:'3m',moves:[],total_moves:0});
describe('authenticated private history HTTP routes',()=>{
    let server:http.Server, base:string, token:string, auth:RankedAuth;
    let store:{verifyUser:ReturnType<typeof vi.fn>;getPrivateGameRecords:ReturnType<typeof vi.fn>;getPrivateGameStats:ReturnType<typeof vi.fn>;saveLocalGameRecord:ReturnType<typeof vi.fn>};
    beforeEach(async()=>{
        store={verifyUser:vi.fn().mockResolvedValue(null),getPrivateGameRecords:vi.fn().mockResolvedValue([]),getPrivateGameStats:vi.fn().mockResolvedValue({totalGames:20}),saveLocalGameRecord:vi.fn().mockResolvedValue(ID)};
        auth=new RankedAuth(async(id,pw)=>id==='Alice'&&pw==='right');
        token=(await auth.issueLegacySession('Alice','right'))!.token;
        const app=express();
        app.use(createPrivateGameRecordRouter(auth,store));
        app.use(express.json({limit:'4kb'}));
        app.post('/auth-test',(req,res)=>res.json({ok:true}));
        server=http.createServer(app);
        await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
        base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        vi.spyOn(console,'warn').mockImplementation(()=>{});
    });
    afterEach(async()=>{server?.closeAllConnections();if(server?.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));vi.restoreAllMocks();});
    const options=(token:string,body?:unknown)=>({headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});

    it('denies absent, guest, raw identity, forged proof and unverified JWT',async()=>{
        for(const value of ['', 'Alice','SUPABASE-Alice','GUEST-Alice','ranked_fake','a.b.c']){
            const res=await fetch(`${base}/game-records`,options(value));expect(res.status).toBe(401);
            expect(res.headers.get('cache-control')).toBe('no-store');
        }
        expect(store.getPrivateGameRecords).not.toHaveBeenCalled();expect(store.verifyUser).toHaveBeenCalledExactlyOnceWith('a.b.c');
    });
    it('accepts verified non-anonymous JWT identity only and rejects revoked legacy sessions',async()=>{
        store.verifyUser.mockResolvedValue('Bob');
        expect((await fetch(`${base}/game-records`,options('valid.jwt.signature'))).status).toBe(200);
        expect(store.getPrivateGameRecords).toHaveBeenCalledWith('Bob',10);
        auth.revokeSession(token);
        expect((await fetch(`${base}/game-stats`,options(token))).status).toBe(401);
    });
    it('rejects expired proof on every private read and write route',async()=>{
        vi.spyOn(Date,'now').mockReturnValue(Date.now()+3_600_001);
        for(const path of ['/game-records',`/game-records/${ID}`,'/game-stats'])expect((await fetch(`${base}${path}`,options(token))).status).toBe(401);
        expect((await fetch(`${base}/game-records`,options(token,record()))).status).toBe(401);
        expect(store.getPrivateGameRecords).not.toHaveBeenCalled();expect(store.getPrivateGameStats).not.toHaveBeenCalled();expect(store.saveLocalGameRecord).not.toHaveBeenCalled();
    });
    it('caps history at ten, blocks selectors/pagination and filters foreign rows defensively',async()=>{
        store.getPrivateGameRecords.mockResolvedValue([{id:ID,white_id:'Mallory'},...Array.from({length:12},(_,i)=>({id:String(i),white_id:'Alice'}))]);
        const res=await fetch(`${base}/game-records?limit=999`,options(token));
        expect(res.status).toBe(200);expect((await res.json()).records).toHaveLength(10);
        expect(store.getPrivateGameRecords).toHaveBeenCalledWith('Alice',10);
        expect(res.headers.get('vary')).toBe('Authorization');
        for(const query of ['userId=Bob','offset=10','limit=0','limit=-1','limit=abc','limit=1&limit=2'])expect((await fetch(`${base}/game-records?${query}`,options(token))).status).toBe(400);
    });
    it('allows details only inside the current user latest-ten set',async()=>{
        const other='9e477b83-4213-4d82-b9dc-f7dcae5a028c';
        store.getPrivateGameRecords.mockResolvedValue([{id:ID,black_id:'Alice',moves:[{replayVersion:2,changes:[]}]}]);
        const res=await fetch(`${base}/game-records/${ID}`,options(token));
        expect(res.status).toBe(200);expect((await res.json()).record.id).toBe(ID);
        expect((await fetch(`${base}/game-records/${other}`,options(token))).status).toBe(404);
        store.getPrivateGameRecords.mockResolvedValue([{id:ID,white_id:'Bob'}]);
        expect((await fetch(`${base}/game-records/${ID}`,options(token))).status).toBe(404);
        store.getPrivateGameRecords.mockResolvedValue([...Array.from({length:10},(_,i)=>({id:`current-${i}`,white_id:'Alice'})),{id:ID,white_id:'Alice'}]);
        expect((await fetch(`${base}/game-records/${ID}`,options(token))).status).toBe(404);
        expect((await fetch(`${base}/game-records/${ID}?userId=Bob`,options(token))).status).toBe(404);
    });
    it('always scopes all-time stats to the token identity',async()=>{
        const res=await fetch(`${base}/game-stats`,options(token));expect(res.status).toBe(200);expect(await res.json()).toEqual({stats:{totalGames:20}});
        expect(store.getPrivateGameStats).toHaveBeenCalledExactlyOnceWith('Alice');
        expect((await fetch(`${base}/game-stats?userId=Bob`,options(token))).status).toBe(400);
    });
    it('saves local CPU records with auth and keeps the 4 KiB default on other routes',async()=>{
        const value={...record(),moves:[{turn:1,player:'white',tokenId:'token_17',from:[6,0],to:[4,0],possibleTypes:['Pawn'],extra:'a'.repeat(6000)}],total_moves:1};
        const res=await fetch(`${base}/game-records`,options(token,value));expect(res.status).toBe(200);expect(await res.json()).toEqual({id:ID});
        expect(store.saveLocalGameRecord).toHaveBeenCalledWith('Alice',expect.objectContaining({mode:'cpu',moves:value.moves}));
        expect((await fetch(`${base}/auth-test`,options(token,value))).status).toBe(413);
    });
    it('saves a private player own copy without ever associating the opponent account',async()=>{
        const move={turn:1,player:'white',tokenId:'w_17',from:[6,0],to:[4,0],possibleTypes:['Pawn'],capturedTokenId:'b_9',replayVersion:2,changes:[[17,32,32,1,0],[9,-1,0,0,0]]};
        const value={...record(),mode:'private',black_id:null,cpu_level:null,moves:[move],total_moves:1};
        expect((await fetch(`${base}/game-records`,options(token,value))).status).toBe(200);
        expect(store.saveLocalGameRecord).toHaveBeenLastCalledWith('Alice',expect.objectContaining({mode:'private',white_id:'Alice',black_id:null,cpu_level:null,moves:[move]}));
        expect((await fetch(`${base}/game-records`,options(token,{...value,white_id:null,black_id:'Alice'}))).status).toBe(200);
        expect(store.saveLocalGameRecord).toHaveBeenLastCalledWith('Alice',expect.objectContaining({white_id:null,black_id:'Alice'}));
        expect((await fetch(`${base}/game-records`,options(token,{...value,black_id:'Bob'}))).status).toBe(400);
    });
    it('rejects other players, online modes, malformed JSON, non-JSON, compressed or oversized input before storage',async()=>{
        for(const bad of [{...record(),white_id:'Bob'},{...record(),mode:'ranked'},{...record(),mode:'private'},{...record(),mode:'ranked_cpu'}])expect((await fetch(`${base}/game-records`,options(token,bad))).status).toBe(400);
        const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
        expect((await fetch(`${base}/game-records`,{method:'POST',headers,body:'{bad'})).status).toBe(400);
        expect((await fetch(`${base}/game-records`,{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:'hi'})).status).toBe(415);
        expect((await fetch(`${base}/game-records`,{method:'POST',headers:{...headers,'Content-Encoding':'gzip'},body:'bad'})).status).toBe(415);
        expect((await fetch(`${base}/game-records`,options(token,{...record(),extra:'x'.repeat(2*1024*1024)}))).status).toBe(413);
        expect(store.saveLocalGameRecord).not.toHaveBeenCalled();
    });
    it('authenticates before parsing a large payload and rate limits saves',async()=>{
        expect((await fetch(`${base}/game-records`,options('GUEST-Alice',{extra:'x'.repeat(30000)}))).status).toBe(401);
        for(let i=0;i<12;i++)expect((await fetch(`${base}/game-records`,options(token,record()))).status).toBe(200);
        const res=await fetch(`${base}/game-records`,options(token,record()));expect(res.status).toBe(429);expect(res.headers.get('retry-after')).toBe('60');
        expect(store.saveLocalGameRecord).toHaveBeenCalledTimes(12);
    });
    it('returns fail-closed generic errors without leaking database payloads',async()=>{
        store.getPrivateGameRecords.mockRejectedValue(new Error('private-key-secret'));
        const res=await fetch(`${base}/game-records`,options(token));expect(res.status).toBe(503);expect(await res.text()).not.toContain('private-key-secret');
    });
});
