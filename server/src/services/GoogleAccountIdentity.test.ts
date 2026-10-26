import {afterEach,describe,it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {SupabaseService} from './SupabaseService';
const id='11111111-1111-4111-8111-111111111111';
function fixture({linked=true,live=true,recovery=false,method='oauth',provider='google'}={}) {
 const token='a.'+Buffer.from(JSON.stringify({sub:id,session_id:id,amr:[{method,timestamp:1000}]})).toString('base64url')+'.c';
 const user={id,is_anonymous:false,identities:[{provider}]};
 const auth={getUser:vi.fn().mockResolvedValue({data:{user},error:null})};
 const rpc=vi.fn().mockResolvedValue({data:live,error:null});
 const from=vi.fn((table:string)=>{
  const result={data:table==='account_recovery_emails'?(recovery?{user_id:'LegacyAlice'}:null)
   :table==='google_account_links'?(linked?{user_id:'LegacyAlice',username:'Alice'}:null):{name:'Alice'},error:null};
  const query={select:vi.fn(),eq:vi.fn(),abortSignal:vi.fn(),maybeSingle:vi.fn().mockResolvedValue(result),single:vi.fn().mockResolvedValue(result)};
  for(const fn of [query.select,query.eq,query.abortSignal])fn.mockReturnValue(query);
  return query;
 });
 vi.stubEnv('GOOGLE_ACCOUNT_LOGIN_ENABLED','true');vi.stubEnv('ACCOUNT_RECOVERY_ENABLED','true');
 return {service:new SupabaseService({auth,rpc,from} as unknown as SupabaseClient),auth,rpc,from,token};
}
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
describe('live Google identity mapping',()=>{
 it('uses the stable game ID only after Auth and live session verification',async()=>{
  const f=fixture();expect(await f.service.verifyUser(f.token)).toBe('LegacyAlice');
  expect(f.auth.getUser).toHaveBeenCalledWith(f.token);
  expect(f.rpc).toHaveBeenCalledWith('account_session_active',{p_user_id:id,p_session_id:id});
 });
 it('allows onboarding before linking but denies game access until setup completes',async()=>{
  const f=fixture({linked:false});expect(await f.service.verifyUser(f.token)).toBeNull();
  expect(await f.service.googleAccountStore().verify(f.token)).toEqual({authId:id,authenticatedAt:1000000});
 });
 it('does not map a revoked session or a non-Google/password identity',async()=>{
  for(const options of [{live:false},{provider:'discord'},{method:'password'}]){
   const f=fixture(options);expect(await f.service.verifyUser(f.token)).toBeNull();
   expect(f.from).not.toHaveBeenCalledWith('google_account_links');
  }
 });
 it('allows a recovery identity only after Google OAuth, never via recovery or password',async()=>{
  const google=fixture({recovery:true});expect(await google.service.verifyUser(google.token)).toBe('LegacyAlice');
  const password=fixture({recovery:true,method:'recovery'});expect(await password.service.verifyUser(password.token)).toBeNull();
 });
 it('joins simultaneous provider reads but checks the live session for every caller',async()=>{
  const f=fixture();let release!:(value:unknown)=>void;
  f.auth.getUser.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  const requests=Array.from({length:6},()=>f.service.verifyUser(f.token));
  expect(f.auth.getUser).toHaveBeenCalledTimes(1);
  release({data:{user:{id,is_anonymous:false,identities:[{provider:'google'}]}},error:null});
  expect(await Promise.all(requests)).toEqual(Array(6).fill('LegacyAlice'));
  expect(f.rpc).toHaveBeenCalledTimes(6);
  f.rpc.mockResolvedValueOnce({data:false,error:null});
  expect(await f.service.verifyUser(f.token)).toBeNull();
  expect(f.auth.getUser).toHaveBeenCalledTimes(2);
 });
 it('keeps different tokens separate and retries an upstream failure',async()=>{
  const f=fixture();f.auth.getUser.mockRejectedValueOnce(new Error('provider unavailable'));
  const failed=await Promise.allSettled([f.service.verifyUser(f.token),f.service.verifyUser(f.token)]);
  expect(failed.every(result=>result.status==='rejected')).toBe(true);
  expect(f.auth.getUser).toHaveBeenCalledTimes(1);
  expect(await f.service.verifyUser(f.token)).toBe('LegacyAlice');
  await Promise.all([f.service.verifyUser(f.token),f.service.verifyUser(f.token+'different')]);
  expect(f.auth.getUser).toHaveBeenCalledTimes(4);
 });
 it('expires an unanswered provider request so it cannot poison subsequent attempts',async()=>{
  vi.useFakeTimers();const f=fixture();f.auth.getUser.mockImplementationOnce(()=>new Promise(()=>{}));
  const result=Promise.allSettled([f.service.verifyUser(f.token),f.service.verifyUser(f.token)]);
  await vi.advanceTimersByTimeAsync(5001);
  expect((await result).every(value=>value.status==='rejected')).toBe(true);
  expect(await f.service.verifyUser(f.token)).toBe('LegacyAlice');
  expect(f.auth.getUser).toHaveBeenCalledTimes(2);
 });
});
