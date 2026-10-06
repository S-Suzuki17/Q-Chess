/** Current-schema fixtures only; this module never contacts Stripe. */
export const reconciliationToken = '11111111-1111-4111-8111-111111111111';
export function invoiceFixture(livemode = false) {
    return { id: 'in_ABCDEFGH', object: 'invoice', livemode, status: 'paid', currency: 'usd',
        customer: 'cus_ABCDEFGH', collection_method: 'charge_automatically',
        total: 300, amount_paid: 300, amount_remaining: 0, automatic_tax: { enabled: false },
        parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_ABCDEFGH' } } };
}
export function paymentFixture(url: string, livemode = false): unknown | null {
    if (url.includes('/invoice_payments?')) return { has_more: false, data: [{
        id: 'inpay_ABCDEFGH', livemode, invoice: 'in_ABCDEFGH', status: 'paid', currency: 'usd', amount_paid: 300,
        payment: { type: 'payment_intent', payment_intent: 'pi_ABCDEFGH' },
    }] };
    if (url.includes('/payment_intents/')) return { id: 'pi_ABCDEFGH', livemode, customer: 'cus_ABCDEFGH',
        status: 'succeeded', currency: 'usd', amount_received: 300, latest_charge: 'ch_ABCDEFGH' };
    if (url.includes('/charges/')) return { id: 'ch_ABCDEFGH', livemode, customer: 'cus_ABCDEFGH',
        payment_intent: 'pi_ABCDEFGH', status: 'succeeded', paid: true, currency: 'usd',
        amount: 300, amount_refunded: 0, disputed: false };
    return null;
}
