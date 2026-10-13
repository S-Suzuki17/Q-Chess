import {describe,it,expect,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {createPlayCommerceStore} from './PlayCommerceStore';

describe('Play deletion selection uses persisted renewal state',()=>{
 it('excludes only terminal subscriptions and scopes the PostgREST request to the current account generation',async()=>{
  const requests:URL[]=[];
  const fetch=vi.fn(async(input:RequestInfo|URL)=>{
   const url=new URL(String(input));requests.push(url);
   return new Response(JSON.stringify(url.pathname.endsWith('/play_commerce_accounts')?{generation:'fixture-generation'}:[]),{headers:{'Content-Type':'application/json'}});
  });
  const client=createClient('https://play-store-fixture.invalid','fixture-key',{global:{fetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  expect(await createPlayCommerceStore(client,async()=>null).deletionTokens('alice')).toEqual([]);
  expect(requests).toHaveLength(2);expect(requests[0].searchParams.get('user_id')).toBe('eq.alice');
  const query=requests[1].searchParams;
  expect(query.get('generation')).toBe('eq.fixture-generation');expect(query.get('retired')).toBe('eq.false');
  expect(query.get('sku')).toBe('in.(standard_monthly,plus_monthly)');
  expect(query.get('state')).toBe('not.in.(SUBSCRIPTION_STATE_EXPIRED,SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED)');
  expect(query.get('state')).not.toContain('SUBSCRIPTION_STATE_CANCELED');
 });
});
