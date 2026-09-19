import {Capacitor,registerPlugin} from '@capacitor/core';
import {supabase} from './supabaseClient';
import {gameServerUrl,readRankedSession} from './rankedSession';

export type FoundersErrorCode='AUTH_REQUIRED'|'NOT_ELIGIBLE'|'ALREADY_LINKED'|'UNAVAILABLE'|'PENDING'|'ANDROID_ONLY';
export class FoundersClientError extends Error {constructor(public code:FoundersErrorCode){super(code);}}
export type FoundersStatus={userId:string;enabled:boolean;owned:boolean;deliveryPending?:boolean};
const PlayRewards=registerPlugin<{restore():Promise<{tokens:string[];pending:boolean}>}>('PlayRewards');
export const canRestorePlayRewards=()=>Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';
export async function foundersPurchaseAvailable(signal:AbortSignal):Promise<boolean>{
    if(!canRestorePlayRewards())return false;
    signal.throwIfAborted();
    const value=await PlayRewards.restore();signal.throwIfAborted();
    return Array.isArray(value?.tokens)&&value.tokens.length>0&&value.tokens.length<=8;
}

async function request(userId:string,signal:AbortSignal,purchaseToken?:string):Promise<FoundersStatus>{
    signal.throwIfAborted();
    let token=readRankedSession(userId)?.token;
    if(!token){
        const {data,error}=await supabase.auth.getSession();
        const session=data.session;
        if(!error&&session?.user.id===userId&&!session.user.is_anonymous&&(!session.expires_at||session.expires_at*1000>Date.now()))token=session.access_token;
    }
    signal.throwIfAborted();
    if(!token)throw new FoundersClientError('AUTH_REQUIRED');
    try{
        const url=new URL(`/rewards/founders${purchaseToken?'/claim':''}`,gameServerUrl());
        if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error();
        const response=await fetch(url,{method:purchaseToken?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(purchaseToken?{'Content-Type':'application/json'}:{})},
            ...(purchaseToken?{body:JSON.stringify({purchaseToken})}:{}),signal:AbortSignal.any([signal,AbortSignal.timeout(30000)]),credentials:'omit',cache:'no-store',redirect:'error'});
        if(response.status===401||response.status===403)throw new FoundersClientError('AUTH_REQUIRED');
        if(response.status===409)throw new FoundersClientError('ALREADY_LINKED');
        if(response.status===422)throw new FoundersClientError('NOT_ELIGIBLE');
        if(!response.ok)throw new Error();
        const value=await response.json();signal.throwIfAborted();
        if(value?.userId!==userId||typeof value.enabled!=='boolean'||typeof value.owned!=='boolean'||
            (value.deliveryPending!==undefined&&typeof value.deliveryPending!=='boolean'))throw new Error();
        return {userId,enabled:value.enabled,owned:value.owned,deliveryPending:value.deliveryPending};
    }catch(error){if(signal.aborted)throw signal.reason;if(error instanceof FoundersClientError)throw error;throw new FoundersClientError('UNAVAILABLE');}
}
export const readFoundersStatus=(userId:string,signal:AbortSignal)=>request(userId,signal);
/** Tokens stay in memory; neither localStorage nor analytics receives a receipt. */
export async function restoreFounders(userId:string,signal:AbortSignal):Promise<FoundersStatus>{
    if(!canRestorePlayRewards())throw new FoundersClientError('ANDROID_ONLY');
    signal.throwIfAborted();
    let purchases:{tokens:string[];pending:boolean};
    try{purchases=await PlayRewards.restore();}catch{throw new FoundersClientError('UNAVAILABLE');}
    signal.throwIfAborted();
    if(!Array.isArray(purchases?.tokens)||purchases.tokens.length>8||purchases.tokens.some(token=>typeof token!=='string'||token.length<16||token.length>4096))throw new FoundersClientError('UNAVAILABLE');
    if(!purchases.tokens.length){
        const status=await request(userId,signal);
        if(status.owned)return status;
        throw new FoundersClientError(purchases.pending?'PENDING':'NOT_ELIGIBLE');
    }
    // Only one dedicated product should be present; never claim unrelated products.
    return request(userId,signal,purchases.tokens[0]);
}
