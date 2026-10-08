import { priceFixture, checkoutLineFixture, checkoutEvidenceFixture } from './StripeTestFixtures';
import { invoiceFixture, paymentFixture, reconciliationToken } from './StripeTestFixtures';
import { describe, expect, it, vi } from 'vitest';
import { StripeTestMembershipApi, type StripeEvent } from './StripeMembership';

const event: StripeEvent = {
    id: 'evt_ABCDEFGH', type: 'charge.refunded', created: 1790726400,
    livemode: false, data: { object: { id: 'ch_ABCDEFGH' } },
    payloadHash: 'a'.repeat(64),
};

describe('Stripe reversal membership context', () => {
    it('maps only the canonical subscription, latest invoice and Checkout account', async () => {
        const request = vi.fn(async (url: string) => Response.json(url.includes('/subscriptions/')
            ? { id: 'sub_ABCDEFGH', livemode: false, customer: 'cus_ABCDEFGH',
                latest_invoice: 'in_ABCDEFGH', current_period_end: 1800000000 }
            : { data: [{ id: 'cs_test_ABCDEFGH', livemode: false, mode: 'subscription',
                subscription: 'sub_ABCDEFGH', customer: 'cus_ABCDEFGH', client_reference_id: 'Alice' }],
                has_more: false }));
        const api = new StripeTestMembershipApi({
            secretKey: 'sk_test_ABCDEFGH', webhookSecret: 'whsec_testsecret123456',
            priceId: 'price_ABCDEFGH', successUrl: 'https://q-gambit.com/',
            cancelUrl: 'https://q-gambit.com/',
        }, request as unknown as typeof fetch);
        expect(await api.reversalContext(event, 'sub_ABCDEFGH')).toEqual({
            subscriptionId: 'sub_ABCDEFGH', checkoutId: 'cs_test_ABCDEFGH',
            customerId: 'cus_ABCDEFGH', userId: 'Alice',
            periodEnd: new Date(1800000000 * 1000).toISOString(), currentInvoiceId: 'in_ABCDEFGH',
        });
        expect(request).toHaveBeenCalledTimes(2);
        await expect(api.reversalContext({ ...event, livemode: true }, 'sub_ABCDEFGH')).rejects.toThrow();
    });
    it('marks a new paid period only for the canonical latest invoice', async () => {
        const request = vi.fn(async (url: string) => Response.json((url.includes('/line_items?') ? checkoutLineFixture() : null) ?? paymentFixture(url) ?? (url.includes('/subscriptions/')
            ? { id: 'sub_ABCDEFGH', livemode: false, customer: 'cus_ABCDEFGH', status: 'active', automatic_tax: { enabled: false },
                latest_invoice: 'in_ABCDEFGH', current_period_end: 1800000000,
                cancel_at_period_end: false,
                items: { data: [{ price: priceFixture(), quantity: 1 }], has_more: false } }
            : url.includes('/checkout/sessions?')
                ? { data: [{ id: 'cs_test_ABCDEFGH', livemode: false, mode: 'subscription',
                    subscription: 'sub_ABCDEFGH', customer: 'cus_ABCDEFGH', client_reference_id: 'Alice', status: 'complete', payment_status: 'paid', ...checkoutEvidenceFixture() }],
                    has_more: false }
                : invoiceFixture())));
        const api = new StripeTestMembershipApi({
            secretKey: 'sk_test_ABCDEFGH', webhookSecret: 'whsec_testsecret123456',
            priceId: 'price_ABCDEFGH', successUrl: 'https://q-gambit.com/',
            cancelUrl: 'https://q-gambit.com/',
        }, request as unknown as typeof fetch);
        const paid = { ...event, type: 'invoice.paid',
            data: { object: { id: 'in_ABCDEFGH', parent: invoiceFixture().parent } } };
        expect((await api.snapshot(paid))?.paidNewPeriod).toBe(true);
        expect((await api.snapshot({ ...paid, data: { object: {
            id: 'in_OLDINVO1', parent: invoiceFixture().parent,
        } } }))?.paidNewPeriod).toBe(false);
        expect((await api.snapshot({ ...paid, type: 'invoice.payment_failed' }))?.paidNewPeriod).toBe(false);
    });
});
