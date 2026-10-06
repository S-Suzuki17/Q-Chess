import type { IncomingHttpHeaders } from 'node:http';
import { verifyStripeWebhook, type StripeEvent } from './StripeMembership';
import { StripeCommerceEvidence } from './StripeCommerceEvidence';
import type { CommerceCheckoutIntent, CommerceFulfillmentResult, StripeCommerceStore } from './StripeCommerceStore';
import { isCommerceSku } from './CommerceCatalog';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown, prefix: string): value is string => typeof value === 'string'
    && new RegExp(`^${prefix}[A-Za-z0-9]{8,200}$`).test(value);
const subscriptionEvents = new Set(['customer.subscription.created','customer.subscription.updated',
    'customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed']);
const invoiceEvents = new Set(['invoice.paid','invoice.payment_failed','invoice.voided','invoice.marked_uncollectible']);
const checkoutEvents = new Set(['checkout.session.completed','checkout.session.async_payment_succeeded']);
const routedCheckoutEvents = new Set([...checkoutEvents, 'checkout.session.async_payment_failed']);
const riskEvents = new Set(['charge.refunded','charge.dispute.created','charge.dispute.closed',
    'radar.early_fraud_warning.created','credit_note.created','credit_note.updated','credit_note.voided']);

/**
 * New-SKU-only boundary, mounted behind the existing billing-processing gates.
 * Reuse neither this module for legacy $2.99 nor the legacy handler for new SKUs.
 * Callers acknowledge only a returned result; ANY exception requests a retry.
 */
export class StripeCommerceFulfillment {
    constructor(private readonly evidence: StripeCommerceEvidence, private readonly store: StripeCommerceStore,
        private readonly webhookSecret: string) {}

    /** Signed routing cannot grant: only a stored intent plus canonical evidence can. */
    async dispatchWebhook(body: Buffer, headers: IncomingHttpHeaders): Promise<boolean> {
        const event = verifyStripeWebhook(body, headers, this.webhookSecret);
        if (event.livemode !== this.evidence.config.livemode) throw new Error('EVENT_MODE_MISMATCH');
        const owned = async (checkout: Record<string, unknown>) => {
            if (!id(checkout.id, event.livemode ? 'cs_live_' : 'cs_test_')) throw new Error('COMMERCE_EVENT_INVALID');
            const intent = await this.store.checkoutIntent(checkout.id, event.livemode);
            if (intent) return intent;
            // Metadata may demand a retry for a lost registration, never prove ownership.
            if (object(checkout.metadata) && isCommerceSku(checkout.metadata.qgambit_sku)) {
                throw new Error('COMMERCE_CHECKOUT_UNBOUND');
            }
            return null;
        };
        if (riskEvents.has(event.type)) {
            for (const checkout of await this.evidence.riskCheckouts(event)) {
                if (await owned(checkout)) throw new Error('COMMERCE_RISK_POLICY_REQUIRED');
            }
            return false;
        }
        const subscriptionId = this.subscriptionId(event, true);
        if (subscriptionId) {
            // The durable retirement fence survives account/intent erasure and
            // must precede provider reads for both legacy and new subscriptions.
            const lease = await this.store.acquireReconciliation(subscriptionId, event.livemode);
            if (lease.retired) return true;
            if (!lease.token) throw new Error('RECONCILIATION_BUSY');
            try {
                const context = await this.evidence.subscriptionContext(subscriptionId);
                const intent = await owned(context.checkout);
                if (!intent) return false; // Legacy router reacquires before its own canonical read.
                if (routedCheckoutEvents.has(event.type) && !checkoutEvents.has(event.type)) {
                    throw new Error('COMMERCE_EVENT_UNSUPPORTED');
                }
                const canonical = await this.evidence.subscription(event, context, intent, lease.token);
                await this.store.fulfillSubscription(canonical);
                return true;
            } finally {
                await this.store.releaseReconciliation(subscriptionId, event.livemode, lease.token);
            }
        }
        let checkout: Record<string, unknown>;
        if (routedCheckoutEvents.has(event.type)) {
            const checkoutId = event.data.object.id;
            if (!id(checkoutId, event.livemode ? 'cs_live_' : 'cs_test_')) throw new Error('COMMERCE_EVENT_INVALID');
            checkout = await this.evidence.checkout(checkoutId);
        } else return false;
        if (!await owned(checkout)) return false;
        const fulfilled = await this.fulfillWebhook(body, headers);
        if (!fulfilled) throw new Error('COMMERCE_EVENT_UNSUPPORTED');
        return true;
    }

    private async intent(checkoutId: string, livemode: boolean): Promise<CommerceCheckoutIntent> {
        const intent = await this.store.checkoutIntent(checkoutId, livemode);
        if (!intent) throw new Error('COMMERCE_CHECKOUT_UNBOUND');
        // Paid reconciliation uses the immutable consent captured by registration
        // inside the atomic RPC. A later current-policy change cannot block it.
        return intent;
    }
    /** Raw signature verification precedes every provider or database operation. */
    async fulfillWebhook(body: Buffer, headers: IncomingHttpHeaders): Promise<CommerceFulfillmentResult | null> {
        const event = verifyStripeWebhook(body, headers, this.webhookSecret);
        if (event.livemode !== this.evidence.config.livemode) throw new Error('EVENT_MODE_MISMATCH');
        if (riskEvents.has(event.type)) throw new Error('COMMERCE_RISK_POLICY_REQUIRED');
        if (checkoutEvents.has(event.type) && !['payment','subscription'].includes(String(event.data.object.mode))) {
            throw new Error('COMMERCE_EVENT_INVALID');
        }
        if (checkoutEvents.has(event.type) && event.data.object.mode === 'payment') {
            const checkoutId = event.data.object.id;
            if (!id(checkoutId, event.livemode ? 'cs_live_' : 'cs_test_')) throw new Error('COMMERCE_EVENT_INVALID');
            // No DB binding means no canonical reads or grants. Metadata alone cannot register ownership.
            const intent = await this.intent(checkoutId, event.livemode);
            const checkout = await this.evidence.checkout(checkoutId);
            return this.store.fulfillOneTime(await this.evidence.oneTime(event, checkout, intent));
        }
        const subscriptionId = this.subscriptionId(event);
        if (!subscriptionId) return null;
        const lease = await this.store.acquireReconciliation(subscriptionId, event.livemode);
        if (lease.retired) return { applied: false, duplicate: false, retired: true, credited: 0 };
        if (!lease.token) throw new Error('RECONCILIATION_BUSY');
        try {
            const context = await this.evidence.subscriptionContext(subscriptionId);
            const intent = await this.intent(context.checkout.id as string, event.livemode);
            const canonical = await this.evidence.subscription(event, context, intent, lease.token);
            return await this.store.fulfillSubscription(canonical);
        } finally {
            // Release failures also retry; durable receipts make a post-commit retry safe.
            await this.store.releaseReconciliation(subscriptionId, event.livemode, lease.token);
        }
    }
    private subscriptionId(event: StripeEvent, includeUnsupportedCheckout = false): string | null {
        let value: unknown;
        if (subscriptionEvents.has(event.type)) value = event.data.object.id;
        else if ((includeUnsupportedCheckout ? routedCheckoutEvents : checkoutEvents).has(event.type)
            && event.data.object.mode === 'subscription') value = event.data.object.subscription;
        else if (invoiceEvents.has(event.type)) {
            const parent = event.data.object.parent;
            value = object(parent) && parent.type === 'subscription_details' && object(parent.subscription_details)
                ? parent.subscription_details.subscription : null;
        } else return null;
        if (!id(value, 'sub_')) throw new Error('COMMERCE_EVENT_INVALID');
        return value;
    }
}
