'use client';
import {supabase} from './supabaseClient';
import {gameServerUrl,readRankedSession} from './rankedSession';
import {isAndroidApp,nativeAds} from './nativeAds';
import {createRewardFlow} from './rewardFlow';
export type RewardKind='hint'|'online';
export const nativeRewardsEnabled=()=>isAndroidApp()&&process.env.NEXT_PUBLIC_NATIVE_REWARDS_ENABLED==='true';
export async function requestRewardApi(userId:string,path:string,body?:unknown):Promise<Record<string,unknown>>{
 if(!userId||/^(guest|anon|cpu|ai[:_-])/i.test(userId))throw new Error('AUTH_REQUIRED');
 let token=readRankedSession(userId)?.token;
 if(!token){
  const {data,error}=await supabase.auth.getSession();const session=data.session;
  if(!error&&session?.user.id===userId&&!session.user.is_anonymous&&(!session.expires_at||session.expires_at*1000>Date.now()))token=session.access_token;
 }
 if(!token)throw new Error('AUTH_REQUIRED');
 const url=new URL(path,gameServerUrl());
 if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('UNAVAILABLE');
 const response=await fetch(url,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('UNAVAILABLE');return response.json();
}
export async function readRewardBalance(userId:string){
 const {balance}=await requestRewardApi(userId,'/ads/allowance');
 const b=balance as Record<RewardKind,number>;
 if(!b||!['hint','online'].every(k=>Number.isSafeInteger(b[k as RewardKind])&&b[k as RewardKind]>=0))throw new Error('UNAVAILABLE');
 return b;
}
/** Explicit user opt-in only. A local SDK reward never changes the balance.
 * Server SSV may arrive later; reopening settings fetches the durable balance. */
export const watchNativeReward=createRewardFlow({
 enabled:nativeRewardsEnabled,request:requestRewardApi,
 show:(kind,proof)=>nativeAds.reward(kind,proof),
 wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),
});
