import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';

export const FOUNDERS_PRODUCT='qg_founders_preregister';
export const PLAY_PACKAGE='com.qgambit.app';
export const validPurchaseToken=(token:unknown):token is string=>typeof token==='string'&&token.length>=16&&token.length<=4096&&/^[A-Za-z0-9._~-]+$/.test(token);
export const receiptHash=(token:string)=>createHash('sha256').update(`${PLAY_PACKAGE}:${FOUNDERS_PRODUCT}:${token}`).digest('hex');
export class FoundersError extends Error {constructor(public code:'NOT_ELIGIBLE'|'ALREADY_LINKED'|'UNAVAILABLE'){super(code);}}
export interface PlayRewardPurchase {purchaseState?:number;consumptionState?:number;productId?:string;purchaseType?:number;quantity?:number;obfuscatedExternalAccountId?:string}
export interface PlayRewardVerifier {verify(token:string):Promise<PlayRewardPurchase>;consume(token:string):Promise<void>}
export interface FoundersStore {
    verifyUser(token:string):Promise<string|null>;
    owned(userId:string):Promise<boolean>;
    receiptOwner(hash:string):Promise<string|null>;
    grant(userId:string,hash:string):Promise<'granted'|'owned'|'conflict'>;
}
/** Google proof first; atomically persist before consume. Retries cannot move ownership. */
export async function claimFounders(userId:string,token:string,store:FoundersStore,play:PlayRewardVerifier,allowTest=false) {
    if(!validPurchaseToken(token))throw new FoundersError('NOT_ELIGIBLE');
    const hash=receiptHash(token),owner=await store.receiptOwner(hash);
    if(owner&&owner!==userId)throw new FoundersError('ALREADY_LINKED');
    const purchase=await play.verify(token);
    if(purchase.purchaseState!==0||![0,1].includes(purchase.consumptionState!)||
        (purchase.productId!==undefined&&purchase.productId!==FOUNDERS_PRODUCT)||
        (purchase.quantity!==undefined&&purchase.quantity!==1)||(!allowTest&&purchase.purchaseType===0)||
        (purchase.obfuscatedExternalAccountId!==undefined&&purchase.obfuscatedExternalAccountId!==createHash('sha256').update(userId).digest('hex')))
        throw new FoundersError('NOT_ELIGIBLE');
    // Consumed tokens cannot mint a fresh entitlement, including after account deletion.
    if(purchase.consumptionState===1&&!owner)throw new FoundersError('NOT_ELIGIBLE');
    const result=await store.grant(userId,hash);
    if(result==='conflict')throw new FoundersError('ALREADY_LINKED');
    let deliveryPending=false;
    if(purchase.consumptionState===0){try{await play.consume(token);}catch{deliveryPending=true;}}
    return {owned:true as const,deliveryPending};
}
export function createFoundersStore(client:SupabaseClient,verifyUser:FoundersStore['verifyUser']):FoundersStore {
    return {
        verifyUser,
        async owned(userId){const {data,error}=await client.from('founders_entitlements').select('user_id').eq('user_id',userId).abortSignal(AbortSignal.timeout(5000)).maybeSingle();if(error)throw new FoundersError('UNAVAILABLE');return data?.user_id===userId;},
        async receiptOwner(hash){const {data,error}=await client.from('founders_entitlements').select('user_id').eq('receipt_hash',hash).abortSignal(AbortSignal.timeout(5000)).maybeSingle();if(error)throw new FoundersError('UNAVAILABLE');return data?.user_id??null;},
        async grant(userId,hash){const {data,error}=await client.rpc('grant_founders_reward',{p_user_id:userId,p_receipt_hash:hash}).abortSignal(AbortSignal.timeout(5000));if(error||!['granted','owned','conflict'].includes(data))throw new FoundersError('UNAVAILABLE');return data;},
    };
}
