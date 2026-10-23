import { canShowVerifiedAccountAdsFor, verifiedAdAccountId } from './sharedAdEligibility';
import {Capacitor} from '@capacitor/core';
import type {AdMobPlugin,MaxAdContentRating} from '@capacitor-community/admob';
import {ADMOB_UNITS,ADMOB_TEST_UNITS,nativeAdsLive} from '../config/nativeAds';
import {soundManager} from './SoundService';
import {ensureAdAudience} from './nativeAdAudience';

export type AdResult='earned'|'dismissed'|'unavailable'|'busy'|'failed';
export type AdPrivacyRequirement='REQUIRED'|'NOT_REQUIRED'|'UNKNOWN'|'FAILED';
export const isAndroidApp=()=>Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';
type Listener={remove:()=>Promise<void>};
type RewardProof={accountId:string;intentId:string};

/** Native completion is a UI signal, NOT a verified server receipt.
 * Credits must come from the authenticated allowance API after Google SSV. */
export class NativeAds {
    private busy=false;
    private sdk?:Promise<{AdMob:AdMobPlugin}>;
    private initialized?:Promise<void>;
    private pendingOperations=new Set<Promise<unknown>>();
    /** A timeout releases UI, not the native operation. Block another request
     * until it settles so late SDK callbacks cannot cross reward intents. */
    private async bounded<T>(operation:Promise<T>):Promise<T>{
        this.pendingOperations.add(operation);
        void operation.then(()=>this.pendingOperations.delete(operation),()=>this.pendingOperations.delete(operation));
        let timer:ReturnType<typeof setTimeout>|undefined;
        try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Ad operation timeout')),15000);})]);}
        finally{clearTimeout(timer);}
    }
    constructor(private supported=isAndroidApp,private live=nativeAdsLive,private load:()=>Promise<{AdMob:AdMobPlugin}>=()=>import('@capacitor-community/admob'),private canShowAds=canShowVerifiedAccountAdsFor,private adAccount=verifiedAdAccountId,private confirmAudience=ensureAdAudience){}
    private async provider(){
        // Keep the proxy inside its module object: resolving a Promise with the
        // raw Capacitor proxy calls its synthetic, unsupported `then` method.
        // Loading the Capacitor bridge and UMP does not initialize MobileAds.
        return this.bounded(this.sdk??=this.load().catch(error=>{this.sdk=undefined;throw error;}));
    }
    private async ready(canShow:()=>boolean){
        const provider=await this.provider(),ad=provider.AdMob;
        let consent=await this.bounded(ad.requestConsentInfo({tagForUnderAgeOfConsent:true}));
        if(consent.status==='REQUIRED'&&consent.isConsentFormAvailable)consent=await ad.showConsentForm();
        if(!consent.canRequestAds||!canShow())return null;
        // Consent and account eligibility precede possible SDK preloading.
        // The plugin applies the child/under-age/General flags before initialize.
        await this.bounded(this.initialized??=ad.initialize({initializeForTesting:!this.live(),tagForChildDirectedTreatment:true,tagForUnderAgeOfConsent:true,maxAdContentRating:'General' as MaxAdContentRating}).catch(error=>{this.initialized=undefined;throw error;}));
        return provider;
    }
    async privacyRequirement():Promise<AdPrivacyRequirement>{
        if(!this.supported()||this.busy||this.pendingOperations.size)return 'UNKNOWN';
        this.busy=true;
        try{
            const {AdMob:ad}=await this.provider(),info=await this.bounded(ad.requestConsentInfo({tagForUnderAgeOfConsent:true}));
            return info.privacyOptionsRequirementStatus==='REQUIRED'?'REQUIRED':info.privacyOptionsRequirementStatus==='NOT_REQUIRED'?'NOT_REQUIRED':'UNKNOWN';
        }catch{return 'FAILED';}finally{this.busy=false;}
    }
    async privacy():Promise<'opened'|'not-required'|'unavailable'>{
        if(!this.supported()||this.busy||this.pendingOperations.size)return 'unavailable';
        this.busy=true;
        // Privacy choices must remain accessible even when ads are not permitted.
        try{
            const {AdMob:ad}=await this.provider(),info=await this.bounded(ad.requestConsentInfo({tagForUnderAgeOfConsent:true}));
            if(info.privacyOptionsRequirementStatus==='NOT_REQUIRED')return 'not-required';
            if(info.privacyOptionsRequirementStatus!=='REQUIRED')return 'unavailable';
            await ad.showPrivacyOptionsForm();return 'opened';
        }catch{return 'unavailable';}finally{this.busy=false;}
    }
    async reward(kind:'hint'|'online',proof:RewardProof):Promise<AdResult>{
        if(!proof.accountId||!proof.intentId)return 'unavailable';
        return this.show(kind,proof);
    }
    async interstitial():Promise<AdResult>{return this.show('circuit');}
    private async show(kind:keyof typeof ADMOB_UNITS,proof?:RewardProof):Promise<AdResult>{
        const accountId=proof?.accountId??this.adAccount()??undefined;
        const canShow=()=>this.canShowAds(accountId);
        if(!this.supported()||!canShow())return 'unavailable';
        if(this.busy||this.pendingOperations.size)return 'busy';
        this.busy=true;
        const listeners:Listener[]=[];
        let resumeAudio:(()=>void)|undefined;
        try{
            if(!await this.confirmAudience()||!canShow())return 'unavailable';
            const provider=await this.ready(canShow);if(!provider||!canShow())return 'unavailable';
            const ad=provider.AdMob;
            const {RewardAdPluginEvents:R,InterstitialAdPluginEvents:I}=await import('@capacitor-community/admob');
            const rewarded=kind!=='circuit';let earned=false;let showing=false;
            let finish!:(result:AdResult)=>void;
            const closed=new Promise<AdResult>(resolve=>{finish=resolve;});
            if(rewarded){
                listeners.push(await ad.addListener(R.Rewarded,()=>{if(showing)earned=true;}));
                listeners.push(await ad.addListener(R.Dismissed,()=>{if(showing)finish(earned?'earned':'dismissed');}));
                listeners.push(await ad.addListener(R.FailedToShow,()=>{if(showing)finish('failed');}));
            }else{
                listeners.push(await ad.addListener(I.Dismissed,()=>{if(showing)finish('dismissed');}));
                listeners.push(await ad.addListener(I.FailedToShow,()=>{if(showing)finish('failed');}));
            }
            const adId=(this.live()?ADMOB_UNITS:ADMOB_TEST_UNITS)[kind];
            const options={adId,isTesting:!this.live()};
            // Listener registration and dynamic imports can outlive an account
            // switch or a paid/unknown entitlement transition. Recheck at the
            // provider-request boundary, with the reward intent's account bound.
            if(!canShow())return 'unavailable';
            // Eligibility uses the actual owner locally. Google receives only
            // the random server intent, never the account name or Auth ID.
            const prepare=rewarded?ad.prepareRewardVideoAd({...options,ssv:{userId:proof!.intentId,customData:proof!.intentId}}):ad.prepareInterstitial(options);
            await this.bounded(prepare);
            if(!canShow())return 'unavailable';
            resumeAudio=soundManager.pauseForAd();
            showing=true;
            // show promises may settle at reward time; wait for dismissal before resuming play.
            if(rewarded)void ad.showRewardVideoAd({adId}).catch(()=>finish('failed'));
            else void ad.showInterstitial({adId}).catch(()=>finish('failed'));
            return await closed;
        }catch{return 'failed';}
        finally{await Promise.allSettled(listeners.map(listener=>listener.remove()));resumeAudio?.();this.busy=false;}
    }
}
export const nativeAds=new NativeAds();
