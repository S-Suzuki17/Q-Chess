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

describe('session-only credential exchange',()=>{
    const values=new Map<string,string>();
    beforeEach(()=>{
        vi.resetModules();values.clear();
        vi.stubGlobal('window',new EventTarget());
        vi.stubGlobal('sessionStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});
        vi.stubGlobal('localStorage',{setItem:()=>{throw new Error('Tokens must not use localStorage');}});
        vi.stubEnv('NEXT_PUBLIC_SERVER_URL','http://127.0.0.1:3001');
    });
    afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
    it('stores only the matching proof and emits a change event',async()=>{
        const proof={token:'opaque-proof-value',userId:'alice',expiresAt:Date.now()+60000};
        const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(proof),{status:200}));vi.stubGlobal('fetch',fetcher);
        const {requestRankedSession,readRankedSession,RANKED_SESSION_EVENT}=await import('./rankedSession');
        const changed=vi.fn();window.addEventListener(RANKED_SESSION_EVENT,changed);
        await requestRankedSession('alice','not-retained');
        expect(readRankedSession('alice')).toEqual(proof);expect(readRankedSession('bob')).toBeNull();
        expect([...values.values()].join('')).not.toContain('not-retained');expect(changed).toHaveBeenCalledOnce();
        expect(fetcher.mock.calls[0][1]).toMatchObject({method:'POST',credentials:'omit',cache:'no-store',redirect:'error'});
    });
    it('does not persist a mismatched identity',async()=>{
        vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({token:'opaque-proof-value',userId:'bob',expiresAt:Date.now()+60000}))));
        const {requestRankedSession}=await import('./rankedSession');
        await expect(requestRankedSession('alice','password')).rejects.toThrow();expect(values.size).toBe(0);
    });
    it('clears local proof immediately and requests server revocation on logout',async()=>{
        const proof={token:'opaque-proof-value',userId:'alice',expiresAt:Date.now()+60000};
        const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(proof))).mockResolvedValueOnce(new Response(null,{status:204}));
        vi.stubGlobal('fetch',fetcher);
        const {requestRankedSession,clearRankedSession,readRankedSession}=await import('./rankedSession');
        await requestRankedSession('alice','password');clearRankedSession();
        expect(readRankedSession('alice')).toBeNull();expect(values.size).toBe(0);
        expect(fetcher.mock.calls[1][0].pathname).toBe('/auth/ranked-session/revoke');
        expect(fetcher.mock.calls[1][1].headers).toEqual({Authorization:'Bearer opaque-proof-value'});
    });
    it('logout invalidates an in-flight credential response',async()=>{
        let release!:(value:Response)=>void;
        vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>new Promise(resolve=>{release=resolve;})));
        const {requestRankedSession,clearRankedSession}=await import('./rankedSession');
        const pending=requestRankedSession('alice','password');clearRankedSession();
        release(new Response(JSON.stringify({token:'opaque-proof-value',userId:'alice',expiresAt:Date.now()+60000})));
        await expect(pending).rejects.toThrow();expect(values.size).toBe(0);
    });
    it('refuses to send credentials to a nonlocal HTTP endpoint',async()=>{
        vi.stubEnv('NEXT_PUBLIC_SERVER_URL','http://example.invalid');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
        const {requestRankedSession}=await import('./rankedSession');
        await expect(requestRankedSession('alice','password')).rejects.toThrow('secure');expect(fetcher).not.toHaveBeenCalled();
    });
});
