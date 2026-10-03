import { expect, it } from 'vitest';
import { LANGUAGES } from './dict';
import { commerceText } from './commerceText';
import { ticketWalletText } from './ticketWalletText';

it('provides complete, distinct disclosure/privacy and ticket-policy copy in all 12 languages', () => {
    for (const { code } of LANGUAGES) {
        for (const value of Object.values(commerceText(code))) expect(value?.trim()).toBeTruthy();
        for (const value of Object.values(ticketWalletText(code))) expect(value?.trim()).toBeTruthy();
        expect(commerceText(code).privacy).toContain('Stripe');
        expect(ticketWalletText(code).rule).toContain('UTC');
        expect(ticketWalletText(code).rule).toContain('3');
        expect(ticketWalletText(code).cap).toContain('20');
    }
    expect(new Set(LANGUAGES.map(({code})=>commerceText(code).privacy)).size).toBe(12);
    expect(new Set(LANGUAGES.map(({code})=>ticketWalletText(code).expiry)).size).toBe(12);
});
