import type { IncomingHttpHeaders } from 'node:http';
import { verifyStripeWebhook, type StripeEvent } from './StripeMembership';
import { StripeCommerceEvidence } from './StripeCommerceEvidence';
import type { CommerceCheckoutIntent, CommerceFulfillmentResult, StripeCommerceStore } from './StripeCommerceStore';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown, prefix: string): value is string => typeof value === 'string'
    && new RegExp(`^${prefix}[A-Za-z0-9]{8,200}$`).test(value);
const subscriptionEvents = new Set(['customer.subscription.created','customer.subscription.updated',
    'customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed']);
const invoiceEvents = new Set(['invoice.paid','invoice.payment_failed','invoice.voided','invoice.marked_uncollectible']);
const checkoutEvents = new Set(['checkout.session.completed','checkout.session.async_payment_succeeded']);
const riskEvents = new Set(['charge.refunded','charge.dispute.created','charge.dispute.closed',
    'radar.early_fraud_warning.created','credit_note.created','credit_note.updated','credit_note.voided']);

/**
 * Dormant new-SKU-only boundary. Not mounted by index.ts or the legacy router.
 * Reuse neither this module for legacy $2.99 nor the legacy handler for new SKUs.
 * Callers acknowledge only a returned result; ANY exception requests a retry.
 */
export class StripeCommerceFulfillment {
    constructor(private readonly evidence: StripeCommerceEvidence, private readonly store: StripeCommerceStore,
        private readonly webhookSecret: string) {}

    private async intent(checkoutId: string, livemode: boolean): Promise<CommerceCheckoutIntent> {
        const intent = await this.store.checkoutIntent(checkoutId, livemode);
        if (!intent) throw new Error('COMMERCE_CHECKOUT_UNBOUND');
        if (!await this.store.hasCurrentTerms(intent.userId)) throw new Error('CURRENT_TERMS_REQUIRED');
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
    private subscriptionId(event: StripeEvent): string | null {
        let value: unknown;
        if (subscriptionEvents.has(event.type)) value = event.data.object.id;
        else if (checkoutEvents.has(event.type) && event.data.object.mode === 'subscription') value = event.data.object.subscription;
        else if (invoiceEvents.has(event.type)) {
            const parent = event.data.object.parent;
            value = object(parent) && parent.type === 'subscription_details' && object(parent.subscription_details)
                ? parent.subscription_details.subscription : null;
        } else return null;
        if (!id(value, 'sub_')) throw new Error('COMMERCE_EVENT_INVALID');
        return value;
    }
}
