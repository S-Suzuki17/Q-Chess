import type {SupabaseClient} from '@supabase/supabase-js';
// Equality with the approved client document is tested before release.
export const CURRENT_TERMS_VERSION='2026-09-25.1';
export function createAccountTermsStore(client:SupabaseClient,verifyUser:(token:string)=>Promise<string|null>,blocked:(id:string)=>Promise<boolean>,ensure:(id:string,mayCreate:boolean)=>Promise<unknown>){
    return {verifyUser,blocked,
        async read(id:string){
            const {data,error}=await client.from('account_terms_consents').select('version,accepted_at').eq('user_id',id).eq('version',CURRENT_TERMS_VERSION).maybeSingle();
            if(error)throw new Error('UNAVAILABLE');
            return data?{version:data.version,acceptedAt:data.accepted_at}:null;
        },
        async accept(id:string,mayCreate:boolean){
            await ensure(id,mayCreate);
            // Retry cannot rewrite the original server timestamp. No client date or identity is accepted.
            const {error}=await client.from('account_terms_consents').upsert({user_id:id,version:CURRENT_TERMS_VERSION},{onConflict:'user_id,version',ignoreDuplicates:true});
            if(error)throw new Error('UNAVAILABLE');
        },
    };
}
