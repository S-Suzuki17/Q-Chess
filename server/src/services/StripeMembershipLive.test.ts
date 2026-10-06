import { invoiceFixture, paymentFixture, reconciliationToken } from './StripeTestFixtures';
import { describe, expect, it, vi } from 'vitest';
import { QG_LIVE_MONTHLY_PRICE_ID, StripeMembershipApi, type StripeEvent } from './StripeMembership';
import { QG_STRIPE_API_VERSION } from './StripeApiVersion';

const config = {
    mode: 'live' as const,
    secretKey: 'sk_live_FAKEKEY12345',
    webhookSecret: 'whsec_FAKESECRET12345',
    priceId: QG_LIVE_MONTHLY_PRICE_ID,
    successUrl: 'https://q-gambit.com/',
    cancelUrl: 'https://q-gambit.com/',
};
const price = {
    id: QG_LIVE_MONTHLY_PRICE_ID, livemode: true, active: true,
    currency: 'usd', unit_amount: 300, type: 'recurring', tax_behavior: 'inclusive',
    recurring: { interval: 'month', interval_count: 1 },
};

describe('Stripe live-mode boundary (mocked; never contacts Stripe)', () => {
    it('requires an explicit matching live key and the reviewed price', () => {
        expect(() => new StripeMembershipApi({ ...config, secretKey: 'sk_test_FAKEKEY12345' })).toThrow('STRIPE_CONFIG_REQUIRED');
        expect(() => new StripeMembershipApi({ ...config, priceId: 'price_ABCDEFGH' })).toThrow('STRIPE_CONFIG_REQUIRED');
        expect(() => new StripeMembershipApi(config).livemode).not.toThrow();
        expect(new StripeMembershipApi(config).livemode).toBe(true);
    });

    it('validates price, exact Checkout line item, owner, and total before returning a live URL', async () => {
        const request = vi.fn(async (url: string) => Response.json(
            url.includes('/prices/') ? price
                : url.endsWith('/checkout/sessions') ? {
                    id: 'cs_live_ABCDEFGH', livemode: true, mode: 'subscription',
                    client_reference_id: 'Alice', expires_at: Math.floor(Date.now() / 1000) + 3600,
                    url: 'https://checkout.stripe.com/c/pay/cs_live_ABCDEFGH',
                    currency: 'usd', amount_total: 300, status: 'open',
                    automatic_tax: { enabled: false },
                } : { data: [{ price: { id: QG_LIVE_MONTHLY_PRICE_ID }, quantity: 1 }], has_more: false },
        ));
        const api = new StripeMembershipApi(config, request as unknown as typeof fetch);
        const checkout = await api.createCheckout('Alice');
        expect(checkout.id).toBe('cs_live_ABCDEFGH');
        expect(request).toHaveBeenCalledTimes(3);
        const post = request.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
        expect(post?.[0]).toBe('https://api.stripe.com/v1/checkout/sessions');
        const form = new URLSearchParams((post?.[1] as RequestInit).body as string);
        expect(new Headers((post?.[1] as RequestInit).headers).get('Stripe-Version')).toBe(QG_STRIPE_API_VERSION);
        expect(form.get('client_reference_id')).toBe('Alice');
        expect(form.get('line_items[0][price]')).toBe(QG_LIVE_MONTHLY_PRICE_ID);
        expect(form.get('automatic_tax[enabled]')).toBe('false');
        expect(form.get('managed_payments[enabled]')).toBe('false');
        expect(form.get('integration_identifier')).toMatch(/^qg_web_membership_[a-z]{8}$/);
    });

    it('fails closed before Checkout creation for non-inclusive tax or wrong price', async () => {
        const request = vi.fn(async () => Response.json({ ...price, tax_behavior: 'exclusive' }));
        const api = new StripeMembershipApi(config, request as unknown as typeof fetch);
        await expect(api.createCheckout('Alice')).rejects.toThrow('STRIPE_LIVE_PRICE_MISMATCH');
        expect(request).toHaveBeenCalledOnce();
    });

    it('projects paid membership only from matching live subscription, owner, price and paid invoice', async () => {
        const subscription = {
            id: 'sub_ABCDEFGH', livemode: true, customer: 'cus_ABCDEFGH', status: 'active',
            latest_invoice: 'in_ABCDEFGH', current_period_end: 1790000000,
            cancel_at_period_end: true,
            automatic_tax: { enabled: false },
            items: { data: [{ price: { id: QG_LIVE_MONTHLY_PRICE_ID }, quantity: 1 }], has_more: false },
        };
        const checkout = {
            id: 'cs_live_ABCDEFGH', livemode: true, subscription: subscription.id,
            customer: subscription.customer, mode: 'subscription', client_reference_id: 'Alice',
            status: 'complete', payment_status: 'paid',
        };
        const invoice = { ...invoiceFixture(true),
            id: 'in_ABCDEFGH', livemode: true, subscription: subscription.id,
            customer: subscription.customer, currency: 'usd', collection_method: 'charge_automatically',
            status: 'paid', amount_paid: 300,
            automatic_tax: { enabled: false },
        };
        let invoiceCustomer = invoice.customer;
        const request = vi.fn(async (url: string) => Response.json(
            paymentFixture(url, true) ?? (url.includes('/subscriptions/') ? subscription
                : url.includes('/checkout/sessions?') ? { data: [checkout], has_more: false }
                    : { ...invoice, customer: invoiceCustomer }),
        ));
        const api = new StripeMembershipApi(config, request as unknown as typeof fetch);
        const event: StripeEvent = {
            id: 'evt_ABCDEFGH', type: 'invoice.paid', created: 1780000000,
            livemode: true, data: { object: { id: invoice.id, parent: invoice.parent } },
            payloadHash: 'a'.repeat(64),
        };
        const snapshot = await api.snapshot(event);
        expect(snapshot).toMatchObject({ userId: 'Alice', status: 'active', paidNewPeriod: true,
            cancelAtPeriodEnd: true,
            priceId: QG_LIVE_MONTHLY_PRICE_ID, livemode: true });
        await expect(api.snapshot({ ...event, livemode: false })).rejects.toThrow('STRIPE_MODE_MISMATCH');
        invoiceCustomer = 'cus_WRONG1234';
        await expect(api.snapshot(event)).rejects.toThrow();
        invoiceCustomer = invoice.customer;
        subscription.automatic_tax.enabled = true;
        await expect(api.snapshot(event)).resolves.toMatchObject({ status: 'unpaid',
            priceId: QG_LIVE_MONTHLY_PRICE_ID, paidNewPeriod: false });
    });
});
