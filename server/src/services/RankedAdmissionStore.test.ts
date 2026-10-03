import { describe,expect,it,vi } from 'vitest';
import { createRankedAdmissionStore } from './RankedAdmissionStore';
import type { SupabaseClient } from '@supabase/supabase-js';
function fixture(data:unknown,enabled=true) {
    const abortSignal=vi.fn(async()=>({data,error:null})),rpc=vi.fn(()=>({abortSignal}));
    return {rpc,store:createRankedAdmissionStore({rpc} as unknown as SupabaseClient,()=>enabled)};
}
describe('ranked admission RPC boundary',()=>{
    it('rollback keeps recovery enabled while refusing new admissions',async()=>{
        const rpc=vi.fn(()=>({abortSignal:async()=>({data:[],error:null})}));
        const store=createRankedAdmissionStore({rpc} as unknown as SupabaseClient,()=>true,()=>false);
        await expect(store.admit({} as any,'epoch')).rejects.toThrow('RANKED_TICKET_ADMISSION_DISABLED');
        expect(rpc).not.toHaveBeenCalled();expect(await store.recover()).toEqual([]);
    });
    it('OFF blocks admission, recovery, ownership, state and busy checks before RPC',async()=>{
        const {store,rpc}=fixture(null,false);
        for(const call of [()=>store.renew('epoch'),()=>store.recover(),()=>store.read('match','Alice'),()=>store.busy('Alice'),()=>store.void('match','epoch','failure')])
            await expect(call()).rejects.toThrow('RANKED_TICKET_ADMISSION_DISABLED');
        expect(rpc).not.toHaveBeenCalled();
    });
    it.each([null,undefined,'false',{},1])('invalid busy/lease replies fail closed (%s)',async value=>{
        const {store}=fixture(value);
        await expect(store.busy('Alice')).rejects.toThrow('RESPONSE_INVALID');
        await expect(store.renew('epoch')).rejects.toThrow('RESPONSE_INVALID');
    });
    it('does not treat malformed admissions or recovery replies as committed',async()=>{
        const {store}=fixture({success:true});
        await expect(store.read('match','Alice')).rejects.toThrow('RESPONSE_INVALID');
        await expect(store.recover()).rejects.toThrow('RESPONSE_INVALID');
    });
    it('requires the full migration protocol before renewing, and caches successful readiness',async()=>{
        const rpc=vi.fn(name=>({abortSignal:async()=>({data:name==='ranked_admission_protocol_version'?2:true,error:null})}));
        const store=createRankedAdmissionStore({rpc} as unknown as SupabaseClient,()=>true);
        expect(await store.renew('epoch')).toBe(true);expect(await store.renew('epoch')).toBe(true);
        expect(rpc.mock.calls.filter(([name])=>name==='ranked_admission_protocol_version')).toHaveLength(1);
    });
});
