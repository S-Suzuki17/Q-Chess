import {describe,it,expect} from 'vitest';
import type {User} from '@supabase/supabase-js';
import {hashGooglePassword,checkGooglePassword,verifiedGoogleActor} from './GoogleAccounts';
const id='11111111-1111-4111-8111-111111111111';
const user={id,is_anonymous:false,identities:[{provider:'google'}]} as User;
const token=(claims:object)=>'header.'+Buffer.from(JSON.stringify({sub:id,session_id:id,...claims})).toString('base64url')+'.signature';
describe('verified Google claims and action passwords',()=>{
 it('requires a verified matching subject, Google identity and OAuth method',()=>{
  expect(verifiedGoogleActor(token({amr:[{method:'oauth',timestamp:1000}]}),user)).toEqual({authId:id,authenticatedAt:1000000});
  for(const claims of [{sub:'other',amr:[{method:'oauth',timestamp:1000}]},{session_id:'bad',amr:[{method:'oauth',timestamp:1000}]},
   {amr:[{method:'password',timestamp:1000}]},{amr:[]},{amr:[{method:'oauth',timestamp:1000},{method:'recovery',timestamp:1001}]}]){
   expect(verifiedGoogleActor(token(claims),user)).toBeNull();
  }
  expect(verifiedGoogleActor(token({amr:[{method:'oauth',timestamp:1000}]}),{...user,identities:[{provider:'discord'}] as User['identities']})).toBeNull();
  expect(verifiedGoogleActor(token({amr:[{method:'oauth',timestamp:1000}]}),{...user,is_anonymous:true})).toBeNull();
 });
 it('uses independently salted hashes and rejects invalid passwords/encodings',async()=>{
  const first=await hashGooglePassword('SyntheticPassword123'),second=await hashGooglePassword('SyntheticPassword123');
  expect(first).not.toBe(second);expect(first).not.toContain('SyntheticPassword');
  expect(await checkGooglePassword('SyntheticPassword123',first)).toBe(true);
  expect(await checkGooglePassword('different',first)).toBe(false);
  expect(await checkGooglePassword('x'.repeat(1025),first)).toBe(false);
  expect(await checkGooglePassword(null,first)).toBe(false);
  expect(await checkGooglePassword('SyntheticPassword123','invalid')).toBe(false);
 });
});
