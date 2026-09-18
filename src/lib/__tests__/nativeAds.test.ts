import {afterEach,describe,expect,it,vi} from 'vitest';
import type {AdMobPlugin} from '@capacitor-community/admob';
import {NativeAds} from '../nativeAds';
import {ADMOB_TEST_UNITS,ADMOB_UNITS} from '../../config/nativeAds';

vi.mock('@capacitor-community/admob',()=>({
 RewardAdPluginEvents:{Rewarded:'reward',Dismissed:'dismiss',FailedToShow:'fail'},
 InterstitialAdPluginEvents:{Dismissed:'interstitialDismiss',FailedToShow:'interstitialFail'},
}));
const proof={userId:'opaque-account',intentId:'server-issued-intent'};
function fixture(supported=true,live=false){
 const events=new Map<string,()=>void>();
 const removed=vi.fn();
 const sdk={
  initialize:vi.fn().mockResolvedValue(undefined),
  requestConsentInfo:vi.fn().mockResolvedValue({status:'NOT_REQUIRED',canRequestAds:true}),
  showConsentForm:vi.fn().mockResolvedValue({status:'OBTAINED',canRequestAds:true}),
  showPrivacyOptionsForm:vi.fn().mockResolvedValue(undefined),
  addListener:vi.fn(async(name:string,fn:()=>void)=>{events.set(name,fn);return{remove:async()=>{events.delete(name);removed();}};}),
  prepareRewardVideoAd:vi.fn().mockResolvedValue({}),
  showRewardVideoAd:vi.fn().mockResolvedValue({amount:3,type:'hint_uses'}),
  prepareInterstitial:vi.fn().mockResolvedValue({}),
  showInterstitial:vi.fn().mockResolvedValue(undefined),
 };
 const load=vi.fn(async()=>sdk as unknown as AdMobPlugin);
 return{ads:new NativeAds(()=>supported,()=>live,load),sdk,load,events,removed};
}
async function flush(){for(let i=0;i<40;i++)await Promise.resolve();}
afterEach(()=>vi.useRealTimers());
describe('Android AdMob lifecycle',()=>{
 it('does not initialize on Web or without a server intent',async()=>{
  const f=fixture(false);expect(await f.ads.reward('hint',proof)).toBe('unavailable');expect(f.load).not.toHaveBeenCalled();
  const android=fixture();expect(await android.ads.reward('hint',{...proof,intentId:''})).toBe('unavailable');expect(android.load).not.toHaveBeenCalled();
 });
 it('uses test units, waits for dismissal and rejects overlapping requests',async()=>{
  const f=fixture();const result=f.ads.reward('hint',proof);await flush();
  expect(await f.ads.interstitial()).toBe('busy');
  expect(f.sdk.initialize).toHaveBeenCalledWith({initializeForTesting:true,tagForChildDirectedTreatment:true,tagForUnderAgeOfConsent:true,maxAdContentRating:'General'});
  expect(f.sdk.requestConsentInfo).toHaveBeenCalledWith({tagForUnderAgeOfConsent:true});
  expect(f.sdk.prepareRewardVideoAd).toHaveBeenCalledWith({adId:ADMOB_TEST_UNITS.hint,isTesting:true,ssv:{userId:proof.userId,customData:proof.intentId}});
  let settled=false;void result.then(()=>{settled=true;});
  f.events.get('reward')!();await flush();expect(settled).toBe(false);
  f.events.get('dismiss')!();expect(await result).toBe('earned');expect(f.removed).toHaveBeenCalledTimes(3);
 });
 it('closing without the reward event is not an earned reward, regardless of show promise',async()=>{
  const f=fixture();const result=f.ads.reward('online',proof);await flush();f.events.get('dismiss')!();expect(await result).toBe('dismissed');
 });
 it('cannot request ads when consent disallows them, but can reopen privacy options',async()=>{
  const f=fixture();f.sdk.requestConsentInfo.mockResolvedValue({status:'REQUIRED',canRequestAds:false});
  expect(await f.ads.interstitial()).toBe('unavailable');expect(f.sdk.prepareInterstitial).not.toHaveBeenCalled();
  expect(await f.ads.privacy()).toBe(true);expect(f.sdk.showPrivacyOptionsForm).toHaveBeenCalledOnce();
 });
 it('selects live units only with explicit opt-in and cleans up on show failure',async()=>{
  const f=fixture(true,true);f.sdk.showRewardVideoAd.mockRejectedValue(new Error('failed'));
  expect(await f.ads.reward('online',proof)).toBe('failed');
  expect(f.sdk.prepareRewardVideoAd).toHaveBeenCalledWith(expect.objectContaining({adId:ADMOB_UNITS.online,isTesting:false}));
  expect(f.events.size).toBe(0);
 });
 it('times out failed loading and allows a later retry',async()=>{
  vi.useFakeTimers();const f=fixture();let complete!:(value:object)=>void;
  f.sdk.prepareInterstitial.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
  const result=f.ads.interstitial();await flush();await vi.advanceTimersByTimeAsync(15001);expect(await result).toBe('failed');
  expect(f.sdk.showInterstitial).not.toHaveBeenCalled();expect(f.events.size).toBe(0);
  expect(await f.ads.interstitial()).toBe('busy');
  complete({});await flush();
  const retry=f.ads.interstitial();await flush();f.events.get('interstitialDismiss')!();expect(await retry).toBe('dismissed');
  expect(f.sdk.initialize).toHaveBeenCalledOnce();
 });
 it('times out initialization without starting a second native initialization',async()=>{
  vi.useFakeTimers();const f=fixture();f.sdk.initialize.mockImplementation(()=>new Promise(()=>{}));
  const result=f.ads.interstitial();await flush();await vi.advanceTimersByTimeAsync(15001);
  expect(await result).toBe('failed');expect(await f.ads.interstitial()).toBe('busy');
  expect(f.sdk.initialize).toHaveBeenCalledOnce();expect(f.sdk.prepareInterstitial).not.toHaveBeenCalled();
 });
 it('does not interpret events during preparation as reward evidence',async()=>{
  const f=fixture();let complete!:(value:object)=>void;
  f.sdk.prepareRewardVideoAd.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
  const result=f.ads.reward('hint',proof);await flush();
  f.events.get('reward')!();f.events.get('dismiss')!();complete({});await flush();
  f.events.get('dismiss')!();expect(await result).toBe('dismissed');
 });
});
