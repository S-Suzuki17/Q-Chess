import type Stripe from 'stripe';
import { COMMERCE_CATALOG, isCommerceSku, matchesCommercePrice, type CommerceProduct } from './CommerceCatalog';
import { createStripeClient, stripeRequest } from './StripeClient';
import type { StripeEvent } from './StripeMembership';
import type { CommerceCheckoutIntent, CommerceOneTimeEvidence, CommercePaidPeriod,
    CommerceSubscriptionEvidence, CommercePaymentSource, CommerceSourceRiskEvidence } from './StripeCommerceStore';

type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const cents = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const stamp = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
    && (value as number) < 8_640_000_000_000;
const id = (value: unknown, prefix: string): value is string => typeof value === 'string'
    && new RegExp(`^${prefix}[A-Za-z0-9]{8,200}$`).test(value);
const empty = (value: unknown) => value === null || (Array.isArray(value) && value.length === 0);
const disabledOption = (value: unknown) => value == null || (object(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    && Object.hasOwn(value, 'enabled') && value.enabled === false);
const fail = (message = 'COMMERCE_EVIDENCE_UNAVAILABLE'): never => { throw new Error(message); };
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const single = (value: unknown): RecordValue => {
    if (!object(value) || value.has_more !== false || !Array.isArray(value.data)
        || value.data.length !== 1 || !object(value.data[0])) return fail();
    return value.data[0];
};
function taxTotal(value: unknown): number {
    if (value === null) return 0;
    if (!Array.isArray(value)) return fail();
    let total = 0;
    for (const tax of value) {
        if (!object(tax) || tax.tax_behavior !== 'inclusive' || !cents(tax.amount)) return fail();
        total += tax.amount;
    }
    if (!cents(total)) return fail();
    return total;
}
export interface CommerceEvidenceConfig {
    secretKey: string; livemode: boolean;
    /** Explicit reviewed tax configuration; this is not a sales switch. */
    automaticTaxEnabled: boolean;
}
export interface CommerceSubscriptionContext { subscription: RecordValue; checkout: RecordValue; }
export interface CommerceRiskTarget {
    checkout: RecordValue; invoiceId: string | null; chargeId: string | null; paymentIntentId: string | null;
}

/** Read-only provider boundary pinned by StripeClient. No Checkout/price/payment writes. */
export class StripeCommerceEvidence {
    private readonly client: Stripe;
    constructor(readonly config: CommerceEvidenceConfig, request: typeof fetch = fetch) {
        if (typeof config.livemode !== 'boolean' || typeof config.automaticTaxEnabled !== 'boolean'
            || !new RegExp(`^(?:sk|rk)_${config.livemode ? 'live' : 'test'}_[A-Za-z0-9_]{8,}$`).test(config.secretKey)) fail('COMMERCE_CONFIG_REQUIRED');
        this.client = createStripeClient(config.secretKey, request);
    }
    private async call(path: string): Promise<RecordValue> {
        let value: unknown;
        try { value = await stripeRequest(this.client, path); } catch { return fail(); }
        if (!object(value) || ('livemode' in value && value.livemode !== this.config.livemode)) return fail();
        return value;
    }
    private automaticTax(value: unknown) {
        if (!object(value) || value.enabled !== this.config.automaticTaxEnabled
            || (value.enabled && value.status !== 'complete')) fail();
    }
    private product(intent: CommerceCheckoutIntent): CommerceProduct {
        if (intent.livemode !== this.config.livemode || intent.amountTotal !== COMMERCE_CATALOG[intent.sku].amount
            || intent.currency !== 'usd') return fail();
        return { ...COMMERCE_CATALOG[intent.sku], priceId: intent.priceId };
    }
    private matchesPrice(price: unknown, expected: CommerceProduct): boolean {
        return object(price) && matchesCommercePrice(price, expected, this.config.livemode)
            && price.billing_scheme === 'per_unit' && price.custom_unit_amount == null
            && price.transform_quantity == null && price.tiers_mode == null
            && (expected.checkoutMode !== 'subscription'
                || (object(price.recurring) && price.recurring.usage_type === 'licensed'));
    }
    async checkout(checkoutId: string): Promise<RecordValue> {
        if (!id(checkoutId, this.config.livemode ? 'cs_live_' : 'cs_test_')) return fail();
        const value = await this.call(`checkout/sessions/${encodeURIComponent(checkoutId)}`);
        if (value.id !== checkoutId || value.livemode !== this.config.livemode) return fail();
        return value;
    }
    /** Routing reads cannot change balances; the full graph is read again under the correct DB lease. */
    async riskTargets(event: StripeEvent): Promise<CommerceRiskTarget[]> {
        const risk = event.data.object;
        if (event.type.startsWith('credit_note.')) {
            if (!id(risk.id, 'cn_')) return fail();
            const note = await this.call(`credit_notes/${encodeURIComponent(risk.id)}`);
            if (note.id !== risk.id || note.livemode !== this.config.livemode || !id(note.invoice, 'in_')) return fail();
            return this.invoiceTargets(note.invoice);
        }
        let chargeId: unknown = risk.id;
        if (event.type !== 'charge.refunded') {
            const resource = event.type.startsWith('refund.') ? ['refunds', 're_']
                : event.type.startsWith('charge.dispute.') ? ['disputes', '(?:dp|du)_']
                    : event.type.startsWith('radar.early_fraud_warning.') ? ['radar/early_fraud_warnings', 'issfr_'] : null;
            if (!resource || !id(risk.id, resource[1])) return fail();
            const canonical = await this.call(`${resource[0]}/${encodeURIComponent(risk.id as string)}`);
            if (canonical.id !== risk.id || !id(canonical.charge, 'ch_')) return fail();
            chargeId = canonical.charge; // The signed event is a routing hint, not current risk evidence.
        }
        if (!id(chargeId, 'ch_')) return fail();
        const charge = await this.call(`charges/${encodeURIComponent(chargeId)}`);
        if (charge.id !== chargeId || charge.livemode !== this.config.livemode) return fail();
        if (charge.payment_intent === null) return [];
        if (!id(charge.payment_intent, 'pi_')) return fail();
        const paymentId = charge.payment_intent;
        const payment = await this.call(`payment_intents/${encodeURIComponent(paymentId)}`);
        if (payment.id !== paymentId || payment.livemode !== this.config.livemode
            || payment.latest_charge !== chargeId || payment.customer !== charge.customer) return fail();
        const sessions = await this.call(`checkout/sessions?payment_intent=${encodeURIComponent(paymentId)}&limit=100`);
        if (sessions.has_more !== false || !Array.isArray(sessions.data)) return fail();
        const targets: CommerceRiskTarget[] = [];
        for (const session of sessions.data) {
            if (!object(session) || !id(session.id, this.config.livemode ? 'cs_live_' : 'cs_test_')) return fail();
            const checkout = await this.checkout(session.id);
            if (checkout.payment_intent !== paymentId || checkout.customer !== payment.customer) return fail();
            targets.push({ checkout, invoiceId: null, chargeId, paymentIntentId: paymentId });
        }
        const query = new URLSearchParams({ 'payment[type]': 'payment_intent',
            'payment[payment_intent]': paymentId, status: 'paid', limit: '100' });
        const payments = await this.call(`invoice_payments?${query}`);
        if (payments.has_more !== false || !Array.isArray(payments.data)) return fail();
        for (const linked of payments.data) {
            if (!object(linked) || linked.livemode !== this.config.livemode || linked.status !== 'paid'
                || !object(linked.payment) || linked.payment.type !== 'payment_intent'
                || linked.payment.payment_intent !== paymentId || !id(linked.invoice, 'in_')) return fail();
            for (const target of await this.invoiceTargets(linked.invoice)) {
                targets.push({ ...target, chargeId, paymentIntentId: paymentId });
            }
        }
        if (!targets.length && object(payment.metadata) && isCommerceSku(payment.metadata.qgambit_sku)) return fail('COMMERCE_CHECKOUT_UNBOUND');
        return targets;
    }
    private async invoiceTargets(invoiceId: string): Promise<CommerceRiskTarget[]> {
        const invoice = await this.call(`invoices/${encodeURIComponent(invoiceId)}`);
        if (invoice.id !== invoiceId || invoice.livemode !== this.config.livemode) return fail();
        const parent = object(invoice.parent) ? invoice.parent : null;
        const details = parent?.type === 'subscription_details' && object(parent.subscription_details)
            ? parent.subscription_details : null;
        if (!details) return [];
        if (!id(details.subscription, 'sub_')) return fail();
        const context = await this.subscriptionContext(details.subscription);
        if (invoice.customer !== context.subscription.customer) return fail();
        return [{ checkout: context.checkout, invoiceId, chargeId: null, paymentIntentId: null }];
    }
    /** Must run after acquiring the subscription reconciliation lease. */
    async subscriptionContext(subscriptionId: string): Promise<CommerceSubscriptionContext> {
        if (!id(subscriptionId, 'sub_')) return fail();
        const subscription = await this.call(`subscriptions/${encodeURIComponent(subscriptionId)}`);
        if (subscription.id !== subscriptionId || subscription.livemode !== this.config.livemode
            || !id(subscription.customer, 'cus_')) return fail();
        const sessions = await this.call(`checkout/sessions?subscription=${encodeURIComponent(subscriptionId)}&limit=100`);
        if (sessions.has_more !== false || !Array.isArray(sessions.data)) return fail();
        const matches = sessions.data.filter(value => object(value) && value.subscription === subscriptionId);
        if (matches.length !== 1 || !object(matches[0]) || !id(matches[0].id, this.config.livemode ? 'cs_live_' : 'cs_test_')) return fail();
        // Retrieve independently; the list is only a routing aid.
        const checkout = await this.checkout(matches[0].id);
        if (checkout.subscription !== subscriptionId || checkout.customer !== subscription.customer) return fail();
        return { subscription, checkout };
    }
    private async validateCheckout(checkout: RecordValue, intent: CommerceCheckoutIntent): Promise<CommerceProduct> {
        const expected = this.product(intent);
        if (checkout.id !== intent.checkoutId || checkout.livemode !== intent.livemode
            || checkout.mode !== expected.checkoutMode || checkout.status !== 'complete'
            || checkout.payment_status !== 'paid' || checkout.client_reference_id !== intent.userId
            || !object(checkout.metadata) || checkout.metadata.qgambit_sku !== intent.sku
            || checkout.currency !== expected.currency || checkout.amount_total !== expected.amount
            || !cents(checkout.amount_subtotal) || !object(checkout.total_details)
            || checkout.total_details.amount_discount !== 0 || checkout.total_details.amount_shipping !== 0
            || !cents(checkout.total_details.amount_tax)
            || checkout.amount_subtotal + checkout.total_details.amount_tax !== expected.amount
            || !empty(checkout.discounts) || checkout.payment_link != null
            || !disabledOption(checkout.adaptive_pricing)
            || !disabledOption(checkout.managed_payments)) return fail();
        this.automaticTax(checkout.automatic_tax);
        const line = single(await this.call(`checkout/sessions/${encodeURIComponent(intent.checkoutId)}/line_items`));
        // Checkout subtotal is NET of inclusive tax; it need not equal Price.unit_amount.
        if (line.quantity !== 1 || (line.quantity_decimal != null && String(line.quantity_decimal) !== '1')
            || line.currency !== expected.currency || line.amount_total !== expected.amount || line.amount_discount !== 0
            || line.amount_subtotal !== checkout.amount_subtotal || line.amount_tax !== checkout.total_details.amount_tax
            || !this.matchesPrice(line.price, expected)
            || !disabledOption(line.adjustable_quantity)) return fail();
        const canonicalPrice = await this.call(`prices/${encodeURIComponent(expected.priceId)}`);
        if (!this.matchesPrice(canonicalPrice, expected)) return fail();
        return expected;
    }
    private async scopedRisk(resource: string, prefix: string, chargeId: string): Promise<RecordValue[]> {
        const page = await this.call(`${resource}?charge=${encodeURIComponent(chargeId)}&limit=100`);
        if (page.has_more !== false || !Array.isArray(page.data) || page.data.length > 100) return fail();
        const values: RecordValue[] = [];
        const seen = new Set<string>();
        for (const item of page.data) {
            if (!object(item) || !id(item.id, prefix) || seen.has(item.id)) return fail();
            seen.add(item.id);
            const canonical = await this.call(`${resource}/${encodeURIComponent(item.id)}`);
            if (canonical.id !== item.id || canonical.charge !== chargeId) return fail();
            values.push(canonical);
        }
        return values;
    }
    private async payment(intentId: unknown, customerId: unknown, expected: CommerceProduct,
        event?: StripeEvent): Promise<CommercePaymentSource> {
        if (!id(intentId, 'pi_') || !(customerId === null || id(customerId, 'cus_'))) return fail();
        const intent = await this.call(`payment_intents/${encodeURIComponent(intentId)}`);
        if (intent.id !== intentId || intent.livemode !== this.config.livemode || intent.status !== 'succeeded'
            || intent.customer !== customerId || intent.currency !== expected.currency
            || intent.amount !== expected.amount || intent.amount_received !== expected.amount
            || !id(intent.latest_charge, 'ch_')) return fail();
        const charge = await this.call(`charges/${encodeURIComponent(intent.latest_charge)}`);
        if (charge.id !== intent.latest_charge || charge.livemode !== this.config.livemode
            || charge.payment_intent !== intentId || charge.customer !== customerId || charge.paid !== true
            || charge.status !== 'succeeded' || charge.currency !== expected.currency
            || charge.amount !== expected.amount || charge.amount_captured !== expected.amount || charge.captured !== true
            || !cents(charge.amount_refunded) || charge.amount_refunded > expected.amount
            || typeof charge.refunded !== 'boolean' || typeof charge.disputed !== 'boolean') return fail();
        const refunds = await this.scopedRisk('refunds', 're_', intent.latest_charge);
        const disputes = await this.scopedRisk('disputes', '(?:dp|du)_', intent.latest_charge);
        const warnings = await this.scopedRisk('radar/early_fraud_warnings', 'issfr_', intent.latest_charge);
        // A single source cannot silently select one of multiple incompatible chargeback lifecycles.
        if (disputes.length > 1 || (charge.disputed && !disputes.length)) return fail();
        let refunded = 0, pending = 0;
        for (const refund of refunds) {
            if (refund.payment_intent !== intentId || refund.currency !== expected.currency
                || !cents(refund.amount) || refund.amount <= 0 || refund.amount > expected.amount
                || !['succeeded', 'pending', 'requires_action', 'failed', 'canceled'].includes(String(refund.status))) return fail();
            if (refund.status === 'succeeded') refunded += refund.amount;
            if (refund.status === 'pending' || refund.status === 'requires_action') pending += refund.amount;
        }
        if (!cents(refunded) || !cents(pending) || refunded + pending > expected.amount
            || charge.amount_refunded < refunded || charge.amount_refunded > refunded + pending
            || (pending === 0 && charge.refunded !== (refunded === expected.amount))) return fail();
        const dispute = disputes[0] ?? null;
        if (dispute && (dispute.livemode !== this.config.livemode || dispute.payment_intent !== intentId
            || dispute.currency !== expected.currency || !cents(dispute.amount) || dispute.amount <= 0
            || dispute.amount > expected.amount || !['needs_response', 'under_review', 'warning_needs_response',
                'warning_under_review', 'lost', 'won', 'warning_closed', 'prevented'].includes(String(dispute.status)))) return fail();
        const open = dispute && ['needs_response', 'under_review', 'warning_needs_response', 'warning_under_review'].includes(String(dispute.status));
        if (dispute && (open || dispute.status === 'lost') && !charge.disputed) return fail();
        for (const warning of warnings) {
            if (warning.livemode !== this.config.livemode || warning.payment_intent !== intentId
                || typeof warning.actionable !== 'boolean') return fail();
        }
        if (event) {
            const expectedList = event.type.startsWith('refund.') ? refunds
                : event.type.startsWith('charge.dispute.') ? disputes
                    : event.type.startsWith('radar.early_fraud_warning.') ? warnings : null;
            if (expectedList && !expectedList.some(item => item.id === event.data.object.id)) return fail();
            if (event.type === 'charge.refunded' && event.data.object.id !== charge.id) return fail();
        }
        // Refuse mixed observations if Stripe changed the charge while the graph was traversed.
        const finalCharge = await this.call(`charges/${encodeURIComponent(intent.latest_charge)}`);
        for (const key of ['id','livemode','payment_intent','customer','paid','status','currency','amount',
            'amount_captured','captured','amount_refunded','refunded','disputed']) {
            if (finalCharge[key] !== charge[key]) return fail();
        }
        return { paymentIntentId: intentId, chargeId: intent.latest_charge, customerId: customerId as string | null,
            amountRefunded: refunded, disputeId: dispute?.id as string ?? null,
            disputeStatus: dispute?.status as string ?? null,
            riskState: refunded === expected.amount ? 'refunded' : dispute?.status === 'lost' ? 'dispute_lost'
                : open ? 'disputed' : refunded > 0 ? 'partial_refund'
                    : pending > 0 || warnings.some(value => value.actionable) ? 'manual_review' : 'clear' };
    }
    async oneTime(event: StripeEvent, checkout: RecordValue, intent: CommerceCheckoutIntent,
        token: string): Promise<CommerceOneTimeEvidence> {
        const expected = await this.validateCheckout(checkout, intent);
        if (expected.checkoutMode !== 'payment' || checkout.subscription !== null || event.data.object.id !== checkout.id
            || event.livemode !== intent.livemode
            || !['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return fail();
        const paymentSource = await this.payment(checkout.payment_intent, checkout.customer, expected);
        return { ...intent, eventId: event.id, payloadHash: event.payloadHash, paymentStatus: 'paid',
            observedAt: new Date().toISOString(), token, paymentSource };
    }
    private async paidInvoice(invoiceId: string, subscription: RecordValue, expected: CommerceProduct, event?: StripeEvent): Promise<CommercePaidPeriod> {
        if (!id(invoiceId, 'in_')) return fail();
        const invoice = await this.call(`invoices/${encodeURIComponent(invoiceId)}`);
        const parent = object(invoice.parent) ? invoice.parent : null;
        const details = parent && object(parent.subscription_details) ? parent.subscription_details : null;
        if (invoice.id !== invoiceId || invoice.livemode !== this.config.livemode || invoice.currency !== expected.currency
            || parent?.type !== 'subscription_details' || details?.subscription !== subscription.id
            || invoice.customer !== subscription.customer || invoice.collection_method !== 'charge_automatically'
            || invoice.status !== 'paid' || !['subscription_create', 'subscription_cycle'].includes(String(invoice.billing_reason))
            || invoice.total !== expected.amount || invoice.amount_paid !== expected.amount || invoice.amount_due !== expected.amount
            || invoice.amount_remaining !== 0 || invoice.amount_overpaid !== 0 || (invoice.amount_paid_off_stripe ?? 0) !== 0
            || invoice.starting_balance !== 0 || invoice.ending_balance !== 0
            || invoice.pre_payment_credit_notes_amount !== 0 || !cents(invoice.post_payment_credit_notes_amount)
            || invoice.post_payment_credit_notes_amount > expected.amount
            || !empty(invoice.total_discount_amounts) || !empty(invoice.total_pretax_credit_amounts)
            || !empty(invoice.discounts) || invoice.shipping_cost != null || invoice.latest_revision != null) return fail();
        this.automaticTax(invoice.automatic_tax);
        const taxes = taxTotal(invoice.total_taxes);
        // Invoice subtotal includes inclusive tax; *_excluding_tax explicitly does not.
        if (invoice.subtotal !== expected.amount || !cents(invoice.total_excluding_tax)
            || invoice.total_excluding_tax + taxes !== expected.amount
            || invoice.subtotal_excluding_tax !== invoice.total_excluding_tax) return fail();
        const line = single(invoice.lines);
        const pricing = object(line.pricing) ? line.pricing : null;
        const priceDetails = pricing && object(pricing.price_details) ? pricing.price_details : null;
        const lineParent = object(line.parent) ? line.parent : null;
        const subscriptionDetails = lineParent && object(lineParent.subscription_item_details) ? lineParent.subscription_item_details : null;
        if (line.invoice !== invoiceId || line.livemode !== this.config.livemode || line.currency !== expected.currency
            || line.amount !== expected.amount || line.quantity !== 1
            || (line.quantity_decimal != null && String(line.quantity_decimal) !== '1')
            || pricing?.type !== 'price_details' || priceDetails?.price !== expected.priceId
            || lineParent?.type !== 'subscription_item_details' || subscriptionDetails?.subscription !== subscription.id
            || subscriptionDetails?.proration !== false || !empty(line.discount_amounts) || !empty(line.pretax_credit_amounts)
            || taxTotal(line.taxes) !== taxes || !object(line.period) || !stamp(line.period.start) || !stamp(line.period.end)
            || line.period.end - line.period.start < 27 * 86400 || line.period.end - line.period.start > 32 * 86400
            || line.period.start > Date.now() / 1000 + 600) return fail();
        const payment = single(await this.call(`invoice_payments?invoice=${encodeURIComponent(invoiceId)}&status=paid&limit=100`));
        if (payment.invoice !== invoiceId || payment.livemode !== this.config.livemode || payment.status !== 'paid'
            || payment.currency !== expected.currency || payment.amount_paid !== expected.amount || payment.amount_requested !== expected.amount
            || !object(payment.payment) || payment.payment.type !== 'payment_intent') return fail();
        const paymentSource = await this.payment(payment.payment.payment_intent, subscription.customer, expected, event);
        // A credit note can credit the customer balance or represent an out-of-band refund.
        // Only canonical successful cash refunds cause automatic recovery.
        if (invoice.post_payment_credit_notes_amount > 0 && paymentSource.riskState === 'clear') paymentSource.riskState = 'manual_review';
        return { invoiceId, periodStart: iso(line.period.start), periodEnd: iso(line.period.end), paymentSource };
    }
    async subscription(event: StripeEvent, context: CommerceSubscriptionContext, intent: CommerceCheckoutIntent,
        token: string): Promise<CommerceSubscriptionEvidence> {
        const { subscription, checkout } = context;
        const expected = await this.validateCheckout(checkout, intent);
        const item = single(subscription.items);
        if (expected.checkoutMode !== 'subscription' || event.livemode !== intent.livemode
            || checkout.subscription !== subscription.id || !id(subscription.id, 'sub_') || !id(subscription.customer, 'cus_')
            || item.quantity !== 1 || (item.quantity_decimal != null && String(item.quantity_decimal) !== '1')
            || !this.matchesPrice(item.price, expected)
            || !object(subscription.automatic_tax) || subscription.automatic_tax.enabled !== this.config.automaticTaxEnabled
            || typeof subscription.cancel_at_period_end !== 'boolean' || !stamp(item.current_period_start)
            || !stamp(item.current_period_end) || item.current_period_end <= item.current_period_start
            || !['incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused'].includes(String(subscription.status))) return fail();
        if (event.type.startsWith('checkout.session.') && event.data.object.id !== checkout.id) return fail();
        const latestInvoiceId = id(subscription.latest_invoice, 'in_') ? subscription.latest_invoice : null;
        const periodEnd = iso(item.current_period_end);
        let currentPaid: CommercePaidPeriod | null = null;
        if (subscription.status === 'active') {
            if (!latestInvoiceId) return fail();
            currentPaid = await this.paidInvoice(latestInvoiceId, subscription, expected);
            if (currentPaid.periodEnd !== periodEnd || currentPaid.periodStart !== iso(item.current_period_start)) return fail();
        }
        let paidPeriod: CommercePaidPeriod | null = null;
        if (event.type === 'invoice.paid') {
            if (!id(event.data.object.id, 'in_')) return fail();
            paidPeriod = event.data.object.id === latestInvoiceId && currentPaid ? currentPaid
                : await this.paidInvoice(event.data.object.id, subscription, expected);
            if (Date.parse(paidPeriod.periodEnd) > Date.parse(periodEnd)) return fail();
        }
        return { ...intent, eventId: event.id, payloadHash: event.payloadHash, eventType: event.type,
            eventCreated: event.created, observedAt: new Date().toISOString(), subscriptionId: subscription.id,
            customerId: subscription.customer, status: subscription.status as string, periodEnd, latestInvoiceId,
            paidNewPeriod: event.type === 'invoice.paid' && paidPeriod?.invoiceId === latestInvoiceId && paidPeriod?.periodEnd === periodEnd,
            cancelAtPeriodEnd: subscription.cancel_at_period_end, token, paidPeriod, currentPaidPeriod: currentPaid };
    }
    /** Every provider proof here is obtained after the caller acquires the source/subscription fence. */
    async risk(event: StripeEvent, routed: CommerceRiskTarget, intent: CommerceCheckoutIntent,
        token: string): Promise<CommerceSourceRiskEvidence> {
        const targets = await this.riskTargets(event);
        const matches = targets.filter(target => target.checkout.id === intent.checkoutId && target.invoiceId === routed.invoiceId);
        if (matches.length !== 1 || targets.length !== 1) return fail();
        const target = matches[0];
        const expected = await this.validateCheckout(target.checkout, intent);
        let period: CommercePaidPeriod | null = null;
        let subscriptionId: string | null = null;
        let paymentSource: CommercePaymentSource;
        if (expected.checkoutMode === 'subscription') {
            if (!id(target.checkout.subscription, 'sub_') || !target.invoiceId) return fail();
            subscriptionId = target.checkout.subscription;
            const context = await this.subscriptionContext(subscriptionId);
            if (context.checkout.id !== intent.checkoutId) return fail();
            period = await this.paidInvoice(target.invoiceId, context.subscription, expected, event);
            paymentSource = period.paymentSource!;
        } else {
            if (target.invoiceId !== null || target.checkout.subscription !== null) return fail();
            paymentSource = await this.payment(target.checkout.payment_intent, target.checkout.customer, expected, event);
        }
        if ((target.chargeId !== null && target.chargeId !== paymentSource.chargeId)
            || (target.paymentIntentId !== null && target.paymentIntentId !== paymentSource.paymentIntentId)
            || (routed.chargeId !== null && routed.chargeId !== paymentSource.chargeId)
            || (routed.paymentIntentId !== null && routed.paymentIntentId !== paymentSource.paymentIntentId)) return fail();
        if (event.type.startsWith('credit_note.')) {
            const note = await this.call(`credit_notes/${encodeURIComponent(event.data.object.id as string)}`);
            if (note.id !== event.data.object.id || note.invoice !== period?.invoiceId
                || note.customer !== paymentSource.customerId || note.livemode !== intent.livemode
                || note.currency !== expected.currency || !cents(note.amount) || note.amount <= 0
                || note.amount > expected.amount || !['issued', 'void'].includes(String(note.status))) return fail();
            if (note.status === 'issued' && paymentSource.riskState === 'clear') paymentSource.riskState = 'manual_review';
        }
        return { ...intent, eventId: event.id, payloadHash: event.payloadHash, observedAt: new Date().toISOString(),
            token, subscriptionId, invoiceId: period?.invoiceId ?? null,
            periodStart: period?.periodStart ?? null, periodEnd: period?.periodEnd ?? null, paymentSource };
    }

}
