import { expect, it } from 'vitest';
import { additional } from './additional';
import { dict, LANGUAGES } from './dict';
import { tutorialDict, rulesDict } from './rulesDict';
import { privacyTranslations } from './privacyTranslations';
it('includes all five requested languages with complete main dictionaries', () => {
    for (const lang of ['tr','pl','hi','pt','ta'] as const) {
        expect(LANGUAGES.some(item=>item.code===lang)).toBe(true);
        expect(Object.keys(additional[lang]).sort()).toEqual(Object.keys(dict.en).sort());
        expect(Object.values(additional[lang]).every(value=>value.trim())).toBe(true);
        expect(tutorialDict[lang].steps).toHaveLength(12);
        expect(Object.keys(rulesDict[lang]).sort()).toEqual(Object.keys(rulesDict.en).sort());
    }
});
it('provides every privacy section in all ten additional locales', () => {
    expect(Object.keys(privacyTranslations)).toHaveLength(10);
    for (const content of Object.values(privacyTranslations)) {
        expect(Object.keys(content)).toHaveLength(24);
        expect(Object.values(content).every(value => value.trim().length > 0)).toBe(true);
        for (let n = 1; n <= 8; n++) expect(content[`sec${n}Title`]).toBeTruthy();
    }
});
