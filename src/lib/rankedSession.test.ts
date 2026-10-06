import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { parseRankedSession } from './rankedSession';
import { cpuOpponent, ratingSettlement } from './rankedProtocol';
import { isRatedPlayer } from './onlineRatings';

describe('ranked proof and server receipts',()=>{
    it('rejects expired, malformed, and guest sessions',()=>{
        const valid={token:'opaque-proof-value',userId:'alice',expiresAt:2000};
        expect(parseRankedSession(valid,1000)).toEqual(valid);
        expect(parseRankedSession(valid,2000)).toBeNull();
        expect(parseRankedSession({...valid,userId:'GUEST-1'},1000)).toBeNull();
        expect(parseRankedSession({...valid,expiresAt:Infinity},1000)).toBeNull();
        expect(parseRankedSession({...valid,token:'x'},1000)).toBeNull();
    });
    it('accepts only the current player’s matching match receipt',()=>{
        const receipt={matchId:'m1',userId:'alice',before:1000,after:1016,delta:16,timeControl:180};
        expect(ratingSettlement(receipt,'m1','alice')).toEqual(receipt);
        expect(ratingSettlement(receipt,'m2','alice')).toBeNull();
        expect(ratingSettlement(receipt,'m1','bob')).toBeNull();
        expect(ratingSettlement({...receipt,delta:99},'m1','alice')).toBeNull();
        expect(ratingSettlement({...receipt,after:NaN},'m1','alice')).toBeNull();
        expect(ratingSettlement({...receipt,timeControl:30},'m1','alice')).toBeNull();
        expect(ratingSettlement({...receipt,before:1000,after:984,delta:-16},'m1','alice')?.delta).toBe(-16);
    });
    it('validates explicit CPU designation',()=>{
        expect(isRatedPlayer('ai:match-1')).toBe(false);
        expect(cpuOpponent({side:'joiner',rating:1000,level:1})).toEqual({side:'joiner',rating:1000,level:1});
        expect(cpuOpponent({side:'human',rating:1000})).toBeUndefined();
        expect(cpuOpponent({side:'host',rating:-1})).toBeUndefined();
    });
});

describe('explicit session storage choice',()=>{
    const key='qg_ranked_session_v1';
    const values=new Map<string,string>();
    const localValues=new Map<string,string>();
    const proofFor=(userId='alice',token='synthetic-proof-value')=>({token,userId,expiresAt:Date.now()+60000});
    beforeEach(()=>{
        vi.resetModules();values.clear();localValues.clear();
        vi.stubGlobal('window',new EventTarget());
        vi.stubGlobal('sessionStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});
        vi.stubGlobal('localStorage',{getItem:(key:string)=>localValues.get(key)??null,setItem:(key:string,value:string)=>localValues.set(key,value),removeItem:(key:string)=>localValues.delete(key)});
        vi.stubEnv('NEXT_PUBLIC_SERVER_URL','http://127.0.0.1:3001');
    });
    afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
    it('stores only the matching proof and emits a change event',async()=>{
        const proof={token:'opaque-proof-value',userId:'alice',expiresAt:Date.now()+60000};
        const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(proof),{status:200}));vi.stubGlobal('fetch',fetcher);
        const {requestRankedSession,readRankedSession,RANKED_SESSION_EVENT}=await import('./rankedSession');
        const changed=vi.fn();window.addEventListener(RANKED_SESSION_EVENT,changed);
        await requestRankedSession('alice','not-retained',false);
        expect(readRankedSession('alice')).toEqual(proof);expect(readRankedSession('bob')).toBeNull();
        expect([...values.values()].join('')).not.toContain('not-retained');expect(changed).toHaveBeenCalledOnce();
        expect(fetcher.mock.calls[0][1]).toMatchObject({method:'POST',credentials:'omit',cache:'no-store',redirect:'error'});
    });
    it('does not persist a mismatched identity',async()=>{
        vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({token:'opaque-proof-value',userId:'bob',expiresAt:Date.now()+60000}))));
        const {requestRankedSession}=await import('./rankedSession');
        await expect(requestRankedSession('alice','password',false)).rejects.toThrow();expect(values.size).toBe(0);
    });
    it.each([true,false])('replaces the old proof when keepLoggedIn changes from %s',async(initialPersistence)=>{
        const oldProof=proofFor('alice','synthetic-old-proof-value');
        const newProof={...proofFor('alice','synthetic-new-proof-value'),expiresAt:Date.now()+30000};
        const fetcher=vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify(oldProof)))
            .mockResolvedValueOnce(new Response(JSON.stringify(newProof)));
        vi.stubGlobal('fetch',fetcher);
        const {requestRankedSession,readRankedSession,RANKED_SESSION_EVENT}=await import('./rankedSession');
        const changed=vi.fn();window.addEventListener(RANKED_SESSION_EVENT,changed);

        await requestRankedSession('alice','synthetic-password',initialPersistence);
        expect((initialPersistence?localValues:values).get(key)).toBe(JSON.stringify(oldProof));
        await requestRankedSession('alice','synthetic-password',!initialPersistence);

        const chosen=initialPersistence?values:localValues;
        const opposite=initialPersistence?localValues:values;
        expect(chosen.get(key)).toBe(JSON.stringify(newProof));
        expect(opposite.has(key)).toBe(false);
        expect(readRankedSession('alice')).toEqual(newProof);
        expect([...chosen.values()].join('')).not.toContain('synthetic-password');
        expect(changed).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({keepLoggedIn:!initialPersistence});

        // Reloading the module must not make a removed old token authoritative.
        vi.resetModules();
        const reloaded=await import('./rankedSession');
        expect(reloaded.readRankedSession('alice')).toEqual(newProof);
        values.clear(); // A new browser session no longer has sessionStorage.
        expect(reloaded.readRankedSession('alice')).toEqual(initialPersistence?null:newProof);
    });
    it.each([true,false])('switches users without leaving the previous account in either store (persistent=%s)',async(keepLoggedIn)=>{
        const previous=proofFor('alice','synthetic-previous-proof');
        values.set(key,JSON.stringify(previous));localValues.set(key,JSON.stringify(previous));
        const next=proofFor('bob','synthetic-next-user-proof');
        vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(next))));
        const {requestRankedSession,readRankedSession}=await import('./rankedSession');
        await requestRankedSession('bob','synthetic-password',keepLoggedIn);
        expect(readRankedSession('alice')).toBeNull();
        expect(readRankedSession('bob')).toEqual(next);
        expect((keepLoggedIn?values:localValues).size).toBe(0);
        expect((keepLoggedIn?localValues:values).get(key)).toBe(JSON.stringify(next));
    });
    it('prefers a matching tab proof over a legacy duplicate persistent proof',async()=>{
        const tab=proofFor('alice','synthetic-tab-proof-value');
        values.set(key,JSON.stringify(tab));
        localValues.set(key,JSON.stringify(proofFor('alice','synthetic-stale-proof-value')));
        const {readRankedSession}=await import('./rankedSession');
        expect(readRankedSession('alice')).toEqual(tab);
    });
    it.each(['corrupt','expired','malformed','other-user'])('does not let a %s persistent record mask a valid tab proof',async(kind)=>{
        const tab=proofFor();values.set(key,JSON.stringify(tab));
        const bad=kind==='corrupt'?'{':JSON.stringify({
            ...proofFor(kind==='other-user'?'bob':'alice'),
            ...(kind==='expired'?{expiresAt:Date.now()-1}:{}),
            ...(kind==='malformed'?{token:'short'}:{}),
        });
        localValues.set(key,bad);
        const {readRankedSession}=await import('./rankedSession');
        expect(readRankedSession('alice')).toEqual(tab);
        expect(readRankedSession('unrelated-user')).toBeNull();
    });
    it.each(['corrupt','expired','other-user'])('reads a valid persistent proof independently of a %s tab record',async(kind)=>{
        const persistent=proofFor();localValues.set(key,JSON.stringify(persistent));
        values.set(key,kind==='corrupt'?'{':JSON.stringify({
            ...proofFor(kind==='other-user'?'bob':'alice'),
            ...(kind==='expired'?{expiresAt:Date.now()-1}:{}),
        }));
        const {readRankedSession}=await import('./rankedSession');
        expect(readRankedSession('alice')).toEqual(persistent);
    });
    it.each(['localStorage','sessionStorage'] as const)('reads the other store independently when %s is blocked',async(blocked)=>{
        const proof=proofFor();
        (blocked==='localStorage'?values:localValues).set(key,JSON.stringify(proof));
        vi.stubGlobal(blocked,{getItem:()=>{throw new Error('Storage blocked');}});
        const {readRankedSession}=await import('./rankedSession');
        expect(readRankedSession('alice')).toEqual(proof);
        expect(readRankedSession('bob')).toBeNull();
    });
    it.each(['localStorage','sessionStorage'] as const)('reads the other store independently when %s is unavailable',async(blocked)=>{
        const proof=proofFor();
        (blocked==='localStorage'?values:localValues).set(key,JSON.stringify(proof));
        vi.stubGlobal(blocked,undefined);
        const {readRankedSession}=await import('./rankedSession');
        expect(readRankedSession('alice')).toEqual(proof);
    });
    it.each([true,false])('fails closed when the selected store rejects writing (persistent=%s)',async(keepLoggedIn)=>{
        const previous=proofFor('alice','synthetic-previous-proof');
        const issued=proofFor('alice','synthetic-not-stored-proof');
        localValues.set(key,JSON.stringify(previous));values.set(key,JSON.stringify(previous));
        const target=keepLoggedIn?localStorage:sessionStorage;
        target.setItem=()=>{throw new Error('Quota exceeded');};
        const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(issued)));
        vi.stubGlobal('fetch',fetcher);
        const {requestRankedSession,readRankedSession,RANKED_SESSION_EVENT}=await import('./rankedSession');
        const changed=vi.fn();window.addEventListener(RANKED_SESSION_EVENT,()=>changed(readRankedSession('alice')));
        await expect(requestRankedSession('alice','synthetic-password',keepLoggedIn)).rejects.toThrow('could not be stored');
        expect(values.size).toBe(0);expect(localValues.size).toBe(0);
        expect(readRankedSession('alice')).toBeNull();
        expect(changed).toHaveBeenCalledExactlyOnceWith(null);
        expect(fetcher.mock.calls.slice(1).some(([,options])=>options.headers.Authorization===`Bearer ${issued.token}`)).toBe(true);
    });
    it.each([true,false])('does not report success if the opposite store cannot be cleared (persistent=%s)',async(keepLoggedIn)=>{
        const previous=proofFor('alice','synthetic-uncleared-proof');
        const issued=proofFor('alice','synthetic-rejected-proof');
        localValues.set(key,JSON.stringify(previous));values.set(key,JSON.stringify(previous));
        const opposite=keepLoggedIn?sessionStorage:localStorage;
        opposite.removeItem=()=>{throw new Error('Removal blocked');};
        const set=vi.spyOn(keepLoggedIn?localStorage:sessionStorage,'setItem');
        const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(issued)));
        vi.stubGlobal('fetch',fetcher);
        const {requestRankedSession,readRankedSession}=await import('./rankedSession');
        await expect(requestRankedSession('alice','synthetic-password',keepLoggedIn)).rejects.toThrow('could not be stored');
        expect(set).not.toHaveBeenCalled();
        expect((keepLoggedIn?localValues:values).size).toBe(0);
        expect(readRankedSession('alice')).toBeNull();
        const revokedTokens=fetcher.mock.calls.slice(1).map(([,options])=>options.headers.Authorization);
        expect(revokedTokens).toEqual(expect.arrayContaining([`Bearer ${issued.token}`,`Bearer ${previous.token}`]));
    });
    it('does not extend the finite server expiry when restoring a proof',async()=>{
        const proof=proofFor();localValues.set(key,JSON.stringify(proof));
        const {readRankedSession}=await import('./rankedSession');
        expect(readRankedSession('alice')).toEqual(proof);
        localValues.set(key,JSON.stringify({...proof,expiresAt:Date.now()-1}));
        expect(readRankedSession('alice')).toBeNull();
    });
    it.each([true,false])('can explicitly log in again after a storage failure (persistent=%s)',async(keepLoggedIn)=>{
        const proof=proofFor();
        vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify(proof)))));
        vi.spyOn(keepLoggedIn?localStorage:sessionStorage,'setItem').mockImplementationOnce(()=>{throw new Error('Quota exceeded');});
        const {requestRankedSession,readRankedSession}=await import('./rankedSession');
        await expect(requestRankedSession('alice','synthetic-password',keepLoggedIn)).rejects.toThrow('could not be stored');
        expect(readRankedSession('alice')).toBeNull();
        await expect(requestRankedSession('alice','synthetic-password',keepLoggedIn)).resolves.toEqual(proof);
        expect(readRankedSession('alice')).toEqual(proof);
    });
    it('clears local proof immediately and requests server revocation on logout',async()=>{
        const proof={token:'opaque-proof-value',userId:'alice',expiresAt:Date.now()+60000};
        const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(proof))).mockResolvedValueOnce(new Response(null,{status:204}));
        vi.stubGlobal('fetch',fetcher);
        const {requestRankedSession,clearRankedSession,readRankedSession}=await import('./rankedSession');
        await requestRankedSession('alice','password',false);clearRankedSession();
        expect(readRankedSession('alice')).toBeNull();expect(values.size).toBe(0);
        expect(fetcher.mock.calls[1][0].pathname).toBe('/auth/ranked-session/revoke');
        expect(fetcher.mock.calls[1][1].headers).toEqual({Authorization:'Bearer opaque-proof-value'});
    });
    it('logout invalidates an in-flight credential response',async()=>{
        let release!:(value:Response)=>void;
        vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>new Promise(resolve=>{release=resolve;})));
        const {requestRankedSession,clearRankedSession}=await import('./rankedSession');
        const pending=requestRankedSession('alice','password',false);clearRankedSession();
        release(new Response(JSON.stringify({token:'opaque-proof-value',userId:'alice',expiresAt:Date.now()+60000})));
        await expect(pending).rejects.toThrow();expect(values.size).toBe(0);
    });
    it.each([true,false])('cancellation never replaces the existing proof (persistent=%s)',async(keepLoggedIn)=>{
        const previous=proofFor('alice','synthetic-existing-proof');
        localValues.set(key,JSON.stringify(previous));
        const issued=proofFor('alice','synthetic-cancelled-proof');
        const controller=new AbortController();
        let release!:(value:Response)=>void;
        vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>new Promise(resolve=>{release=resolve;})));
        const {requestRankedSession,readRankedSession,RANKED_SESSION_EVENT}=await import('./rankedSession');
        const changed=vi.fn();window.addEventListener(RANKED_SESSION_EVENT,changed);
        const pending=requestRankedSession('alice','synthetic-password',keepLoggedIn,controller.signal);
        controller.abort();release(new Response(JSON.stringify(issued)));
        await expect(pending).rejects.toThrow('could not be verified');
        expect(localValues.get(key)).toBe(JSON.stringify(previous));expect(values.size).toBe(0);
        expect(readRankedSession('alice')).toEqual(previous);expect(changed).not.toHaveBeenCalled();
    });
    it('a stale response cannot overwrite a newer user or persistence choice',async()=>{
        let release!:(value:Response)=>void;
        const newer=proofFor('bob','synthetic-newer-proof');
        vi.stubGlobal('fetch',vi.fn()
            .mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}))
            .mockResolvedValueOnce(new Response(JSON.stringify(newer))));
        const {requestRankedSession,readRankedSession}=await import('./rankedSession');
        const stale=requestRankedSession('alice','synthetic-password',true);
        await requestRankedSession('bob','synthetic-password',false);
        release(new Response(JSON.stringify(proofFor('alice','synthetic-stale-proof'))));
        await expect(stale).rejects.toThrow('could not be verified');
        expect(readRankedSession('bob')).toEqual(newer);expect(readRankedSession('alice')).toBeNull();
        expect(localValues.size).toBe(0);expect(values.get(key)).toBe(JSON.stringify(newer));
    });
    it('cancellation during response decoding never commits a proof',async()=>{
        let release!:(value:unknown)=>void;
        const controller=new AbortController();
        vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:()=>new Promise(resolve=>{release=resolve;})}));
        const {requestRankedSession}=await import('./rankedSession');
        const pending=requestRankedSession('alice','synthetic-password',true,controller.signal);
        await Promise.resolve();
        controller.abort();release(proofFor());
        await expect(pending).rejects.toThrow('could not be verified');
        expect(localValues.size).toBe(0);expect(values.size).toBe(0);
    });
    it('a mismatched response leaves existing storage and events unchanged',async()=>{
        const previous=proofFor('alice','synthetic-existing-proof');
        localValues.set(key,JSON.stringify(previous));
        vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(proofFor('bob')))));
        const {requestRankedSession,readRankedSession,RANKED_SESSION_EVENT}=await import('./rankedSession');
        const changed=vi.fn();window.addEventListener(RANKED_SESSION_EVENT,changed);
        await expect(requestRankedSession('alice','synthetic-password',false)).rejects.toThrow('could not be verified');
        expect(readRankedSession('alice')).toEqual(previous);expect(readRankedSession('bob')).toBeNull();
        expect(values.size).toBe(0);expect(changed).not.toHaveBeenCalled();
    });
    it('logout clears and revokes both legacy saved proofs, without duplicating token revocations',async()=>{
        const local=proofFor('alice','synthetic-local-proof');
        const session=proofFor('bob','synthetic-session-proof');
        localValues.set(key,JSON.stringify(local));values.set(key,JSON.stringify(session));
        const fetcher=vi.fn().mockResolvedValue(new Response(null,{status:204}));vi.stubGlobal('fetch',fetcher);
        const {clearRankedSession,readRankedSession}=await import('./rankedSession');
        clearRankedSession();
        expect(localValues.size).toBe(0);expect(values.size).toBe(0);
        expect(readRankedSession('alice')).toBeNull();expect(readRankedSession('bob')).toBeNull();
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(fetcher.mock.calls.map(([,options])=>options.headers.Authorization)).toEqual([
            `Bearer ${session.token}`,`Bearer ${local.token}`,
        ]);
        fetcher.mockClear();
        localValues.set(key,JSON.stringify(local));values.set(key,JSON.stringify(local));
        clearRankedSession();expect(fetcher).toHaveBeenCalledOnce();
    });
    it.each(['localStorage','sessionStorage'] as const)('logout clears the other store when %s removal is blocked',async(blocked)=>{
        const proof=proofFor();localValues.set(key,JSON.stringify(proof));values.set(key,JSON.stringify(proof));
        const broken=blocked==='localStorage'?localStorage:sessionStorage;
        broken.removeItem=()=>{throw new Error('Removal blocked');};
        vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('Offline')));
        const {clearRankedSession,readRankedSession}=await import('./rankedSession');
        expect(()=>clearRankedSession()).not.toThrow();
        expect((blocked==='localStorage'?values:localValues).size).toBe(0);
        expect(readRankedSession('alice')).toBeNull();
        await Promise.resolve();
    });
    it('refuses to send credentials to a nonlocal HTTP endpoint',async()=>{
        vi.stubEnv('NEXT_PUBLIC_SERVER_URL','http://example.invalid');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
        const {requestRankedSession}=await import('./rankedSession');
        await expect(requestRankedSession('alice','password',false)).rejects.toThrow('secure');expect(fetcher).not.toHaveBeenCalled();
    });
});
