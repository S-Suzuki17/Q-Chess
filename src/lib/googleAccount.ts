'use client';
import {Capacitor} from '@capacitor/core';
import {Browser} from '@capacitor/browser';
import {supabase} from './supabaseClient';
import {gameServerUrl} from './rankedSession';
import {clientReleaseHeaders} from './clientRelease';
import {beginOAuthLoginIntent,clearOAuthLoginIntent} from './oauthLoginIntent';
import {CURRENT_TERMS_VERSION} from '../config/currentTerms';
import {setLocalTermsConsent} from './currentAccountTerms';
import {type GoogleAccount,googleAccountFor} from './googleAccountIdentity';

export const GOOGLE_PASSWORD_RESET_KEY='qg_google_password_reset';
export class GoogleLoginError extends Error {constructor(public code:string){super(code);}}
const endpoint=(path:string)=>{
    const url=new URL(path,gameServerUrl());
    if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new GoogleLoginError('AUTH_UNAVAILABLE');
    return url;
};
async function request(path:string,authId:string,body?:unknown,signal?:AbortSignal,token?:string) {
    const {data,error}=await supabase.auth.getSession(),session=data.session;
    if(error||!session||session.user.id!==authId||session.user.is_anonymous)throw new GoogleLoginError('GOOGLE_REQUIRED');
    const response=await fetch(endpoint(path),{method:body===undefined?'GET':'POST',
        headers:{Authorization:`Bearer ${token??session.access_token}`,...clientReleaseHeaders(),...(body===undefined?{}:{'Content-Type':'application/json'})},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),credentials:'omit',cache:'no-store',redirect:'error',
        signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(20000)])});
    const value=await response.json().catch(()=>null);
    if(!response.ok)throw new GoogleLoginError(typeof value?.code==='string'?value.code:'AUTH_UNAVAILABLE');
    if(value?.authId!==authId)throw new GoogleLoginError('AUTH_UNAVAILABLE');
    return value;
}
function parseAccount(value:unknown,authId:string):GoogleAccount|null {
    if(value===null)return null;
    const item=value as GoogleAccount;
    if(!item||item.authId!==authId||typeof item.userId!=='string'||!item.userId
        ||typeof item.username!=='string'||typeof item.name!=='string')throw new GoogleLoginError('AUTH_UNAVAILABLE');
    return {authId,userId:item.userId,username:item.username,name:item.name};
}
export async function readGoogleAccount(authId:string,signal?:AbortSignal) {
    const value=await request('/auth/google/account',authId,undefined,signal);
    if(value.termsVersion!==CURRENT_TERMS_VERSION)throw new GoogleLoginError('TERMS_UPDATED');
    return parseAccount(value.account,authId);
}
export async function completeGoogleAccount(authId:string,username:string,password:string,legacyPassword:string|undefined,signal?:AbortSignal) {
    const value=await request('/auth/google/setup',authId,{username,password,accepted:true,termsVersion:CURRENT_TERMS_VERSION,
        ...(legacyPassword===undefined?{}:{legacyPassword})},signal);
    const account=parseAccount(value.account,authId);
    if(!account)throw new GoogleLoginError('SETUP_UNAVAILABLE');
    setLocalTermsConsent(account.userId);
    return account;
}
export async function startGoogleSignIn(resetPassword=false) {
    beginOAuthLoginIntent();
    try{
        if(resetPassword)sessionStorage.setItem(GOOGLE_PASSWORD_RESET_KEY,'true');
        else sessionStorage.removeItem(GOOGLE_PASSWORD_RESET_KEY);
        const native=Capacitor.isNativePlatform();
        const {data,error}=await supabase.auth.signInWithOAuth({provider:'google',
            options:{redirectTo:native?'qgambit://login-callback':window.location.origin,skipBrowserRedirect:native,
                ...(resetPassword?{queryParams:{prompt:'select_account'}}:{})}});
        if(error||!data.url)throw new GoogleLoginError('AUTH_UNAVAILABLE');
        if(native)await Browser.open({url:data.url});
    }catch{clearOAuthLoginIntent();sessionStorage.removeItem(GOOGLE_PASSWORD_RESET_KEY);throw new GoogleLoginError('AUTH_UNAVAILABLE');}
}
export function wantsGooglePasswordReset() {
    try{return sessionStorage.getItem(GOOGLE_PASSWORD_RESET_KEY)==='true';}catch{return false;}
}
export function clearGooglePasswordReset() {try{sessionStorage.removeItem(GOOGLE_PASSWORD_RESET_KEY);}catch{/* No authorization from this marker. */}}
export async function changeGooglePassword(authId:string,password:string,signal?:AbortSignal) {
    if((await request('/auth/google/password',authId,{password},signal)).changed!==true)throw new GoogleLoginError('AUTH_UNAVAILABLE');
    clearGooglePasswordReset();
}
export async function confirmGooglePassword(userId:string,password:string,action:'delete'|'revoke-all') {
    const owner=googleAccountFor(userId);
    if(!owner)throw new GoogleLoginError('GOOGLE_REQUIRED');
    const {data}=await supabase.auth.getSession(),session=data.session;
    if(!session||session.user.id!==owner.authId)throw new GoogleLoginError('GOOGLE_REQUIRED');
    const value=await request('/auth/google/confirm-password',owner.authId,{password,action},undefined,session.access_token);
    if(typeof value.proof!=='string'||!/^[a-f0-9]{64}$/.test(value.proof))throw new GoogleLoginError('AUTH_UNAVAILABLE');
    return {proof:value.proof as string,token:session.access_token};
}
