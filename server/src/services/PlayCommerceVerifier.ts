import {GoogleAuth} from 'google-auth-library';
import {PLAY_COMMERCE_PACKAGE,playCommerceProduct} from './PlayCommerceCatalog';
import {parsePlayCommerceProof,type PlayCommerceProof} from './PlayCommerceProof';
import {parsePlayCommercePaidOrder,parsePlayCommerceHistoricalOrder,type PlayCommercePaidOrder} from './PlayCommercePaidOrder';
import {PlayCommerceError,playToken,playOrderId} from './PlayCommerceValues';
import type {CommerceSku} from './CommerceCatalog';

export interface PlayCanonicalPurchase {
    purchase:PlayCommerceProof;
    order:PlayCommercePaidOrder|null;
    orderUnavailable:boolean;
}
export interface PlayCommerceVerifier {
    verify(sku:CommerceSku,token:string):Promise<PlayCanonicalPurchase>;
    deliver(sku:CommerceSku,token:string,action:'acknowledge'|'consume'):Promise<void>;
    historical(sku:CommerceSku,token:string,orderId:string,test:boolean):Promise<PlayCommercePaidOrder>;
    cancel(sku:CommerceSku,token:string):Promise<void>;
}
export type PlayPublisherRequest=(path:string,method?:'GET'|'POST',body?:unknown)=>Promise<unknown>;
const packagePath=`/androidpublisher/v3/applications/${PLAY_COMMERCE_PACKAGE}`;

/** Only the authenticated Publisher transport can feed these parsers. Native JSON is never evidence. */
export function playCommerceVerifier(request:PlayPublisherRequest,now=Date.now):PlayCommerceVerifier {
    return {
        async historical(sku,rawToken,rawOrderId,test){
            const token=playToken(rawToken),orderId=playOrderId(rawOrderId);
            const raw=await request(`${packagePath}/orders/${encodeURIComponent(orderId)}`);
            return parsePlayCommerceHistoricalOrder(sku,raw,{packageName:PLAY_COMMERCE_PACKAGE,purchaseToken:token,orderId,test,now:now()});
        },
        async cancel(sku,rawToken){
            if(playCommerceProduct(sku)?.type!=='subs')throw new PlayCommerceError('INVALID_PURCHASE');
            await request(`${packagePath}/purchases/subscriptionsv2/tokens/${encodeURIComponent(playToken(rawToken))}:cancel`,'POST',
                {cancellationContext:{cancellationType:'DEVELOPER_REQUESTED_STOP_PAYMENTS'}});
        },
        async verify(sku,rawToken){
            const product=playCommerceProduct(sku);if(!product)throw new PlayCommerceError('INVALID_PURCHASE');
            const token=playToken(rawToken);
            const raw=await request(`${packagePath}/purchases/${product.type==='subs'?'subscriptionsv2':'productsv2'}/tokens/${encodeURIComponent(token)}`);
            const purchase=parsePlayCommerceProof(sku,raw,now());
            let order:PlayCommercePaidOrder|null=null,orderUnavailable=false;
            if(purchase.orderId){
                try{
                    const canonical=await request(`${packagePath}/orders/${encodeURIComponent(playOrderId(purchase.orderId))}`);
                    order=parsePlayCommercePaidOrder(sku,canonical,{packageName:PLAY_COMMERCE_PACKAGE,purchaseToken:token,purchase,now:now()});
                }catch{
                    // Missing, contradictory or inaccessible order proof never fabricates a paid period.
                    // The durable caller must preserve this as a retry, with no new grant/acknowledgement.
                    orderUnavailable=true;
                }
            }
            return {purchase,order,orderUnavailable};
        },
        async deliver(sku,rawToken,action){
            const product=playCommerceProduct(sku);if(!product||action!==(product.type==='subs'?'acknowledge':'consume'))throw new PlayCommerceError('INVALID_PURCHASE');
            const token=playToken(rawToken);
            // Called ONLY for a durable outbox row whose grant/ownership transaction committed.
            await request(`${packagePath}/purchases/${product.type==='subs'?'subscriptions':'products'}/${encodeURIComponent(product.productId)}/tokens/${encodeURIComponent(token)}:${action}`,'POST');
        },
    };
}

/** Uses the already configured Play identity. Never creates credentials or follows credential URLs. */
export function createPlayCommerceVerifier():PlayCommerceVerifier|null {
    try{
        const credentials=JSON.parse(process.env.PLAY_REWARDS_SERVICE_ACCOUNT_JSON??'null');
        if(credentials?.type!=='service_account'||typeof credentials.client_email!=='string'||typeof credentials.private_key!=='string')return null;
        const auth=new GoogleAuth({credentials:{client_email:credentials.client_email,private_key:credentials.private_key},
            scopes:['https://www.googleapis.com/auth/androidpublisher'],clientOptions:{transporterOptions:{timeout:8000,retry:false}}});
        return playCommerceVerifier(async(path,method='GET',body={})=>{
            try{
                if(!path.startsWith(packagePath+'/'))throw new Error();
                const accessToken=await auth.getAccessToken();if(!accessToken)throw new Error();
                const response=await fetch(`https://androidpublisher.googleapis.com${path}`,{method,redirect:'error',
                    headers:{Authorization:`Bearer ${accessToken}`,...(method==='POST'?{'Content-Type':'application/json'}:{})},
                    ...(method==='POST'?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
                if(!response.ok)throw new Error();
                return method==='GET'?await response.json():undefined;
            }catch{throw new PlayCommerceError('UNAVAILABLE');}
        });
    }catch{return null;}
}
