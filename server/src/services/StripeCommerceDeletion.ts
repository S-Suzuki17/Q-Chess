import type { SupabaseClient } from '@supabase/supabase-js';
import { DeletionError } from './AccountDeletion';
import { COMMERCE_CATALOG, matchesCommercePrice } from './CommerceCatalog';
import { parseCommerceCheckoutIntent, type CommerceCheckoutIntent } from './StripeCommerceStore';
import { createStripeClient, stripeRequest } from './StripeClient';

/** Independent of sales switches; once released, keep deletion enabled during sales pauses. */
export const COMMERCE_DELETION_RELEASE_VERIFIED = true;
export interface CommerceDeletionIntent extends CommerceCheckoutIntent { fulfilled: boolean; }
export interface RetiredCommerceCheckout {
    checkoutId: string; livemode: boolean; terminalState: 'expired' | 'completed_paid';
}
export type StripeRetireCommerceCheckouts = (userId: string, checkouts: RetiredCommerceCheckout[]) => Promise<void>;
export interface CommerceDeletionOptions {
    releaseEnabled: boolean;
    retire: StripeRetireCommerceCheckouts;
}
const unavailable = () => new DeletionError('UNAVAILABLE');
const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
const providerId = (value: unknown, prefix: string): value is string =>
    typeof value === 'string' && new RegExp('^' + prefix + '[A-Za-z0-9]{8,200}$').test(value);

/** Called only behind the explicit source release option; dormant servers never query these tables. */
export function createStripeCommerceDeletionLinkSource(client: SupabaseClient) {
    return async (userId: string): Promise<CommerceDeletionIntent[]> => {
        const { data: version, error: protocolError } = await client.rpc('stripe_commerce_deletion_protocol_version')
            .abortSignal(AbortSignal.timeout(5000));
        if (protocolError || version !== 1) throw unavailable();
        const [intents, purchases] = await Promise.all([
            client.from('stripe_commerce_checkout_intents')
                .select('checkout_id,user_id,sku,price_id,amount_total,currency,livemode', { count: 'exact' })
                .eq('user_id', userId).limit(1001).abortSignal(AbortSignal.timeout(5000)),
            client.from('stripe_one_time_purchases').select('checkout_id,user_id,livemode', { count: 'exact' })
                .eq('user_id', userId).limit(1001).abortSignal(AbortSignal.timeout(5000)),
        ]);
        for (const result of [intents, purchases]) {
            if (result.error || !Array.isArray(result.data) || result.count !== result.data.length
                || result.data.length > 1000) throw unavailable();
        }
        const paid = new Map<string, boolean>();
        for (const row of purchases.data!) {
            if (row.user_id !== userId || typeof row.livemode !== 'boolean'
                || !providerId(row.checkout_id, row.livemode ? 'cs_live_' : 'cs_test_')
                || paid.has(row.checkout_id)) throw unavailable();
            paid.set(row.checkout_id, row.livemode);
        }
        const seen = new Set<string>(), result: CommerceDeletionIntent[] = [];
        for (const row of intents.data!) {
            let intent: CommerceCheckoutIntent;
            try { intent = parseCommerceCheckoutIntent(row, row.checkout_id, row.livemode); }
            catch { throw unavailable(); }
            if (intent.userId !== userId || seen.has(intent.checkoutId)) throw unavailable();
            seen.add(intent.checkoutId);
            if (COMMERCE_CATALOG[intent.sku].checkoutMode !== 'payment') {
                if (paid.has(intent.checkoutId)) throw unavailable();
                continue; // Subscription IDs already belong to the legacy cancellation inventory.
            }
            if (paid.has(intent.checkoutId) && paid.get(intent.checkoutId) !== intent.livemode) throw unavailable();
            result.push({ ...intent, fulfilled: paid.has(intent.checkoutId) });
            paid.delete(intent.checkoutId);
        }
        if (paid.size) throw unavailable();
        return result;
    };
}
export function createStripeRetireCommerceCheckouts(client: SupabaseClient): StripeRetireCommerceCheckouts {
    return async (userId, checkouts) => {
        const { error } = await client.rpc('retire_stripe_commerce_account_checkouts', {
            p_user_id: userId, p_checkouts: checkouts,
        }).abortSignal(AbortSignal.timeout(5000));
        if (error) throw unavailable();
    };
}

/** Every mutation targets a DB-owned Checkout. No refund or payment creation is performed here. */
export async function cancelStripeCommerceCheckouts(userId: string, intents: CommerceDeletionIntent[],
    keys: { test?: string; live?: string }, request: typeof fetch,
    retire: StripeRetireCommerceCheckouts): Promise<void> {
    if (!Array.isArray(intents) || intents.length > 1000
        || new Set(intents.map(item => item.checkoutId)).size !== intents.length) throw unavailable();
    const terminal: RetiredCommerceCheckout[] = [];
    for (const intent of intents) {
        if (intent.userId !== userId || typeof intent.fulfilled !== 'boolean'
            || COMMERCE_CATALOG[intent.sku]?.checkoutMode !== 'payment') throw unavailable();
        const mode = intent.livemode ? 'live' : 'test', key = keys[mode];
        if (!key || !new RegExp('^(?:sk|rk)_' + mode + '_[A-Za-z0-9_]{8,}$').test(key)
            || !providerId(intent.checkoutId, 'cs_' + mode + '_')) throw unavailable();
        const call = async (path: string, method = 'GET') => {
            try {
                const result = await stripeRequest(createStripeClient(key, request), path, { method });
                if (!object(result)) throw unavailable();
                return result;
            } catch { throw unavailable(); }
        };
        const owned = (session: Record<string, unknown>) => {
            if (session.id !== intent.checkoutId || session.livemode !== intent.livemode
                || session.client_reference_id !== userId || session.mode !== 'payment'
                || session.subscription != null || session.amount_total !== intent.amountTotal
                || session.currency !== intent.currency || !object(session.metadata)
                || session.metadata.qgambit_sku !== intent.sku
                || (session.customer != null && !providerId(session.customer, 'cus_'))) throw unavailable();
        };
        const path = 'checkout/sessions/' + encodeURIComponent(intent.checkoutId);
        let session = await call(path); owned(session);
        const lines = await call(path + '/line_items?limit=2');
        if (!Array.isArray(lines.data) || lines.data.length !== 1 || lines.has_more !== false
            || !object(lines.data[0]) || lines.data[0].quantity !== 1
            || !matchesCommercePrice(lines.data[0].price,
                { ...COMMERCE_CATALOG[intent.sku], priceId: intent.priceId }, intent.livemode)) throw unavailable();
        if (session.status === 'open') {
            // Completion can win this race. A fresh GET must prove the final state.
            try { await call(path + '/expire', 'POST'); } catch { /* Re-read, then fail closed if still unresolved. */ }
            session = await call(path); owned(session);
        }
        let payment: Record<string, unknown> | null = null;
        if (session.payment_intent != null) {
            if (!providerId(session.payment_intent, 'pi_')) throw unavailable();
            payment = await call('payment_intents/' + encodeURIComponent(session.payment_intent));
            if (payment.id !== session.payment_intent || payment.livemode !== intent.livemode
                || payment.amount !== intent.amountTotal || payment.currency !== intent.currency
                || (payment.customer ?? null) !== (session.customer ?? null)
                || !object(payment.metadata) || payment.metadata.qgambit_user_id !== userId
                || payment.metadata.qgambit_sku !== intent.sku) throw unavailable();
        }
        if (session.status === 'expired' && session.payment_status === 'unpaid' && !intent.fulfilled
            && (!payment || (payment.status === 'canceled' && payment.amount_received === 0
                && payment.amount_capturable === 0))) {
            terminal.push({ checkoutId: intent.checkoutId, livemode: intent.livemode, terminalState: 'expired' });
        } else if (session.status === 'complete' && session.payment_status === 'paid' && intent.fulfilled
            && payment?.status === 'succeeded' && payment.amount_received === intent.amountTotal
            && payment.amount_capturable === 0) {
            terminal.push({ checkoutId: intent.checkoutId, livemode: intent.livemode, terminalState: 'completed_paid' });
        } else {
            // A paid but unfulfilled purchase needs explicit settlement; deletion cannot invent a grant
            // or silently decide that this payment should be forfeited. Processing is never terminal.
            throw unavailable();
        }
    }
    // The RPC checks the complete current DB inventory under the deletion/profile lock.
    await retire(userId, terminal);
}
