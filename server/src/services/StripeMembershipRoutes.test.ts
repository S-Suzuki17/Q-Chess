import { createHmac } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RankedAuth } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { createStripeMembershipRouter, createStripeWebhookRouter } from './StripeMembershipRoutes';
import { StripeMembershipError, StripeTestMembershipApi, verifyStripeWebhook, type StripeEvent } from './StripeMembership';
import type { StripeMembershipStore } from './StripeMembershipStore';

const secret = 'whsec_testsecret123456';
const checkout = { id: 'cs_test_ABCDEFGH', url: 'https://checkout.stripe.com/c/pay/cs_test_ABCDEFGH',
    expiresAt: '2026-10-01T00:00:00.000Z' };
const status = { userId: 'Alice', active: false, periodEnd: null, lastGrantUtcDay: null,
    tickets: { ranked: 0, hint: 0 } };
const claim = { ...status, claimed: false, credited: { ranked: 0, hint: 0 } };
const post = (token: string, body = '{}') => ({ method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body });

describe('Stripe test-only membership HTTP boundary', () => {
    let server: http.Server, base: string, token: string, enabled: boolean;
    let api: { [key: string]: ReturnType<typeof vi.fn> | string | boolean };
    let store: { [K in keyof StripeMembershipStore]: ReturnType<typeof vi.fn> };
    beforeEach(async () => {
        enabled = true;
        const auth = new RankedAuth(async (id, password) => id === 'Alice' && password === 'right');
        token = (await auth.issueLegacySession('Alice', 'right'))!.token;
        api = { priceId: 'price_ABCDEFGH', livemode: false, createCheckout: vi.fn().mockResolvedValue(checkout),
            expireCheckout: vi.fn().mockResolvedValue(undefined),
            isCheckoutExpired: vi.fn().mockResolvedValue(false), snapshot: vi.fn().mockResolvedValue(null),
            resolveReversal: vi.fn().mockResolvedValue([]), reversalContext: vi.fn() };
        store = { verifyUser: vi.fn().mockResolvedValue(null), blocked: vi.fn().mockResolvedValue(false),
            preflight: vi.fn().mockResolvedValue({ eligible: true, reason: null, checkoutId: null, expiresAt: null }),
            closeExpiredIntent: vi.fn().mockResolvedValue(undefined),
            registerCheckoutIntent: vi.fn().mockResolvedValue(undefined), applySnapshot: vi.fn().mockResolvedValue(undefined),
            applyReversal: vi.fn().mockResolvedValue(undefined),
            portalCustomer: vi.fn().mockResolvedValue(null),
            status: vi.fn().mockResolvedValue(status), claim: vi.fn().mockResolvedValue(claim) };
        const app = express();
        app.use(createStripeWebhookRouter(api as unknown as StripeTestMembershipApi, store, secret, () => enabled));
        app.use(createStripeMembershipRouter(auth, api as unknown as StripeTestMembershipApi,
            store, new AccountWriteGate(), () => enabled));
        server = http.createServer(app);
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterEach(async () => {
        server?.closeAllConnections();
        if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve()));
        vi.restoreAllMocks();
    });
    it('defaults OFF when flag is false, with no Stripe or DB calls', async () => {
        enabled = false;
        const result = await fetch(`${base}/membership/stripe/status`, { headers: { Authorization: `Bearer ${token}` } });
        expect(result.status).toBe(503);
        expect(await result.json()).toEqual({ code: 'FEATURE_DISABLED', enabled: false });
        expect(result.headers.get('cache-control')).toBe('no-store');
        expect((await fetch(`${base}/membership/stripe/checkout`, post(token))).status).toBe(503);
        expect(api.createCheckout).not.toHaveBeenCalled();
        expect(store.status).not.toHaveBeenCalled();
    });
    it('requires authenticated user and refuses client-selected price/identity', async () => {
        expect((await fetch(`${base}/membership/stripe/checkout`, post('GUEST-Alice'))).status).toBe(401);
        expect((await fetch(`${base}/membership/stripe/checkout`, post(token, '{"priceId":"price_hacker"}'))).status).toBe(400);
        expect((await fetch(`${base}/membership/stripe/status?userId=Bob`,
            { headers: { Authorization: `Bearer ${token}` } })).status).toBe(400);
        expect(api.createCheckout).not.toHaveBeenCalled();
    });
    it('checks eligibility and registers the user-bound intent before revealing URL', async () => {
        store.preflight.mockResolvedValueOnce({ eligible: false, reason: 'checkout_pending',
            checkoutId: checkout.id, expiresAt: '2099-01-01T00:00:00Z' });
        expect((await fetch(`${base}/membership/stripe/checkout`, post(token))).status).toBe(409);
        expect(api.createCheckout).not.toHaveBeenCalled();
        const result = await fetch(`${base}/membership/stripe/checkout`, post(token));
        expect(result.status).toBe(200);
        expect(await result.json()).toEqual({ url: checkout.url });
        expect(store.registerCheckoutIntent).toHaveBeenCalledExactlyOnceWith('Alice', checkout.id,
            'price_ABCDEFGH', checkout.expiresAt, false);
    });
    it('expires an unregistered session when atomic DB registration fails', async () => {
        store.registerCheckoutIntent.mockRejectedValue(new Error('another pending checkout'));
        const result = await fetch(`${base}/membership/stripe/checkout`, post(token));
        expect(result.status).toBe(503);
        expect(await result.text()).not.toContain('another pending checkout');
        expect(api.expireCheckout).toHaveBeenCalledWith(checkout.id);
    });
    it('blocks a stale intent until Stripe confirms expiration, then permits one replacement', async () => {
        const stale = { eligible: false, reason: 'checkout_pending',
            checkoutId: checkout.id, expiresAt: '2020-01-01T00:00:00Z' };
        store.preflight.mockResolvedValueOnce(stale);
        expect((await fetch(`${base}/membership/stripe/checkout`, post(token))).status).toBe(409);
        expect(api.isCheckoutExpired).toHaveBeenCalledWith(checkout.id);
        expect(api.createCheckout).not.toHaveBeenCalled();
        expect(store.closeExpiredIntent).not.toHaveBeenCalled();

        store.preflight.mockResolvedValueOnce(stale);
        (api.isCheckoutExpired as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
        expect((await fetch(`${base}/membership/stripe/checkout`, post(token))).status).toBe(200);
        expect(store.closeExpiredIntent).toHaveBeenCalledExactlyOnceWith('Alice', checkout.id, false);
        expect(store.preflight).toHaveBeenCalledTimes(3);
        expect(api.createCheckout).toHaveBeenCalledTimes(1);
    });
    it('does not grant from a return URL; claim is a separate authenticated DB operation', async () => {
        expect((await fetch(`${base}/membership/stripe/status`,
            { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
        expect(store.claim).not.toHaveBeenCalled();
        const result = await fetch(`${base}/membership/stripe/daily-grant`, post(token));
        expect(result.status).toBe(200);
        expect(await result.json()).toEqual({ enabled: true, ...claim });
        expect(store.claim).toHaveBeenCalledExactlyOnceWith('Alice', false);
    });
    it('verifies raw webhook signature and never accepts a forged or live-mode event', async () => {
        const event = { id: 'evt_ABCDEFGH', type: 'invoice.paid', created: Math.floor(Date.now() / 1000),
            livemode: false, data: { object: { id: 'in_ABCDEFGH' } } };
        const body = JSON.stringify(event);
        const t = Math.floor(Date.now() / 1000);
        const signature = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
        const signed = (payload: string, sig = signature) => fetch(`${base}/membership/stripe/webhook`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` }, body: payload,
        });
        expect((await signed(body, '0'.repeat(64))).status).toBe(400);
        expect((await signed(`${body} `)).status).toBe(400);
        expect(api.snapshot).not.toHaveBeenCalled();
        expect((await signed(body)).status).toBe(202);
        expect(api.snapshot).toHaveBeenCalledOnce();
        const verified = (api.snapshot as ReturnType<typeof vi.fn>).mock.calls[0][0] as StripeEvent;
        expect(verified.payloadHash).toMatch(/^[0-9a-f]{64}$/);
        expect(store.applySnapshot).not.toHaveBeenCalled();
        const liveBody = JSON.stringify({ ...event, livemode: true });
        const liveSig = createHmac('sha256', secret).update(`${t}.${liveBody}`).digest('hex');
        (api.snapshot as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new StripeMembershipError('LIVE_EVENT_REJECTED'));
        expect((await signed(liveBody, liveSig)).status).toBe(400);
    });
    it('suspends current-period refunded membership before acknowledging a signed risk event', async () => {
        const risk = { id: 'evt_REVERSAL1', type: 'charge.refunded', created: Math.floor(Date.now() / 1000),
            livemode: false, data: { object: { id: 'ch_ABCDEFGH', payment_intent: 'pi_ABCDEFGH' } } };
        const body = JSON.stringify(risk);
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
        const signed = () => fetch(`${base}/membership/stripe/webhook`, {
            method: 'POST', headers: { 'Content-Type': 'application/json',
                'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body,
        });
        (api.resolveReversal as ReturnType<typeof vi.fn>).mockResolvedValue([{ subscriptionId: 'sub_ABCDEFGH',
            reversedInvoiceIds: ['in_OLDER123', 'in_CURRENT1'] }]);
        (api.reversalContext as ReturnType<typeof vi.fn>).mockResolvedValue({ subscriptionId: 'sub_ABCDEFGH',
            checkoutId: 'cs_test_ABCDEFGH', customerId: 'cus_ABCDEFGH', userId: 'Alice',
            currentInvoiceId: 'in_CURRENT1', periodEnd: '2026-10-30T00:00:00.000Z' });
        expect((await signed()).status).toBe(200);
        expect(store.applyReversal).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            eventId: 'evt_REVERSAL1', eventType: 'charge.refunded',
            reversedInvoiceId: 'in_CURRENT1', currentInvoiceId: 'in_CURRENT1', userId: 'Alice',
        }));
        expect(store.applySnapshot).not.toHaveBeenCalled();
        store.applyReversal.mockRejectedValueOnce(new Error('DB unavailable'));
        const retry = await signed();
        expect(retry.status).toBe(503);
        expect(retry.headers.get('retry-after')).toBe('60');
        const liveBody = JSON.stringify({ ...risk, livemode: true });
        const liveSignature = createHmac('sha256', secret).update(`${timestamp}.${liveBody}`).digest('hex');
        const live = await fetch(`${base}/membership/stripe/webhook`, {
            method: 'POST', headers: { 'Content-Type': 'application/json',
                'Stripe-Signature': `t=${timestamp},v1=${liveSignature}` }, body: liveBody,
        });
        expect(live.status).toBe(400);
        expect(api.resolveReversal).toHaveBeenCalledTimes(2);
    });
    it('records an old-invoice dispute without presenting it as the current invoice', async () => {
        const risk = { id: 'evt_DISPUTE12', type: 'charge.dispute.created', created: Math.floor(Date.now() / 1000),
            livemode: false, data: { object: { charge: 'ch_ABCDEFGH' } } };
        const body = JSON.stringify(risk);
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
        (api.resolveReversal as ReturnType<typeof vi.fn>).mockResolvedValue([{ subscriptionId: 'sub_ABCDEFGH',
            reversedInvoiceIds: ['in_OLD12345'] }]);
        (api.reversalContext as ReturnType<typeof vi.fn>).mockResolvedValue({ subscriptionId: 'sub_ABCDEFGH',
            checkoutId: 'cs_test_ABCDEFGH', customerId: 'cus_ABCDEFGH', userId: 'Alice',
            currentInvoiceId: 'in_NEW12345', periodEnd: '2026-10-30T00:00:00.000Z' });
        const result = await fetch(`${base}/membership/stripe/webhook`, {
            method: 'POST', headers: { 'Content-Type': 'application/json',
                'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body,
        });
        expect(result.status).toBe(200);
        expect(store.applyReversal).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            reversedInvoiceId: 'in_OLD12345', currentInvoiceId: 'in_NEW12345',
        }));
    });
    it('uses live-only Store calls when API and signed webhook are both live', async () => {
        api.livemode = true;
        const result = await fetch(`${base}/membership/stripe/status`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(result.status).toBe(200);
        expect(store.status).toHaveBeenCalledWith('Alice', true);
        const risk = { id: 'evt_LIVERISK1', type: 'charge.refunded', created: Math.floor(Date.now() / 1000),
            livemode: true, data: { object: { id: 'ch_ABCDEFGH', payment_intent: 'pi_ABCDEFGH' } } };
        const body = JSON.stringify(risk);
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
        (api.resolveReversal as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{
            subscriptionId: 'sub_ABCDEFGH', reversedInvoiceIds: ['in_ABCDEFGH'],
        }]);
        (api.reversalContext as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            subscriptionId: 'sub_ABCDEFGH', checkoutId: 'cs_live_ABCDEFGH',
            customerId: 'cus_ABCDEFGH', userId: 'Alice',
            currentInvoiceId: 'in_ABCDEFGH', periodEnd: '2026-10-30T00:00:00.000Z',
        });
        const webhook = await fetch(`${base}/membership/stripe/webhook`, {
            method: 'POST', headers: { 'Content-Type': 'application/json',
                'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body,
        });
        expect(webhook.status).toBe(200);
        expect(store.applyReversal).toHaveBeenCalledWith(expect.objectContaining({ livemode: true }));
    });
});

describe('Stripe canonical test-mode snapshot', () => {
    const subscription = { id: 'sub_ABCDEFGH', livemode: false, customer: 'cus_ABCDEFGH', status: 'active',
        latest_invoice: 'in_ABCDEFGH', current_period_end: 1800000000,
        cancel_at_period_end: false,
        items: { data: [{ price: { id: 'price_ABCDEFGH' }, quantity: 1 }], has_more: false } };
    const sessionList = { data: [{ id: 'cs_test_ABCDEFGH', livemode: false, mode: 'subscription',
        subscription: 'sub_ABCDEFGH', customer: 'cus_ABCDEFGH', client_reference_id: 'Alice' }], has_more: false };
    const event = { id: 'evt_ABCDEFGH', type: 'customer.subscription.updated', created: 1790000000,
        livemode: false, data: { object: { id: 'sub_ABCDEFGH' } }, payloadHash: 'a'.repeat(64) };
    it('projects unpaid unless the canonical latest invoice is paid in USD', async () => {
        let paid = false;
        const request = vi.fn(async (url: string) => {
            const value = url.includes('/subscriptions/') ? subscription
                : url.includes('/checkout/sessions?') ? sessionList
                : { id: 'in_ABCDEFGH', livemode: false, subscription: subscription.id,
                    currency: 'usd', paid, status: paid ? 'paid' : 'open', amount_paid: paid ? 299 : 0 };
            return Response.json(value);
        });
        const api = new StripeTestMembershipApi({ secretKey: 'sk_test_ABCDEFGH', webhookSecret: secret,
            priceId: 'price_ABCDEFGH', successUrl: 'https://q-gambit.com/', cancelUrl: 'https://q-gambit.com/' },
        request as unknown as typeof fetch);
        expect((await api.snapshot(event))?.status).toBe('unpaid');
        paid = true;
        expect((await api.snapshot(event))?.status).toBe('active');
        expect((await api.snapshot(event))?.eventPayloadHash).toBe('a'.repeat(64));
        expect((await api.snapshot(event))?.eventCreated).toBe(event.created);
    });
    it('refuses unsafe refund and dispute acknowledgement; refuses live keys', async () => {
        const request = vi.fn();
        const api = new StripeTestMembershipApi({ secretKey: 'sk_test_ABCDEFGH', webhookSecret: secret,
            priceId: 'price_ABCDEFGH', successUrl: 'https://q-gambit.com/', cancelUrl: 'https://q-gambit.com/' },
        request as unknown as typeof fetch);
        await expect(api.snapshot({ ...event, type: 'charge.refunded' })).rejects.toThrow('PAYMENT_REVERSAL');
        expect(request).not.toHaveBeenCalled();
        expect(() => new StripeTestMembershipApi({ secretKey: 'sk_live_ABCDEFGH', webhookSecret: secret,
            priceId: 'price_ABCDEFGH', successUrl: 'https://q-gambit.com/', cancelUrl: 'https://q-gambit.com/' })).toThrow();
        const raw = Buffer.from(JSON.stringify(event));
        expect(() => verifyStripeWebhook(raw, { 'stripe-signature': `t=${Math.floor(Date.now()/1000)-600},v1=${'0'.repeat(64)}` },
            secret)).toThrow('INVALID_SIGNATURE');
    });
    it('refuses a mispriced or non-monthly Stripe Price before creating Checkout', async () => {
        const request = vi.fn(async () => Response.json({ id: 'price_ABCDEFGH', livemode: false,
            active: true, currency: 'usd', unit_amount: 399, type: 'recurring',
            recurring: { interval: 'month', interval_count: 1 } }));
        const api = new StripeTestMembershipApi({ secretKey: 'sk_test_ABCDEFGH', webhookSecret: secret,
            priceId: 'price_ABCDEFGH', successUrl: 'https://q-gambit.com/', cancelUrl: 'https://q-gambit.com/' },
        request as unknown as typeof fetch);
        await expect(api.createCheckout('Alice')).rejects.toThrow('STRIPE_TEST_PRICE_MISMATCH');
        expect(request).toHaveBeenCalledOnce();
    });
    it('does not consider a completed Checkout expired when its webhook is delayed', async () => {
        const request = vi.fn(async () => Response.json({ id: checkout.id, livemode: false,
            status: 'complete', subscription: 'sub_ABCDEFGH', payment_status: 'paid' }));
        const api = new StripeTestMembershipApi({ secretKey: 'sk_test_ABCDEFGH', webhookSecret: secret,
            priceId: 'price_ABCDEFGH', successUrl: 'https://q-gambit.com/', cancelUrl: 'https://q-gambit.com/' },
        request as unknown as typeof fetch);
        expect(await api.isCheckoutExpired(checkout.id)).toBe(false);
        expect(request).toHaveBeenCalledOnce();
        request.mockResolvedValueOnce(Response.json({ id: checkout.id, livemode: false,
            status: 'expired', subscription: null, payment_status: 'unpaid' }));
        expect(await api.isCheckoutExpired(checkout.id)).toBe(true);
    });
});
