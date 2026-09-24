import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createCircuitAccessStore} from './circuitAccess';
import {TERMS_VERSION} from '../config/terms';import {LANGUAGES} from '../locales/dict';import {termsText} from '../locales/termsText';
vi.mock('./accountProfile',()=>({requestAccountProfile:vi.fn()}));
import {requestAccountProfile} from './accountProfile';import {hasCurrentConsent,acceptAccountTerms} from './accountTerms';
describe('terms consent',()=>{
 it('requires a current version and a valid server timestamp',()=>{
    expect(hasCurrentConsent({currentVersion:TERMS_VERSION,consent:null})).toBe(false);
    expect(hasCurrentConsent({currentVersion:TERMS_VERSION,consent:{version:'old',acceptedAt:'2026-09-25'}})).toBe(false);
    expect(hasCurrentConsent({currentVersion:TERMS_VERSION,consent:{version:TERMS_VERSION,acceptedAt:'invalid'}})).toBe(false);
    expect(()=>hasCurrentConsent({currentVersion:'future'})).toThrow('TERMS_UPDATED');
 });
 it('sends explicit acceptance without identity, date or IP fields',async()=>{
    vi.mocked(requestAccountProfile).mockResolvedValue({currentVersion:TERMS_VERSION,consent:{version:TERMS_VERSION,acceptedAt:'2026-09-24T18:00:00Z'}});
    await acceptAccountTerms('Alice');expect(requestAccountProfile).toHaveBeenLastCalledWith('/account/terms','Alice',{version:TERMS_VERSION,accepted:true});
 });
 it('provides all consent UI messages in all supported languages',()=>{for(const {code} of LANGUAGES){expect(termsText(code)).toHaveLength(9);expect(termsText(code).every(s=>s.length>0)).toBe(true);}});
 it('invalidates readiness when the same owner signs in again',()=>{
    const access=createCircuitAccessStore(),user={id:'Alice',name:'Alice',type:'registered' as const};
    access.grant(user,access.beginAuthentication());const firstRevision=access.getSnapshot().revision;
    access.revoke();access.grant(user,access.beginAuthentication());
    expect(access.getSnapshot().userId).toBe('Alice');expect(access.getSnapshot().revision).not.toBe(firstRevision);
    const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
    expect(page).toContain('circuitAccess.getSnapshot().revision');
    expect(page).toContain('termsReadyIdentity===termsIdentity');expect(page).toContain('<TermsGate key={termsIdentity}');
 });
});
