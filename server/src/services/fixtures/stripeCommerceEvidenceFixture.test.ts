import { createHmac } from 'node:crypto';
import { vi } from 'vitest';
import { COMMERCE_CATALOG, type CommerceSku } from '../CommerceCatalog';
import { QG_STRIPE_API_VERSION } from '../StripeApiVersion';
import type { CommerceCheckoutIntent, StripeCommerceStore } from '../StripeCommerceStore';

/** Synthetic API fixtures only. No real Price IDs, credentials, API calls or payment proof. */
export function commerceEvidenceFixture(sku: CommerceSku = 'plus_monthly', livemode = false, tax = 60) {
    const product = COMMERCE_CATALOG[sku];
    const amount = product.amount;
    const checkoutId = `cs_${livemode ? 'live' : 'test'}_FIXTURECHECKOUT`;
    const priceId = 'price_FIXTURECOMMERCE';
    const subscriptionId = 'sub_FIXTURECOMMERCE';
    const customerId = 'cus_FIXTURECOMMERCE';
    const invoiceId = 'in_FIXTURECURRENT';
    const paymentId = 'pi_FIXTURECURRENT';
    const chargeId = 'ch_FIXTURECURRENT';
    const end = Math.floor(Date.now() / 1000) + 10 * 86400;
    const start = end - 30 * 86400;
    const price = { id: priceId, livemode, active: true, currency: 'usd', unit_amount: amount,
        unit_amount_decimal: String(amount), tax_behavior: 'inclusive', billing_scheme: 'per_unit',
        type: product.checkoutMode === 'payment' ? 'one_time' : 'recurring',
        recurring: product.checkoutMode === 'payment' ? null : { interval: 'month', interval_count: 1, usage_type: 'licensed' } };
    const checkout = { id: checkoutId, object: 'checkout.session', livemode, status: 'complete',
        mode: product.checkoutMode, payment_status: 'paid', client_reference_id: 'Alice', metadata: { qgambit_sku: sku },
        customer: customerId, subscription: product.checkoutMode === 'subscription' ? subscriptionId : null,
        payment_intent: product.checkoutMode === 'payment' ? paymentId : null,
        currency: 'usd', amount_total: amount, amount_subtotal: amount - tax,
        total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: tax }, discounts: [],
        automatic_tax: { enabled: true, status: 'complete' }, payment_link: null,
        adaptive_pricing: { enabled: false }, managed_payments: { enabled: false } };
    const lines = { has_more: false, data: [{ id: 'li_FIXTURECOMMERCE', price: { ...price }, quantity: 1,
        currency: 'usd', amount_total: amount, amount_subtotal: amount - tax, amount_tax: tax, amount_discount: 0 }] };
    const subscription = { id: subscriptionId, object: 'subscription', livemode, customer: customerId,
        status: 'active', cancel_at_period_end: false, latest_invoice: invoiceId,
        automatic_tax: { enabled: true }, items: { has_more: false, data: [{ id: 'si_FIXTURECOMMERCE',
            quantity: 1, price: { ...price }, current_period_start: start, current_period_end: end }] } };
    const taxes = tax ? [{ amount: tax, tax_behavior: 'inclusive' }] : [];
    const invoice = { id: invoiceId, object: 'invoice', livemode, status: 'paid', currency: 'usd',
        customer: customerId, collection_method: 'charge_automatically', billing_reason: 'subscription_cycle',
        total: amount, subtotal: amount, total_excluding_tax: amount - tax, subtotal_excluding_tax: amount - tax,
        total_taxes: taxes, amount_due: amount, amount_paid: amount, amount_remaining: 0, amount_overpaid: 0,
        amount_paid_off_stripe: 0, starting_balance: 0, ending_balance: 0,
        pre_payment_credit_notes_amount: 0, post_payment_credit_notes_amount: 0,
        total_discount_amounts: [], total_pretax_credit_amounts: [], discounts: [], shipping_cost: null, latest_revision: null,
        automatic_tax: { enabled: true, status: 'complete' },
        parent: { type: 'subscription_details', subscription_details: { subscription: subscriptionId } },
        lines: { has_more: false, data: [{ id: 'il_FIXTURECOMMERCE', invoice: invoiceId, livemode,
            amount, quantity: 1, quantity_decimal: '1', currency: 'usd', taxes, discount_amounts: [], pretax_credit_amounts: [],
            period: { start, end }, parent: { type: 'subscription_item_details', subscription_item_details: {
                subscription: subscriptionId, proration: false } },
            pricing: { type: 'price_details', price_details: { price: priceId }, unit_amount_decimal: String(amount) } }] } };
    const payments = { has_more: false, data: [{ id: 'inpay_FIXTURECOMMERCE', livemode,
        invoice: invoiceId, status: 'paid', currency: 'usd', amount_paid: amount, amount_requested: amount,
        payment: { type: 'payment_intent', payment_intent: paymentId } }] };
    const payment = { id: paymentId, livemode, customer: customerId, status: 'succeeded', currency: 'usd',
        amount, amount_received: amount, latest_charge: chargeId };
    const charge = { id: chargeId, livemode, customer: customerId, payment_intent: paymentId,
        status: 'succeeded', paid: true, currency: 'usd', amount, amount_captured: amount, captured: true,
        amount_refunded: 0, refunded: false, disputed: false };
    const records: Record<string, any> = {
        [`checkout/sessions/${checkoutId}`]: checkout,
        [`checkout/sessions/${checkoutId}/line_items`]: lines,
        [`prices/${priceId}`]: price,
        [`subscriptions/${subscriptionId}`]: subscription,
        'checkout/sessions': { has_more: false, data: [checkout] },
        [`invoices/${invoiceId}`]: invoice,
        [`invoice_payments:${invoiceId}`]: payments,
        [`payment_intents/${paymentId}`]: payment,
        [`charges/${chargeId}`]: charge,
    };
    const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        if ((init?.method ?? 'GET') !== 'GET') throw new Error('Fixture allows reads only');
        const path = url.pathname.replace('/v1/', '');
        const key = path === 'invoice_payments' ? `${path}:${url.searchParams.get('invoice')}` : path;
        if (!(key in records)) throw new Error(`Unexpected fixture request ${key}`);
        return new Response(JSON.stringify(records[key]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const intent: CommerceCheckoutIntent = { checkoutId, userId: 'Alice', sku, priceId, amountTotal: amount, currency: 'usd', livemode };
    const store: StripeCommerceStore = {
        checkoutIntent: vi.fn(async () => intent), hasCurrentTerms: vi.fn(async () => true),
        acquireReconciliation: vi.fn(async () => ({ token: '11111111-1111-4111-8111-111111111111', retired: false })),
        releaseReconciliation: vi.fn(async () => {}),
        fulfillOneTime: vi.fn(async () => ({ applied: true, duplicate: false, credited: product.hintTickets })),
        fulfillSubscription: vi.fn(async () => ({ applied: true, duplicate: false, credited: product.hintTickets })),
    };
    const secret = 'whsec_FIXTUREONLYCOMMERCE';
    const eventCreated = Math.floor(Date.now() / 1000);
    function signed(type = product.checkoutMode === 'payment' ? 'checkout.session.completed' : 'invoice.paid', patch: Record<string, unknown> = {}) {
        const now = Math.floor(Date.now() / 1000);
        const value = { id: 'evt_FIXTURECOMMERCE', type, created: eventCreated, livemode, api_version: QG_STRIPE_API_VERSION,
            data: { object: type.startsWith('invoice.') ? invoice : type.startsWith('customer.subscription.') ? subscription : checkout }, ...patch };
        const body = Buffer.from(JSON.stringify(value));
        const signature = createHmac('sha256', secret).update(`${now}.`).update(body).digest('hex');
        return { body, headers: { 'stripe-signature': `t=${now},v1=${signature}` } };
    }
    return { sku, intent, store, records, request, secret, signed, price, checkout, lines, subscription, invoice,
        payments, payment, charge, start, end, config: { livemode, secretKey: `sk_${livemode ? 'live' : 'test'}_FIXTUREONLYKEY`, automaticTaxEnabled: true } };
}
