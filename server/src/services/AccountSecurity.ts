import type { SupabaseClient } from '@supabase/supabase-js';
import { registrationEmail, registrationIssues } from './RegistrationValidation';

export function validRegistration(id:unknown,password:unknown):id is string {
    return registrationIssues(id,password,undefined,false).length===0;
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
    register(id:string,password:string,email?:string):Promise<boolean>;
    signOutAll(token:string):Promise<void>;
}
export function createAccountSecurityStore(client:SupabaseClient,verifyUser:AccountSecurityStore['verifyUser']):AccountSecurityStore {
    return {
        verifyUser,
        async ready(){try{const {data,error}=await client.rpc('account_security_version');return !error&&data===1;}catch{return false;}},
        async restricted(id){const {data,error}=await client.from('account_restrictions').select('blocked').eq('user_id',id).maybeSingle();if(error)throw new Error('UNAVAILABLE');return data?.blocked===true;},
        async register(id,password,email){if(!validRegistration(id,password)||(email!==undefined&&!registrationEmail(email)))throw new Error('INVALID_REQUEST');const {data,error}=await client.rpc(email===undefined?'register_account_secure':'register_account_with_email',email===undefined?{p_id:id,p_password:password}:{p_id:id,p_password:password,p_email:registrationEmail(email)}).abortSignal(AbortSignal.timeout(10000));if(error)throw new Error('UNAVAILABLE');return data===true;},
        async signOutAll(token){const {error}=await client.auth.admin.signOut(token,'global');if(error)throw new Error('UNAVAILABLE');},
    };
}
