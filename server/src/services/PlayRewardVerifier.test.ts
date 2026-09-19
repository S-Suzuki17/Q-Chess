import {afterEach,describe,it,expect,vi} from 'vitest';
const auth=vi.hoisted(()=>({getAccessToken:vi.fn(async()=> 'google-access'),options:vi.fn()}));
vi.mock('google-auth-library',()=>({GoogleAuth:class {constructor(options:unknown){auth.options(options);}getAccessToken=auth.getAccessToken;}}));
import {createPlayRewardVerifier} from './PlayRewardVerifier';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
function enable(){vi.stubEnv('PLAY_PREREG_REWARDS_ENABLED','true');vi.stubEnv('PLAY_REWARDS_SERVICE_ACCOUNT_JSON',JSON.stringify({type:'service_account',client_email:'test@example.invalid',private_key:'test-key',token_uri:'https://untrusted.example',universe_domain:'untrusted.example'}));}
describe('fixed Play Developer API integration',()=>{
 it('is disabled without both explicit enable and credentials',()=>{
  vi.stubEnv('PLAY_PREREG_REWARDS_ENABLED','false');expect(createPlayRewardVerifier()).toBeNull();
  vi.stubEnv('PLAY_PREREG_REWARDS_ENABLED','true');vi.stubEnv('PLAY_REWARDS_SERVICE_ACCOUNT_JSON','{}');expect(createPlayRewardVerifier()).toBeNull();
 });
 it('pins package/product/endpoint and ignores credential URL overrides',async()=>{
  enable();const fetcher=vi.fn(async()=>Response.json({purchaseState:0,consumptionState:0}));vi.stubGlobal('fetch',fetcher);
  const play=createPlayRewardVerifier()!;await play.verify('test-token');await play.consume('test-token');
  expect(auth.options).toHaveBeenCalledWith(expect.objectContaining({credentials:{client_email:'test@example.invalid',private_key:'test-key'}}));
  expect(fetcher).toHaveBeenNthCalledWith(1,'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.qgambit.app/purchases/products/qg_founders_preregister/tokens/test-token',expect.objectContaining({method:'GET',redirect:'error'}));
  expect(fetcher).toHaveBeenNthCalledWith(2,expect.stringMatching(/test-token:consume$/),expect.objectContaining({method:'POST'}));
 });
 it('returns only safe error codes for upstream failures',async()=>{
  enable();vi.stubGlobal('fetch',vi.fn(async()=>new Response('sensitive upstream detail',{status:403})));
  await expect(createPlayRewardVerifier()!.verify('test-token')).rejects.toMatchObject({message:'UNAVAILABLE'});
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:404})));
  await expect(createPlayRewardVerifier()!.verify('test-token')).rejects.toMatchObject({code:'NOT_ELIGIBLE'});
 });
});
