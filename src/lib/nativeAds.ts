import {Capacitor} from '@capacitor/core';
import type {AdMobPlugin,MaxAdContentRating} from '@capacitor-community/admob';
import {ADMOB_UNITS,ADMOB_TEST_UNITS,nativeAdsLive} from '../config/nativeAds';
import {soundManager} from './SoundService';

export type AdResult='earned'|'dismissed'|'unavailable'|'busy'|'failed';
export const isAndroidApp=()=>Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';
type Listener={remove:()=>Promise<void>};
type RewardProof={userId:string;intentId:string};

/** Native completion is a UI signal, NOT a verified server receipt.
 * Credits must come from the authenticated allowance API after Google SSV. */
export class NativeAds {
    private busy=false;
    private sdk?:Promise<AdMobPlugin>;
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
    constructor(private supported=isAndroidApp,private live=nativeAdsLive,private load=async()=> (await import('@capacitor-community/admob')).AdMob){}
    private async initialize(){
        const ad=await this.bounded(this.sdk??=this.load().then(async sdk=>{
            // Conservative default for a mixed audience: never assume an adult.
            // The plugin applies this configuration BEFORE MobileAds.initialize.
            await sdk.initialize({initializeForTesting:!this.live(),tagForChildDirectedTreatment:true,tagForUnderAgeOfConsent:true,maxAdContentRating:'General' as MaxAdContentRating});
            return sdk;
        }).catch(error=>{this.sdk=undefined;throw error;}));
        return ad;
    }
    private async ready(){
        const ad=await this.initialize();
        let consent=await this.bounded(ad.requestConsentInfo({tagForUnderAgeOfConsent:true}));
        if(consent.status==='REQUIRED'&&consent.isConsentFormAvailable)consent=await ad.showConsentForm();
        return consent.canRequestAds?ad:null;
    }
    async privacy():Promise<boolean>{
        if(!this.supported()||this.busy||this.pendingOperations.size)return false;
        this.busy=true;
        // Privacy choices must remain accessible even when ads are not permitted.
        try{const ad=await this.initialize();await this.bounded(ad.requestConsentInfo({tagForUnderAgeOfConsent:true}));await ad.showPrivacyOptionsForm();return true;}catch{return false;}finally{this.busy=false;}
    }
    async reward(kind:'hint'|'online',proof:RewardProof):Promise<AdResult>{
        if(!proof.userId||!proof.intentId)return 'unavailable';
        return this.show(kind,proof);
    }
    async interstitial():Promise<AdResult>{return this.show('circuit');}
    private async show(kind:keyof typeof ADMOB_UNITS,proof?:RewardProof):Promise<AdResult>{
        if(!this.supported())return 'unavailable';
        if(this.busy||this.pendingOperations.size)return 'busy';
        this.busy=true;
        const listeners:Listener[]=[];
        let resumeAudio:(()=>void)|undefined;
        try{
            const ad=await this.ready();if(!ad)return 'unavailable';
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
            const prepare=rewarded?ad.prepareRewardVideoAd({...options,ssv:{userId:proof!.userId,customData:proof!.intentId}}):ad.prepareInterstitial(options);
            await this.bounded(prepare);
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
