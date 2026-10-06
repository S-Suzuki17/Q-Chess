import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const key='qg_ranked_session_v1';
const tab=new Map<string,string>(), local=new Map<string,string>();
let monotonic=100;
const serverNow=1_800_000_000_000;
const proof={userId:'Alice',token:'ranked_'+'a'.repeat(43),expiresAt:serverNow+60000};
const storage=(values:Map<string,string>)=>({getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)});
const status=(override:Record<string,unknown>={})=>new Response(JSON.stringify({userId:proof.userId,expiresAt:proof.expiresAt,serverNow,...override}));
async function fixture(persistent=true) {
    (persistent?local:tab).set(key,JSON.stringify(proof));
    const {createCircuitAccessStore}=await import('./circuitAccess');
    const {createLegacySessionRestoration}=await import('./legacySessionRestoration');
    const access=createCircuitAccessStore(),onState=vi.fn(),onVerified=vi.fn();
    return {access,onState,onVerified,runner:createLegacySessionRestoration({access,onState,onVerified})};
}
beforeEach(()=>{
    vi.resetModules();tab.clear();local.clear();monotonic=100;
    vi.stubGlobal('window',new EventTarget());vi.stubGlobal('performance',{now:()=>monotonic});
    vi.stubGlobal('localStorage',storage(local));vi.stubGlobal('sessionStorage',storage(tab));
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL','http://127.0.0.1:3001');
});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('verified legacy reload restoration',()=>{
    it.each([true,false])('grants only after server verification, preserving original storage and expiry (%s)',async persistent=>{
        let resolve!:(r:Response)=>void;
        const fetcher=vi.fn(()=>new Promise<Response>(done=>{resolve=done;}));vi.stubGlobal('fetch',fetcher);
        const f=await fixture(persistent);const pending=f.runner.retry();
        expect(f.onState).toHaveBeenLastCalledWith('checking');expect(f.access.getSnapshot().userId).toBeNull();
        resolve(status());await pending;
        expect(f.access.getSnapshot().userId).toBe('Alice');expect(f.onVerified).toHaveBeenCalledExactlyOnceWith('Alice');
        expect(f.onState).toHaveBeenLastCalledWith('valid');
        expect((persistent?local:tab).get(key)).toBe(JSON.stringify(proof));expect((persistent?tab:local).size).toBe(0);
        expect(fetcher.mock.calls[0]).toEqual([expect.objectContaining({pathname:'/auth/ranked-session/status'}),expect.objectContaining({method:'GET',credentials:'omit',cache:'no-store',redirect:'error',headers:{Authorization:`Bearer ${proof.token}`}})]);
    });
    it('503 then explicit retry retains the token and grants only on the later verified result',async()=>{
        const fetcher=vi.fn().mockResolvedValueOnce(new Response('',{status:503})).mockResolvedValueOnce(status());vi.stubGlobal('fetch',fetcher);
        const f=await fixture();await f.runner.retry();expect(f.onState).toHaveBeenLastCalledWith('unavailable');
        expect(local.get(key)).toBe(JSON.stringify(proof));expect(f.access.getSnapshot().userId).toBeNull();
        await f.runner.retry();expect(f.onState).toHaveBeenLastCalledWith('valid');expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it('retains saved login on network failure and avoids overlapping requests',async()=>{
        let reject!:(e:Error)=>void;const fetcher=vi.fn(()=>new Promise((_,fail)=>{reject=fail;}));vi.stubGlobal('fetch',fetcher);
        const f=await fixture();const pending=f.runner.retry();await f.runner.retry();expect(fetcher).toHaveBeenCalledOnce();
        reject(new Error('Offline'));await pending;expect(f.onState).toHaveBeenLastCalledWith('unavailable');expect(local.has(key)).toBe(true);
    });
    it('bounds headers and body decoding to 15 seconds without erasing the candidate',async()=>{
        vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:()=>new Promise(()=>{})}));
        const f=await fixture();const pending=f.runner.retry();await vi.advanceTimersByTimeAsync(15000);await pending;
        expect(f.onState).toHaveBeenLastCalledWith('unavailable');expect(local.has(key)).toBe(true);expect(vi.getTimerCount()).toBe(0);
    });
    it('401 is invalid, grants nothing, and never silently tries another saved account',async()=>{
        vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:401})));
        const f=await fixture(false);local.set(key,JSON.stringify({...proof,userId:'Bob',token:'ranked_'+'b'.repeat(43)}));
        await f.runner.retry();await f.runner.retry();expect(fetch).toHaveBeenCalledOnce();expect(f.onState).toHaveBeenLastCalledWith('invalid');expect(f.onVerified).not.toHaveBeenCalled();
    });
    it.each([{userId:'Bob'},{expiresAt:proof.expiresAt+1},{serverNow:Infinity},{serverNow:undefined},{serverNow:proof.expiresAt},{serverNow:proof.expiresAt-31*86400000},{token:proof.token}])('does not grant a malformed or mismatched result %j',async bad=>{
        vi.stubGlobal('fetch',vi.fn().mockResolvedValue(status(bad)));const f=await fixture();await f.runner.retry();
        expect(f.onState).toHaveBeenLastCalledWith('invalid');expect(f.onVerified).not.toHaveBeenCalled();expect(f.access.getSnapshot().userId).toBeNull();
    });
    it.each(['logout','new-login','proof-replaced','cancel'] as const)('ignores delayed success after %s',async action=>{
        let resolve!:(r:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(done=>{resolve=done;})));
        const f=await fixture();const pending=f.runner.retry();
        if(action==='logout')f.access.revoke();
        if(action==='new-login'){const n=f.access.beginAuthentication();f.access.grant({id:'Bob',name:'Bob',type:'registered'},n);}
        if(action==='proof-replaced')local.set(key,JSON.stringify({...proof,token:'ranked_'+'b'.repeat(43)}));
        if(action==='cancel')f.runner.cancel();
        resolve(status());await pending;expect(f.onVerified).not.toHaveBeenCalled();expect(f.access.getSnapshot().userId).toBe(action==='new-login'?'Bob':null);
    });
    it('new credential request invalidates restoration before its response returns',async()=>{
        let resolve!:(r:Response)=>void;
        vi.stubGlobal('fetch',vi.fn().mockImplementationOnce(()=>new Promise<Response>(done=>{resolve=done;})).mockRejectedValueOnce(new Error('Offline')));
        const f=await fixture();const pending=f.runner.retry();const {requestRankedSession}=await import('./rankedSession');
        await expect(requestRankedSession('Bob','synthetic-password',false)).rejects.toThrow();resolve(status());await pending;expect(f.onVerified).not.toHaveBeenCalled();
    });
    it('cached profile alone grants nothing and mismatched appearance cannot replace verified identity',async()=>{
        local.set('qg_last_user',JSON.stringify({id:'Bob',name:'Admin',type:'registered'}));
        const {createLegacySessionRestoration,restoredLegacyUser}=await import('./legacySessionRestoration');
        const {createCircuitAccessStore}=await import('./circuitAccess');const access=createCircuitAccessStore();
        const onVerified=vi.fn();vi.stubGlobal('fetch',vi.fn());
        const f=createLegacySessionRestoration({access,onVerified,onState:vi.fn()});await f.retry();
        expect(fetch).not.toHaveBeenCalled();expect(access.getSnapshot().userId).toBeNull();
        expect(restoredLegacyUser('Alice',{id:'Bob',name:'Admin',type:'registered'})).toEqual({id:'Alice',name:'Alice',type:'registered'});
    });
    it('blocked storage fails closed without network traffic',async()=>{
        vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('Blocked');}});vi.stubGlobal('sessionStorage',undefined);vi.stubGlobal('fetch',vi.fn());
        const {createLegacySessionRestoration}=await import('./legacySessionRestoration');const onState=vi.fn();const f=createLegacySessionRestoration({onState,onVerified:vi.fn()});
        await f.retry();expect(onState).toHaveBeenLastCalledWith('invalid');expect(fetch).not.toHaveBeenCalled();
    });
});

describe('server time and finite lifetime',()=>{
    it('restores despite a fast device clock, subtracts full roundtrip, and expires exactly',async()=>{
        vi.spyOn(Date,'now').mockReturnValue(serverNow+100*86400000);
        const {readRankedSession,readRankedSessionCandidate,rankedSessionRemainingMs}=await import('./rankedSession');
        vi.stubGlobal('fetch',vi.fn(async()=>{monotonic+=200;return status();}));const f=await fixture();
        expect(readRankedSession('Alice')).toBeNull();expect(readRankedSessionCandidate()).toEqual(proof);
        await f.runner.retry();expect(readRankedSession('Alice')).toEqual(proof);expect(rankedSessionRemainingMs(proof)).toBe(59800);
        monotonic=60100;expect(readRankedSession('Alice')).toBeNull();vi.mocked(Date.now).mockReturnValue(serverNow-99999999);expect(readRankedSession('Alice')).toBeNull();
    });
    it('fails closed when the monotonic clock resets and never resurrects the deadline',async()=>{
        const {acceptVerifiedRankedSession,rankedSessionRemainingMs}=await import('./rankedSession');
        expect(acceptVerifiedRankedSession(proof,serverNow,100)).toBe(true);monotonic=99;expect(rankedSessionRemainingMs(proof)).toBe(0);monotonic=120;expect(rankedSessionRemainingMs(proof)).toBe(0);
    });
    it('supports older login responses without metadata but rejects malformed metadata',async()=>{
        vi.spyOn(Date,'now').mockReturnValue(serverNow);const {requestRankedSession}=await import('./rankedSession');
        vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify(proof)))));await expect(requestRankedSession('Alice','synthetic',false)).resolves.toEqual(proof);
        for(const serverNow of [null,'bad',0,-1,Infinity]){
            vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify({...proof,serverNow})))));
            await expect(requestRankedSession('Alice','synthetic',false)).rejects.toThrow('could not be verified');
        }
    });
    it('uses server time for an explicit login on a fast clock',async()=>{
        vi.spyOn(Date,'now').mockReturnValue(serverNow+99999999);
        vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({...proof,serverNow}))));
        const {requestRankedSession,readRankedSession}=await import('./rankedSession');await requestRankedSession('Alice','synthetic',true);expect(readRankedSession('Alice')).toEqual(proof);
    });
});

describe('restored active-match navigation',()=>{
    it('requires the same cached/verified identity and a fresh valid match',async()=>{
        const {restoredOnlineMatch}=await import('./legacySessionRestoration');
        const match={roomId:'m1',userId:'Alice',role:'white',matchMode:'ranked',timestamp:1000,tc:'3m'};
        expect(restoredOnlineMatch('Alice',{id:'Alice'},match,1100)).toEqual({roomId:'m1',role:'white',matchMode:'ranked',tc:'3m'});
        for(const [cached,value] of [[{id:'Bob'},match],[{id:'Alice'},{...match,userId:'Bob'}],[{id:'Alice'},{...match,role:'bogus'}],[{id:'Alice'},{...match,timestamp:1200}],[{id:'Alice'},{...match,timestamp:1100-900000}]])expect(restoredOnlineMatch('Alice',cached,value,1100)).toBeNull();
    });
    it('uses wall elapsed time conservatively when monotonic time pauses during sleep',async()=>{
        const clock=vi.spyOn(Date,'now').mockReturnValue(serverNow);
        const {acceptVerifiedRankedSession,rankedSessionRemainingMs}=await import('./rankedSession');
        expect(acceptVerifiedRankedSession(proof,serverNow,100)).toBe(true);clock.mockReturnValue(serverNow+60000);
        expect(rankedSessionRemainingMs(proof)).toBe(0);
    });
});

it('cancels promptly even if a transport ignores abort, with no retry timer left',async()=>{
    vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})));
    const f=await fixture();const pending=f.runner.retry();f.runner.cancel();await pending;
    expect(vi.getTimerCount()).toBe(0);expect(f.onVerified).not.toHaveBeenCalled();
});
