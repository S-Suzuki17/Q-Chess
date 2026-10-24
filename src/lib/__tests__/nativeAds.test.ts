import {afterEach,describe,expect,it,vi} from 'vitest';
import type {AdMobPlugin} from '@capacitor-community/admob';
import {acceptAdEntitlement,resetAdEntitlement,canShowVerifiedAccountAdsFor} from '../sharedAdEligibility';
import {NativeAds} from '../nativeAds';
import {ADMOB_TEST_UNITS,ADMOB_UNITS} from '../../config/nativeAds';
import {createRewardFlow} from '../rewardFlow';

vi.mock('@capacitor-community/admob',()=>({
 RewardAdPluginEvents:{Rewarded:'reward',Dismissed:'dismiss',FailedToShow:'fail'},
 InterstitialAdPluginEvents:{Dismissed:'interstitialDismiss',FailedToShow:'interstitialFail'},
}));
const proof={accountId:'actual-account',intentId:'server-issued-intent'};
function fixture(supported=true,live=false,canShowAds: (userId?:string)=>boolean=()=>true){
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
 const load=vi.fn(async()=>({AdMob:sdk as unknown as AdMobPlugin}));
 const audience=vi.fn(async()=>true);
 return{ads:new NativeAds(()=>supported,()=>live,load,canShowAds,undefined,audience),sdk,load,events,removed,audience};
}
async function flush(){for(let i=0;i<40;i++)await Promise.resolve();}
afterEach(()=>{vi.useRealTimers();resetAdEntitlement();});
describe('Android AdMob lifecycle',()=>{
 it('never treats the Capacitor plugin proxy as a Promise during privacy or ad setup',async()=>{
  const f=fixture();const then=vi.fn(()=>{throw new Error('AdMob.then() is not implemented on android');});
  const proxy=new Proxy(f.sdk,{get(target,prop,receiver){if(prop==='then')return then;return Reflect.get(target,prop,receiver);}});
  f.load.mockResolvedValue({AdMob:proxy as unknown as AdMobPlugin});
  await f.ads.privacyRequirement();
  const result=f.ads.reward('hint',proof);await flush();
  expect(f.sdk.showRewardVideoAd).toHaveBeenCalledOnce();
  f.events.get('reward')!();f.events.get('dismiss')!();
  expect(await result).toBe('earned');expect(then).not.toHaveBeenCalled();
 });
 it('skips provider initialization when the age prompt is cancelled',async()=>{
  const f=fixture();f.audience.mockResolvedValue(false);
  expect(await f.ads.interstitial()).toBe('unavailable');expect(f.load).not.toHaveBeenCalled();
 });
 it('rechecks the account after the age prompt before requesting consent',async()=>{
  let eligible=true;const f=fixture(true,false,()=>eligible);
  f.audience.mockImplementation(async()=>{eligible=false;return true;});
  expect(await f.ads.reward('hint',proof)).toBe('unavailable');expect(f.load).not.toHaveBeenCalled();
 });
 it('does not initialize on Web or without a server intent',async()=>{
  const f=fixture(false);expect(await f.ads.reward('hint',proof)).toBe('unavailable');expect(f.load).not.toHaveBeenCalled();
  const android=fixture();expect(await android.ads.reward('hint',{...proof,intentId:''})).toBe('unavailable');expect(android.load).not.toHaveBeenCalled();
 });
 it.each(['paid','unknown','different_account'] as const)('reward and interstitial do not prepare after %s during listener setup',async change=>{
  for(const kind of ['reward','interstitial']){
   acceptAdEntitlement(proof.accountId,{plan:'free',noAds:false,unlimitedOnlineRanked:false,periodEnd:null});
   const f=fixture(true,false,canShowVerifiedAccountAdsFor),register=f.sdk.addListener.getMockImplementation()!;
   let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
   f.sdk.addListener.mockImplementationOnce(async(name,fn)=>{await pending;return register(name,fn);});
   const result=kind==='reward'?f.ads.reward('hint',proof):f.ads.interstitial();await flush();
   expect(f.sdk.addListener).toHaveBeenCalledOnce();
   if(change==='paid')acceptAdEntitlement(proof.accountId,{plan:'plus',noAds:true,unlimitedOnlineRanked:true,periodEnd:'2099-01-01'});
   else if(change==='unknown')resetAdEntitlement();
   else acceptAdEntitlement('other-account',{plan:'free',noAds:false,unlimitedOnlineRanked:false,periodEnd:null});
   release();expect(await result).toBe('unavailable');
   expect(f.sdk.prepareRewardVideoAd).not.toHaveBeenCalled();expect(f.sdk.prepareInterstitial).not.toHaveBeenCalled();
   expect(f.sdk.showRewardVideoAd).not.toHaveBeenCalled();expect(f.sdk.showInterstitial).not.toHaveBeenCalled();
   expect(f.events.size).toBe(0);
  }
 });
 it('rejects a reward intent owned by a different account before loading the provider',async()=>{
  acceptAdEntitlement('other-account',{plan:'free',noAds:false,unlimitedOnlineRanked:false,periodEnd:null});
  const f=fixture(true,false,canShowVerifiedAccountAdsFor);
  expect(await f.ads.reward('hint',proof)).toBe('unavailable');expect(f.load).not.toHaveBeenCalled();
 });
 it('uses test units, waits for dismissal and rejects overlapping requests',async()=>{
  const f=fixture();const result=f.ads.reward('hint',proof);await flush();
  expect(await f.ads.interstitial()).toBe('busy');
  expect(f.sdk.initialize).toHaveBeenCalledWith({initializeForTesting:true,tagForChildDirectedTreatment:true,tagForUnderAgeOfConsent:true,maxAdContentRating:'General'});
  expect(f.sdk.requestConsentInfo).toHaveBeenCalledWith({tagForUnderAgeOfConsent:true});
  expect(f.sdk.prepareRewardVideoAd).toHaveBeenCalledWith({adId:ADMOB_TEST_UNITS.hint,isTesting:true,ssv:{userId:proof.intentId,customData:proof.intentId}});
  let settled=false;void result.then(()=>{settled=true;});
  f.events.get('reward')!();await flush();expect(settled).toBe(false);
  f.events.get('dismiss')!();expect(await result).toBe('earned');expect(f.removed).toHaveBeenCalledTimes(3);
 });
 it('closing without the reward event is not an earned reward, regardless of show promise',async()=>{
  const f=fixture();const result=f.ads.reward('online',proof);await flush();f.events.get('dismiss')!();expect(await result).toBe('dismissed');
 });
 it('cannot request ads when consent disallows them, but can reopen privacy options',async()=>{
  const f=fixture();f.sdk.requestConsentInfo.mockResolvedValue({status:'REQUIRED',canRequestAds:false,privacyOptionsRequirementStatus:'REQUIRED'});
  expect(await f.ads.interstitial()).toBe('unavailable');expect(f.sdk.prepareInterstitial).not.toHaveBeenCalled();expect(f.sdk.initialize).not.toHaveBeenCalled();
  expect(await f.ads.privacy()).toBe('opened');expect(f.sdk.showPrivacyOptionsForm).toHaveBeenCalledOnce();expect(f.sdk.initialize).not.toHaveBeenCalled();
 });
 it('privacy requirement distinguishes unnecessary, unknown and failed checks without initializing ads',async()=>{
  const f=fixture();
  f.sdk.requestConsentInfo.mockResolvedValue({status:'NOT_REQUIRED',canRequestAds:false,privacyOptionsRequirementStatus:'NOT_REQUIRED'});
  expect(await f.ads.privacyRequirement()).toBe('NOT_REQUIRED');expect(await f.ads.privacy()).toBe('not-required');expect(f.sdk.showPrivacyOptionsForm).not.toHaveBeenCalled();
  f.sdk.requestConsentInfo.mockResolvedValue({status:'UNKNOWN',canRequestAds:false,privacyOptionsRequirementStatus:'UNKNOWN'});expect(await f.ads.privacyRequirement()).toBe('UNKNOWN');expect(await f.ads.privacy()).toBe('unavailable');
  f.sdk.requestConsentInfo.mockRejectedValueOnce(new Error('network'));expect(await f.ads.privacyRequirement()).toBe('FAILED');expect(f.sdk.initialize).not.toHaveBeenCalled();
 });
 it('obtains UMP permission before MobileAds initialization and applies child flags before any ad request',async()=>{
  const f=fixture();const result=f.ads.interstitial();await flush();
  expect(f.sdk.requestConsentInfo.mock.invocationCallOrder[0]).toBeLessThan(f.sdk.initialize.mock.invocationCallOrder[0]);
  expect(f.sdk.initialize.mock.invocationCallOrder[0]).toBeLessThan(f.sdk.prepareInterstitial.mock.invocationCallOrder[0]);
  f.events.get('interstitialDismiss')!();expect(await result).toBe('dismissed');
 });
 it('does not initialize after an account becomes ad-free while UMP is open',async()=>{
  acceptAdEntitlement(proof.accountId,{plan:'free',noAds:false,unlimitedOnlineRanked:false,periodEnd:null});
  const f=fixture(true,false,canShowVerifiedAccountAdsFor);let complete!:(value:{status:'NOT_REQUIRED';canRequestAds:boolean})=>void;
  f.sdk.requestConsentInfo.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
  const result=f.ads.interstitial();await flush();
  acceptAdEntitlement(proof.accountId,{plan:'plus',noAds:true,unlimitedOnlineRanked:true,periodEnd:'2099-01-01'});
  complete({status:'NOT_REQUIRED',canRequestAds:true});expect(await result).toBe('unavailable');expect(f.sdk.initialize).not.toHaveBeenCalled();
 });
 it('joins the real reward flow to verified-account eligibility, then waits for SDK close and server confirmation',async()=>{
  const accountId='actual-account',intentId='00000000-0000-4000-8000-000000000001';
  acceptAdEntitlement(accountId,{plan:'free',noAds:false,unlimitedOnlineRanked:false,periodEnd:null});
  const f=fixture(true,false,canShowVerifiedAccountAdsFor),request=vi.fn(async(_owner:string,path:string)=>path==='/ads/reward'?{intentId}:{status:'credited'});
  const run=createRewardFlow({enabled:()=>true,request,show:(kind,p)=>f.ads.reward(kind,p),wait:async()=>{}});
  const result=run(accountId,'hint');await flush();expect(f.sdk.prepareRewardVideoAd).toHaveBeenCalledWith(expect.objectContaining({ssv:{userId:intentId,customData:intentId}}));
  f.events.get('reward')!();await flush();expect(request).toHaveBeenCalledTimes(1);
  f.events.get('dismiss')!();expect(await result).toBe('credited');expect(request).toHaveBeenLastCalledWith(accountId,'/ads/reward/'+intentId);
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
