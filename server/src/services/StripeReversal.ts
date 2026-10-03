import { StripeMembershipError, type StripeEvent } from './StripeMembership';
import { createStripeClient, stripeRequest } from './StripeClient';

const stripeId = (value: unknown, prefix: string): value is string =>
    typeof value === 'string' && new RegExp(`^${prefix}[A-Za-z0-9]{8,200}$`).test(value);
const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const REVERSAL_EVENTS = new Set([
    'charge.refunded', 'charge.dispute.created', 'radar.early_fraud_warning.created',
]);

export interface StripeReversalTarget {
    subscriptionId: string;
    /** One PaymentIntent can settle more than one invoice for the same subscription. */
    reversedInvoiceIds: string[];
}

/**
 * Resolve a signed risk event through Stripe's canonical PaymentIntent ->
 * InvoicePayment -> Invoice graph. Webhook metadata and customer email are
 * deliberately not used as an ownership assertion. The signed event and
 * every canonical Stripe response must match the configured key mode.
 */
export async function resolveStripeReversal(
    event: StripeEvent,
    secretKey: string,
    request: typeof fetch = fetch,
): Promise<StripeReversalTarget[]> {
    const keyMode = /^(?:sk|rk)_(test|live)_[A-Za-z0-9_]{8,}$/.exec(secretKey)?.[1];
    const livemode = keyMode === 'live';
    if (!keyMode || event.livemode !== livemode || !REVERSAL_EVENTS.has(event.type)) {
        throw new StripeMembershipError('STRIPE_REVERSAL_MODE_MISMATCH');
    }

    const client = createStripeClient(secretKey, request);
    const call = async (path: string): Promise<Record<string, unknown>> => {
        let value: unknown;
        try { value = await stripeRequest(client, path); }
        catch { throw new StripeMembershipError('REVERSAL_LOOKUP_UNAVAILABLE'); }
        if (!object(value) || ('livemode' in value && value.livemode !== livemode)) {
            throw new StripeMembershipError('REVERSAL_LOOKUP_INVALID');
        }
        return value;
    };

    const risk = event.data.object;
    let paymentIntent: unknown = risk.payment_intent;
    if (!stripeId(paymentIntent, 'pi_')) {
        const chargeId = event.type === 'charge.refunded' ? risk.id : risk.charge;
        if (!stripeId(chargeId, 'ch_')) throw new StripeMembershipError('REVERSAL_CHARGE_MISSING');
        const charge = await call(`charges/${encodeURIComponent(chargeId)}`);
        if (charge.id !== chargeId || charge.object !== 'charge') {
            throw new StripeMembershipError('REVERSAL_CHARGE_INVALID');
        }
        paymentIntent = charge.payment_intent;
    }
    // A legacy direct charge is not an invoice-backed membership payment.
    if (paymentIntent === null) return [];
    if (!stripeId(paymentIntent, 'pi_')) throw new StripeMembershipError('REVERSAL_PAYMENT_INVALID');

    const bySubscription = new Map<string, Set<string>>();
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
        const query = new URLSearchParams({
            'payment[type]': 'payment_intent',
            'payment[payment_intent]': paymentIntent,
            status: 'paid', limit: '100',
        });
        if (cursor) query.set('starting_after', cursor);
        const list = await call(`invoice_payments?${query}`);
        if (!Array.isArray(list.data) || typeof list.has_more !== 'boolean'
            || (list.has_more && list.data.length === 0)) {
            throw new StripeMembershipError('REVERSAL_INVOICE_LIST_INVALID');
        }
        for (const payment of list.data) {
            if (!object(payment) || !stripeId(payment.id, 'inpay_')
                || payment.livemode !== livemode || payment.status !== 'paid'
                || !object(payment.payment) || payment.payment.type !== 'payment_intent'
                || payment.payment.payment_intent !== paymentIntent
                || !stripeId(payment.invoice, 'in_')) {
                throw new StripeMembershipError('REVERSAL_INVOICE_PAYMENT_INVALID');
            }
            const invoiceId = payment.invoice;
            const invoice = await call(`invoices/${encodeURIComponent(invoiceId)}`);
            if (invoice.id !== invoiceId || invoice.object !== 'invoice'
                || invoice.status !== 'paid' || invoice.livemode !== livemode) {
                throw new StripeMembershipError('REVERSAL_INVOICE_INVALID');
            }
            const parent = object(invoice.parent) ? invoice.parent : null;
            const details = parent?.type === 'subscription_details' && object(parent.subscription_details)
                ? parent.subscription_details : null;
            const subscriptionId = details?.subscription;
            if (!stripeId(subscriptionId, 'sub_')) continue;
            const invoices = bySubscription.get(subscriptionId) ?? new Set<string>();
            invoices.add(invoiceId);
            bySubscription.set(subscriptionId, invoices);
        }
        if (!list.has_more) {
            return [...bySubscription].map(([subscriptionId, invoices]) => ({
                subscriptionId, reversedInvoiceIds: [...invoices],
            }));
        }
        const last = list.data.at(-1);
        if (!object(last) || !stripeId(last.id, 'inpay_')) {
            throw new StripeMembershipError('REVERSAL_PAGINATION_INVALID');
        }
        cursor = last.id;
    }
    // Never acknowledge an incomplete payment graph; Stripe should retry.
    throw new StripeMembershipError('REVERSAL_PAGINATION_LIMIT');
}
