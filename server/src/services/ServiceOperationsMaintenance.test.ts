import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createServiceOperations,type ServiceStatus} from './ServiceOperations';
import {MatchmakingService} from '../matchmaking/MatchmakingService';
import {RankedAdmissionCoordinator} from './RankedAdmissionCoordinator';
import type {RankedAdmissionStore,AdmissionOutcome} from './RankedAdmissionStore';

const before=Date.parse('2026-10-13T01:59:59.999Z');
const stopped=before+1;
const status:ServiceStatus={maintenance:false,minimumAndroidBuild:0,minimumProtocol:0,announcement:{},revision:'fixture'};
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return{promise,resolve};}
async function fixture(kind:'free'|'ranked'|'shared'|'cpu'){
    const emitted=vi.fn(),io={emit:vi.fn(),to:()=>({emit:emitted}),sockets:{sockets:new Map()}};
    const operations=createServiceOperations(async()=>({...status}));await operations.read();
    const mm=new MatchmakingService(io as never,kind==='ranked'||kind==='cpu',kind==='shared');
    mm.newMatchError=operations.newMatchError;
    mm.registerSocket('Alice','a');mm.registerSocket('Bob','b');
    mm.joinQueue('Alice',600,'Alice',kind==='ranked'||kind==='cpu'?'ranked':'random',1000);
    const match=kind==='cpu'?mm.takeCpuFallbacks(Date.now()+10000)[0]:mm.joinQueue('Bob',600,'Bob',kind==='ranked'?'ranked':'random',1000).match!;
    const store:RankedAdmissionStore={renew:vi.fn(async()=>true),admit:vi.fn(async()=>({state:'active'})),
        void:vi.fn(async()=>({state:'voided'})),recover:vi.fn(async()=>[]),read:vi.fn(async()=>null),busy:vi.fn(async()=>false)};
    const started=vi.fn(),notify=vi.fn();
    const coordinator=new RankedAdmissionCoordinator(mm,store,started,notify,{wall:Date.now,mono:Date.now});
    return{mm,match,store,started,notify,coordinator,operations,emitted};
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(before);});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});
describe('maintenance final engine admission',()=>{
    it.each(['ranked','shared','cpu'] as const)('voids %s durable admission completed after maintenance starts',async kind=>{
        const f=await fixture(kind),db=deferred<AdmissionOutcome>();
        vi.mocked(f.store.admit).mockReturnValue(db.promise);
        f.mm.connectMatch('Alice',f.match.matchId);
        if(kind!=='cpu')f.mm.connectMatch('Bob',f.match.matchId);
        const pending=f.coordinator.begin(f.match);await flush();
        expect(f.store.admit).toHaveBeenCalledOnce();expect(f.match.engine).toBeUndefined();
        vi.setSystemTime(stopped);db.resolve({state:'active'});await pending;
        expect(f.store.void).toHaveBeenCalledOnce();
        expect(f.store.void).toHaveBeenCalledWith(f.match.matchId,f.coordinator.ownerId,'MAINTENANCE');
        expect(f.match.state).toBe('CANCELLED');expect(f.match.engine).toBeUndefined();expect(f.started).not.toHaveBeenCalled();
    });
    it('cancels an uncharged private match instead of constructing an engine',async()=>{
        const f=await fixture('free');f.mm.registerSocket('Carol','c');f.mm.registerSocket('Dave','d');
        f.mm.connectMatch('Carol','private-room');
        vi.setSystemTime(stopped);const result=f.mm.connectMatch('Dave','private-room');
        expect(result.match?.state).toBe('CANCELLED');expect(result.engine).toBeUndefined();
        expect(f.emitted).toHaveBeenCalledWith('match_cancelled',{matchId:'private-room',reason:'MAINTENANCE'});
        expect(f.store.void).not.toHaveBeenCalled();
    });
    it('allows a started game and reconnect through the schedule boundary',async()=>{
        const f=await fixture('free');f.mm.connectMatch('Alice',f.match.matchId);f.mm.connectMatch('Bob',f.match.matchId);
        const engine=f.match.engine;expect(engine).toBeDefined();
        vi.setSystemTime(stopped);f.mm.removeSocket('a');f.mm.registerSocket('Alice','a2');
        const result=f.mm.connectMatch('Alice',f.match.matchId);
        expect(result.success).toBe(true);expect(result.engine).toBe(engine);expect(f.match.state).toBe('IN_GAME');
        expect(f.store.void).not.toHaveBeenCalled();
    });
    it('fails closed for an expired manual-state cache before engine creation',async()=>{
        vi.setSystemTime(Date.parse('2026-10-13T05:01:00Z'));const f=await fixture('free');
        f.mm.connectMatch('Alice',f.match.matchId);vi.setSystemTime(Date.now()+5001);f.mm.connectMatch('Bob',f.match.matchId);
        expect(f.match.engine).toBeUndefined();expect(f.match.state).toBe('CANCELLED');
        expect(f.emitted).toHaveBeenCalledWith('match_cancelled',{matchId:f.match.matchId,reason:'SERVICE_UNAVAILABLE'});
    });
    it('does not restart a voided admission when the schedule ends',async()=>{
        const f=await fixture('shared');f.mm.connectMatch('Alice',f.match.matchId);f.mm.connectMatch('Bob',f.match.matchId);
        vi.setSystemTime(stopped);await f.coordinator.begin(f.match);
        vi.setSystemTime(Date.parse('2026-10-13T05:00:00Z'));await f.operations.read();await f.coordinator.begin(f.match);
        expect(f.match.state).toBe('CANCELLED');expect(f.match.engine).toBeUndefined();expect(f.store.void).toHaveBeenCalledOnce();
    });
});
