'use client';
import { gameServerUrl } from './rankedSession';
import { requestAccountProfile,AccountProfileError } from './accountProfile';
import {clientReleaseHeaders} from './clientRelease';
import { readRegistrationIssue, type RegistrationIssue } from '../../server/src/services/RegistrationValidation';

export class AccountRegistrationError extends AccountProfileError {
    constructor(public readonly registrationCode:'INVALID_REQUEST'|'CONFLICT'|'TRY_LATER'|'UNAVAILABLE',public readonly issue?:RegistrationIssue) {
        super(registrationCode==='TRY_LATER'?'UNAVAILABLE':registrationCode);
    }
}

export async function registerAccount(username:string,password:string,email:string,signal?:AbortSignal):Promise<void>{
    try{
        const url=new URL('/auth/register',gameServerUrl());
        if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('UNAVAILABLE');
        const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...clientReleaseHeaders()},body:JSON.stringify({username,password,email}),
            credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(20000)])});
        if(!response.ok){
            if(response.status===400){
                const value=await response.json().catch(()=>null);
                throw new AccountRegistrationError('INVALID_REQUEST',value?.code==='INVALID_REGISTRATION'?readRegistrationIssue(value):undefined);
            }
            throw new AccountRegistrationError(response.status===409?'CONFLICT':response.status===429?'TRY_LATER':'UNAVAILABLE');
        }
        if((await response.json())?.registered!==true)throw new Error('UNAVAILABLE');
    }catch(error){if(error instanceof AccountRegistrationError)throw error;throw new AccountRegistrationError('UNAVAILABLE');}
}
export async function revokeAllAccountSessions(userId:string):Promise<void>{
    const value=await requestAccountProfile('/account/sessions/revoke-all',userId,{});
    if(value.revoked!==true)throw new AccountProfileError('UNAVAILABLE');
}
