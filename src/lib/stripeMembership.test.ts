import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ANDROID_BUILD } from '../config/appPlatform';
import {
    STRIPE_WEB_CHECKOUT_ENABLED,
    STRIPE_WEB_MEMBERSHIP_ENABLED,
    STRIPE_WEB_PORTAL_ENABLED,
    MEMBER_TICKET_USAGE_ENABLED,
    readMemberTicketStatus,
    claimMemberTickets,
    parseStripeCheckoutUrl,
    parseStripePortalUrl,
    parseStripeMembershipStatus,
    prepareStripeCheckout,
    prepareStripeBillingPortal,
    readStripeMembershipStatus,
    stripeWebMembershipAllowed,
} from './stripeMembership';

afterEach(() => vi.unstubAllGlobals());

const status = {
    userId: 'Alice', enabled: true, active: false, canManageBilling: false,
    cancelAtPeriodEnd: false, periodEnd: null,
    lastGrantUtcDay: null, tickets: { ranked: 0, hint: 0 },
};

it('keeps every Web purchase surface hard-off and makes no network request', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(STRIPE_WEB_MEMBERSHIP_ENABLED).toBe(false);
    expect(STRIPE_WEB_CHECKOUT_ENABLED).toBe(false);
    expect(STRIPE_WEB_PORTAL_ENABLED).toBe(false);
    expect(MEMBER_TICKET_USAGE_ENABLED).toBe(false);
    await expect(readStripeMembershipStatus('Alice')).rejects.toThrow('DISABLED');
    await expect(prepareStripeCheckout('Alice', 'standard_monthly')).rejects.toThrow('DISABLED');
    await expect(prepareStripeBillingPortal('Alice')).rejects.toThrow('DISABLED');
    await expect(readMemberTicketStatus('Alice')).rejects.toThrow('DISABLED');
    await expect(claimMemberTickets('Alice')).rejects.toThrow('DISABLED');
    expect(fetcher).not.toHaveBeenCalled();
});

it('requires browser Web content and rejects native apps even if a future flag is enabled', () => {
    expect(stripeWebMembershipAllowed(false, false, true)).toBe(false);
    expect(stripeWebMembershipAllowed(true, true, true)).toBe(false);
    expect(stripeWebMembershipAllowed(true, false, false)).toBe(false);
    expect(stripeWebMembershipAllowed(true, false, true)).toBe(!ANDROID_BUILD);
});

it('keeps the account screen doubly gated and hides billing management', () => {
    const account = readFileSync('src/components/LevelSelect.tsx', 'utf8');
    const panel = readFileSync('src/components/StripeMembershipPanel.tsx', 'utf8');
    const hub = readFileSync('src/components/RewardsDialog.tsx', 'utf8');
    expect(account).toContain("user.type==='registered' && rewardsHubEnabled()");
    expect(hub).toContain("user.type !== 'registered' || !rewardsHubEnabled()");
    expect(panel).toContain('stripeWebMembershipAllowed(webContent, Capacitor.isNativePlatform())');
    expect(panel).toContain('STRIPE_WEB_PORTAL_ENABLED && status?.canManageBilling');
    expect(panel).toContain('{copy.billingTerms}');
});

it('only accepts same-account membership state with bounded ticket balances', () => {
    expect(parseStripeMembershipStatus(status, 'Alice')).toEqual(status);
    expect(parseStripeMembershipStatus({ ...status, active: true,
        cancelAtPeriodEnd: true, periodEnd: '2026-10-30T00:00:00Z' }, 'Alice').cancelAtPeriodEnd).toBe(true);
    for (const value of [
        { ...status, userId: 'Bob' }, { ...status, enabled: false },
        { ...status, canManageBilling: 'yes' },
        { ...status, cancelAtPeriodEnd: 'yes' },
        { ...status, cancelAtPeriodEnd: true },
        { ...status, active: true },
        { ...status, active: 'yes' }, { ...status, tickets: { ranked: Number.MAX_SAFE_INTEGER + 1, hint: 0 } },
        { ...status, tickets: { ranked: 0, hint: 0.5 } },
        { ...status, tickets: { ranked: -1, hint: 0 } },
        { ...status, lastGrantUtcDay: '2026-02-30' },
        { ...status, periodEnd: 'tomorrow' },
    ]) expect(() => parseStripeMembershipStatus(value, 'Alice')).toThrow('UNAVAILABLE');
});

it('accepts separate member pools above historical product caps without unsafe integers', () => {
    for (const count of [20, 21, 59, 60, 61, 100000, Number.MAX_SAFE_INTEGER]) {
        const value = { ...status, tickets: { ranked: count, hint: count } };
        expect(parseStripeMembershipStatus(value, 'Alice').tickets).toEqual(value.tickets);
    }
});

it('accepts only short-lived HTTPS Stripe-hosted billing portal URLs', () => {
    const valid = 'https://billing.stripe.com/p/session/test_ABCDEFGH';
    expect(parseStripePortalUrl({ url: valid })).toBe(valid);
    for (const url of [
        'http://billing.stripe.com/p/session/test_ABCDEFGH',
        'https://billing.stripe.com.evil.example/p/session/test_ABCDEFGH',
        'https://billing.stripe.com@evil.example/p/session/test_ABCDEFGH',
        'https://billing.stripe.com/p/session/',
        'https://billing.stripe.com/p/session/test_ABCDEFGH#frag',
        'javascript:alert(1)',
    ]) expect(() => parseStripePortalUrl({ url })).toThrow('UNAVAILABLE');
});

it('accepts only HTTPS Stripe-hosted checkout URLs', () => {
    const valid = 'https://checkout.stripe.com/c/pay/cs_test_123';
    expect(parseStripeCheckoutUrl({ url: valid })).toBe(valid);
    for (const url of [
        'http://checkout.stripe.com/c/pay/cs_test_123',
        'https://checkout.stripe.com.evil.example/c/pay/cs_test_123',
        'https://evil.example/pay/cs_test_123',
        'https://checkout.stripe.com@evil.example/c/pay/cs_test_123',
        'https://checkout.stripe.com/anything',
        'javascript:alert(1)',
    ]) expect(() => parseStripeCheckoutUrl({ url })).toThrow('UNAVAILABLE');
});
it('validates server checkout availability and rejects unknown or duplicate SKUs', () => {
    expect(parseStripeMembershipStatus({...status,availableCheckoutSkus:[]},'Alice').availableCheckoutSkus).toEqual([]);
    expect(parseStripeMembershipStatus({...status,availableCheckoutSkus:['standard_monthly','hints_13']},'Alice').availableCheckoutSkus).toEqual(['standard_monthly','hints_13']);
    for(const availableCheckoutSkus of [['price_1UNTrJQWzwYDIuXWtdNlAMnV'],['hints_13','hints_13'],['unknown'],{},null]) {
        expect(()=>parseStripeMembershipStatus({...status,availableCheckoutSkus},'Alice')).toThrow('UNAVAILABLE');
    }
});

const commerce = {
    userId: 'Alice', livemode: true, active: true, sku: 'plus_monthly', periodEnd: '2099-11-03T12:00:00Z',
    cancelAtPeriodEnd: false, unlimitedRanked: true, adFree: true, balances: { purchased: 13, subscription: 10 },
};

it('keeps legacy fields unchanged and new commerce stock independent, including after subscription end', () => {
    const parsed = parseStripeMembershipStatus({ ...status, commerce }, 'Alice');
    expect(parsed).toEqual({ ...status, commerce });
    expect(parsed.active).toBe(false);
    expect(parsed.tickets).toEqual({ ranked: 0, hint: 0 });
    const ended = { ...commerce, active: false, sku: null, periodEnd: null, unlimitedRanked: false, adFree: false };
    expect(parseStripeMembershipStatus({ ...status, commerce: ended }, 'Alice').commerce).toEqual(ended);
    expect(parseStripeMembershipStatus(status, 'Alice')).not.toHaveProperty('commerce');
});

it('accepts separate sandbox stock only with both live entitlement flags off', () => {
    const sandbox = { ...commerce, livemode: false, unlimitedRanked: false, adFree: false };
    expect(parseStripeMembershipStatus({ ...status, commerce: sandbox }, 'Alice').commerce).toEqual(sandbox);
    for (const benefits of [{ unlimitedRanked: true }, { adFree: true }]) {
        expect(() => parseStripeMembershipStatus({ ...status, commerce: { ...sandbox, ...benefits } }, 'Alice')).toThrow('UNAVAILABLE');
    }
});

it('fails closed on malformed nested owner, mode, SKU, billing state, dates, or benefits', () => {
    for (const invalid of [
        null, [], {}, 'active',
        { ...commerce, userId: 'Bob' }, { ...commerce, livemode: 'true' }, { ...commerce, active: 'true' },
        { ...commerce, sku: 'hints_13' }, { ...commerce, sku: null }, { ...commerce, cancelAtPeriodEnd: 1 },
        { ...commerce, unlimitedRanked: false }, { ...commerce, adFree: false },
        ...[null, 'tomorrow', '2099-11-03', '2099-02-30T00:00:00Z', '2099-11-03T24:00:00Z'].map(periodEnd => ({ ...commerce, periodEnd })),
        { ...commerce, active: false },
        { ...commerce, active: false, sku: null, periodEnd: null, unlimitedRanked: false, adFree: false, cancelAtPeriodEnd: true },
    ]) expect(() => parseStripeMembershipStatus({ ...status, commerce: invalid }, 'Alice')).toThrow('UNAVAILABLE');
});

it('requires both nested stocks to be nonnegative safe integers, with no legacy cap', () => {
    for (const balance of [0, 1, 166, Number.MAX_SAFE_INTEGER]) {
        const balances = { purchased: balance, subscription: balance };
        expect(parseStripeMembershipStatus({ ...status, commerce: { ...commerce, balances } }, 'Alice').commerce?.balances).toEqual(balances);
    }
    for (const key of ['purchased', 'subscription']) {
        for (const balance of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, '10', undefined]) {
            expect(() => parseStripeMembershipStatus({ ...status, commerce: { ...commerce, balances: { ...commerce.balances, [key]: balance } } }, 'Alice')).toThrow('UNAVAILABLE');
        }
    }
    for (const balances of [null, [], {}, 'stock']) {
        expect(() => parseStripeMembershipStatus({ ...status, commerce: { ...commerce, balances } }, 'Alice')).toThrow('UNAVAILABLE');
    }
});

it('accepts a valid paid Standard period and timezone-bearing server timestamps', () => {
    for (const periodEnd of ['2099-11-03T12:00:00.000000+00:00', '2099-11-03T12:00:00+09:00']) {
        expect(parseStripeMembershipStatus({ ...status, commerce: { ...commerce, sku: 'standard_monthly', periodEnd, cancelAtPeriodEnd: true } }, 'Alice').commerce?.sku).toBe('standard_monthly');
    }
});

it.each(['2000-01-01T00:00:00Z', '2100-01-01T00:00:00Z'])('preserves server-owned status and stock with a skewed client clock at %s', clientTime => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(clientTime));
    try {
        for (const serverStatus of [commerce, { ...commerce, livemode: false, unlimitedRanked: false, adFree: false }]) {
            const parsed = parseStripeMembershipStatus({ ...status, commerce: serverStatus }, 'Alice');
            expect(parsed.commerce).toEqual(serverStatus);
            expect(parsed.active).toBe(false);
            expect(parsed.tickets).toEqual({ ranked: 0, hint: 0 });
        }
    } finally { clock.mockRestore(); }
});
