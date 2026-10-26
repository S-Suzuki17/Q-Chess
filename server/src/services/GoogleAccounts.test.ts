import {describe,it,expect,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import type {User} from '@supabase/supabase-js';
import {hashGooglePassword,checkGooglePassword,verifiedGoogleActor,createGoogleAccountStore} from './GoogleAccounts';
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

describe('Google account inspection uses one Data API request',()=>{
 function fixture(value:unknown,status=200){
  const fetch=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}}));
  const client=createClient('https://example.test','synthetic-key',{
   auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch},
  });
  return {fetch,store:createGoogleAccountStore(client,async()=>null)};
 }
 it('reads the linked profile through the existing foreign key in a single round-trip',async()=>{
  const f=fixture({user_id:'Alice',username:'Alice',profile:{name:'Display Alice'}});
  expect(await f.store.read(id)).toEqual({authId:id,userId:'Alice',username:'Alice',name:'Display Alice'});
  expect(f.fetch).toHaveBeenCalledTimes(1);
  const url=new URL(String(f.fetch.mock.calls[0][0]));
  expect(url.pathname).toBe('/rest/v1/google_account_links');
  expect(url.searchParams.get('auth_user_id')).toBe('eq.'+id);
  expect(url.searchParams.get('select')).toBe('user_id,username,profile:profiles!google_account_links_user_id_fkey(name)');
 });
 it('preserves incomplete onboarding and fails closed on missing profiles or API errors',async()=>{
  expect(await fixture(null).store.read(id)).toBeNull();
  for(const profile of [null,[],{name:null}]){
   await expect(fixture({user_id:'Alice',username:'Alice',profile}).store.read(id)).rejects.toThrow();
  }
  await expect(fixture({message:'unavailable'},403).store.read(id)).rejects.toThrow();
 });
});
