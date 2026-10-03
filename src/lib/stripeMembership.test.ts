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
    await expect(prepareStripeCheckout('Alice')).rejects.toThrow('DISABLED');
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
        { ...status, active: 'yes' }, { ...status, tickets: { ranked: 61, hint: 0 } },
        { ...status, tickets: { ranked: 0, hint: 61 } },
        { ...status, tickets: { ranked: -1, hint: 0 } },
        { ...status, lastGrantUtcDay: '2026-02-30' },
        { ...status, periodEnd: 'tomorrow' },
    ]) expect(() => parseStripeMembershipStatus(value, 'Alice')).toThrow('UNAVAILABLE');
});

it('accepts the approved separate member pools through 60 tickets', () => {
    for (const count of [20, 21, 59, 60]) {
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
