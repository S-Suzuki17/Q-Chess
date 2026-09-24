import type { SupabaseClient } from '@supabase/supabase-js';
import { permittedAccountName } from './AccountNamePolicy';

export function validRegistration(id:unknown,password:unknown):id is string {
    return typeof id==='string' && /^[A-Za-z0-9]{3,15}$/.test(id) && permittedAccountName(id)
        && typeof password==='string' && [...password].length>=12 && Buffer.byteLength(password,'utf8')<=72
        && !/[\p{Cc}]/u.test(password) && !/^(?:password|qwerty|123456|abcdef|letmein)[\d!@#$]*$/i.test(password)
        && new Set(password).size>=4;
}
/** Decode only AFTER getUser has verified the signed token. Never authorize from decoded claims alone. */
export function verifiedTokenSessionId(token:string,verifiedUserId:string):string|null {
    try {
        const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));
        return claims.sub===verifiedUserId && typeof claims.session_id==='string'
            && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.session_id) ? claims.session_id : null;
    } catch {return null;}
}
export interface AccountSecurityStore {
    ready():Promise<boolean>;
    verifyUser(token:string):Promise<string|null>;
    restricted(id:string):Promise<boolean>;
    register(id:string,password:string):Promise<boolean>;
    signOutAll(token:string):Promise<void>;
}
export function createAccountSecurityStore(client:SupabaseClient,verifyUser:AccountSecurityStore['verifyUser']):AccountSecurityStore {
    return {
        verifyUser,
        async ready(){try{const {data,error}=await client.rpc('account_security_version');return !error&&data===1;}catch{return false;}},
        async restricted(id){const {data,error}=await client.from('account_restrictions').select('blocked').eq('user_id',id).maybeSingle();if(error)throw new Error('UNAVAILABLE');return data?.blocked===true;},
        async register(id,password){if(!validRegistration(id,password))throw new Error('INVALID_REQUEST');const {data,error}=await client.rpc('register_account_secure',{p_id:id,p_password:password});if(error)throw new Error('UNAVAILABLE');return data===true;},
        async signOutAll(token){const {error}=await client.auth.admin.signOut(token,'global');if(error)throw new Error('UNAVAILABLE');},
    };
}
