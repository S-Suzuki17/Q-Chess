import {describe,it,expect,vi,afterEach} from 'vitest';
import {AuthApiError,type SupabaseClient} from '@supabase/supabase-js';
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
    it.each([{},null,{data:{}},{data:{user:null},error:null},{data:{user:{}},error:null}])('treats malformed Auth success as unavailable (%j)',async response=>{
        const service=new SupabaseService({auth:{getUser:async()=>response}} as unknown as SupabaseClient);
        await expect(service.verifyUser('a.b.c')).rejects.toThrow('Session authority unavailable');
    });
    it.each([null,undefined,'true',{},1])('treats malformed session lookup as unavailable (%j)',async data=>{
        const token=`a.${Buffer.from(JSON.stringify({sub:'verified-id',session_id:'00000000-0000-4000-8000-000000000001'})).toString('base64url')}.c`;
        const service=new SupabaseService({auth:{getUser:async()=>({data:{user:{id:'verified-id'}},error:null})},rpc:async()=>({data,error:null})} as unknown as SupabaseClient);
        await expect(service.verifyUser(token)).rejects.toThrow('Session authority unavailable');
    });
    it.each([429,500,503,504])('classifies Auth HTTP %s as temporary, without exposing its message',async status=>{
        const service=new SupabaseService({auth:{getUser:async()=>({data:{user:null},error:new AuthApiError('private-token',status,'unexpected_failure')})}} as unknown as SupabaseClient);
        await expect(service.verifyUser('a.b.c')).rejects.toMatchObject({name:'SessionAuthorityUnavailable',message:'Session authority unavailable'});
    });
    it.each(['bad_jwt','session_not_found','session_expired','user_not_found','user_banned'])('keeps explicit %s denials separate',async code=>{
        const service=new SupabaseService({auth:{getUser:async()=>({data:{user:null},error:new AuthApiError('denied',401,code)})}} as unknown as SupabaseClient);
        expect(await service.verifyUser('a.b.c')).toBeNull();
    });
    it('bounds a stalled Auth request and does not start a late session lookup',async()=>{
        vi.useFakeTimers();
        let release!:(value:unknown)=>void;
        const getUser=vi.fn(()=>new Promise(resolve=>{release=resolve;})),rpc=vi.fn();
        const service=new SupabaseService({auth:{getUser},rpc} as unknown as SupabaseClient);
        const pending=expect(service.verifyUser('a.b.c')).rejects.toThrow('Session authority unavailable');
        await vi.advanceTimersByTimeAsync(5000);await pending;
        release({data:{user:{id:'late-user'}},error:null});await Promise.resolve();expect(rpc).not.toHaveBeenCalled();
    });
    it('treats a failed recovery lookup as unavailable instead of revoking an ordinary Auth identity',async()=>{
        vi.stubEnv('ACCOUNT_RECOVERY_ENABLED','true');
        const token=`a.${Buffer.from(JSON.stringify({sub:'verified-id',session_id:'00000000-0000-4000-8000-000000000001'})).toString('base64url')}.c`;
        const q={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn(async()=>({data:null,error:{message:'private-db-detail'}}))};
        q.select.mockReturnValue(q);q.eq.mockReturnValue(q);
        const service=new SupabaseService({auth:{getUser:async()=>({data:{user:{id:'verified-id'}},error:null})},rpc:async()=>({data:true,error:null}),from:()=>q} as unknown as SupabaseClient);
        try{await expect(service.verifyUser(token)).rejects.toThrow('Session authority unavailable');}finally{vi.unstubAllEnvs();}
    });
    it.each([null,{user_id:'legacy-account'},false,{},[],undefined])('requires a valid recovery lookup result (%j)',async data=>{
        vi.stubEnv('ACCOUNT_RECOVERY_ENABLED','true');
        const token=`a.${Buffer.from(JSON.stringify({sub:'verified-id',session_id:'00000000-0000-4000-8000-000000000001'})).toString('base64url')}.c`;
        const query={select:vi.fn(),eq:vi.fn(),maybeSingle:async()=>({data,error:null})};query.select.mockReturnValue(query);query.eq.mockReturnValue(query);
        const service=new SupabaseService({auth:{getUser:async()=>({data:{user:{id:'verified-id'}},error:null})},rpc:async()=>({data:true,error:null}),from:()=>query} as unknown as SupabaseClient);
        try{
            if(data===null)expect(await service.verifyUser(token)).toBe('verified-id');
            else if(data&&typeof data==='object'&&'user_id' in data)expect(await service.verifyUser(token)).toBeNull();
            else await expect(service.verifyUser(token)).rejects.toThrow('Session authority unavailable');
        }finally{vi.unstubAllEnvs();}
    });
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
        rpc.mockResolvedValue({data:true,error:{message:'denied'}});await expect(service.verifyUser(token)).rejects.toThrow('Session authority unavailable');
    });
    it('caps pending JWT verification and frees capacity after completion',async()=>{
        let release!:(value:unknown)=>void;
        const pending=new Promise(resolve=>{release=resolve;}),getUser=vi.fn(()=>pending);
        const service=new SupabaseService({auth:{getUser}} as unknown as SupabaseClient);
        const checks=Array.from({length:32},()=>service.verifyUser('a.b.c'));
        await expect(service.verifyUser('a.b.c')).rejects.toThrow('Session authority unavailable');
        expect(getUser).toHaveBeenCalledTimes(32);
        release({data:{user:null},error:new AuthApiError('denied',401,'bad_jwt')});await Promise.all(checks);
        getUser.mockResolvedValue({data:{user:null},error:new AuthApiError('denied',401,'bad_jwt')});
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
