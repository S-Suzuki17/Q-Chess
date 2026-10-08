import React from 'react';
import type { StripeMembershipStatus } from '../../../../src/lib/stripeMembership';

const params = new URLSearchParams(location.search);
export const scenario = params.get('scenario') ?? 'legacy';
export const native = params.get('platform') === 'android';
export const qa = {
    ready: false, reads: 0, checkout: 0, portal: 0, consent: 0,
    replaceAccount: () => {}, releasePortal: () => {},
};
Object.assign(window, { commerceStatusQA: qa });
const currentPeriod = '2099-11-03T12:00:00Z';
const base: StripeMembershipStatus = {
    userId: 'CommerceFixture', enabled: true, active: false, canManageBilling: true,
    availableCheckoutSkus: ['standard_monthly', 'plus_monthly', 'hints_1'],
    cancelAtPeriodEnd: false, periodEnd: null, lastGrantUtcDay: null, tickets: { ranked: 0, hint: 0 },
};
const live: NonNullable<StripeMembershipStatus['commerce']> = {
    userId: base.userId, livemode: true, active: true, sku: 'plus_monthly', periodEnd: currentPeriod,
    cancelAtPeriodEnd: false, unlimitedRanked: true, adFree: true, balances: { purchased: 13, subscription: 10 },
};
const legacy: StripeMembershipStatus = { ...base, active: true, periodEnd: currentPeriod, cancelAtPeriodEnd: true,
    lastGrantUtcDay: '2026-10-06', tickets: { ranked: 4, hint: 5 } };
const fixtures: Record<string, StripeMembershipStatus> = {
    legacy,
    standard: { ...base, commerce: { ...live, sku: 'standard_monthly', balances: { purchased: 13, subscription: 0 } } },
    plus: { ...base, commerce: live },
    retained: { ...base, commerce: { ...live, active: false, sku: null, periodEnd: null, unlimitedRanked: false, adFree: false,
        balances: { purchased: 27, subscription: 7 } } },
    sandbox: { ...base, commerce: { ...live, livemode: false, unlimitedRanked: false, adFree: false,
        balances: { purchased: 77, subscription: 10 } } },
    mixed: { ...legacy, commerce: live },
};

// Controlled transport replies only. These do not import authentication, Stripe,
// SQL or production configuration. Source checkout readiness remains OFF.
export const STRIPE_WEB_CHECKOUT_ENABLED = true;
export const STRIPE_WEB_PORTAL_ENABLED = true;
export const MEMBER_TICKET_USAGE_ENABLED = true;
export const stripeWebMembershipAllowed = (webContent: boolean, nativePlatform: boolean) => webContent && !nativePlatform;
export const readStripeMembershipStatus = async (userId: string, signal?: AbortSignal): Promise<StripeMembershipStatus> => {
    signal?.throwIfAborted(); qa.reads++;
    const status = fixtures[scenario];
    if (!status) throw new Error('Unknown synthetic scenario');
    return { ...status, userId, ...(status.commerce ? { commerce: { ...status.commerce, userId } } : {}) };
};
export const readMemberTicketStatus = readStripeMembershipStatus;
export const claimMemberTickets = async () => { throw new Error('No claims in read-only fixture'); };
export const prepareStripeCheckout = async () => { qa.checkout++; throw new Error('Checkout must remain closed'); };
export const prepareStripeBillingPortal = async () => {
    qa.portal++;
    return new Promise<string>(resolve => { qa.releasePortal = () => resolve('https://billing.stripe.com/p/session/fixture_stale'); });
};
export const CURRENT_TERMS_ACCEPTED_EVENT = 'fixture-terms-accepted';
export const DAILY_LOGIN_REWARD_CHANGED_EVENT = 'qg-daily-login-reward-changed';
export const acceptCurrentAccountTerms = async () => { qa.consent++; };
export const Capacitor = { isNativePlatform: () => native };
export const useAppPlatform = () => ({ webContent: !native });
export default function Link({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    return <a href={href} {...props}>{children}</a>;
}
