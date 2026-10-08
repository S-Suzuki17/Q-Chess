/** Current-schema fixtures only; this module never contacts Stripe. */
import { LEGACY_MEMBERSHIP_PRODUCT } from './CommerceCatalog';
export const reconciliationToken = '11111111-1111-4111-8111-111111111111';
export function priceFixture(livemode = false, id = livemode ? LEGACY_MEMBERSHIP_PRODUCT.priceId : 'price_ABCDEFGH', amount = 299) {
    return { id, livemode, active: true, currency: 'usd', unit_amount: amount, unit_amount_decimal: String(amount),
        type: 'recurring', tax_behavior: 'inclusive', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } };
}
export function checkoutLineFixture(livemode = false, priceId = livemode ? LEGACY_MEMBERSHIP_PRODUCT.priceId : 'price_ABCDEFGH', amount = 299) {
    return { has_more: false, data: [{ price: priceFixture(livemode, priceId, amount),
        quantity: 1, currency: 'usd', amount_total: amount, amount_discount: 0 }] };
}
export function checkoutEvidenceFixture(amount = 299) {
    return { currency: 'usd', amount_total: amount, automatic_tax: { enabled: false } };
}
export function invoiceFixture(livemode = false, priceId = livemode ? LEGACY_MEMBERSHIP_PRODUCT.priceId : 'price_ABCDEFGH', amount = 299, periodEnd = 1800000000) {
    return { id: 'in_ABCDEFGH', object: 'invoice', livemode, status: 'paid', currency: 'usd',
        customer: 'cus_ABCDEFGH', collection_method: 'charge_automatically',
        total: amount, amount_paid: amount, amount_remaining: 0, automatic_tax: { enabled: false },
        lines: { has_more: false, data: [{ id: 'il_ABCDEFGH', invoice: 'in_ABCDEFGH', livemode,
            amount, quantity: 1, quantity_decimal: '1', currency: 'usd', taxes: [], discount_amounts: [],
            period: { start: periodEnd - 30 * 86400, end: periodEnd },
            parent: { type: 'subscription_item_details', subscription_item_details: {
                subscription: 'sub_ABCDEFGH', proration: false } },
            pricing: { type: 'price_details', price_details: { price: priceId }, unit_amount_decimal: String(amount) } }] },
        parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_ABCDEFGH' } } };
}
export function paymentFixture(url: string, livemode = false, amount = 299): unknown | null {
    if (url.includes('/invoice_payments?')) return { has_more: false, data: [{
        id: 'inpay_ABCDEFGH', livemode, invoice: 'in_ABCDEFGH', status: 'paid', currency: 'usd', amount_paid: amount,
        payment: { type: 'payment_intent', payment_intent: 'pi_ABCDEFGH' },
    }] };
    if (url.includes('/payment_intents/')) return { id: 'pi_ABCDEFGH', livemode, customer: 'cus_ABCDEFGH',
        status: 'succeeded', currency: 'usd', amount, amount_received: amount, latest_charge: 'ch_ABCDEFGH' };
    if (url.includes('/charges/')) return { id: 'ch_ABCDEFGH', livemode, customer: 'cus_ABCDEFGH',
        payment_intent: 'pi_ABCDEFGH', status: 'succeeded', paid: true, currency: 'usd',
        amount, amount_captured: amount, captured: true, amount_refunded: 0, refunded: false, disputed: false };
    return null;
}
