import { describe, expect, it, vi } from 'vitest';
import { resolveStripeReversal } from './StripeReversal';
import type { StripeEvent } from './StripeMembership';
import { QG_STRIPE_API_VERSION } from './StripeApiVersion';

const event: StripeEvent = {
    id: 'evt_ABCDEFGH', type: 'charge.refunded', created: 1790000000,
    livemode: false, payloadHash: 'a'.repeat(64),
    data: { object: { id: 'ch_ABCDEFGH', payment_intent: 'pi_ABCDEFGH' } },
};
const invoicePayment = (invoice: string, id = 'inpay_ABCDEFGH') => ({
    id, object: 'invoice_payment', status: 'paid', livemode: false, invoice,
    payment: { type: 'payment_intent', payment_intent: 'pi_ABCDEFGH' },
});
const invoice = (id: string, subscription = 'sub_ABCDEFGH') => ({
    id, object: 'invoice', status: 'paid', livemode: false,
    parent: { type: 'subscription_details', subscription_details: { subscription } },
});
const key = 'sk_test_ABCDEFGH';

describe('Stripe test-only refund/dispute lineage', () => {
    it('maps a refunded charge through paid InvoicePayment and subscription Invoice', async () => {
        const request = vi.fn(async (url: string, _init?: RequestInit) => Response.json(
            url.includes('/invoice_payments?') ? { data: [invoicePayment('in_ABCDEFGH')], has_more: false }
                : invoice('in_ABCDEFGH'),
        ));
        await expect(resolveStripeReversal(event, key, request as unknown as typeof fetch)).resolves.toEqual([
            { subscriptionId: 'sub_ABCDEFGH', reversedInvoiceIds: ['in_ABCDEFGH'] },
        ]);
        expect(new URL(request.mock.calls[0][0]).searchParams.get('payment[payment_intent]')).toBe('pi_ABCDEFGH');
        expect(new Headers(request.mock.calls[0][1]?.headers).get('Stripe-Version')).toBe(QG_STRIPE_API_VERSION);
        expect(request).toHaveBeenCalledTimes(2);
    });

    it('retrieves a dispute charge when PaymentIntent is absent, and paginates multiple invoices', async () => {
        const risk = { ...event, type: 'charge.dispute.created', data: { object: { charge: 'ch_ABCDEFGH' } } };
        const request = vi.fn(async (url: string) => {
            if (url.includes('/charges/')) return Response.json({
                id: 'ch_ABCDEFGH', object: 'charge', livemode: false, payment_intent: 'pi_ABCDEFGH',
            });
            if (url.includes('/invoice_payments?')) return Response.json(
                url.includes('starting_after=')
                    ? { data: [invoicePayment('in_IJKLMNOP', 'inpay_IJKLMNOP')], has_more: false }
                    : { data: [invoicePayment('in_ABCDEFGH')], has_more: true },
            );
            return Response.json(invoice(url.endsWith('in_ABCDEFGH') ? 'in_ABCDEFGH' : 'in_IJKLMNOP'));
        });
        await expect(resolveStripeReversal(risk, key, request as unknown as typeof fetch)).resolves.toEqual([
            { subscriptionId: 'sub_ABCDEFGH', reversedInvoiceIds: ['in_ABCDEFGH', 'in_IJKLMNOP'] },
        ]);
        expect(request).toHaveBeenCalledTimes(5);
    });

    it('ignores unrelated paid invoices and fails closed on incomplete lineage', async () => {
        const unrelated = vi.fn(async (url: string) => Response.json(
            url.includes('/invoice_payments?') ? { data: [invoicePayment('in_ABCDEFGH')], has_more: false }
                : { ...invoice('in_ABCDEFGH'), parent: null },
        ));
        await expect(resolveStripeReversal(event, key, unrelated as unknown as typeof fetch)).resolves.toEqual([]);
        const incomplete = vi.fn(async () => Response.json({ data: [], has_more: true }));
        await expect(resolveStripeReversal(event, key, incomplete as unknown as typeof fetch))
            .rejects.toThrow('REVERSAL_INVOICE_LIST_INVALID');
    });

    it('rejects key/event mode mismatch and forged invoice-payment associations', async () => {
        const request = vi.fn(async () => Response.json({ data: [
            { ...invoicePayment('in_ABCDEFGH'), payment: { type: 'payment_intent', payment_intent: 'pi_OTHER123' } },
        ], has_more: false }));
        await expect(resolveStripeReversal({ ...event, livemode: true }, key, request as unknown as typeof fetch))
            .rejects.toThrow('STRIPE_REVERSAL_MODE_MISMATCH');
        await expect(resolveStripeReversal(event, 'sk_live_ABCDEFGH', request as unknown as typeof fetch))
            .rejects.toThrow('STRIPE_REVERSAL_MODE_MISMATCH');
        await expect(resolveStripeReversal(event, key, request as unknown as typeof fetch))
            .rejects.toThrow('REVERSAL_INVOICE_PAYMENT_INVALID');
    });
    it('resolves verified live-mode lineage without crossing into test-mode data', async () => {
        const liveEvent = { ...event, livemode: true };
        const request = vi.fn(async (url: string) => Response.json(
            url.includes('/invoice_payments?')
                ? { data: [{ ...invoicePayment('in_ABCDEFGH'), livemode: true }], has_more: false }
                : { ...invoice('in_ABCDEFGH'), livemode: true },
        ));
        await expect(resolveStripeReversal(liveEvent, 'rk_live_ABCDEFGH', request as unknown as typeof fetch))
            .resolves.toEqual([{ subscriptionId: 'sub_ABCDEFGH', reversedInvoiceIds: ['in_ABCDEFGH'] }]);
        const crossed = vi.fn(async () => Response.json({
            data: [invoicePayment('in_ABCDEFGH')], has_more: false,
        }));
        await expect(resolveStripeReversal(liveEvent, 'sk_live_ABCDEFGH', crossed as unknown as typeof fetch))
            .rejects.toThrow('REVERSAL_INVOICE_PAYMENT_INVALID');
    });
});
