import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAccountProfileStore, ACCOUNT_PROFILE_COLUMNS } from './AccountProfiles';

let calls: [string, unknown[]][], results: {data?:unknown;error?:unknown}[];
const client = { from(table: string) {
    calls.push(['from',[table]]);
    const chain: Record<string, unknown> = {};
    for (const method of ['select','eq','or','order','limit','insert','update','delete']) chain[method] = (...args:unknown[]) => { calls.push([method,args]); return chain; };
    chain.then = (resolve:(value:unknown)=>unknown, reject:(reason:unknown)=>unknown) => Promise.resolve(results.shift() ?? {data:null,error:null}).then(resolve,reject);
    chain.maybeSingle = () => { calls.push(['maybeSingle',[]]);return Promise.resolve(results.shift() ?? {data:null,error:null}); };
    return chain;
} } as unknown as SupabaseClient;
const store = createAccountProfileStore(client, vi.fn(), vi.fn());
beforeEach(() => { calls=[];results=[]; });
const has = (method:string,args:unknown[]) => expect(calls).toContainEqual([method,args]);
it('only renames the authenticated row and selects public columns', async () => {
    results=[{data:{id:'Alice',name:'Name'}}]; await store.rename('Alice','Name');
    has('update',[{name:'Name'}]);has('eq',['id','Alice']);has('select',[ACCOUNT_PROFILE_COLUMNS]);
    expect(ACCOUNT_PROFILE_COLUMNS).not.toMatch(/password|email/);
});
it('never re-creates a missing legacy profile', async () => {
    results=[{data:null}]; await expect(store.ensure('Alice','Name',false)).rejects.toThrow('NOT_FOUND');
    expect(calls.some(([method])=>method==='insert')).toBe(false);
});
it('preserves an existing profile and concurrent insert winner without resetting rating', async () => {
    results=[{data:{id:'OAuth',name:'Old',rating:2200}}];
    expect((await store.ensure('OAuth','Name',true)).rating).toBe(2200); expect(calls.some(([method])=>method==='insert')).toBe(false);
    calls=[]; results=[{data:null},{error:{code:'23505'}},{data:{id:'OAuth',name:'Other tab',rating:2300}}];
    expect((await store.ensure('OAuth','Name',true)).rating).toBe(2300);
    has('insert',[{id:'OAuth',name:'Name',rating:1000,rating_10s:1000,rating_3m:1000,rating_10m:1000}]);
    expect(calls.some(([method])=>method==='update')).toBe(false);
});
it('does not create after a failed lookup', async () => {
    results=[{error:{message:'offline'}}]; await expect(store.ensure('OAuth','Name',true)).rejects.toThrow('UNAVAILABLE');
    expect(calls.some(([method])=>method==='insert')).toBe(false);
});
it('only accepts requests addressed to the authenticated recipient', async () => {
    results=[{data:{id:'Bob'}},{data:[{id:'row'}]}]; expect(await store.changeFriend('Alice','Bob','accept')).toBe(true);
    has('update',[{status:'accepted'}]);has('eq',['user_id','Bob']);has('eq',['friend_id','Alice']);
    expect(calls.some(([method])=>method==='insert')).toBe(false);
});
it('does not auto-accept an incoming request or duplicate a reverse friendship', async () => {
    results=[{data:{id:'Bob'}},{data:[{id:'existing'}]}]; expect(await store.changeFriend('Alice','Bob','request')).toBe(true);
    has('or',['and(user_id.eq.Alice,friend_id.eq.Bob),and(user_id.eq.Bob,friend_id.eq.Alice)']);
    expect(calls.some(([method])=>['insert','update'].includes(method))).toBe(false);
});
it('binds a new request to the owner and makes removals retryable', async () => {
    results=[{data:{id:'Bob'}},{data:[]},{data:null}]; expect(await store.changeFriend('Alice','Bob','request')).toBe(true);
    has('insert',[{user_id:'Alice',friend_id:'Bob',status:'pending'}]);
    calls=[];results=[{data:[]}];expect(await store.changeFriend('Alice','Bob','remove')).toBe(true);
    has('or',['and(user_id.eq.Alice,friend_id.eq.Bob),and(user_id.eq.Bob,friend_id.eq.Alice)']);
});
it('rejects unsafe filter IDs, self-friending and vanished recipients', async () => {
    for(const id of ['Bob),id.gt.0','Alice','GUEST-x']) await expect(store.changeFriend('Alice',id,'request')).rejects.toThrow('INVALID_REQUEST');
    expect(calls).toHaveLength(0);results=[{data:null}]; await expect(store.changeFriend('Alice','Bob','request')).rejects.toThrow('NOT_FOUND');
});
it('limits reads, filters foreign rows, and rejects truncation instead of silently dropping friends', async () => {
    results=[{data:[{user_id:'Alice',friend_id:'Bob'},{user_id:'Mallory',friend_id:'Bob'}]}];expect(await store.friends('Alice')).toHaveLength(1);
    has('or',['user_id.eq.Alice,friend_id.eq.Alice']);has('limit',[1001]);
    results=[{data:Array.from({length:1001},()=>({user_id:'Alice'}))}];await expect(store.friends('Alice')).rejects.toThrow('UNAVAILABLE');
});
