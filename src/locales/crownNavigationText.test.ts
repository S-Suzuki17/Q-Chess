import { expect, it } from 'vitest';
import { LANGUAGES } from './dict';
import { crownNavigationKeys, crownNavigationText, crownNavigationTranslationCount } from './crownNavigationText';
it.each(LANGUAGES.map(item=>item.code))('provides every Crown navigation label in %s',lang=>{
 expect(crownNavigationTranslationCount(lang)).toBe(crownNavigationKeys.length);
 for(const key of crownNavigationKeys) expect(crownNavigationText(lang,key)?.trim().length).toBeGreaterThan(0);
});
