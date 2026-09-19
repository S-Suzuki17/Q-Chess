import {GoogleAuth} from 'google-auth-library';
import {FOUNDERS_PRODUCT,PLAY_PACKAGE,FoundersError,type PlayRewardPurchase,type PlayRewardVerifier} from './FoundersRewards';

/** Never forward client package/product IDs or log upstream errors containing tokens. */
export function createPlayRewardVerifier():PlayRewardVerifier|null {
    if(process.env.PLAY_PREREG_REWARDS_ENABLED!=='true')return null;
    try {
        const credentials=JSON.parse(process.env.PLAY_REWARDS_SERVICE_ACCOUNT_JSON??'null');
        if(credentials?.type!=='service_account'||typeof credentials.client_email!=='string'||typeof credentials.private_key!=='string')return null;
        // Ignore arbitrary credential endpoint/universe overrides.
        const auth=new GoogleAuth({credentials:{client_email:credentials.client_email,private_key:credentials.private_key},scopes:['https://www.googleapis.com/auth/androidpublisher'],clientOptions:{transporterOptions:{timeout:8000,retry:false}}});
        const request=async(token:string,consume=false)=>{
            try{
                const accessToken=await auth.getAccessToken();
                if(!accessToken)throw new Error();
                const url=`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE}/purchases/products/${FOUNDERS_PRODUCT}/tokens/${encodeURIComponent(token)}${consume?':consume':''}`;
                const response=await fetch(url,{method:consume?'POST':'GET',headers:{Authorization:`Bearer ${accessToken}`},signal:AbortSignal.timeout(10000),redirect:'error'});
                if(!consume&&[400,404,410].includes(response.status))throw new FoundersError('NOT_ELIGIBLE');
                if(!response.ok)throw new FoundersError('UNAVAILABLE');
                return consume?undefined:await response.json();
            }catch(error){throw error instanceof FoundersError?error:new FoundersError('UNAVAILABLE');}
        };
        return {verify:async token=>await request(token) as PlayRewardPurchase,consume:async token=>{await request(token,true);}};
    }catch{return null;}
}
