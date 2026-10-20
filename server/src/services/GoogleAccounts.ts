import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import type {SupabaseClient,User} from '@supabase/supabase-js';
import {verifiedTokenSessionId} from './AccountSecurity';
import {SessionAuthorityUnavailable} from './SessionAuthorityError';

export const googleAccountsEnabled=()=>process.env.GOOGLE_ACCOUNT_LOGIN_ENABLED==='true';
export interface GoogleActor {authId:string;authenticatedAt:number}
export interface GoogleAccount {authId:string;userId:string;username:string;name:string}
/** Only inspect these claims after Auth.getUser verified this exact token. */
export function verifiedGoogleActor(token:string,user:User):GoogleActor|null {
    try {
        const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));
        if(user.is_anonymous||claims.sub!==user.id||!verifiedTokenSessionId(token,user.id)
            ||!user.identities?.some(identity=>identity.provider==='google'))return null;
        const methods=Array.isArray(claims.amr)?claims.amr:[],
            latest=methods.filter((item:{timestamp?:unknown})=>Number.isSafeInteger(item?.timestamp))
                .sort((a:{timestamp:number},b:{timestamp:number})=>b.timestamp-a.timestamp)[0];
        return latest?.method==='oauth' ? {authId:user.id,authenticatedAt:latest.timestamp*1000}:null;
    }catch{return null;}
}
const derive=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>{
    // OWASP's 32 MiB scrypt configuration; bound concurrent derivations in the router.
    scrypt(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key));
});
export async function hashGooglePassword(password:string) {
    const salt=randomBytes(16).toString('hex');
    return `scrypt-v1:${salt}:${(await derive(password,salt)).toString('hex')}`;
}
export async function checkGooglePassword(password:unknown,encoded:string|null) {
    if(typeof password!=='string'||Buffer.byteLength(password)>1024||!encoded
        ||!/^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded))return false;
    const [,salt,hash]=encoded.split(':');
    return timingSafeEqual(await derive(password,salt),Buffer.from(hash,'hex'));
}
export interface GoogleAccountStore {
    verify(token:string):Promise<GoogleActor|null>;
    read(authId:string):Promise<GoogleAccount|null>;
    setup(actor:GoogleActor,username:string,hash:string,version:string,legacyPassword?:string):Promise<GoogleAccount>;
    password(authId:string,password:unknown):Promise<boolean>;
    changePassword(authId:string,hash:string):Promise<boolean>;
}
export class GoogleAccountError extends Error {constructor(public code:string){super(code);}}
export function createGoogleAccountStore(client:SupabaseClient,
    verify:(token:string)=>Promise<GoogleActor|null>):GoogleAccountStore {
    const read:GoogleAccountStore['read']=async authId=>{
        const {data,error}=await client.from('google_account_links').select('user_id,username').eq('auth_user_id',authId)
            .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
        if(error)throw new SessionAuthorityUnavailable();
        if(!data)return null;
        const profile=await client.from('profiles').select('name').eq('id',data.user_id)
            .abortSignal(AbortSignal.timeout(5000)).single();
        if(profile.error)throw new SessionAuthorityUnavailable();
        return {authId,userId:data.user_id,username:data.username,name:profile.data.name};
    };
    return {verify,read,
        async setup(actor,username,hash,version,legacyPassword){
            const {data,error}=await client.rpc('complete_google_account',{p_auth_user_id:actor.authId,p_username:username,
                p_hash:hash,p_terms_version:version,p_link_existing:legacyPassword!==undefined,p_legacy_password:legacyPassword??null})
                .abortSignal(AbortSignal.timeout(15000));
            if(error)throw new GoogleAccountError(error.code==='23505'?'NAME_UNAVAILABLE':'SETUP_UNAVAILABLE');
            if(data?.code)throw new GoogleAccountError(data.code);
            const account=await read(actor.authId);
            if(!account||account.userId!==data?.userId)throw new GoogleAccountError('SETUP_UNAVAILABLE');
            return account;
        },
        async password(authId,password){
            const {data,error}=await client.rpc('google_account_credential',{p_auth_user_id:authId})
                .abortSignal(AbortSignal.timeout(5000));
            if(error)throw new SessionAuthorityUnavailable();
            return checkGooglePassword(password,data);
        },
        async changePassword(authId,hash){
            const {data,error}=await client.rpc('change_google_account_password',{p_auth_user_id:authId,p_hash:hash})
                .abortSignal(AbortSignal.timeout(5000));
            if(error)throw new SessionAuthorityUnavailable();
            return data===true;
        },
    };
}
