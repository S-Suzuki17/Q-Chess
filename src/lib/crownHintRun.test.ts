import { describe, expect, it, vi } from 'vitest';
import { CrownHintRunClient, crownRunClocks, displayCrownRun, type CrownRunSnapshot } from './crownHintRun';
import { createInitialState } from '../quantum-engine/initialState';
import { applyPracticeMove } from '../quantum-engine/practice';
import { getAllConcreteMoves } from '../quantum-engine/ai/random';
import { legacyToQuantumState } from '../quantum-engine/adapter';
const storage=()=>{const saved=new Map<string,string>();return {saved,getItem:(key:string)=>saved.get(key)??null,setItem:(key:string,value:string)=>{saved.set(key,value);}};};
const settings=(stageId=1,playerSide:'white'|'black'='white')=>({runId:crypto.randomUUID(),stageId,playerSide});
function snapshot(config= settings()):CrownRunSnapshot {return {...config,kind:'crown',hintContextId:crypto.randomUUID(),
    strength:Math.floor((config.stageId-1)/3)+1,seconds:([600,180,10] as const)[(config.stageId-1)%3],
    rulesVersion:'quantum-crown-v1',revision:0,stateHash:'server-hash',state:createInitialState(),history:[],whiteMs:600000,blackMs:600000,status:'active',serverNow:Date.now()};}
describe('Crown hint contexts preserve canonical stage and actual CPU moves',()=>{
    it('uses the response midpoint and monotonic elapsed time for the active server clock',async()=>{
        const config=settings(3),value={...snapshot(config),whiteMs:10000,blackMs:10000,serverNow:987654321000};
        const clock=vi.spyOn(performance,'now').mockReturnValueOnce(1000).mockReturnValueOnce(5000);
        try{
            const run=await new CrownHintRunClient('Alice',config,vi.fn().mockResolvedValue(value),storage()).open();
            expect(crownRunClocks(run,5000)).toEqual({whiteMs:8000,blackMs:10000});
            expect(crownRunClocks(run,6000)).toEqual({whiteMs:7000,blackMs:10000});
            expect(crownRunClocks(run,15000)).toEqual({whiteMs:0,blackMs:10000});
            expect(crownRunClocks({...run,status:'finished'},15000)).toEqual({whiteMs:10000,blackMs:10000});
        }finally{clock.mockRestore();}
    });
    it.each([1,2,3,34,99,100])('opens stage %i using only run identity, stage and player side',async stageId=>{
        const config=settings(stageId,'black'),value=snapshot(config),saved=storage(),send=vi.fn(async(_user:string,_path:string,body:unknown)=>{expect(saved.saved.size).toBe(1);expect(body).toEqual(config);return value;});
        expect(await new CrownHintRunClient('Alice',config,send,saved).open()).toEqual(value);
        expect(send.mock.calls[0][1]).toBe('/crown-hints/runs');expect(Object.keys(send.mock.calls[0][2] as object).sort()).toEqual(['playerSide','runId','stageId']);
    });
    it('persists actual CPU move IDs before dispatch and reuses them after a lost reply',async()=>{
        const config=settings(100,'black'),saved=storage(),move=getAllConcreteMoves(createInitialState())[0],send=vi.fn().mockRejectedValue(new Error('lost'));
        await expect(new CrownHintRunClient('Alice',config,send,saved).advance(0,'cpu',move)).rejects.toThrow('lost');
        await expect(new CrownHintRunClient('Alice',config,send,saved).advance(0,'cpu',move)).rejects.toThrow('lost');
        expect(send.mock.calls[0][2]).toEqual(send.mock.calls[1][2]);expect(send.mock.calls[0][2]).toMatchObject({actor:'cpu',revision:0,move});
        expect(send.mock.calls[0][2]).not.toHaveProperty('level');expect(send.mock.calls[0][2]).not.toHaveProperty('profile');
    });
    it('reconstructs accepted moves, both sides, candidates and capture/last-move state without a practice-kind snapshot',()=>{
        const run=snapshot();let state=run.state;
        for(let ply=0;ply<18;ply++){
            const legal=getAllConcreteMoves(state);if(!legal.length||state.winner)break;
            state=applyPracticeMove(state,legal[(ply*13)%legal.length]);run.history.push(state.lastMove!);
            run.state=state;run.revision=state.ply;
            const display=displayCrownRun(run),rebuilt=legacyToQuantumState(display.tokens,display.pool,state.sideToMove,state.ply,display.history.at(-1)??null);
            expect(rebuilt.pieces).toEqual(state.pieces);expect(rebuilt.lastMove).toEqual(state.lastMove);expect(rebuilt.captured).toEqual(state.captured);
            expect(display.history.length).toBe(run.revision);expect(run.kind).toBe('crown');
        }
        expect(run.history.length).toBeGreaterThan(8);
    });
    it.each(['hintContextId','runId','stageId','playerSide','strength','seconds','rulesVersion','revision','stateHash','status','whiteMs'] as const)('rejects a mismatched %s registry snapshot',async field=>{
        const config=settings(),value=snapshot(config),send=vi.fn().mockResolvedValue({...value,[field]:field==='revision'?1:field==='whiteMs'?-1:field==='stateHash'?'':'invalid'});
        await expect(new CrownHintRunClient('Alice',config,send,storage()).open()).rejects.toThrow('HINT_RESPONSE_INVALID');
    });
    it('reads and closes without a hint purchase and rejects a changed display position',async()=>{
        const config=settings(),value=snapshot(config),send=vi.fn().mockResolvedValue(value),client=new CrownHintRunClient('Alice',config,send,storage());
        await client.read();await client.close();expect(send.mock.calls.map(call=>call[1])).toEqual([`/crown-hints/runs/${config.runId}`,`/crown-hints/runs/${config.runId}/close`]);expect(send.mock.calls[0][2]).toBeUndefined();expect(send.mock.calls[1][2]).toEqual({});
        const altered={...value,state:{...value.state,pieces:value.state.pieces.map((piece,i)=>i?piece:{...piece,position:{row:4,col:4}})}};
        expect(()=>displayCrownRun(altered)).toThrow('HINT_RESPONSE_INVALID');
    });
});
