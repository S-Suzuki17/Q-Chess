import { expect, it } from 'vitest';
import { COMMERCE_SELLER, MEMBER_TICKET_CAP, webCommerceCheckoutReady, SALES_TERMS_DRAFT_VERSION } from './webCommerce';
import { SALES_TERMS_DRAFT } from './salesTermsDraft';
import { TERMS_VERSION } from './terms';

it('fails closed until the cap, reviewed release and new effective consent version are all configured', () => {
    expect(MEMBER_TICKET_CAP).toEqual({ ranked: 60, hint: 60 });
    expect(webCommerceCheckoutReady()).toBe(false);
    expect(webCommerceCheckoutReady(true, {ranked:60,hint:60}, SALES_TERMS_DRAFT_VERSION, '2026-01-01', false)).toBe(false);
    expect(webCommerceCheckoutReady(true, null, SALES_TERMS_DRAFT_VERSION)).toBe(false);
    expect(webCommerceCheckoutReady(true, {ranked:20,hint:20}, TERMS_VERSION)).toBe(false);
    expect(webCommerceCheckoutReady(false, {ranked:20,hint:20}, SALES_TERMS_DRAFT_VERSION)).toBe(false);
    expect(webCommerceCheckoutReady(true, {ranked:60,hint:60}, SALES_TERMS_DRAFT_VERSION, '2026-01-01', true)).toBe(true);
    expect(webCommerceCheckoutReady(true, {ranked:-1,hint:20}, SALES_TERMS_DRAFT_VERSION)).toBe(false);
});
it('aligns approved sales terms with the release date and keeps seller fields purpose-limited', () => {
    expect(TERMS_VERSION).toBe('2026-09-25.1');
    expect(SALES_TERMS_DRAFT.version).toBe(SALES_TERMS_DRAFT_VERSION);
    expect(SALES_TERMS_DRAFT.effectiveDate).toBe('2026-10-08');
    expect(SALES_TERMS_DRAFT.ja[2][1]).toContain('各60枚まで');
    expect(SALES_TERMS_DRAFT.en[2][1]).toContain('cannot be claimed retroactively');
    expect(Object.keys(COMMERCE_SELLER)).toEqual(['legalName','businessName','address','telephone','telephoneUri','email']);
});
