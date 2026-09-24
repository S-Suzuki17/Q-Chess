import {describe,it,expect,vi,afterEach} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {SupabaseService,INITIAL_RATING as SERVER_INITIAL_RATING} from './SupabaseService';
import {INITIAL_RATING} from '../../../src/config/rating';

afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();});
function fixture(result:unknown) {
    const read=vi.fn().mockResolvedValue(result),insert=vi.fn(),update=vi.fn();
    const query={select:vi.fn(),eq:vi.fn(),abortSignal:vi.fn(),maybeSingle:read,insert,update};
    for(const method of [query.select,query.eq,query.abortSignal])method.mockReturnValue(query);
    const from=vi.fn().mockReturnValue(query);
    return {service:new SupabaseService({from} as unknown as SupabaseClient),query,from};
}
describe('server opening and initial ratings',()=>{
    it('rejects anonymous Supabase users and self-declared identity tokens',async()=>{
        const getUser=vi.fn().mockResolvedValue({data:{user:{id:'anonymous-id',is_anonymous:true}},error:null});
        const rpc=vi.fn().mockResolvedValue({data:true,error:null});
        const service=new SupabaseService({auth:{getUser},rpc} as unknown as SupabaseClient);
        for(const token of ['SUPABASE-victim','ranked_revoked','GUEST-x','', 'x'.repeat(9000)])expect(await service.verifyUser(token)).toBeNull();
        expect(getUser).not.toHaveBeenCalled();
        expect(await service.verifyUser('a.b.c')).toBeNull();
        getUser.mockResolvedValue({data:{user:{id:'verified-id',is_anonymous:false}},error:null});
        expect(await service.verifyUser('a.b.c')).toBeNull();
        const token=`a.${Buffer.from(JSON.stringify({sub:'verified-id',session_id:'00000000-0000-4000-8000-000000000001'})).toString('base64url')}.c`;
        expect(await service.verifyUser(token)).toBe('verified-id');
        expect(rpc).toHaveBeenCalledWith('account_session_active',{p_user_id:'verified-id',p_session_id:'00000000-0000-4000-8000-000000000001'});
        rpc.mockResolvedValue({data:false,error:null});expect(await service.verifyUser(token)).toBeNull();
        rpc.mockResolvedValue({data:true,error:{message:'denied'}});expect(await service.verifyUser(token)).toBeNull();
    });
    it('caps pending JWT verification and frees capacity after completion',async()=>{
        let release!:(value:unknown)=>void;
        const getUser=vi.fn(()=>new Promise(resolve=>{release=resolve;}));
        const service=new SupabaseService({auth:{getUser}} as unknown as SupabaseClient);
        for(let i=0;i<32;i++)void service.verifyUser('a.b.c');
        expect(await service.verifyUser('a.b.c')).toBeNull();
        expect(getUser).toHaveBeenCalledTimes(32);
        release({data:{user:null},error:null});await Promise.resolve();await Promise.resolve();
        getUser.mockResolvedValue({data:{user:null},error:null});
        expect(await service.verifyUser('a.b.c')).toBeNull();
        expect(getUser).toHaveBeenCalledTimes(33);
    });
    it('keeps Web and server new-user defaults at 1000',()=>{
        expect(INITIAL_RATING).toBe(1000);expect(SERVER_INITIAL_RATING).toBe(INITIAL_RATING);
    });
    it.each([[10,'rating_10s'],[180,'rating_3m'],[600,'rating_10m']] as const)('reads only the %i second match column',async(seconds,column)=>{
        const {service,query}=fixture({data:{[column]:2250},error:null});
        expect(await service.getMatchRating('player',seconds)).toBe(2250);
        expect(query.select).toHaveBeenCalledWith(column);
        expect(query.eq).toHaveBeenCalledWith('id','player');
        expect(query.insert).not.toHaveBeenCalled();
    });
    it.each([undefined,null,NaN,Infinity,-1,'2000'])('does not invent a badge for invalid rating %s',async rating=>{
        const {service}=fixture({data:{rating_10m:rating},error:null});
        expect(await service.getMatchRating('player',600)).toBeNull();
    });
    it('deduplicates pending reads and bounds stalled reads without blocking a match indefinitely',async()=>{
        vi.useFakeTimers();
        const {service,query}=fixture(null);
        let signal:AbortSignal;
        query.abortSignal.mockImplementation(value=>{signal=value;return query;});
        query.maybeSingle.mockImplementation(()=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve({data:null,error:{message:'Aborted'}}),{once:true})));
        const first=service.getMatchRating('player',600),second=service.getMatchRating('player',600);
        expect(second).toBe(first);
        await vi.advanceTimersByTimeAsync(2000);
        expect(await first).toBeNull();
        expect(query.select).toHaveBeenCalledTimes(1);
    });
    it('never queries guest, anonymous or CPU profiles',async()=>{
        const {service,from}=fixture({data:{rating_10m:2400},error:null});
        for(const id of ['','ai','GUEST-a','anon_a'])expect(await service.getMatchRating(id,600)).toBeNull();
        expect(from).not.toHaveBeenCalled();
    });
    it('never inserts or updates ratings after a failed profile lookup',async()=>{
        vi.spyOn(console,'log').mockImplementation(()=>{});
        const {service,query}=fixture({data:null,error:{message:'Connection lost'}});
        expect(await service.recordMatchResult('qa','a','b','WHITE',[])).toBe(false);
        expect(query.insert).not.toHaveBeenCalled();expect(query.update).not.toHaveBeenCalled();
    });
});
