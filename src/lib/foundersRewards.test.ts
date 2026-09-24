import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),ranked:vi.fn(),restore:vi.fn(),native:vi.fn(),platform:vi.fn()}));
vi.mock('./supabaseClient',()=>({supabase:{auth:{getSession:mocks.session}}}));
vi.mock('./rankedSession',()=>({readRankedSession:mocks.ranked,gameServerUrl:()=> 'https://game.example'}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:mocks.native,getPlatform:mocks.platform},registerPlugin:()=>({restore:mocks.restore})}));
import {readFoundersStatus,restoreFounders,foundersPurchaseAvailable} from './foundersRewards';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('NEXT_PUBLIC_FOUNDERS_REWARDS_ENABLED','true');mocks.ranked.mockReturnValue({token:'private-token'});mocks.native.mockReturnValue(true);mocks.platform.mockReturnValue('android');});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const signal=()=>new AbortController().signal;
describe('founders client boundaries',()=>{
 it('keeps distribution off without contacting Play or the server',async()=>{
  vi.stubEnv('NEXT_PUBLIC_FOUNDERS_REWARDS_ENABLED','false');
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  expect(await readFoundersStatus('alice',signal())).toEqual({userId:'alice',enabled:false,owned:false});
  expect(await foundersPurchaseAvailable(signal())).toBe(false);
  await expect(restoreFounders('alice',signal())).rejects.toMatchObject({code:'UNAVAILABLE'});
  expect(fetcher).not.toHaveBeenCalled();expect(mocks.restore).not.toHaveBeenCalled();expect(mocks.session).not.toHaveBeenCalled();
 });
 it('uses authenticated no-store requests and checks returned account identity',async()=>{
  const fetcher=vi.fn(async()=>Response.json({userId:'alice',owned:true,enabled:true}));vi.stubGlobal('fetch',fetcher);
  expect((await readFoundersStatus('alice',signal())).owned).toBe(true);
  expect(fetcher).toHaveBeenCalledWith(new URL('https://game.example/rewards/founders'),expect.objectContaining({method:'GET',redirect:'error',cache:'no-store',credentials:'omit',headers:{Authorization:'Bearer private-token'}}));
  fetcher.mockResolvedValue(Response.json({userId:'bob',owned:true,enabled:true}));
  await expect(readFoundersStatus('alice',signal())).rejects.toMatchObject({code:'UNAVAILABLE'});
 });
 it('rejects unverified login and never sends requests without proof',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);mocks.ranked.mockReturnValue(null);
  mocks.session.mockResolvedValue({data:{session:{user:{id:'other'},access_token:'bad'}},error:null});
  await expect(readFoundersStatus('alice',signal())).rejects.toMatchObject({code:'AUTH_REQUIRED'});expect(fetcher).not.toHaveBeenCalled();
 });
 it('sends only the native reward token; not client entitlement or package IDs',async()=>{
  const fetcher=vi.fn(async()=>Response.json({userId:'alice',owned:true,enabled:true}));vi.stubGlobal('fetch',fetcher);
  mocks.restore.mockResolvedValue({tokens:['play-reward-0123456789'],pending:false});
  expect((await restoreFounders('alice',signal())).owned).toBe(true);
  expect(fetcher).toHaveBeenCalledWith(new URL('https://game.example/rewards/founders/claim'),expect.objectContaining({method:'POST',body:JSON.stringify({purchaseToken:'play-reward-0123456789'})}));
 });
 it('does not offer web checkout or claim without a Play receipt',async()=>{
  const fetcher=vi.fn(async()=>Response.json({userId:'alice',owned:false,enabled:true}));vi.stubGlobal('fetch',fetcher);
  mocks.native.mockReturnValue(false);
  await expect(restoreFounders('alice',signal())).rejects.toMatchObject({code:'ANDROID_ONLY'});expect(mocks.restore).not.toHaveBeenCalled();
  mocks.native.mockReturnValue(true);mocks.restore.mockResolvedValue({tokens:[],pending:true});
  await expect(restoreFounders('alice',signal())).rejects.toMatchObject({code:'PENDING'});
  expect(fetcher.mock.calls.every(call=>(call as unknown as[URL,RequestInit])[1].method==='GET')).toBe(true);
 });
 it('restores consumed rewards from account ownership without buying again',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({userId:'alice',owned:true,enabled:true})));
  mocks.restore.mockResolvedValue({tokens:[],pending:false});expect((await restoreFounders('alice',signal())).owned).toBe(true);
 });
 it('aborts on identity changes before forwarding native proof',async()=>{
  const controller=new AbortController(),fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  mocks.restore.mockImplementation(async()=>{controller.abort();return {tokens:['play-reward-0123456789'],pending:false};});
  await expect(restoreFounders('alice',controller.signal)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
 });
});
