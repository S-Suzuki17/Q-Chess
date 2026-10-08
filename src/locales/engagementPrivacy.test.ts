import { describe, expect, it } from 'vitest';
import { LANGUAGES } from './dict';
import { engagementPrivacy } from './engagementPrivacy';
import { privacyReview } from './privacyReview';
import { registrationPrivacy } from './registrationPrivacy';

describe('optional gameplay metrics privacy notice', () => {
    it('has a complete notice in every supported language', () => {
        for (const { code } of LANGUAGES) {
            const notice = engagementPrivacy[code];
            expect(notice.title.length).toBeGreaterThan(0);
            expect(notice.choice.length).toBeGreaterThan(20);
            expect(notice.details.length).toBeGreaterThan(40);
            expect(notice.withdrawal.length).toBeGreaterThan(20);
        }
    });

    it('does not describe the retired Vercel host or optional metrics as disabled', () => {
        for (const { code } of LANGUAGES) {
            const displayed = privacyReview(code);
            expect(displayed.updated).toBe('2026-10-08');
            expect(registrationPrivacy[code].length).toBeGreaterThan(40);
            expect(displayed.sec2li1).toContain(registrationPrivacy[code]);
            expect(displayed.sec3li3).toContain('Cloudflare');
            expect(displayed.sec3li3).not.toContain('Vercel');
            expect(displayed.sec2li3).toContain(engagementPrivacy[code].choice);
        }
        expect(privacyReview('en').sec2li3).not.toContain('analytics and performance tracking are disabled');
    });
});
