import {describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createCrownAdmissionStore} from './CrownAdmissionStore';

const rank='crown:fixture:v1:rank1';
const result={state:'authorized',userId:'Alice',rankKey:rank,authorizationId:'00000000-0000-4000-8000-000000000001',source:'subscription',reused:true};
describe('Crown database adapter',()=>{
    it('dispatches the exact service RPC contract and keeps entitlement/debit decisions in SQL',async()=>{
        const abortSignal=vi.fn(async()=>({data:result,error:null})),rpc=vi.fn(()=>({abortSignal}));
        const store=createCrownAdmissionStore({rpc} as unknown as SupabaseClient);
        expect(await store.authorize('Alice',rank)).toEqual(result);
        expect(rpc).toHaveBeenCalledWith('authorize_crown_first_attempt',{
            p_authorization_id:expect.stringMatching(/^[0-9a-f-]{36}$/),p_user_id:'Alice',p_rank_key:rank,
        });
        expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    });
    it('refuses malformed identity, keys and already cancelled work before dispatch',async()=>{
        const rpc=vi.fn(),store=createCrownAdmissionStore({rpc} as unknown as SupabaseClient);
        await expect(store.authorize('GUEST-X',rank)).rejects.toThrow('INVALID_REQUEST');
        await expect(store.authorize('Alice','bad key')).rejects.toThrow('INVALID_REQUEST');
        const controller=new AbortController();controller.abort();
        await expect(store.authorize('Alice',rank,controller.signal)).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();
    });
    it('drops cancelled replies and never fabricates authorization on a database error',async()=>{
        const controller=new AbortController(),abortSignal=vi.fn(async()=>{controller.abort();return{data:result,error:null};});
        const store=createCrownAdmissionStore({rpc:()=>({abortSignal})} as unknown as SupabaseClient);
        await expect(store.authorize('Alice',rank,controller.signal)).rejects.toThrow();
        const denied=createCrownAdmissionStore({rpc:()=>({abortSignal:async()=>({data:null,error:{code:'42501'}})})} as unknown as SupabaseClient);
        await expect(denied.authorize('Alice',rank)).rejects.toThrow('ACCOUNT_UNAVAILABLE');
    });
});
