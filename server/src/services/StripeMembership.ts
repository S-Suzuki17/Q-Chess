import { createHash, randomUUID, randomInt } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import Stripe from 'stripe';
import type { StripeReversalTarget } from './StripeReversal';
import { QG_STRIPE_API_VERSION } from './StripeApiVersion';
import { createStripeClient, stripeRequest } from './StripeClient';

const STRIPE_ID = /^(?:cs_(?:test|live)_|sub_|cus_|price_|evt_|in_)[A-Za-z0-9]{8,200}$/;
export const QG_LIVE_MONTHLY_PRICE_ID = 'price_1ULM9fQWzwYDIuXWgs5Uj3yt';
// A canonical Stripe Subscription with malformed/multiple line items is never
// an eligible $2.99 membership, even if one item happens to use our Price.
const INELIGIBLE_PRICE_ID = 'price_INELIGIBLE000000';
export type StripeMembershipMode = 'test' | 'live';
const SUBSCRIPTION_EVENTS = new Set([
    'customer.subscription.created', 'customer.subscription.updated',
    'customer.subscription.deleted', 'customer.subscription.paused',
    'customer.subscription.resumed',
]);
const INVOICE_EVENTS = new Set([
    'invoice.paid', 'invoice.payment_failed', 'invoice.voided', 'invoice.marked_uncollectible',
]);
const REVERSAL_EVENTS = new Set([
    'charge.refunded', 'charge.dispute.created', 'radar.early_fraud_warning.created',
]);
const CHECKOUT_EVENTS = new Set(['checkout.session.completed',
    'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed']);
const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

export interface StripeEvent {
    id: string;
    type: string;
    created: number;
    livemode: boolean;
    data: { object: Record<string, unknown> };
    payloadHash: string;
}
export interface StripeMembershipSnapshot {
    eventId: string;
    eventPayloadHash: string;
    eventType: string;
    eventCreated: number;
    observedAt: string;
    subscriptionId: string;
    checkoutId: string;
    customerId: string;
    userId: string;
    priceId: string;
    status: string;
    periodEnd: string | null;
    paidNewPeriod: boolean;
    cancelAtPeriodEnd: boolean;
    livemode: boolean;
    reconciliationToken?: string;
}
export interface StripeCheckout { id: string; url: string; expiresAt: string; }
export interface StripeMembershipConfig {
    mode?: StripeMembershipMode;
    secretKey: string;
    webhookSecret: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    automaticTaxEnabled?: boolean;
    taxRegistrationConfirmed?: boolean;
}

export class StripeMembershipError extends Error {
    constructor(message = 'STRIPE_UNAVAILABLE') { super(message); }
}

/** Verify the exact raw body with Stripe's maintained SDK before parsing it. */
export function verifyStripeWebhook(body: Buffer, headers: IncomingHttpHeaders, secret: string, now = Date.now()): StripeEvent {
    const header = headers['stripe-signature'];
    if (!Buffer.isBuffer(body) || body.length < 2 || body.length > 64 * 1024 || typeof header !== 'string'
        || header.length > 1024 || typeof secret !== 'string' || !/^whsec_[A-Za-z0-9_-]{8,}$/.test(secret)) {
        throw new StripeMembershipError('INVALID_SIGNATURE');
    }
    const parts = header.split(',').map(part => part.trim());
    const stamps = parts.filter(part => part.startsWith('t='));
    if (stamps.length !== 1 || !/^t=\d{10}$/.test(stamps[0])) {
        throw new StripeMembershipError('INVALID_SIGNATURE');
    }
    const timestamp = Number(stamps[0].slice(2));
    if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp * 1000) > 300_000) {
        throw new StripeMembershipError('INVALID_SIGNATURE');
    }
    let value: unknown;
    try { value = Stripe.webhooks.constructEvent(body, header, secret, 300, undefined, now); }
    catch { throw new StripeMembershipError('INVALID_SIGNATURE'); }
    if (!object(value) || typeof value.id !== 'string' || !STRIPE_ID.test(value.id) || !value.id.startsWith('evt_')
        || typeof value.type !== 'string' || !Number.isSafeInteger(value.created)
        || value.api_version !== QG_STRIPE_API_VERSION
        || typeof value.livemode !== 'boolean' || !object(value.data) || !object(value.data.object)) {
        throw new StripeMembershipError('INVALID_EVENT');
    }
    return { ...(value as unknown as Omit<StripeEvent, 'payloadHash'>),
        payloadHash: createHash('sha256').update(body).digest('hex') };
}

function stripeId(value: unknown, prefix: string): value is string {
    return typeof value === 'string' && value.startsWith(prefix) && STRIPE_ID.test(value);
}

/** Server-only Stripe boundary. Its default mode remains test for old callers. */
export class StripeMembershipApi {
    get priceId() { return this.config.priceId; }
    get livemode() { return this.mode === 'live'; }
    readonly mode: StripeMembershipMode;
    private readonly client: Stripe;
    constructor(
        private readonly config: StripeMembershipConfig,
        private readonly request: typeof fetch = fetch,
    ) {
        this.mode = config.mode ?? 'test';
        if (!['test', 'live'].includes(this.mode)
            || !new RegExp(`^(?:sk|rk)_${this.mode}_[A-Za-z0-9_]{8,}$`).test(config.secretKey)
            || !/^whsec_[A-Za-z0-9_-]{8,}$/.test(config.webhookSecret)
            || !stripeId(config.priceId, 'price_')
            || config.priceId === INELIGIBLE_PRICE_ID
            || (this.mode === 'live' && config.priceId !== QG_LIVE_MONTHLY_PRICE_ID)
            || ![config.successUrl, config.cancelUrl].every(url => {
                try { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname === 'q-gambit.com'; }
                catch { return false; }
            })
            || (config.automaticTaxEnabled === true && config.taxRegistrationConfirmed !== true)) {
            throw new StripeMembershipError('STRIPE_CONFIG_REQUIRED');
        }
        this.client = createStripeClient(config.secretKey, request);
    }

    private async call(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
        let data: unknown;
        try { data = await stripeRequest(this.client, path, init); }
        catch { throw new StripeMembershipError(); }
        if (!object(data) || ('livemode' in data && data.livemode !== (this.mode === 'live'))) {
            throw new StripeMembershipError();
        }
        return data;
    }

    async createCheckout(userId: string): Promise<StripeCheckout> {
        if (typeof userId !== 'string' || !userId || userId.length > 256 || /[\u0000-\u001f\u007f]/.test(userId)) {
            throw new StripeMembershipError('INVALID_ACCOUNT');
        }
        const price = await this.call(`prices/${encodeURIComponent(this.config.priceId)}`);
        const recurring = object(price.recurring) ? price.recurring : null;
        if (price.id !== this.config.priceId || price.active !== true
            || price.livemode !== (this.mode === 'live')
            || price.currency !== 'usd' || price.unit_amount !== 299 || price.type !== 'recurring'
            || recurring?.interval !== 'month' || recurring?.interval_count !== 1
            || price.tax_behavior !== 'inclusive') {
            throw new StripeMembershipError(this.mode === 'test' ? 'STRIPE_TEST_PRICE_MISMATCH' : 'STRIPE_LIVE_PRICE_MISMATCH');
        }
        const form = new URLSearchParams({
            mode: 'subscription',
            'line_items[0][price]': this.config.priceId,
            'line_items[0][quantity]': '1',
            client_reference_id: userId,
            success_url: this.config.successUrl,
            cancel_url: this.config.cancelUrl,
            'subscription_data[metadata][qgambit_user_id]': userId,
        });
        form.set('automatic_tax[enabled]', String(this.config.automaticTaxEnabled === true));
        // Managed Payments enables tax by default in some accounts. Tax policy
        // is explicit and independent of sales; never change account settings.
        form.set('managed_payments[enabled]', 'false');
        const suffix = Array.from({ length: 8 }, () => String.fromCharCode(97 + randomInt(26))).join('');
        form.set('integration_identifier', `qg_web_membership_${suffix}`);
        const data = await this.call('checkout/sessions', {
            method: 'POST', body: form,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': randomUUID() },
        });
        const expectedPrefix = `cs_${this.mode}_`;
        let checkoutUrl: URL;
        try { checkoutUrl = new URL(String(data.url)); }
        catch { throw new StripeMembershipError(); }
        if (!stripeId(data.id, expectedPrefix) || typeof data.url !== 'string'
            || data.mode !== 'subscription' || data.client_reference_id !== userId
            || data.livemode !== (this.mode === 'live') || !Number.isSafeInteger(data.expires_at)
            || (data.expires_at as number) * 1000 <= Date.now()
            || checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com'
            || (data.currency !== 'usd' || data.amount_total !== 299
                || data.status !== 'open' || !object(data.automatic_tax)
                || data.automatic_tax.enabled !== (this.config.automaticTaxEnabled === true))) {
            throw new StripeMembershipError();
        }
        {
            // Verify the server-created Session actually contains exactly the
            // reviewed $2.99 subscription Price before exposing its URL.
            const lines = await this.call(`checkout/sessions/${encodeURIComponent(data.id as string)}/line_items?limit=2`);
            const item = Array.isArray(lines.data) && lines.data.length === 1 ? lines.data[0] : null;
            if (!object(item) || !object(item.price) || item.price.id !== this.config.priceId
                || item.quantity !== 1 || lines.has_more !== false) throw new StripeMembershipError();
        }
        return { id: data.id as string, url: data.url as string, expiresAt: new Date((data.expires_at as number) * 1000).toISOString() };
    }

    async expireCheckout(id: string): Promise<void> {
        if (!stripeId(id, `cs_${this.mode}_`)) return;
        await this.call(`checkout/sessions/${encodeURIComponent(id)}/expire`, { method: 'POST' });
    }

    /** Only Stripe's terminal expired state proves that a delayed paid webhook cannot exist. */
    async isCheckoutExpired(id: string): Promise<boolean> {
        if (!stripeId(id, `cs_${this.mode}_`)) throw new StripeMembershipError();
        const session = await this.call(`checkout/sessions/${encodeURIComponent(id)}`);
        if (session.id !== id || session.livemode !== (this.mode === 'live')
            || !['open', 'complete', 'expired'].includes(String(session.status))) {
            throw new StripeMembershipError();
        }
        return session.status === 'expired' && session.subscription == null
            && session.payment_status !== 'paid';
    }

    private async subscription(id: string): Promise<Record<string, unknown>> {
        if (!stripeId(id, 'sub_')) throw new StripeMembershipError();
        const data = await this.call(`subscriptions/${encodeURIComponent(id)}`);
        if (data.id !== id || !stripeId(data.customer, 'cus_')
            || data.livemode !== (this.mode === 'live')) throw new StripeMembershipError();
        return data;
    }

    private async invoicePaid(subscription: Record<string, unknown>, subscriptionId: string): Promise<boolean> {
        const invoiceId = subscription.latest_invoice;
        if (!stripeId(invoiceId, 'in_')) return false;
        const invoice = await this.call(`invoices/${encodeURIComponent(invoiceId)}`);
        const parentSubscription = object(invoice.parent) && object(invoice.parent.subscription_details)
            ? invoice.parent.subscription_details.subscription : null;
        if (invoice.id !== invoiceId || parentSubscription !== subscriptionId
            || invoice.livemode !== (this.mode === 'live') || invoice.currency !== 'usd'
            || invoice.customer !== subscription.customer
            || invoice.collection_method !== 'charge_automatically'
            || !object(invoice.automatic_tax)
            || invoice.automatic_tax.enabled !== (this.config.automaticTaxEnabled === true)) throw new StripeMembershipError();
        // A paid invoice is a necessary condition, not sufficient evidence against a later refund.
        if (invoice.status !== 'paid' || invoice.total !== 299 || invoice.amount_paid !== 299
            || invoice.amount_remaining !== 0 || (invoice.amount_paid_off_stripe ?? 0) !== 0) return false;
        const payments = await this.call(`invoice_payments?invoice=${encodeURIComponent(invoiceId)}&status=paid&limit=100`);
        if (!Array.isArray(payments.data) || payments.has_more !== false || payments.data.length !== 1) return false;
        const payment = payments.data[0];
        if (!object(payment) || payment.invoice !== invoiceId || payment.livemode !== this.livemode
            || payment.status !== 'paid' || payment.amount_paid !== 299 || payment.currency !== 'usd'
            || !object(payment.payment) || payment.payment.type !== 'payment_intent'
            || typeof payment.payment.payment_intent !== 'string') return false;
        const intentId = payment.payment.payment_intent;
        if (!/^pi_[A-Za-z0-9]{8,200}$/.test(intentId)) return false;
        const intent = await this.call(`payment_intents/${encodeURIComponent(intentId)}`);
        if (!(intent.id === intentId && intent.livemode === this.livemode && intent.status === 'succeeded'
            && intent.customer === subscription.customer && intent.currency === 'usd' && intent.amount_received === 299
        )) return false;
        if (typeof intent.latest_charge !== 'string' || !/^ch_[A-Za-z0-9]{8,200}$/.test(intent.latest_charge)) return false;
        const charge = await this.call(`charges/${encodeURIComponent(intent.latest_charge)}`);
        return charge.id === intent.latest_charge && charge.livemode === this.livemode
            && charge.payment_intent === intentId && charge.customer === subscription.customer
            && charge.paid === true && charge.status === 'succeeded' && charge.currency === 'usd'
            && charge.amount === 299 && charge.amount_refunded === 0 && charge.disputed === false;
    }

    private async checkoutFor(subscriptionId: string, customerId: string): Promise<Record<string, unknown>> {
        const data = await this.call(`checkout/sessions?subscription=${encodeURIComponent(subscriptionId)}&limit=100`);
        if (!Array.isArray(data.data) || data.has_more !== false) throw new StripeMembershipError();
        const matches = data.data.filter(item => object(item) && stripeId(item.id, `cs_${this.mode}_`)
            && item.subscription === subscriptionId && item.customer === customerId
            && item.mode === 'subscription' && item.livemode === (this.mode === 'live'));
        if (matches.length !== 1) throw new StripeMembershipError();
        return matches[0] as Record<string, unknown>;
    }

    async resolveReversal(event: StripeEvent): Promise<StripeReversalTarget[]> {
        const { resolveStripeReversal } = await import('./StripeReversal');
        return resolveStripeReversal(event, this.config.secretKey, this.request);
    }

    /** Canonical mode-matched mapping for a reversed invoice; never trust webhook metadata. */
    async reversalContext(event: StripeEvent, subscriptionId: string): Promise<{
        subscriptionId: string; checkoutId: string; customerId: string; userId: string;
        periodEnd: string; currentInvoiceId: string;
    }> {
        if (event.livemode !== (this.mode === 'live') || !stripeId(subscriptionId, 'sub_')) {
            throw new StripeMembershipError('STRIPE_MODE_MISMATCH');
        }
        const subscription = await this.subscription(subscriptionId);
        const customerId = subscription.customer as string;
        const checkout = await this.checkoutFor(subscriptionId, customerId);
        const userId = checkout.client_reference_id;
        const invoiceId = subscription.latest_invoice;
        const itemList = object(subscription.items) ? subscription.items.data : null;
        const item = Array.isArray(itemList) && itemList.length === 1 ? itemList[0] : null;
        const periodEnd = subscription.current_period_end ?? (object(item) ? item.current_period_end : null);
        if (!stripeId(checkout.id, `cs_${this.mode}_`) || typeof userId !== 'string' || !userId
            || userId.length > 256 || !stripeId(invoiceId, 'in_')
            || !Number.isSafeInteger(periodEnd) || (periodEnd as number) <= 0) {
            throw new StripeMembershipError('REVERSAL_CONTEXT_UNAVAILABLE');
        }
        return { subscriptionId, checkoutId: checkout.id as string, customerId, userId,
            periodEnd: new Date((periodEnd as number) * 1000).toISOString(), currentInvoiceId: invoiceId };
    }

    async snapshot(event: StripeEvent): Promise<StripeMembershipSnapshot | null> {
        if (event.livemode !== (this.mode === 'live')) {
            throw new StripeMembershipError(this.mode === 'test' ? 'LIVE_EVENT_REJECTED' : 'STRIPE_MODE_MISMATCH');
        }
        // Current-period refund/dispute reconciliation needs invoice/payment lineage.
        // Retrying instead of acknowledging prevents a stale active projection from being silently accepted.
        if (REVERSAL_EVENTS.has(event.type)) throw new StripeMembershipError('PAYMENT_REVERSAL_REQUIRES_RECONCILIATION');
        const subscriptionId = this.eventSubscriptionId(event);
        if (!subscriptionId) return null;
        const subscription = await this.subscription(subscriptionId);
        const customerId = subscription.customer as string;
        const checkout = await this.checkoutFor(subscriptionId, customerId);
        const userId = checkout.client_reference_id;
        const subscriptionItems = object(subscription.items) ? subscription.items : null;
        const itemList = subscriptionItems?.data;
        const item = Array.isArray(itemList) && itemList.length === 1 && object(itemList[0]) ? itemList[0] : null;
        const itemPrice = item && object(item.price) ? item.price.id : null;
        const price = stripeId(itemPrice, 'price_') ? itemPrice : INELIGIBLE_PRICE_ID;
        const eligiblePrice = subscriptionItems?.has_more === false
            && price === this.config.priceId && item?.quantity === 1
            && object(subscription.automatic_tax)
            && subscription.automatic_tax.enabled === (this.config.automaticTaxEnabled === true);
        const periodEnd = subscription.current_period_end ?? (object(item) ? item.current_period_end : null);
        const allowedStatuses = new Set(['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused']);
        if (typeof userId !== 'string' || !userId || userId.length > 256
            || !stripeId(checkout.id, `cs_${this.mode}_`)
            || (CHECKOUT_EVENTS.has(event.type) && event.data.object.id !== checkout.id)
            || checkout.status !== 'complete'
            || typeof subscription.status !== 'string'
            || !allowedStatuses.has(subscription.status) || !Number.isSafeInteger(periodEnd)
            || typeof subscription.cancel_at_period_end !== 'boolean'
            || !Number.isSafeInteger(event.created)) throw new StripeMembershipError();
        // Project a verified off-price subscription as ineligible instead of
        // retrying its webhook forever and leaving stale paid access in the DB.
        // The DB still requires the original server-registered Checkout and
        // owner; current_price_id must match that intent to grant tickets.
        const latestInvoicePaid = eligiblePrice && subscription.status === 'active'
            && checkout.payment_status === 'paid'
            && await this.invoicePaid(subscription, subscriptionId);
        const normalizedStatus = subscription.status === 'active' && !latestInvoicePaid
            ? 'unpaid' : subscription.status;
        const paidNewPeriod = event.type === 'invoice.paid'
            && eligiblePrice && event.data.object.id === subscription.latest_invoice && latestInvoicePaid;
        return {
            eventId: event.id, eventPayloadHash: event.payloadHash,
            eventType: event.type, eventCreated: event.created, observedAt: new Date().toISOString(),
            subscriptionId, checkoutId: checkout.id as string, customerId,
            userId, priceId: price as string, status: normalizedStatus,
            periodEnd: new Date((periodEnd as number) * 1000).toISOString(),
            paidNewPeriod, cancelAtPeriodEnd: subscription.cancel_at_period_end as boolean,
            livemode: this.mode === 'live',
        };
    }

    /** Decode only a signed routing key; all ownership/state comes from API + DB. */
    eventSubscriptionId(event: StripeEvent): string | null {
        let id: unknown;
        if (SUBSCRIPTION_EVENTS.has(event.type)) id = event.data.object.id;
        else if (CHECKOUT_EVENTS.has(event.type) && event.data.object.mode === 'subscription') id = event.data.object.subscription;
        else if (INVOICE_EVENTS.has(event.type)) {
            const parent = object(event.data.object.parent) ? event.data.object.parent : null;
            const details = parent && object(parent.subscription_details) ? parent.subscription_details : null;
            id = details?.subscription;
        } else return null;
        if (!stripeId(id, 'sub_')) throw new StripeMembershipError();
        return id;
    }
}

/** Backward-compatible test-only entry point. Callers cannot switch it to live. */
export class StripeTestMembershipApi extends StripeMembershipApi {
    constructor(config: Omit<StripeMembershipConfig, 'mode'>, request: typeof fetch = fetch) {
        super({ ...config, mode: 'test' }, request);
    }
}
