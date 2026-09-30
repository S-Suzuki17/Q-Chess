import { expect, it } from 'vitest';
import { LANGUAGES } from './dict';
import { rulesDict } from './rulesDict';
import { rulesVisualDict } from './rulesVisualDict';

it('provides the illustrated rule explanations in every supported language', () => {
    expect(LANGUAGES).toHaveLength(12);
    for (const { code } of LANGUAGES) {
        const copy = rulesVisualDict[code];
        expect(Object.values(copy).every(value => Array.isArray(value)
            ? value.length === 6 && value.every(name => name.trim().length > 0)
            : value.trim().length > 0)).toBe(true);
        expect(copy.captureHelp).toContain('?');
        expect(rulesDict[code].sec3p1).toBe(copy.chessContrast);
        if (code !== 'en') expect(copy.chessContrast).not.toBe(rulesVisualDict.en.chessContrast);
    }
});
