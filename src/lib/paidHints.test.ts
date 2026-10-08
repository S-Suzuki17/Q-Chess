import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ proof: vi.fn(), session: vi.fn(), url: vi.fn(()=>'http://127.0.0.1:3218') }));
vi.mock('./rankedSession', () => ({ readRankedSession: auth.proof, gameServerUrl: auth.url }));
vi.mock('./supabaseClient', () => ({ supabase: { auth: { getSession: auth.session } } }));
import { PaidHintClient, readCrownHintRecovery, readMatchHintRecovery, readLastMatchHintRecovery, requestHintApi, type HintReceipt, type PaidHintContext } from './paidHints';
import { DAILY_LOGIN_REWARD_CHANGED_EVENT } from './dailyLoginRewards';
const storage = () => { const values=new Map<string,string>();return {values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}}; };
const context = (mode:'ranked'|'random'|'private'='ranked'):PaidHintContext => ({kind:'match',mode,matchId:'SAME-ROOM',contextId:crypto.randomUUID(),rulesVersion:'match-hint-v1'});
const receipt = (ctx:PaidHintContext, revision=0):HintReceipt => ({receiptId:crypto.randomUUID(),contextId:ctx.contextId,
    kind:ctx.kind,mode:ctx.mode,revision,stateHash:'server-state-hash',rulesVersion:ctx.rulesVersion,deliveryState:'paid_retrievable',
    hint:{fromRow:6,fromCol:0,toRow:5,toCol:0},move:{pieceId:'w_17',target:{row:5,col:0},chosenType:32}});
beforeEach(()=>{auth.proof.mockReturnValue({token:'local-proof'});auth.session.mockReset();auth.url.mockReturnValue('http://127.0.0.1:3218');});
afterEach(()=>vi.unstubAllGlobals());
describe('paid hint purchase identity and read-only recovery',()=>{
    it.each(['ranked','random','private'] as const)('persists before POST and reuses the lost-response identity in %s',async mode=>{
        const saved=storage(),ctx=context(mode),seen:unknown[]=[],paid=receipt(ctx);
        const send=vi.fn(async(_user:string,path:string,body:unknown)=>{
            seen.push(body);expect(saved.values.size).toBe(3);
            if(body!==undefined)throw new Error('reply lost');return paid;
        });
        const first=new PaidHintClient('Alice',ctx,send,saved);
        await expect(first.buy(0)).rejects.toThrow('reply lost');
        const reopened=new PaidHintClient('Alice',ctx,send,saved);
        await expect(reopened.buy(0)).rejects.toThrow('reply lost');expect(seen[1]).toEqual(seen[0]);
        expect(Object.keys(seen[0] as object).sort()).toEqual(['requestId','revision']);
        expect(await reopened.recover(0)).toEqual(paid);
        expect(send.mock.calls[2][1]).toBe(`/match-hints/${ctx.contextId}/0/${(seen[0] as {requestId:string}).requestId}`);
        expect(send.mock.calls[2][2]).toBeUndefined();
    });
    it('does not mint an ID or call an endpoint when there is nothing to recover',async()=>{
        const saved=storage(),send=vi.fn(),client=new PaidHintClient('Alice',context(),send,saved);
        expect(client.latestAttempt()).toBeNull();expect(await client.recover(0)).toBeNull();expect(send).not.toHaveBeenCalled();expect(saved.values.size).toBe(0);
    });
    it('coalesces double clicks before the first response, then retains the same ID for an explicit retry',async()=>{
        const ctx=context(),saved=storage(),paid=receipt(ctx);let complete!:(value:unknown)=>void;
        const send=vi.fn(()=>new Promise(resolve=>{complete=resolve;})),client=new PaidHintClient('Alice',ctx,send,saved);
        const first=client.buy(0),second=client.buy(0);expect(second).toBe(first);expect(send).toHaveBeenCalledOnce();
        complete(paid);await first;const previous=send.mock.calls[0];
        const retry=client.buy(0);expect(send.mock.calls[1]).toEqual(previous);complete(paid);await retry;
    });
    it('keeps the original context for recovery after the same private room gets a new game',async()=>{
        const saved=storage(),old=context('private'),fresh=context('private'),paid=receipt(old);
        const lost=vi.fn().mockRejectedValue(new Error('lost'));await expect(new PaidHintClient('Alice',old,lost,saved).buy(0)).rejects.toThrow();
        const send=vi.fn().mockResolvedValue(paid),current=new PaidHintClient('Alice',fresh,send,saved),attempt=current.latestAttempt()!;
        expect(attempt.contextId).toBe(old.contextId);expect(await current.recover(attempt.revision,undefined,attempt.contextId)).toEqual(paid);
        expect(send.mock.calls[0][1]).toContain(`/match-hints/${old.contextId}/`);
        expect(new PaidHintClient('Bob',fresh,send,saved).latestAttempt()).toBeNull();
    });
    it.each(['ranked','random','private'] as const)('retrieves a %s receipt with no live runtime or participant snapshot',async mode=>{
        const saved=storage(),ctx=context(mode),paid=receipt(ctx,4),lost=vi.fn().mockRejectedValue(new Error('lost'));
        await expect(new PaidHintClient('Alice',ctx,lost,saved).buy(4)).rejects.toThrow();
        const before=new Map(saved.values),pointer=readMatchHintRecovery('Alice','SAME-ROOM',mode,saved)!;
        expect(readLastMatchHintRecovery('Alice',saved)).toEqual(pointer);expect(readLastMatchHintRecovery('Bob',saved)).toBeNull();
        expect(readMatchHintRecovery('Bob','SAME-ROOM',mode,saved)).toBeNull();
        const send=vi.fn().mockResolvedValue(paid);
        expect(await new PaidHintClient('Alice',pointer.context,send,saved).recover(pointer.attempt.revision)).toEqual(paid);
        expect(send.mock.calls[0][1]).toBe(`/match-hints/${ctx.contextId}/4/${pointer.attempt.requestId}`);
        expect(send.mock.calls[0][2]).toBeUndefined();expect(saved.values).toEqual(before);
    });
    it('separates the Crown mutation run ID from its durable receipt context',async()=>{
        const ctx:PaidHintContext={kind:'crown',mode:'crown',runId:crypto.randomUUID(),contextId:crypto.randomUUID(),rulesVersion:'quantum-crown-v1'};
        const send=vi.fn().mockResolvedValue(receipt(ctx)),client=new PaidHintClient('Alice',ctx,send,storage());
        await client.buy(0);await client.recover(0);
        expect(send.mock.calls[0][1]).toBe(`/crown-hints/runs/${ctx.runId}/hints`);
        expect(send.mock.calls[1][1]).toContain(`/crown-hints/receipts/${ctx.contextId}/0/`);expect(send.mock.calls[1][2]).toBeUndefined();
    });
    it('recovers the previous Crown receipt after reload without opening a new run or writing IDs',async()=>{
        const saved=storage(),ctx:PaidHintContext={kind:'crown',mode:'crown',runId:crypto.randomUUID(),contextId:crypto.randomUUID(),rulesVersion:'quantum-crown-v1'};
        const lost=vi.fn().mockRejectedValue(new Error('lost'));
        await expect(new PaidHintClient('Alice',ctx,lost,saved).buy(8)).rejects.toThrow('lost');
        const before=new Map(saved.values),pointer=readCrownHintRecovery('Alice',saved)!;
        expect(pointer.context).toEqual(ctx);expect(pointer.attempt.revision).toBe(8);
        expect(readCrownHintRecovery('Bob',saved)).toBeNull();expect(readCrownHintRecovery('GUEST-Alice',saved)).toBeNull();
        const paid=receipt(ctx,8),send=vi.fn().mockResolvedValue(paid),reopened=new PaidHintClient('Alice',pointer.context,send,saved);
        expect(await reopened.recover(pointer.attempt.revision,undefined,pointer.attempt.contextId)).toEqual(paid);
        expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0][1]).toBe(`/crown-hints/receipts/${ctx.contextId}/8/${pointer.attempt.requestId}`);
        expect(send.mock.calls[0][2]).toBeUndefined();expect(saved.values).toEqual(before);
    });
    it('refuses a malformed or missing purchase association in a saved Crown pointer',async()=>{
        const saved=storage(),ctx:PaidHintContext={kind:'crown',mode:'crown',runId:crypto.randomUUID(),contextId:crypto.randomUUID(),rulesVersion:'quantum-crown-v1'};
        await new PaidHintClient('Alice',ctx,vi.fn().mockResolvedValue(receipt(ctx)),saved).buy(0);
        saved.values.delete(`qg_paid_hint_v1:Alice:${ctx.contextId}:0`);
        expect(()=>readCrownHintRecovery('Alice',saved)).toThrow('REQUEST_STORAGE_UNAVAILABLE');
        saved.values.set('qg_last_crown_hint_v1:Alice','{"runId":"invalid"}');
        expect(()=>readCrownHintRecovery('Alice',saved)).toThrow('REQUEST_STORAGE_UNAVAILABLE');
    });
    it('refuses to dispatch if saving or verifying the request ID fails',async()=>{
        for(const saved of [undefined,{getItem:()=>null,setItem:()=>{}},{getItem:()=>null,setItem:()=>{throw new Error('full');}},{getItem:()=> 'corrupt',setItem:()=>{}}]) {
            const send=vi.fn(),client=new PaidHintClient('Alice',context(),send,saved);
            expect(()=>client.buy(0)).toThrow('REQUEST_STORAGE_UNAVAILABLE');expect(send).not.toHaveBeenCalled();
        }
    });
    it.each(['contextId','kind','mode','revision','rulesVersion','stateHash','receiptId','deliveryState','hint','move'] as const)('rejects a mismatched or malformed %s without publishing a balance change',async field=>{
        const target=new EventTarget(),changes=vi.fn();target.addEventListener(DAILY_LOGIN_REWARD_CHANGED_EVENT,changes);vi.stubGlobal('window',target);
        const ctx=context(),value=receipt(ctx),invalid={...value,[field]:field==='revision'?1:field==='hint'?{...value.hint,toRow:8}:field==='move'?{...value.move,target:{row:4,col:0}}:field==='stateHash'?'':'wrong'};
        const client=new PaidHintClient('Alice',ctx,vi.fn().mockResolvedValue(invalid),storage());
        await expect(client.buy(0)).rejects.toThrow('HINT_RESPONSE_INVALID');await expect(client.recover(0)).rejects.toThrow('HINT_RESPONSE_INVALID');expect(changes).not.toHaveBeenCalled();
    });
    it('ignores a late receipt after cancellation, while preserving its ID for GET recovery',async()=>{
        const ctx=context(),saved=storage(),paid=receipt(ctx);let complete!:(value:unknown)=>void;
        const send=vi.fn(()=>new Promise(resolve=>{complete=resolve;})),client=new PaidHintClient('Alice',ctx,send,saved),controller=new AbortController();
        const pending=client.buy(0,controller.signal);controller.abort(new Error('closed'));complete(paid);
        await expect(pending).rejects.toThrow('closed');expect(client.latestAttempt()?.contextId).toBe(ctx.contextId);
    });
});
describe('existing credential transport, independently verified by the server',()=>{
    it('forwards a matching non-anonymous fallback credential without treating it as authorization',async()=>{
        auth.proof.mockReturnValue(null);auth.session.mockResolvedValue({data:{session:{access_token:'fallback',expires_at:Date.now()/1000+3600,user:{id:'Alice',is_anonymous:false}}},error:null});
        const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true})});vi.stubGlobal('fetch',fetcher);
        await requestHintApi('Alice','/match-hints/ROOM',{requestId:crypto.randomUUID(),revision:0});
        expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer fallback');
    });
    it('forwards only the credential and request contract with no cookies or cache',async()=>{
        const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true})});vi.stubGlobal('fetch',fetcher);
        await requestHintApi('Alice','/match-hints/ROOM',{requestId:crypto.randomUUID(),revision:2});
        expect(fetcher.mock.calls[0][1]).toMatchObject({method:'POST',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{Authorization:'Bearer local-proof'}});
        expect(auth.session).not.toHaveBeenCalled();
    });
    it.each(['different-user','anonymous','expired','missing'] as const)('never uses a %s fallback session for a paid request',async scenario=>{
        auth.proof.mockReturnValue(null);auth.session.mockResolvedValue({data:{session:scenario==='missing'?null:{access_token:'fallback',expires_at:scenario==='expired'?1:Date.now()/1000+3600,user:{id:scenario==='different-user'?'Bob':'Alice',is_anonymous:scenario==='anonymous'}}},error:null});
        const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);await expect(requestHintApi('Alice','/match-hints/ROOM',{})).rejects.toThrow('AUTH_REQUIRED');expect(fetcher).not.toHaveBeenCalled();
    });
    it('requires TLS away from localhost and propagates server errors without any free fallback',async()=>{
        const fetcher=vi.fn().mockResolvedValue({ok:false,json:async()=>({code:'TERMS_REQUIRED'})});vi.stubGlobal('fetch',fetcher);
        auth.url.mockReturnValue('http://game.example.com');await expect(requestHintApi('Alice','/match-hints/ROOM',{})).rejects.toThrow('HINT_STORE_UNAVAILABLE');expect(fetcher).not.toHaveBeenCalled();
        auth.url.mockReturnValue('http://127.0.0.1:3218');await expect(requestHintApi('Alice','/match-hints/ROOM',{})).rejects.toThrow('TERMS_REQUIRED');expect(fetcher).toHaveBeenCalledOnce();
    });
});
