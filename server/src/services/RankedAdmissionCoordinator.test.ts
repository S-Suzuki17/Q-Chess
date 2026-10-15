import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { MatchmakingService } from '../matchmaking/MatchmakingService';
import { RankedRuntime } from '../game/RankedRuntime';
import { RankedAdmissionCoordinator } from './RankedAdmissionCoordinator';
import type { RankedAdmissionStore,AdmissionOutcome } from './RankedAdmissionStore';
import type { RankCpuWorkerResponse } from '../game/rankCpuWorker';
function deferred<T>() {
    let resolve!:(value:T)=>void,reject!:(value:Error)=>void;
    const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
    return {promise,resolve,reject};
}
async function flush() {for(let i=0;i<25;i++)await Promise.resolve();}
function fixture(onOwnerChange?: (state:'retired'|'recovered')=>void) {
    const events:{event:string;data:any}[]=[];
    const io={emit:vi.fn(),to:()=>({emit:(event:string,data:any)=>events.push({event,data})}),sockets:{sockets:new Map()}};
    const mm=new MatchmakingService(io as any,true);
    mm.registerSocket('human','socket');
    mm.joinQueue('human',600,'Human','ranked',1200);
    vi.advanceTimersByTime(60000);
    const [match]=mm.takeCpuFallbacks();
    mm.connectMatch('human',match.matchId,'Human',undefined,undefined,1);
    const ledger=new Map<string,AdmissionOutcome>();
    const store:RankedAdmissionStore={
        renew:vi.fn(async()=>true),
        admit:vi.fn(async m=>{
            const existing=ledger.get(m.matchId);
            if(existing)return {...existing,duplicate:true};
            const result:AdmissionOutcome={state:'active',success:true};
            ledger.set(m.matchId,result);return result;
        }),
        void:vi.fn(async id=>{
            const previous=ledger.get(id);
            if(previous?.state==='settled')return previous;
            const result:AdmissionOutcome={state:'voided',success:true};
            ledger.set(id,result);return result;
        }),
        recover:vi.fn(async()=>[]),read:vi.fn(async id=>ledger.get(id)??null),
        busy:vi.fn(async()=>[...ledger.values()].some(x=>x.state==='active')),
    };
    const started=vi.fn(),notify=vi.fn();
    const clock={mono:()=>Date.now(),wall:()=>Date.now()};
    const coordinator=new RankedAdmissionCoordinator(mm,store,started,notify,clock,undefined,undefined,onOwnerChange);
    return {mm,match,io,store,coordinator,started,notify,ledger,clock,events};
}
async function activate(f:ReturnType<typeof fixture>) {
    await f.coordinator.begin(f.match);
    f.match.engine!.acknowledgeIntro('human');
    vi.advanceTimersByTime(250);
}
function nextCpuMatch(f:ReturnType<typeof fixture>) {
    f.mm.registerSocket('next-human','next-socket');
    f.mm.joinQueue('next-human',600,'Next human','ranked',1200);
    vi.advanceTimersByTime(60000);
    const [match]=f.mm.takeCpuFallbacks();
    f.mm.connectMatch('next-human',match.matchId,'Next human',undefined,undefined,1);
    return match;
}
function nextHumanMatch(f:ReturnType<typeof fixture>) {
    f.mm.registerSocket('next-human','next-socket');f.mm.registerSocket('peer-human','peer-socket');
    f.mm.joinQueue('next-human',600,'Next human','ranked',1200);
    const match=f.mm.joinQueue('peer-human',600,'Peer human','ranked',1200).match!;
    f.mm.connectMatch('next-human',match.matchId);f.mm.connectMatch('peer-human',match.matchId);
    return match;
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(1_000_000);vi.spyOn(Math,'random').mockReturnValue(.2);});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();});
describe('durable ranked admission faults',()=>{
    it('disconnect while admitting cannot start a clock; reconnect activates the confirmed UUID once',async()=>{
        const f=fixture(),db=deferred<AdmissionOutcome>();
        vi.mocked(f.store.admit).mockReturnValue(db.promise);
        const admission=f.coordinator.begin(f.match);await flush();
        f.mm.removeSocket('socket');
        db.resolve({state:'active'});await admission;
        expect(f.match.engine).toBeUndefined();expect(f.started).not.toHaveBeenCalled();
        f.mm.registerSocket('human','replacement');
        f.mm.connectMatch('human',f.match.matchId);
        await f.coordinator.begin(f.match);
        expect(f.started).toHaveBeenCalledOnce();expect(f.store.admit).toHaveBeenCalledOnce();
        expect(f.match.engine!.getPublicState('human').clock.white).toBe(600000);
    });
    it('has no clock, engine, start or action before confirmed DB commit; reconnect shares one request',async()=>{
        const f=fixture(),db=deferred<AdmissionOutcome>();
        vi.mocked(f.store.admit).mockReturnValue(db.promise);
        const a=f.coordinator.begin(f.match),b=f.coordinator.begin(f.match);
        expect(a).toBe(b);await flush();
        expect(f.match.state).toBe('ADMITTING');
        expect(f.match.engine).toBeUndefined();expect(f.started).not.toHaveBeenCalled();
        expect(f.mm.accountBusy('human')).toBe(true);
        f.mm.connectMatch('human',f.match.matchId);
        vi.advanceTimersByTime(5000);expect(f.match.engine).toBeUndefined();
        db.resolve({state:'active',success:true});await a;
        expect(f.match.engine).toBeDefined();expect(f.started).toHaveBeenCalledOnce();
        expect(f.store.admit).toHaveBeenCalledOnce();
        expect(f.match.engine!.getPublicState('human').clock.white).toBe(600000);
    });
    it.each([false,true])('retries response loss (committed=%s) with the same UUID, never starts speculatively',async committed=>{
        const f=fixture();
        const original=f.store.admit;
        vi.mocked(f.store.admit).mockImplementationOnce(async m=>{
            if(committed)f.ledger.set(m.matchId,{state:'active',success:true});
            throw new Error('connection lost');
        }).mockImplementation(async m=>f.ledger.get(m.matchId)??{state:'active',success:true});
        await f.coordinator.begin(f.match);
        expect(f.started).not.toHaveBeenCalled();expect(f.match.engine).toBeUndefined();
        vi.advanceTimersByTime(1000);await f.coordinator.begin(f.match);
        expect(f.started).toHaveBeenCalledOnce();
        expect(vi.mocked(original).mock.calls.map(([m])=>m.matchId)).toEqual([f.match.matchId,f.match.matchId]);
    });
    it('insufficient admission releases both ready participants without an engine',async()=>{
        const f=fixture();
        vi.mocked(f.store.admit).mockResolvedValue({state:'rejected',reason:'INSUFFICIENT_FUNDS'});
        await f.coordinator.begin(f.match);
        expect(f.match.state).toBe('CANCELLED');expect(f.match.engine).toBeUndefined();
        expect(f.mm.accountBusy('human')).toBe(false);expect(f.started).not.toHaveBeenCalled();
        expect(f.notify).toHaveBeenCalledWith(expect.objectContaining({state:'rejected',reason:'INSUFFICIENT_FUNDS'}));
    });
    it.each(['42501','22023','23505'])('definitive admission SQL error %s cancels durably instead of retrying forever',async code=>{
        const f=fixture();
        vi.mocked(f.store.admit).mockRejectedValue({code,message:'database rejected admission'});
        await f.coordinator.begin(f.match);
        expect(f.store.void).toHaveBeenCalledWith(f.match.matchId,f.coordinator.ownerId,'admission_unavailable');
        expect(f.match.state).toBe('CANCELLED');expect(f.match.engine).toBeUndefined();
        expect(f.mm.accountBusy('human')).toBe(false);expect(f.started).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1500);f.coordinator.tick();await flush();
        expect(f.store.admit).toHaveBeenCalledOnce();
    });
    it('a rejected admission with a lost void response stays busy and retries only the tombstone',async()=>{
        const f=fixture();
        vi.mocked(f.store.admit).mockRejectedValue({code:'42501'});
        vi.mocked(f.store.void).mockRejectedValueOnce(new Error('void acknowledgement lost'));
        await f.coordinator.begin(f.match);
        expect(f.match.state).toBe('VOIDING');expect(f.mm.accountBusy('human')).toBe(true);
        expect(f.notify).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1000);f.coordinator.tick();await flush();
        expect(f.match.state).toBe('CANCELLED');expect(f.mm.accountBusy('human')).toBe(false);
        expect(f.store.admit).toHaveBeenCalledOnce();expect(f.store.void).toHaveBeenCalledTimes(2);
    });
    it('cancellation racing a committed admission waits for its void and never constructs an engine',async()=>{
        const f=fixture(),admit=deferred<AdmissionOutcome>(),refund=deferred<AdmissionOutcome>();
        vi.mocked(f.store.admit).mockReturnValue(admit.promise);
        vi.mocked(f.store.void).mockReturnValue(refund.promise);
        const pending=f.coordinator.begin(f.match);await flush();
        void f.coordinator.cancel(f.match,'admission_abandoned');
        admit.resolve({state:'active'});await flush();
        expect(f.match.state).toBe('VOIDING');expect(f.mm.accountBusy('human')).toBe(true);
        expect(f.match.engine).toBeUndefined();expect(f.notify).not.toHaveBeenCalled();
        refund.resolve({state:'voided'});await pending;
        expect(f.match.state).toBe('CANCELLED');expect(f.started).not.toHaveBeenCalled();
    });
    it.each(['reject','no-move','illegal','deadline'])('CPU %s freezes then durably voids; lost void response keeps account busy',async kind=>{
        const f=fixture();await activate(f);
        const runCpu=vi.fn(async()=> {
            if(kind==='reject'||kind==='deadline')throw new Error('CPU failed/deadline');
            return {version:0,move:kind==='no-move'?null:{pieceId:-1,toX:0,toY:0}};
        });
        const settle=vi.fn(),reply=deferred<AdmissionOutcome>();
        vi.mocked(f.store.void).mockReturnValueOnce(reply.promise);
        const runtime=new RankedRuntime(f.io as any,f.mm,settle,runCpu,undefined,f.coordinator);
        runtime.tick();await flush();
        expect(f.match.state).toBe('VOIDING');expect(f.mm.accountBusy('human')).toBe(true);
        expect(f.notify).not.toHaveBeenCalled();expect(settle).not.toHaveBeenCalled();
        const frozen=f.match.engine!.getPublicState('human').clock;
        vi.advanceTimersByTime(5000);
        expect(f.match.engine!.getPublicState('human').clock.white).toBe(frozen.white);
        reply.reject(new Error('void ack lost'));await flush();
        expect(f.mm.accountBusy('human')).toBe(true);
        vi.advanceTimersByTime(1000);f.coordinator.tick();await flush();
        expect(f.match.state).toBe('CANCELLED');expect(f.mm.accountBusy('human')).toBe(false);
        expect(f.store.void).toHaveBeenCalledTimes(2);
    });
    it('event loop stall past local expiry stops timeout, action, forfeit, public clock and stale CPU result',async()=>{
        const f=fixture();await activate(f);
        const cpu=deferred<RankCpuWorkerResponse>();
        const runtime=new RankedRuntime(f.io as any,f.mm,vi.fn(),()=>cpu.promise,undefined,f.coordinator);
        runtime.tick();await flush();
        vi.advanceTimersByTime(11000);
        const engine=f.match.engine!,before=engine.getPublicState('human');
        expect(engine.checkTimeout()).toBe(false);expect(engine.forfeit('human')).toBe(false);
        expect(engine.processAction({actionId:'late',version:0,playerId:'human',action:{type:'RESIGN',payload:{}}}).success).toBe(false);
        vi.advanceTimersByTime(2000);
        expect(engine.getPublicState('human').clock.white).toBe(before.clock.white);
        cpu.resolve({version:0,move:{pieceId:1,toX:0,toY:2}});await flush();
        expect(engine.getPublicState('human').moveCount).toBe(0);
        f.coordinator.tick();await flush();
        expect(f.match.state).toBe('CANCELLED');
        expect(engine.getPublicState('human').gameOver).toBeNull();
    });
    it('failed/late renewals retire the epoch immediately; wall rollback cannot extend monotonic authority',async()=>{
        const f=fixture();await activate(f);
        let mono=Date.now();
        f.clock.mono=()=>mono;
        vi.mocked(f.store.renew).mockRejectedValueOnce(new Error('renew failed'));
        await f.coordinator.renew();await flush();
        expect(f.coordinator.canAdvance(f.match)).toBe(false);
        const calls=vi.mocked(f.store.renew).mock.calls.length;
        await f.coordinator.renew();expect(f.store.renew).toHaveBeenCalledTimes(calls);
        const g=fixture();await activate(g);
        let monotonic=Date.now();g.clock.mono=()=>monotonic;
        monotonic+=11000;vi.setSystemTime(Date.now()-86400000);
        expect(g.coordinator.canAdvance(g.match)).toBe(false);
        vi.setSystemTime(Date.now()+86400000+5000);
        const frozen=g.match.engine!.getPublicState('human').clock.white;
        vi.setSystemTime(Date.now()+1000);
        expect(g.match.engine!.getPublicState('human').clock.white).toBe(frozen);
    });
    it('late renewal acknowledgement cannot bridge a lease gap',async()=>{
        const f=fixture();await activate(f);
        const reply=deferred<boolean>();vi.mocked(f.store.renew).mockReturnValue(reply.promise);
        const renewal=f.coordinator.renew();
        vi.advanceTimersByTime(11000);reply.resolve(true);
        expect(await renewal).toBe(false);await flush();expect(f.match.state).toBe('CANCELLED');
    });
    it('settlement committed before cancellation response is replayed, never reported as refunded',async()=>{
        const f=fixture();await activate(f);
        const result={timeControl:600,black:{userId:'human',before:1200,after:1216,delta:16}};
        f.ledger.set(f.match.matchId,{state:'settled',result});
        await f.coordinator.cancel(f.match,'owner_unavailable');
        expect(f.match.state).toBe('FINISHED');expect(f.match.settlement).toBe('saved');
        expect(f.notify).toHaveBeenCalledWith(expect.objectContaining({state:'settled',result}));
    });
    it('reconnect after restart reads durable final state without a new admission',async()=>{
        const f=fixture(),outcome:AdmissionOutcome={state:'voided',matchId:'old',humanIds:['human']};
        vi.mocked(f.store.read).mockResolvedValue(outcome);
        expect(await f.coordinator.reconnect('old','human')).toEqual(outcome);
        expect(f.store.admit).not.toHaveBeenCalled();expect(f.notify).toHaveBeenCalledWith(outcome);
    });
    it('lease loss during unresolved settlement voids and clears the durable/local busy state',async()=>{
        const f=fixture();await activate(f);
        const save=deferred<null>();
        const runtime=new RankedRuntime(f.io as any,f.mm,()=>save.promise,vi.fn(),undefined,f.coordinator);
        f.match.engine!.processAction({actionId:'resign',version:0,playerId:'human',action:{type:'RESIGN',payload:{}}});
        runtime.afterAction(f.match);
        expect(f.match.settlement).toBe('pending');
        await f.coordinator.cancel(f.match,'owner_unavailable');
        expect(f.match.state).toBe('CANCELLED');expect(f.match.settlement).toBeUndefined();
        save.resolve(null);await flush();
        expect(f.mm.accountBusy('human')).toBe(false);expect(runtime.isSavingAccount('human')).toBe(false);
        expect(f.events.some(e=>e.event==='rating_pending')).toBe(false);
    });
});

describe('ranked admission owner replacement',()=>{
    it('keeps a new match unbound during replacement backoff and starts it after fresh confirmation',async()=>{
        const f=fixture();await activate(f);const oldOwner=f.coordinator.ownerId;
        vi.mocked(f.store.renew).mockRejectedValueOnce(new Error('temporary renewal failure'));
        await f.coordinator.renew();await flush();const next=nextHumanMatch(f);
        await f.coordinator.begin(next);
        expect(next.state).toBe('ADMITTING');expect(next.admission).toBeUndefined();expect(next.engine).toBeUndefined();
        expect(f.store.void).toHaveBeenCalledOnce();expect(f.store.admit).toHaveBeenCalledOnce();
        vi.advanceTimersByTime(2999);f.coordinator.tick();await flush();expect(next.state).toBe('ADMITTING');
        vi.advanceTimersByTime(1);f.coordinator.tick();await flush();
        expect(f.coordinator.ownerId).not.toBe(oldOwner);expect(next.state).toBe('IN_GAME');expect(f.started).toHaveBeenCalledTimes(2);
        expect(next.admission?.ownerId).toBe(f.coordinator.ownerId);expect(f.store.void).toHaveBeenCalledOnce();
    });
    it('keeps a newly connected match pending while old-owner void confirmation is unavailable',async()=>{
        const f=fixture();await activate(f);const reply=deferred<AdmissionOutcome>();
        vi.mocked(f.store.void).mockReturnValueOnce(reply.promise);
        vi.mocked(f.store.renew).mockRejectedValueOnce(new Error('renew failed'));
        await f.coordinator.renew();await flush();const next=nextHumanMatch(f),createdAt=next.createdAt;
        vi.advanceTimersByTime(3000);await f.coordinator.begin(next);f.coordinator.tick();await flush();
        expect(next.state).toBe('ADMITTING');expect(next.admission).toBeUndefined();expect(next.createdAt).toBe(createdAt);
        reply.resolve({state:'voided'});await flush();f.coordinator.tick();await flush();
        expect(next.state).toBe('IN_GAME');expect(next.createdAt).toBe(createdAt);
    });
    it.each(['transport','rejected'] as const)('starts the next ranked match with a fresh owner after the prior match is durably voided (%s)',async failure=>{
        const f=fixture();await activate(f);const oldOwner=f.coordinator.ownerId;
        if(failure==='transport')vi.mocked(f.store.renew).mockRejectedValueOnce(new Error('temporary transport failure'));
        else vi.mocked(f.store.renew).mockResolvedValueOnce(false);
        expect(await f.coordinator.renew()).toBe(false);await flush();
        expect(f.match.state).toBe('CANCELLED');
        const frozen=f.match.engine!.getPublicState('human').clock.white;
        const next=nextCpuMatch(f);f.coordinator.tick();await flush();await f.coordinator.begin(next);
        expect(f.coordinator.ownerId).not.toBe(oldOwner);
        expect(f.store.renew).toHaveBeenLastCalledWith(f.coordinator.ownerId);
        expect(f.store.admit).toHaveBeenLastCalledWith(next,f.coordinator.ownerId);
        expect(next.state).toBe('IN_GAME');expect(f.started).toHaveBeenCalledTimes(2);
        expect(f.coordinator.canAdvance(f.match)).toBe(false);
        expect(f.match.engine!.getPublicState('human').clock.white).toBe(frozen);
        expect(f.match.engine!.processAction({actionId:'old-owner',version:0,playerId:'human',action:{type:'RESIGN',payload:{}}}).success).toBe(false);
    });
    it('recovers after the very first lease acquisition fails',async()=>{
        const f=fixture(),oldOwner=f.coordinator.ownerId;
        vi.mocked(f.store.renew).mockRejectedValueOnce(new Error('protocol temporarily unavailable'));
        await f.coordinator.begin(f.match);expect(f.match.state).toBe('CANCELLED');
        const next=nextCpuMatch(f);f.coordinator.tick();await flush();await f.coordinator.begin(next);
        expect(f.coordinator.ownerId).not.toBe(oldOwner);expect(next.state).toBe('IN_GAME');
        expect(f.store.void).toHaveBeenCalledWith(f.match.matchId,oldOwner,'owner_unavailable');
    });
    it('waits for a confirmed old-owner void before allocating another owner',async()=>{
        const f=fixture();await activate(f);const oldOwner=f.coordinator.ownerId,reply=deferred<AdmissionOutcome>();
        vi.mocked(f.store.void).mockReturnValueOnce(reply.promise);
        vi.mocked(f.store.renew).mockRejectedValueOnce(new Error('renew failed'));
        await f.coordinator.renew();await flush();vi.advanceTimersByTime(3000);f.coordinator.tick();await flush();
        expect(f.match.state).toBe('VOIDING');expect(f.coordinator.ownerId).toBe(oldOwner);
        expect(f.store.renew).toHaveBeenCalledTimes(2);
        reply.resolve({state:'voided'});await flush();f.coordinator.tick();await flush();
        expect(f.match.state).toBe('CANCELLED');expect(f.coordinator.ownerId).not.toBe(oldOwner);
        expect(f.store.renew).toHaveBeenCalledTimes(3);
    });
    it('waits for an old renewal acknowledgement and never revives that expired owner',async()=>{
        const f=fixture();await activate(f);const oldOwner=f.coordinator.ownerId,reply=deferred<boolean>();
        vi.mocked(f.store.renew).mockReturnValueOnce(reply.promise);
        const pending=f.coordinator.renew();vi.advanceTimersByTime(11000);f.coordinator.tick();await flush();
        expect(f.match.state).toBe('CANCELLED');expect(f.coordinator.ownerId).toBe(oldOwner);
        expect(f.store.renew).toHaveBeenCalledTimes(2);
        reply.resolve(true);expect(await pending).toBe(false);f.coordinator.tick();await flush();
        expect(f.coordinator.ownerId).not.toBe(oldOwner);expect(f.coordinator.canAdvance(f.match)).toBe(false);
        expect(f.store.renew).toHaveBeenLastCalledWith(f.coordinator.ownerId);
    });
    it('finishes an in-flight old admission with the old owner before replacing it',async()=>{
        const f=fixture(),oldOwner=f.coordinator.ownerId,reply=deferred<AdmissionOutcome>();
        vi.mocked(f.store.admit).mockReturnValueOnce(reply.promise);
        const pending=f.coordinator.begin(f.match);await flush();vi.advanceTimersByTime(11000);f.coordinator.tick();await flush();
        expect(f.match.state).toBe('VOIDING');expect(f.coordinator.ownerId).toBe(oldOwner);
        reply.resolve({state:'active'});await pending;
        expect(f.store.void).toHaveBeenCalledWith(f.match.matchId,oldOwner,'owner_unavailable');
        expect(f.match.engine).toBeUndefined();f.coordinator.tick();await flush();
        expect(f.coordinator.ownerId).not.toBe(oldOwner);expect(f.started).not.toHaveBeenCalled();
    });
    it('bounds replacement attempts during a continuing database outage',async()=>{
        const f=fixture();await activate(f);
        vi.mocked(f.store.renew).mockRejectedValue(new Error('database unavailable'));
        await f.coordinator.renew();await flush();const calls=vi.mocked(f.store.renew).mock.calls.length;
        vi.advanceTimersByTime(2999);f.coordinator.tick();await flush();expect(f.store.renew).toHaveBeenCalledTimes(calls);
        vi.advanceTimersByTime(1);f.coordinator.tick();await flush();expect(f.store.renew).toHaveBeenCalledTimes(calls+1);
        const attemptedOwner=f.coordinator.ownerId;
        for(let i=0;i<5;i++)f.coordinator.tick();await flush();expect(f.store.renew).toHaveBeenCalledTimes(calls+1);
        vi.advanceTimersByTime(3000);f.coordinator.tick();await flush();
        expect(f.store.renew).toHaveBeenCalledTimes(calls+2);expect(f.coordinator.ownerId).not.toBe(attemptedOwner);
    });
    it('keeps the retired owner when a void request failed, even after the request promise is cleared',async()=>{
        const f=fixture();await activate(f);const oldOwner=f.coordinator.ownerId;
        vi.mocked(f.store.void).mockRejectedValue(new Error('void acknowledgement unavailable'));
        vi.mocked(f.store.renew).mockRejectedValueOnce(new Error('renew failed'));
        await f.coordinator.renew();await flush();vi.advanceTimersByTime(3000);f.coordinator.tick();await flush();
        expect(f.match.state).toBe('VOIDING');expect(f.coordinator.ownerId).toBe(oldOwner);expect(f.store.renew).toHaveBeenCalledTimes(2);
        vi.mocked(f.store.void).mockResolvedValue({state:'voided'});vi.advanceTimersByTime(1000);f.coordinator.tick();await flush();
        f.coordinator.tick();await flush();expect(f.coordinator.ownerId).not.toBe(oldOwner);
    });
    it('replaces an expired idle owner before admitting a match that never belonged to it',async()=>{
        const f=fixture();await f.coordinator.renew();const oldOwner=f.coordinator.ownerId;
        vi.advanceTimersByTime(11000);f.coordinator.tick();await flush();
        expect(f.coordinator.ownerId).not.toBe(oldOwner);expect(f.match.state).toBe('IN_GAME');
        expect(f.store.admit).toHaveBeenCalledOnce();expect(f.store.admit).toHaveBeenCalledWith(f.match,f.coordinator.ownerId);
    });
    it('reports recovery only after the fresh owner is confirmed and ignores observer failures',async()=>{
        const observe=vi.fn(()=>{throw new Error('unavailable observer');}),f=fixture(observe);await activate(f);
        vi.mocked(f.store.renew).mockRejectedValueOnce(new Error('renew failed'));
        await f.coordinator.renew();await flush();expect(observe.mock.calls).toEqual([['retired']]);
        const reply=deferred<boolean>();vi.mocked(f.store.renew).mockReturnValueOnce(reply.promise);
        vi.advanceTimersByTime(3000);f.coordinator.tick();await flush();expect(observe.mock.calls).toEqual([['retired']]);
        reply.resolve(true);await flush();expect(observe.mock.calls).toEqual([['retired'],['recovered']]);
        const next=nextCpuMatch(f);f.coordinator.tick();await flush();await f.coordinator.begin(next);
        expect(next.state).toBe('IN_GAME');
    });
});
