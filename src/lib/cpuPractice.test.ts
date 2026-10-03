import { describe,it,expect,vi } from 'vitest';
import { CPU_HINT_TICKETS_ENABLED,CpuPracticeClient,displayCpuPractice,officialCpuPractice } from './cpuPractice';
import { createInitialState } from '../quantum-engine/initialState';
import { applyPracticeMove,CPU_PRACTICE_RULES_VERSION,type CpuPracticeSnapshot } from '../quantum-engine/practice';
import { getAllConcreteMoves } from '../quantum-engine/ai/random';
import { applyLocalMove,positionForDisplay } from './localGame';
import { legacyToQuantumState,quantumToLegacyMove } from '../quantum-engine/adapter';

const storage=()=>{const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,
    setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};};
const settings={playerSide:'white' as const,level:1 as const,seconds:600 as const};
describe('durable CPU practice transport and engine display',()=>{
    it('reuses request/session IDs after lost response and component reconstruction',async()=>{
        const saved=storage();const seen:unknown[]=[];
        const send=vi.fn(async (_user:string,_path:string,body:unknown)=>{seen.push(body);throw new Error('response lost');});
        const first=new CpuPracticeClient('Alice',settings,send,saved);
        await expect(first.hint(2)).rejects.toThrow('response lost');
        const reopened=new CpuPracticeClient('Alice',settings,send,saved);
        await expect(reopened.hint(2)).rejects.toThrow('response lost');
        expect(reopened.sessionId).toBe(first.sessionId);expect(seen[1]).toEqual(seen[0]);
        expect(Object.keys(seen[0] as object).sort()).toEqual(['requestId','revision']);
        await expect(reopened.hint(3)).rejects.toThrow();expect(seen[2]).not.toEqual(seen[0]);
        const other=new CpuPracticeClient('Bob',settings,send,saved);expect(other.sessionId).not.toBe(first.sessionId);
    });
    it('uses a read-only receipt endpoint for recovery without a debit payload',async()=>{
        const saved=storage();let client:CpuPracticeClient;
        const move={fromRow:6,fromCol:0,toRow:5,toCol:0};
        const send=vi.fn(async (_user:string,path:string,body:unknown)=>path.endsWith('/hints')?
            Promise.reject(new Error('lost')):{sessionId:client.sessionId,revision:0,rulesVersion:CPU_PRACTICE_RULES_VERSION,
                deliveryState:'paid_retrievable',hint:move});
        client=new CpuPracticeClient('Alice',settings,send,saved);
        await expect(client.hint(0)).rejects.toThrow();expect(await client.recover(0)).toEqual(move);
        expect(send.mock.calls[1][1]).toContain('/hints/0/');expect(send.mock.calls[1][2]).toBeUndefined();
    });
    it('keeps the release gate OFF and excludes ranked, online and campaign hint UI',()=>{
        expect(CPU_HINT_TICKETS_ENABLED).toBe(false);expect(officialCpuPractice({})).toBe(true);
        for(const props of [{roomId:'private'}, {matchMode:'ranked'}, {matchMode:'random'}, {campaignLabel:'Circuit'},
            {onComplete:()=>{}},{cpuPersonality:'balanced'},{cpuSearchProfile:{}},{onlineRole:'spectator'}]) {
            expect(officialCpuPractice(props)).toBe(false);
        }
    });
    it('replays both sides with identical movement, candidates, capture and last-move state',()=>{
        let state=createInitialState();let display=positionForDisplay(state);
        const history:ReturnType<typeof displayCpuPractice>['history']=[];
        const moves=[];
        for(let ply=0;ply<12;ply++){
            const legal=getAllConcreteMoves(state);if(!legal.length||state.winner)break;
            const move=legal[(ply*7)%legal.length];const legacy=quantumToLegacyMove(move,state);
            const local=applyLocalMove(display.tokens,display.pool,legacy,state.sideToMove,history);
            const next=applyPracticeMove(state,move);moves.push(next.lastMove!);
            expect(local.state.pieces).toEqual(next.pieces);expect(local.state.captured).toEqual(next.captured);
            const snapshot={sessionId:crypto.randomUUID(),userId:'Alice',kind:'cpu_practice',rulesVersion:CPU_PRACTICE_RULES_VERSION,
                playerSide:'white',level:1,seconds:600,revision:moves.length,stateHash:'hash',state:next,history:[...moves],
                status:'active',whiteMs:600000,blackMs:600000} as CpuPracticeSnapshot;
            const restored=displayCpuPractice(snapshot);
            const rebuilt=legacyToQuantumState(restored.tokens,restored.pool,next.sideToMove,moves.length,restored.history.at(-1)??null);
            expect(rebuilt.pieces).toEqual(next.pieces);expect(rebuilt.lastMove).toEqual(next.lastMove);
            history.splice(0,history.length,...restored.history);state=next;display=restored;
        }
        expect(moves.length).toBeGreaterThan(4);
    });
});
