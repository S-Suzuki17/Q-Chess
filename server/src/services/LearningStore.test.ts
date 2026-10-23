import {afterEach,expect,it,vi} from 'vitest';
import {createLearningStore} from './LearningStore';
import type {SupabaseClient} from '@supabase/supabase-js';

afterEach(()=>vi.restoreAllMocks());
function fixture(){
 let missing=false,fail=false;
 const from=vi.fn((table:string)=>{
  const response=()=>fail?{data:null,error:new Error('temporary')}:{error:null,data:table==='learning_weeks'
   ?missing?null:{week:'2026-10-20',opens_at:'2026-10-20T05:00:00Z',closes_at:'2026-10-27T05:00:00Z'}
   :Array.from({length:10},(_,i)=>({ordinal:i+1,position_key:String(i),state:{pieces:[]}}))};
  const chain:any={select:()=>chain,eq:()=>chain,order:()=>chain,abortSignal:()=>chain,maybeSingle:async()=>response(),then:(ok:any,bad:any)=>Promise.resolve(response()).then(ok,bad)};
  return chain;
 });
 const rpc=vi.fn(()=>({abortSignal:async()=>({data:true,error:null})}));
 const account={verifyUser:vi.fn(),blocked:vi.fn(),hasCurrentTerms:vi.fn()};
 const store=createLearningStore({from,rpc} as unknown as SupabaseClient,account);
 return {store,from,account,setMissing:(value:boolean)=>missing=value,setFail:(value:boolean)=>fail=value};
}
it('shares a bounded-lived board fetch while leaving account checks live',async()=>{
 let stamp=0;vi.spyOn(Date,'now').mockImplementation(()=>stamp);
 const {store,from,account}=fixture();
 const [first,second]=await Promise.all([store.week('2026-10-20'),store.week('2026-10-20')]);
 expect(first).toEqual(second);expect(from).toHaveBeenCalledTimes(2);
 await store.week('2026-10-20');expect(from).toHaveBeenCalledTimes(2);
 await store.blocked('Alice');await store.blocked('Alice');expect(account.blocked).toHaveBeenCalledTimes(2);
 stamp=60001;await store.week('2026-10-20');expect(from).toHaveBeenCalledTimes(4);
 await store.publish(first!);await store.week('2026-10-20');expect(from).toHaveBeenCalledTimes(6);
});
it('retries missing weeks and errors instead of caching them as available',async()=>{
 const f=fixture();f.setMissing(true);expect(await f.store.week('2026-10-20')).toBeNull();
 f.setMissing(false);f.setFail(true);await expect(f.store.week('2026-10-20')).rejects.toThrow('LEARNING_UNAVAILABLE');
 f.setFail(false);expect((await f.store.week('2026-10-20'))?.problems).toHaveLength(10);
 expect(f.from).toHaveBeenCalledTimes(4);
});
