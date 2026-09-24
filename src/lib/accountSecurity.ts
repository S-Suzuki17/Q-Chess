'use client';
import { gameServerUrl } from './rankedSession';
import { requestAccountProfile,AccountProfileError } from './accountProfile';
import {clientReleaseHeaders} from './clientRelease';

export async function registerAccount(username:string,password:string,signal?:AbortSignal):Promise<void>{
    try{
        const url=new URL('/auth/register',gameServerUrl());
        if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('UNAVAILABLE');
        const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...clientReleaseHeaders()},body:JSON.stringify({username,password}),
            credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(20000)])});
        if(!response.ok)throw new AccountProfileError(response.status===400?'INVALID_REQUEST':'UNAVAILABLE');
        if((await response.json())?.registered!==true)throw new Error('UNAVAILABLE');
    }catch(error){if(error instanceof AccountProfileError)throw error;throw new AccountProfileError('UNAVAILABLE');}
}
export async function revokeAllAccountSessions(userId:string):Promise<void>{
    const value=await requestAccountProfile('/account/sessions/revoke-all',userId,{});
    if(value.revoked!==true)throw new AccountProfileError('UNAVAILABLE');
}
