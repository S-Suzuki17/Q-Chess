import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
const state=vi.hoisted(()=>({enabled:true,token:'ranked_fixture_token',oauth:null as unknown}));
vi.mock('../config/crownAdmission',()=>({crownAdmissionEnabled:()=>state.enabled,
    crownRankKey:(id:number)=>Number.isInteger(id)&&id>=1&&id<=100?`crown:stage:v1:${id}`:null}));
vi.mock('./rankedSession',()=>({gameServerUrl:()=> 'https://fixture.invalid',readRankedSession:()=>state.token?{token:state.token}:null}));
vi.mock('./supabaseClient',()=>({supabase:{auth:{getSession:async()=>({data:{session:state.oauth},error:null})}}}));
import {authorizeCrownStage,parseCrownAuthorization} from './crownAdmission';
const receipt={state:'authorized',userId:'Alice',rankKey:'crown:stage:v1:1',authorizationId:'00000000-0000-4000-8000-000000000001',source:'verified_ad',reused:true};
beforeEach(()=>{state.enabled=true;state.token='ranked_fixture_token';state.oauth=null;});
afterEach(()=>vi.unstubAllGlobals());
describe('Crown receipt transport',()=>{
    it('sends only stage ID to the authenticated server and binds its reply to account and stable rank',async()=>{
        const fetcher=vi.fn(async()=>new Response(JSON.stringify(receipt),{status:200}));vi.stubGlobal('fetch',fetcher);
        expect(await authorizeCrownStage('Alice',1)).toEqual(receipt);
        const [url,options]=fetcher.mock.calls[0] as unknown as [URL,RequestInit];
        expect(url.href).toBe('https://fixture.invalid/crown/first-attempt');expect(JSON.parse(options.body as string)).toEqual({stageId:1});
        expect(options.credentials).toBe('omit');expect(options.redirect).toBe('error');expect(options.cache).toBe('no-store');
        expect(options.headers).toEqual({Authorization:'Bearer ranked_fixture_token','Content-Type':'application/json'});
    });
    it('leaves unavailable release gates closed before network or credential lookup',async()=>{
        const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);state.enabled=false;
        await expect(authorizeCrownStage('Alice',1)).rejects.toThrow('FEATURE_DISABLED');expect(fetcher).not.toHaveBeenCalled();
    });
    it('rejects invalid stages and unrelated/anonymous OAuth sessions without a request',async()=>{
        const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
        await expect(authorizeCrownStage('Alice',0)).rejects.toThrow('INVALID_REQUEST');state.token='';
        for(const user of [{id:'Bob',is_anonymous:false},{id:'Alice',is_anonymous:true}]){
            state.oauth={user,access_token:'oauth_fixture'};
            await expect(authorizeCrownStage('Alice',1)).rejects.toThrow('AUTH_REQUIRED');
        }
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('discards a receipt if cancellation happens while decoding the response',async()=>{
        const controller=new AbortController();
        vi.stubGlobal('fetch',async()=>({ok:true,status:200,json:async()=>{controller.abort();return receipt;}}));
        await expect(authorizeCrownStage('Alice',1,controller.signal)).rejects.toThrow();
    });
    it('rejects forged/misbound receipts and never accepts adViewed as evidence',()=>{
        for(const value of [null,{},[],{...receipt,userId:'Bob'},{...receipt,rankKey:'other'},{...receipt,source:'adViewed'},
            {...receipt,authorizationId:''},{...receipt,reused:null},{state:'authorized',adViewed:true}]){
            expect(()=>parseCrownAuthorization(value,'Alice',receipt.rankKey)).toThrow('CROWN_UNAVAILABLE');
        }
        expect(parseCrownAuthorization({...receipt,secret:'hidden'},'Alice',receipt.rankKey)).not.toHaveProperty('secret');
        expect(parseCrownAuthorization({state:'reward_required',userId:'Alice',rankKey:receipt.rankKey},'Alice',receipt.rankKey).state).toBe('reward_required');
    });
});
