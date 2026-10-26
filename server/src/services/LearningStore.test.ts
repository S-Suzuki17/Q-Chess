import {afterEach,expect,it,vi} from 'vitest';
import {createLearningStore} from './LearningStore';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';

afterEach(()=>vi.restoreAllMocks());
function fixture(){
 let missing=false,fail=false;
 const from=vi.fn(()=>{
  const response=()=>fail?{data:null,error:new Error('temporary')}:{error:null,data:missing?null:boardRow()};
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
 expect(first).toEqual(second);expect(from).toHaveBeenCalledTimes(1);
 await store.week('2026-10-20');expect(from).toHaveBeenCalledTimes(1);
 await store.blocked('Alice');await store.blocked('Alice');expect(account.blocked).toHaveBeenCalledTimes(2);
 stamp=60001;await store.week('2026-10-20');expect(from).toHaveBeenCalledTimes(2);
 await store.publish(first!);await store.week('2026-10-20');expect(from).toHaveBeenCalledTimes(3);
});
it('retries missing weeks and errors instead of caching them as available',async()=>{
 const f=fixture();f.setMissing(true);expect(await f.store.week('2026-10-20')).toBeNull();
 f.setMissing(false);f.setFail(true);await expect(f.store.week('2026-10-20')).rejects.toThrow('LEARNING_UNAVAILABLE');
 f.setFail(false);expect((await f.store.week('2026-10-20'))?.problems).toHaveLength(10);
 expect(f.from).toHaveBeenCalledTimes(3);
});

function boardRow(){
 return {week:'2026-10-20',opens_at:'2026-10-20T05:00:00Z',closes_at:'2026-10-27T05:00:00Z',
  learning_problems:Array.from({length:10},(_,i)=>({ordinal:i+1,position_key:String(i),state:{pieces:[]}}))};
}
function httpFixture(row:unknown){
 const fetch=vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify(row===null?[]:[row]),
  {status:200,headers:{'Content-Type':'application/json'}}));
 const client=createClient('https://learning.example.invalid','test-only-key',
  {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch}});
 const store=createLearningStore(client,{verifyUser:vi.fn(),blocked:vi.fn(),hasCurrentTerms:vi.fn()});
 return {store,fetch};
}
it('loads the week and ten ordered boards in one HTTP request through the existing foreign key',async()=>{
 const {store,fetch}=httpFixture(boardRow());
 const result=await store.week('2026-10-20');
 expect(result?.problems.map(p=>p.id)).toEqual(Array.from({length:10},(_,i)=>String(i+1)));
 expect(fetch).toHaveBeenCalledOnce();
 const url=new URL(String(fetch.mock.calls[0][0]));
 expect(url.pathname).toBe('/rest/v1/learning_weeks');
 expect(url.searchParams.get('week')).toBe('eq.2026-10-20');
 expect(url.searchParams.get('select')).toBe('week,opens_at,closes_at,learning_problems(ordinal,position_key,state)');
 expect(url.searchParams.get('learning_problems.order')).toBe('ordinal.asc');
});
it('keeps an absent week distinct from an incomplete publication',async()=>{
 expect(await httpFixture(null).store.week('2026-10-20')).toBeNull();
 await expect(httpFixture({...boardRow(),learning_problems:[]}).store.week('2026-10-20')).rejects.toThrow('LEARNING_UNAVAILABLE');
});
it.each([
 ['missing relation',null],
 ['non-array relation',{}],
 ['missing board',boardRow().learning_problems.slice(1)],
 ['out-of-order boards',boardRow().learning_problems.toReversed()],
 ['duplicate ordinal',boardRow().learning_problems.map(p=>({...p,ordinal:1}))],
 ['invalid pieces',boardRow().learning_problems.map(p=>({...p,state:{pieces:{}}}))],
])('rejects %s without exposing an incomplete problem set',async(_label,rows)=>{
 const {store}=httpFixture({...boardRow(),learning_problems:rows});
 await expect(store.week('2026-10-20')).rejects.toThrow('LEARNING_UNAVAILABLE');
});
