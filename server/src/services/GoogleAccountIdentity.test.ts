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
afterEach(()=>vi.unstubAllEnvs());
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
});
