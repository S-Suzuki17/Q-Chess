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
function fixture() {
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
    const coordinator=new RankedAdmissionCoordinator(mm,store,started,notify,clock);
    return {mm,match,io,store,coordinator,started,notify,ledger,clock,events};
}
async function activate(f:ReturnType<typeof fixture>) {
    await f.coordinator.begin(f.match);
    f.match.engine!.acknowledgeIntro('human');
    vi.advanceTimersByTime(250);
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
