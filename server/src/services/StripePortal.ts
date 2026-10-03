import { StripeMembershipError } from './StripeMembership';
import { createStripeClient, stripeRequest } from './StripeClient';
import type Stripe from 'stripe';

const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
const stripeId = (value: unknown, prefix: string): value is string =>
    typeof value === 'string' && new RegExp(`^${prefix}[A-Za-z0-9]{8,200}$`).test(value);

export interface StripePortalConfig {
    secretKey: string;
    mode: 'test' | 'live';
    returnUrl: string;
}

/** The caller obtains customerId only from a trusted owner-scoped DB lookup. */
export class StripePortalApi {
    private readonly client: Stripe;
    get livemode() { return this.config.mode === 'live'; }
    constructor(private readonly config: StripePortalConfig, private readonly request: typeof fetch = fetch) {
        const keyMode = /^(?:sk|rk)_(test|live)_[A-Za-z0-9_]{8,}$/.exec(config.secretKey)?.[1];
        let validReturn = false;
        try {
            const url = new URL(config.returnUrl);
            validReturn = url.protocol === 'https:' && url.hostname === 'q-gambit.com'
                && !url.username && !url.password && !url.port;
        } catch { /* fail below */ }
        if (!keyMode || keyMode !== config.mode || !validReturn) {
            throw new StripeMembershipError('STRIPE_PORTAL_CONFIG_REQUIRED');
        }
        this.client = createStripeClient(config.secretKey, request);
    }

    private async call(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
        let data: unknown;
        try { data = await stripeRequest(this.client, path, init); }
        catch { throw new StripeMembershipError('STRIPE_PORTAL_UNAVAILABLE'); }
        if (!object(data) || ('livemode' in data && data.livemode !== (this.config.mode === 'live'))) {
            throw new StripeMembershipError('STRIPE_PORTAL_MODE_MISMATCH');
        }
        return data;
    }

    /** Read-only preflight. Returns the validated configuration for session creation. */
    async verifyDefaultConfiguration(): Promise<string> {
        // Fail closed if the Dashboard default portal does not permit both
        // payment-method changes and cancellation, or enables plan changes.
        const list = await this.call('billing_portal/configurations?limit=100');
        if (!Array.isArray(list.data) || list.has_more !== false) {
            throw new StripeMembershipError('STRIPE_PORTAL_CONFIGURATION_INVALID');
        }
        const matches = list.data.filter(row => object(row) && row.is_default === true
            && row.active === true && row.livemode === (this.config.mode === 'live'));
        if (matches.length !== 1) throw new StripeMembershipError('STRIPE_PORTAL_CONFIGURATION_INVALID');
        const portal = matches[0] as Record<string, unknown>;
        const features = object(portal.features) ? portal.features : null;
        const paymentMethod = features && object(features.payment_method_update) ? features.payment_method_update : null;
        const cancel = features && object(features.subscription_cancel) ? features.subscription_cancel : null;
        const update = features && object(features.subscription_update) ? features.subscription_update : null;
        if (!stripeId(portal.id, 'bpc_') || paymentMethod?.enabled !== true
            || cancel?.enabled !== true || cancel.mode !== 'at_period_end'
            || cancel.proration_behavior !== 'none'
            || update?.enabled !== false) {
            throw new StripeMembershipError('STRIPE_PORTAL_FEATURES_NOT_READY');
        }
        return portal.id;
    }

    async createSession(customerId: string): Promise<string> {
        if (!stripeId(customerId, 'cus_')) throw new StripeMembershipError('STRIPE_PORTAL_CUSTOMER_INVALID');
        const configurationId = await this.verifyDefaultConfiguration();
        const form = new URLSearchParams({
            customer: customerId,
            configuration: configurationId,
            return_url: this.config.returnUrl,
        });
        const session = await this.call('billing_portal/sessions', {
            method: 'POST', body: form,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        if (!stripeId(session.id, 'bps_') || session.object !== 'billing_portal.session'
            || session.customer !== customerId || session.configuration !== configurationId
            || session.return_url !== this.config.returnUrl || typeof session.url !== 'string') {
            throw new StripeMembershipError('STRIPE_PORTAL_SESSION_INVALID');
        }
        let url: URL;
        try { url = new URL(session.url); }
        catch { throw new StripeMembershipError('STRIPE_PORTAL_SESSION_INVALID'); }
        if (url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com'
            || !/^\/p\/session\/[A-Za-z0-9_-]{8,}$/.test(url.pathname)
            || url.username || url.password || url.port || url.search || url.hash) {
            throw new StripeMembershipError('STRIPE_PORTAL_SESSION_INVALID');
        }
        return url.href;
    }
}
