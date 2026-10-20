import type {Session} from '@supabase/supabase-js';

export interface GoogleAccount {authId:string;userId:string;username:string;name:string}
let account:GoogleAccount|null=null;
/** Display/transport binding only. The server independently verifies every token. */
export function rememberGoogleAccount(value:GoogleAccount) {account={...value};}
export function forgetGoogleAccount() {account=null;}
export function googleAccountFor(userId:string) {return account?.userId===userId?account:null;}
export function sessionOwnsAccount<T extends Pick<Session,'user'>>(session:T|null|undefined,userId:string):session is T {
    return !!session&&!session.user.is_anonymous&&(session.user.id===userId
        ||(account?.userId===userId&&account.authId===session.user.id));
}
