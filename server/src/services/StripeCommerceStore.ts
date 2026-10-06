import type { SupabaseClient } from '@supabase/supabase-js';
import { COMMERCE_CATALOG, isCommerceSku, type CommerceSku } from './CommerceCatalog';
import { hasCurrentTicketTerms } from './AccountCurrentTerms';
import type { StripeMembershipStore } from './StripeMembershipStore';

export interface CommerceCheckoutIntent {
    checkoutId: string; userId: string; sku: CommerceSku; priceId: string;
    amountTotal: number; currency: 'usd'; livemode: boolean;
}
export interface StripeCommerceCheckoutStore {
    registerCheckoutIntent(intent: CommerceCheckoutIntent, expiresAt: string): Promise<void>;
}
export interface CommerceOneTimeEvidence extends CommerceCheckoutIntent {
    eventId: string; payloadHash: string; paymentStatus: 'paid';
}
export interface CommercePaidPeriod { invoiceId: string; periodStart: string; periodEnd: string; }
export interface CommerceSubscriptionEvidence extends CommerceCheckoutIntent {
    eventId: string; payloadHash: string; eventType: string; eventCreated: number; observedAt: string;
    subscriptionId: string; customerId: string; status: string; periodEnd: string;
    latestInvoiceId: string | null; paidNewPeriod: boolean; cancelAtPeriodEnd: boolean; token: string;
    paidPeriod: CommercePaidPeriod | null;
}
export interface CommerceFulfillmentResult {
    applied: boolean; duplicate: boolean; credited: number; retired?: boolean;
}
export interface StripeCommerceStore {
    checkoutIntent(checkoutId: string, livemode: boolean): Promise<CommerceCheckoutIntent | null>;
    hasCurrentTerms(userId: string): Promise<boolean>;
    acquireReconciliation: StripeMembershipStore['acquireReconciliation'];
    releaseReconciliation: StripeMembershipStore['releaseReconciliation'];
    fulfillOneTime(evidence: CommerceOneTimeEvidence): Promise<CommerceFulfillmentResult>;
    fulfillSubscription(evidence: CommerceSubscriptionEvidence): Promise<CommerceFulfillmentResult>;
}
const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
const unavailable = () => new Error('COMMERCE_STORE_UNAVAILABLE');

/** The DB binding is reviewed configuration, never client metadata or an env sales flag. */
export function parseCommerceCheckoutIntent(value: unknown, checkoutId: string, livemode: boolean): CommerceCheckoutIntent {
    if (!object(value) || value.checkout_id !== checkoutId || value.livemode !== livemode
        || !isCommerceSku(value.sku) || typeof value.price_id !== 'string'
        || !/^price_[A-Za-z0-9]{8,200}$/.test(value.price_id)
        || typeof value.user_id !== 'string' || !value.user_id || value.user_id.trim() !== value.user_id
        || Buffer.byteLength(value.user_id) > 256 || /[\u0000-\u001f\u007f]/.test(value.user_id)
        || value.currency !== 'usd' || value.amount_total !== COMMERCE_CATALOG[value.sku].amount
        || !new RegExp(`^cs_${livemode ? 'live' : 'test'}_[A-Za-z0-9]{8,200}$`).test(checkoutId)) throw unavailable();
    return { checkoutId, livemode, userId: value.user_id, sku: value.sku, priceId: value.price_id,
        amountTotal: value.amount_total as number, currency: 'usd' };
}
function result(data: unknown, expectedCredit: number): CommerceFulfillmentResult {
    if (!object(data) || typeof data.applied !== 'boolean' || typeof data.duplicate !== 'boolean'
        || (data.applied && data.duplicate) || !Number.isSafeInteger(data.credited)
        || (data.credited as number) < 0 || (data.credited as number) > 166
        || (data.applied && data.credited !== expectedCredit)
        || (!data.applied && data.credited !== 0)
        || (!data.applied && !data.duplicate && data.retired !== true)
        || (data.retired !== undefined && typeof data.retired !== 'boolean')
        || (data.retired === true && (data.applied || data.credited !== 0))) throw unavailable();
    return data as unknown as CommerceFulfillmentResult;
}

/** Server-owned registration and fulfillment. Never creates a price binding or opens sales. */
export function createStripeCommerceStore(client: SupabaseClient,
    reconciliation: Pick<StripeMembershipStore, 'acquireReconciliation' | 'releaseReconciliation'>): StripeCommerceStore & StripeCommerceCheckoutStore {
    const apply = async (name: string, evidence: CommerceOneTimeEvidence | CommerceSubscriptionEvidence, expectedCredit: number) => {
        const { data, error } = await client.rpc(name, { p_evidence: evidence }).abortSignal(AbortSignal.timeout(5000));
        if (error) {
            if (typeof error.message === 'string' && error.message.includes('COMMERCE_RECONCILIATION_REVIEW_REQUIRED')) {
                throw new Error('COMMERCE_RECONCILIATION_REVIEW_REQUIRED');
            }
            throw unavailable();
        }
        return result(data, expectedCredit);
    };
    return {
        async registerCheckoutIntent(intent, expiresAt) {
            parseCommerceCheckoutIntent({ checkout_id: intent.checkoutId, user_id: intent.userId,
                sku: intent.sku, price_id: intent.priceId, amount_total: intent.amountTotal,
                currency: intent.currency, livemode: intent.livemode }, intent.checkoutId, intent.livemode);
            const expiry = Date.parse(expiresAt);
            if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 2 * 86400_000) throw unavailable();
            // The RPC checks reviewed mode/price binding, account/consent, and
            // serializes subscription ownership under the profile row lock.
            const { error } = await client.rpc('register_stripe_commerce_checkout_intent', {
                p_user_id: intent.userId, p_checkout_id: intent.checkoutId, p_sku: intent.sku,
                p_price_id: intent.priceId, p_amount_total: intent.amountTotal, p_currency: intent.currency,
                p_livemode: intent.livemode, p_expires_at: expiresAt,
            }).abortSignal(AbortSignal.timeout(5000));
            if (error) throw unavailable();
        },
        acquireReconciliation: (...args) => reconciliation.acquireReconciliation(...args),
        releaseReconciliation: (...args) => reconciliation.releaseReconciliation(...args),
        hasCurrentTerms: userId => hasCurrentTicketTerms(client, userId),
        async checkoutIntent(checkoutId, livemode) {
            const { data, error } = await client.from('stripe_commerce_checkout_intents')
                .select('checkout_id,user_id,sku,price_id,amount_total,currency,livemode')
                .eq('checkout_id', checkoutId).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
            if (error) throw unavailable();
            if (data === null) return null;
            const intent = parseCommerceCheckoutIntent(data, checkoutId, livemode);
            const binding = await client.from('stripe_commerce_price_bindings').select('sku,price_id,livemode')
                .eq('sku', intent.sku).eq('livemode', livemode).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
            if (binding.error || !object(binding.data) || binding.data.sku !== intent.sku
                || binding.data.price_id !== intent.priceId || binding.data.livemode !== livemode) throw unavailable();
            return intent;
        },
        fulfillOneTime: evidence => apply('fulfill_stripe_commerce_one_time', evidence, COMMERCE_CATALOG[evidence.sku].hintTickets),
        fulfillSubscription: evidence => apply('fulfill_stripe_commerce_subscription', evidence,
            evidence.paidPeriod ? COMMERCE_CATALOG[evidence.sku].hintTickets : 0),
    };
}
