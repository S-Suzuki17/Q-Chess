import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {MatchmakingService} from '../matchmaking/MatchmakingService';
import {RankedAdmissionCoordinator} from './RankedAdmissionCoordinator';
import {createRankedAdmissionStore,type RankedAdmissionStore,type AdmissionOutcome} from './RankedAdmissionStore';
import {sharedMatchAdmissionEnabled,sharedMatchAdmissionRecoveryEnabled,verifiedMatchAdProviderEnabled,sharedMatchEntitlementEnabled} from './SharedMatchFeatureGates';
import {parseSharedMatchChoice,parseSharedMatchEntitlement} from '../protocol/SharedMatchAdmission';
import {RankedRuntime} from '../game/RankedRuntime';
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
function fixture(mode:'random'|'ranked'='random') {
    const io={emit:vi.fn(),to:()=>({emit:vi.fn()}),sockets:{sockets:new Map()}};
    const mm=new MatchmakingService(io as never,false,true);
    mm.registerSocket('Alice','a');mm.registerSocket('Bob','b');
    mm.joinQueue('Alice',600,'Alice',mode,1000);
    const match=mm.joinQueue('Bob',600,'Bob',mode,1000).match!;
    mm.connectMatch('Alice',match.matchId);mm.connectMatch('Bob',match.matchId);
    const store:RankedAdmissionStore={renew:vi.fn(async()=>true),admit:vi.fn(async()=>({state:'active'})),
        void:vi.fn(async()=>({state:'voided'})),recover:vi.fn(async()=>[]),read:vi.fn(async()=>null),busy:vi.fn(async()=>false),
        choice:vi.fn(async()=>crypto.randomUUID()),finishOnline:vi.fn(async()=>({state:'settled'}))};
    const started=vi.fn(),notify=vi.fn(),check=vi.fn(async()=>true);
    const coordinator=new RankedAdmissionCoordinator(mm,store,started,notify,{wall:Date.now,mono:Date.now},undefined,check);
    return {io,mm,match,store,started,notify,check,coordinator};
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(1_000_000);});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllEnvs();});
describe('shared online/ranked admission',()=>{
    it.each([undefined,'false','TRUE','1',''])('requires an explicit true entitlement flag, received %s',value=>{
        vi.stubEnv('SHARED_MATCH_ENTITLEMENT_ENABLED',value);
        expect(sharedMatchEntitlementEnabled()).toBe(false);
        vi.stubEnv('SHARED_MATCH_ADMISSION_ENABLED','true');
        expect(sharedMatchAdmissionEnabled()).toBe(false);
    });
    it('releases shared admission only with both runtime switches while provider ads stay closed',()=>{
        vi.stubEnv('SHARED_MATCH_ENTITLEMENT_ENABLED','true');
        vi.stubEnv('SHARED_MATCH_ADMISSION_ENABLED','false');
        expect(sharedMatchEntitlementEnabled()).toBe(true);expect(sharedMatchAdmissionEnabled()).toBe(false);
        vi.stubEnv('SHARED_MATCH_ADMISSION_ENABLED','true');
        expect(sharedMatchAdmissionEnabled()).toBe(true);expect(sharedMatchAdmissionRecoveryEnabled()).toBe(true);
        vi.stubEnv('VERIFIED_MATCH_AD_PROVIDER_ENABLED','true');expect(verifiedMatchAdProviderEnabled()).toBe(false);
    });
    it('keeps recovery and paid no-ad reads available when new shared admissions are paused',()=>{
        vi.stubEnv('SHARED_MATCH_ENTITLEMENT_ENABLED','true');vi.stubEnv('SHARED_MATCH_ADMISSION_ENABLED','false');
        vi.stubEnv('SHARED_MATCH_ADMISSION_RECOVERY_ENABLED','true');
        expect(sharedMatchEntitlementEnabled()).toBe(true);expect(sharedMatchAdmissionEnabled()).toBe(false);
        expect(sharedMatchAdmissionRecoveryEnabled()).toBe(true);
        vi.stubEnv('SHARED_MATCH_ENTITLEMENT_ENABLED','false');expect(sharedMatchAdmissionRecoveryEnabled()).toBe(true);
    });
    it.each(['random','ranked'] as const)('%s has no engine before durable admission',async mode=>{
        const f=fixture(mode),db=deferred<AdmissionOutcome>();vi.mocked(f.store.admit).mockReturnValue(db.promise);
        const pending=f.coordinator.begin(f.match);await flush();expect(f.match.engine).toBeUndefined();
        db.resolve({state:'active'});await pending;expect(f.started).toHaveBeenCalledOnce();expect(f.match.state).toBe('IN_GAME');
    });
    it.each(['authentication','restriction','disconnect','cancel','deadline'] as const)('voids the commit-to-activation window on %s',async reason=>{
        const f=fixture(),db=deferred<AdmissionOutcome>();vi.mocked(f.store.admit).mockReturnValue(db.promise);
        const pending=f.coordinator.begin(f.match);await flush();
        if(reason==='authentication'||reason==='restriction')f.check.mockResolvedValue(false);
        if(reason==='disconnect')f.mm.removeSocket('a');
        if(reason==='cancel')void f.coordinator.cancel(f.match,'admission_cancelled');
        if(reason==='deadline')vi.advanceTimersByTime(15000);
        db.resolve({state:'active'});await pending;
        expect(f.store.void).toHaveBeenCalled();expect(f.match.state).toBe('CANCELLED');expect(f.match.engine).toBeUndefined();expect(f.started).not.toHaveBeenCalled();
    });
    it('rechecks synchronous restriction after the final asynchronous identity check',async()=>{
        const f=fixture();f.mm.canAdmitPlayer=()=>false;await f.coordinator.begin(f.match);
        expect(f.store.void).toHaveBeenCalled();expect(f.started).not.toHaveBeenCalled();
    });
    it('never issues ticket consent without explicit choice; both humans must choose',async()=>{
        const f=fixture();vi.mocked(f.store.admit).mockResolvedValueOnce({state:'choice_required',humanIds:['Alice','Bob']});
        await f.coordinator.begin(f.match);f.coordinator.tick();await flush();expect(f.store.admit).toHaveBeenCalledOnce();expect(f.store.choice).not.toHaveBeenCalled();
        await f.coordinator.choose(f.match,'Alice',{matchId:f.match.matchId,source:'ticket'});expect(f.store.admit).toHaveBeenCalledOnce();
        await f.coordinator.choose(f.match,'Bob',{matchId:f.match.matchId,source:'ticket'});expect(f.store.admit).toHaveBeenCalledTimes(2);expect(f.started).toHaveBeenCalledOnce();
        expect(await f.coordinator.choose(f.match,'Alice',{matchId:f.match.matchId,source:'ticket'})).toBe(false);
    });
    it('rechecks a database UTC rollover while already awaiting choice without host-day authority or automatic consent',async()=>{
        // The host clock deliberately stays in the middle of its own UTC day.
        // A separately modeled database day crosses midnight during the wait.
        const f=fixture();let databaseDay='2026-10-06';
        vi.mocked(f.store.admit).mockImplementation(async()=>databaseDay==='2026-10-06'
            ?{state:'choice_required',humanIds:['Alice','Bob']}:{state:'active'});
        await f.coordinator.begin(f.match);const deadline=f.match.createdAt+15000;
        vi.advanceTimersByTime(999);f.coordinator.tick();await flush();expect(f.store.admit).toHaveBeenCalledOnce();
        databaseDay='2026-10-07';vi.advanceTimersByTime(1);f.coordinator.tick();await flush();
        expect(f.store.admit).toHaveBeenCalledTimes(2);expect(f.started).toHaveBeenCalledOnce();
        expect(f.store.choice).not.toHaveBeenCalled();expect(f.match.admissionConsents).toBeUndefined();
        expect(f.match.createdAt+15000).toBe(deadline);
    });
    it('bounded choice rechecks preserve the original prestart timeout and never authorize tickets',async()=>{
        const f=fixture();vi.mocked(f.store.admit).mockResolvedValue({state:'choice_required',humanIds:['Alice']});
        await f.coordinator.begin(f.match);
        for(let i=0;i<15;i++){vi.advanceTimersByTime(1000);f.coordinator.tick();await flush();}
        expect(f.match.state).toBe('CANCELLED');expect(f.store.admit).toHaveBeenCalledTimes(15);
        expect(f.store.choice).not.toHaveBeenCalled();expect(f.notify.mock.calls.filter(([o])=>o.state==='choice_required')).toHaveLength(1);
    });
    it('reconnecting while awaiting choice replays the offer without authorizing or spending',async()=>{
        const f=fixture();vi.mocked(f.store.admit).mockResolvedValue({state:'choice_required',humanIds:['Alice']});
        await f.coordinator.begin(f.match);f.notify.mockClear();
        await f.coordinator.begin(f.match,true);
        expect(f.notify).toHaveBeenCalledWith({state:'choice_required',matchId:f.match.matchId,humanIds:['Alice']});
        expect(f.store.admit).toHaveBeenCalledOnce();expect(f.store.choice).not.toHaveBeenCalled();
    });
    it('cancel during consent issuance cannot resurrect the match',async()=>{
        const f=fixture();vi.mocked(f.store.admit).mockResolvedValue({state:'choice_required',humanIds:['Alice']});await f.coordinator.begin(f.match);
        const consent=deferred<string>();vi.mocked(f.store.choice!).mockReturnValue(consent.promise);
        const choose=f.coordinator.choose(f.match,'Alice',{matchId:f.match.matchId,source:'ticket'});
        await f.coordinator.cancel(f.match,'admission_cancelled');consent.resolve(crypto.randomUUID());expect(await choose).toBe(false);expect(f.started).not.toHaveBeenCalled();
    });
    it('shared random terminal receipt is retried and clears pending before ordinary history save',async()=>{
        const f=fixture();await f.coordinator.begin(f.match);const record=vi.fn(async()=>{});
        const runtime=new RankedRuntime(f.io as never,f.mm,vi.fn(),vi.fn(),record,f.coordinator);
        vi.mocked(f.store.finishOnline!).mockRejectedValueOnce(new Error('response lost'));
        f.match.engine!.forfeit('Alice');runtime.afterAction(f.match);await flush();expect(f.match.settlement).toBe('pending');
        vi.advanceTimersByTime(1000);runtime.tick();await flush();expect(f.match.admission?.state).toBe('settled');expect(f.match.settlement).toBe('saved');expect(record).toHaveBeenCalledOnce();
        await f.coordinator.cancel(f.match,'owner_unavailable');expect(f.store.void).not.toHaveBeenCalled();
    });
    it('strict source parsing rejects auto-spend and client ad flags',()=>{
        const matchId=crypto.randomUUID();expect(parseSharedMatchChoice({matchId,source:'ticket'})).toEqual({matchId,source:'ticket'});
        for(const extra of [{adViewed:true},{autoSpend:true},{grantId:crypto.randomUUID()}])expect(parseSharedMatchChoice({matchId,source:'ticket',...extra})).toBeNull();
        expect(parseSharedMatchChoice({matchId,source:'verified_ad',adViewed:true})).toBeNull();
    });
    it('malformed JSON choice sources return null without coercion or exceptions',()=>{
        const matchId=crypto.randomUUID();
        for(const source of [null,[],{},['ticket'],{toString:null},{toString:'ticket'},true,1]){
            expect(parseSharedMatchChoice({matchId,source})).toBeNull();
        }
        for(const input of [null,[],[null],{},true,1])expect(parseSharedMatchChoice(input)).toBeNull();
    });
    it('strict canonical plans separate unlimited/noAds from legacy',()=>{
        expect(parseSharedMatchEntitlement({plan:'legacy299',noAds:false,unlimitedOnlineRanked:false,periodEnd:null}).plan).toBe('legacy299');
        expect(()=>parseSharedMatchEntitlement({plan:'plus',noAds:false,unlimitedOnlineRanked:true,periodEnd:'2099-01-01'})).toThrow();
        expect(()=>parseSharedMatchEntitlement({plan:'free',noAds:true,unlimitedOnlineRanked:false,periodEnd:null})).toThrow();
    });
    it('shared adapter requires the shared protocol and passes only per-match server consent tokens',async()=>{
        const rpc=vi.fn(name=>({abortSignal:async()=>({data:name==='shared_match_admission_protocol_version'?1:name==='renew_ranked_server_lease'?true:{state:'active'},error:null})}));
        const store=createRankedAdmissionStore({rpc} as never,()=>true,()=>true,true),f=fixture();
        f.match.admissionConsents={Alice:crypto.randomUUID()};await store.renew('owner');await store.admit(f.match,'owner');
        expect(rpc).toHaveBeenCalledWith('admit_shared_match',expect.objectContaining({p_mode:'random',p_consents:f.match.admissionConsents}));
    });
});
