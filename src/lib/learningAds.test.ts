import {afterEach,describe,it,expect,vi} from 'vitest';
import {acceptAdEntitlement,resetAdEntitlement} from './sharedAdEligibility';
import {requestLearningInterstitial} from './adPolicy';
const mock=vi.hoisted(()=>({native:true,show:vi.fn(async()=> 'dismissed' as const)}));
vi.mock('./nativeAds',()=>({isAndroidApp:()=>mock.native,nativeAds:{interstitial:mock.show}}));
afterEach(()=>{vi.unstubAllEnvs();resetAdEntitlement();mock.show.mockClear();mock.native=true;});
describe('weekly checkpoint advertisement eligibility',()=>{
 it('requests the existing native interstitial only for the current eligible owner',async()=>{
  vi.stubEnv('NEXT_PUBLIC_NATIVE_LEARNING_INTERSTITIAL_ENABLED','true');
  vi.stubEnv('NEXT_PUBLIC_NATIVE_INTERSTITIAL_ENABLED','false');
  acceptAdEntitlement('Alice',{plan:'free',noAds:false,unlimitedOnlineRanked:false,periodEnd:null});
  expect(await requestLearningInterstitial('week:5','Alice')).toBe('dismissed');
  expect(mock.show).toHaveBeenCalledTimes(1);
  expect(await requestLearningInterstitial('week:10','Bob')).toBe('unavailable');
  expect(mock.show).toHaveBeenCalledTimes(1);
 });
 it('skips ad-free members, unknown eligibility, disabled ads and web without blocking completion',async()=>{
  vi.stubEnv('NEXT_PUBLIC_NATIVE_LEARNING_INTERSTITIAL_ENABLED','true');
  expect(await requestLearningInterstitial('week:5','Alice')).toBe('unavailable');
  acceptAdEntitlement('Alice',{plan:'standard',noAds:true,unlimitedOnlineRanked:true,periodEnd:'2099-01-01'});
  expect(await requestLearningInterstitial('week:5','Alice')).toBe('unavailable');
  acceptAdEntitlement('Alice',{plan:'free',noAds:false,unlimitedOnlineRanked:false,periodEnd:null});
  mock.native=false;expect(await requestLearningInterstitial('week:5','Alice')).toBe('unavailable');
  mock.native=true;vi.stubEnv('NEXT_PUBLIC_NATIVE_LEARNING_INTERSTITIAL_ENABLED','false');
  vi.stubEnv('NEXT_PUBLIC_NATIVE_INTERSTITIAL_ENABLED','true');
  expect(await requestLearningInterstitial('week:5','Alice')).toBe('unavailable');
  expect(mock.show).not.toHaveBeenCalled();
 });
});
