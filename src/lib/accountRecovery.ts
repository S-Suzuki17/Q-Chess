'use client';
import { gameServerUrl, readRankedSession } from './rankedSession';

export class AccountRecoveryError extends Error {
    constructor(public code: 'AUTH_REQUIRED' | 'INVALID_CODE' | 'TRY_LATER' | 'ACCOUNT_BUSY' | 'UNAVAILABLE') { super(code); }
}
async function request(path: string, body?: object, userId?: string) {
    try {
        const endpoint = new URL(path, gameServerUrl());
        if(endpoint.protocol !== 'https:' && !['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)) throw new AccountRecoveryError('UNAVAILABLE');
        const token = userId ? readRankedSession(userId)?.token : undefined;
        if(userId && !token) throw new AccountRecoveryError('AUTH_REQUIRED');
        const response = await fetch(endpoint, {
            method: body ? 'POST' : 'GET', credentials:'omit',cache:'no-store',redirect:'error',
            headers: { ...(body ? {'Content-Type':'application/json'} : {}), ...(token ? {Authorization:`Bearer ${token}`} : {}) },
            ...(body ? { body:JSON.stringify(body) } : {}), signal:AbortSignal.timeout(30000),
        });
        if(response.status === 401) throw new AccountRecoveryError('AUTH_REQUIRED');
        if(response.status === 429) throw new AccountRecoveryError('TRY_LATER');
        if(response.status === 409) throw new AccountRecoveryError('ACCOUNT_BUSY');
        if(response.status === 400) throw new AccountRecoveryError('INVALID_CODE');
        if(!response.ok) throw new AccountRecoveryError('UNAVAILABLE');
        return await response.json() as { available?:boolean;ticket?:string;completed?:boolean };
    } catch(error) { if(error instanceof AccountRecoveryError) throw error; throw new AccountRecoveryError('UNAVAILABLE'); }
}
export async function recoveryAvailable() {
    try { return (await request('/account/recovery/capabilities')).available === true; } catch { return false; }
}
export async function startRecovery(userId:string,email:string,currentPassword?:string) {
    const enroll = currentPassword !== undefined;
    const result = await request(enroll?'/account/recovery/start':'/auth/recovery/start',
        { userId,email,...(enroll?{password:currentPassword}:{}) },enroll?userId:undefined);
    if(typeof result.ticket!=='string'||!/^[a-f0-9]{64}$/.test(result.ticket)) throw new AccountRecoveryError('UNAVAILABLE');
    return result.ticket;
}
export async function completeRecovery(ticket:string,code:string,newPassword?:string,userId?:string) {
    const enroll = newPassword === undefined;
    const result = await request(enroll?'/account/recovery/complete':'/auth/recovery/complete',
        {ticket,code,...(enroll?{}:{password:newPassword})},enroll?userId:undefined);
    if(result.completed!==true) throw new AccountRecoveryError('UNAVAILABLE');
}
