import { expect, it } from 'vitest';
import { LANGUAGES } from './dict';
import { stripeMembershipText } from './stripeMembershipText';

it('provides complete, purchase-specific copy for every supported language', () => {
    for (const { code } of LANGUAGES) {
        const text = stripeMembershipText(code);
        expect(text.title.length).toBeGreaterThan(0);
        expect(text.planned).toMatch(/2[.,]99/);
        expect(text.benefits).toMatch(/3/);
        expect(text.billingTerms).toMatch(/2[.,]99/);
        expect(text.billingTerms.length).toBeGreaterThan(50);
        expect(text.scheduledEnd.length).toBeGreaterThan(0);
        for (const value of Object.values(text)) expect(value.trim()).not.toBe('');
    }
    expect(new Set(LANGUAGES.map(({ code }) => stripeMembershipText(code).billingTerms)).size)
        .toBe(LANGUAGES.length);
});
