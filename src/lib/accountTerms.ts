import {TERMS_VERSION} from '../config/terms';
import {requestAccountProfile} from './accountProfile';
export function hasCurrentConsent(value:Record<string,unknown>){
    if(value.currentVersion!==TERMS_VERSION)throw new Error('TERMS_UPDATED');
    const consent=value.consent as {version?:unknown;acceptedAt?:unknown}|null;
    return consent?.version===TERMS_VERSION&&typeof consent.acceptedAt==='string'&&Number.isFinite(Date.parse(consent.acceptedAt));
}
export async function accountTermsStatus(id:string){return hasCurrentConsent(await requestAccountProfile('/account/terms',id));}
export async function acceptAccountTerms(id:string){
    if(!hasCurrentConsent(await requestAccountProfile('/account/terms',id,{version:TERMS_VERSION,accepted:true})))throw new Error('UNAVAILABLE');
}
