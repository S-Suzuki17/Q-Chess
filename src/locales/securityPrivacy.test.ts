import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {LANGUAGES} from './dict';
import {securityPrivacy,cloudStoragePrivacy} from './securityPrivacy';
import {privacyReview} from './privacyReview';
import {accountDeletionText} from './accountDeletionText';
it('includes the approved audit and cloud-erasure explanation in all twelve languages',()=>{
    expect(LANGUAGES).toHaveLength(12);
    for(const {code} of LANGUAGES){
        expect(securityPrivacy[code]).toContain('30');
        expect(privacyReview(code).sec2li3).toContain(securityPrivacy[code]);
        expect(privacyReview(code).sec4p).toContain(cloudStoragePrivacy[code]);
        expect(accountDeletionText(code).scope).toContain(cloudStoragePrivacy[code]);
    }
});
it('renders complete translated privacy items instead of truncating on locale punctuation',()=>{
    const page=readFileSync(new URL('../app/privacy/page.tsx',import.meta.url),'utf8');
    expect(page).not.toContain(".split(': ')");expect(page).toContain('<li key={key}>{c[key]}</li>');
});
