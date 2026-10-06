import { createHmac } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountWriteGate } from './AccountDeletion';
import { RankedAuth } from './RankedAuth';
import { QG_STRIPE_API_VERSION } from './StripeApiVersion';
import { createStripeCancellationGuard } from './StripeCancellation';
import { QG_LIVE_MONTHLY_PRICE_ID, StripeMembershipApi } from './StripeMembership';
import { createStripeCheckoutReadiness } from './StripeMembershipReadiness';
import { createStripeMembershipRouter, createStripeWebhookRouter } from './StripeMembershipRoutes';
import type { StripeMembershipStore } from './StripeMembershipStore';
import { StripePortalApi } from './StripePortal';
import { reconciliationToken } from './StripeTestFixtures';

const config = {
    mode: 'live' as const, secretKey: 'rk_live_FAKEKEY12345', webhookSecret: 'whsec_FAKESECRET12345',
    priceId: QG_LIVE_MONTHLY_PRICE_ID, successUrl: 'https://q-gambit.com/', cancelUrl: 'https://q-gambit.com/',
};
const price = {
    id: config.priceId, livemode: true, active: true, currency: 'usd', unit_amount: 300,
    type: 'recurring', tax_behavior: 'inclusive', recurring: { interval: 'month', interval_count: 1 },
};
const features = {
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none' },
    subscription_update: { enabled: false },
};
const portalConfig = { id: 'bpc_ABCDEFGH', active: true, is_default: true, livemode: true, features };
const portalList = { data: [portalConfig], has_more: false };

function fixture(priceValue: unknown = price, portalValue: unknown = portalList) {
    const request = vi.fn(async (url: string, _init?: RequestInit) => {
        if (url.includes('/prices/')) return Response.json(priceValue);
        if (url.includes('/billing_portal/configurations?')) return Response.json(portalValue);
        throw new Error('Unexpected Stripe resource');
    });
    const api = new StripeMembershipApi(config, request as unknown as typeof fetch);
    const portal = new StripePortalApi({ ...config, returnUrl: config.successUrl }, request as unknown as typeof fetch);
    const gates = { processing: true, portal: true };
    const readiness = createStripeCheckoutReadiness({ api, portal,
        processingEnabled: () => gates.processing, portalEnabled: () => gates.portal });
    return { request, api, portal, gates, readiness };
}

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('read-only Stripe Checkout startup readiness (mocked HTTP only)', () => {
    it('starts closed, reads both APIs while sales are OFF, and requires the exact independent env flag', async () => {
        vi.stubEnv('STRIPE_MEMBERSHIP_CHECKOUT_ENABLED', undefined);
        const { request, readiness, gates } = fixture();
        expect(readiness.enabled()).toBe(false);
        const check = readiness.check();
        expect(readiness.enabled()).toBe(false);
        await expect(check).resolves.toBe('verified');
        expect(readiness.enabled()).toBe(false);
        for (const flag of ['', 'false', 'TRUE', '1', ' true ']) {
            vi.stubEnv('STRIPE_MEMBERSHIP_CHECKOUT_ENABLED', flag);
            expect(readiness.enabled()).toBe(false);
        }
        vi.stubEnv('STRIPE_MEMBERSHIP_CHECKOUT_ENABLED', 'true');
        expect(readiness.enabled()).toBe(true);
        gates.portal = false;
        expect(readiness.enabled()).toBe(false);
        gates.portal = true; gates.processing = false;
        expect(readiness.enabled()).toBe(false);
        gates.processing = true;
        expect(readiness.enabled()).toBe(true);
        vi.stubEnv('STRIPE_MEMBERSHIP_CHECKOUT_ENABLED', 'false');
        expect(readiness.enabled()).toBe(false);
        expect(gates).toEqual({ processing: true, portal: true });
        expect(readiness.check()).toBe(check);
        expect(request).toHaveBeenCalledTimes(2);
        expect(request.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
            `https://api.stripe.com/v1/prices/${config.priceId}`,
            'https://api.stripe.com/v1/billing_portal/configurations?limit=100',
        ]));
        for (const [, init] of request.mock.calls) {
            expect(init?.method).toBe('GET');
            expect(new Headers(init?.headers).get('Stripe-Version')).toBe(QG_STRIPE_API_VERSION);
        }
    });

    it('keeps an explicitly enabled checkout closed until both reads finish', async () => {
        vi.stubEnv('STRIPE_MEMBERSHIP_CHECKOUT_ENABLED', 'true');
        const { api, portal, readiness } = fixture();
        vi.spyOn(api, 'verifyCheckoutPrice').mockResolvedValue(undefined);
        let finishPortal!: (id: string) => void;
        vi.spyOn(portal, 'verifyDefaultConfiguration').mockReturnValue(new Promise(resolve => { finishPortal = resolve; }));
        expect(readiness.enabled()).toBe(false);
        const check = readiness.check();
        await Promise.resolve();
        expect(readiness.enabled()).toBe(false);
        finishPortal('bpc_ABCDEFGH');
        await expect(check).resolves.toBe('verified');
        expect(readiness.enabled()).toBe(true);
    });

    it.each([
        { id: 'price_OTHER123' }, { livemode: false }, { active: false }, { currency: 'jpy' },
        { unit_amount: 99999 }, { tax_behavior: 'exclusive' }, { type: 'one_time' },
        { recurring: { interval: 'year', interval_count: 1 } },
        { recurring: { interval: 'month', interval_count: 2 } },
    ])('keeps purchases closed for an unsafe price: %j', async patch => {
        vi.stubEnv('STRIPE_MEMBERSHIP_CHECKOUT_ENABLED', 'true');
        const { readiness, request } = fixture({ ...price, ...patch });
        await expect(readiness.check()).resolves.toBe('failed');
        expect(readiness.enabled()).toBe(false);
        expect(request.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
    });

    it.each([
        { data: [], has_more: false }, { ...portalList, has_more: true },
        { data: [portalConfig, portalConfig], has_more: false },
        ...[{ active: false }, { is_default: false }, { livemode: false },
            { features: { ...features, payment_method_update: { enabled: false } } },
            { features: { ...features, subscription_cancel: { ...features.subscription_cancel, enabled: false } } },
            { features: { ...features, subscription_cancel: { ...features.subscription_cancel, mode: 'immediately' } } },
            { features: { ...features, subscription_cancel: { ...features.subscription_cancel, proration_behavior: 'create_prorations' } } },
            { features: { ...features, subscription_update: { enabled: true } } },
        ].map(patch => ({ data: [{ ...portalConfig, ...patch }], has_more: false })),
    ])('keeps purchases closed for an unsafe default Portal: %j', async value => {
        vi.stubEnv('STRIPE_MEMBERSHIP_CHECKOUT_ENABLED', 'true');
        const { readiness } = fixture(price, value);
        await expect(readiness.check()).resolves.toBe('failed');
        expect(readiness.enabled()).toBe(false);
    });

    it('does not reopen after one read fails and the other completes late; never exposes errors', async () => {
        vi.stubEnv('STRIPE_MEMBERSHIP_CHECKOUT_ENABLED', 'true');
        const { api, portal } = fixture();
        let finishPrice!: () => void;
        vi.spyOn(api, 'verifyCheckoutPrice').mockReturnValue(new Promise(resolve => { finishPrice = resolve; }));
        const verifyPortal = vi.spyOn(portal, 'verifyDefaultConfiguration')
            .mockRejectedValue(new Error('Do not log API response or credentials'));
        const readiness = createStripeCheckoutReadiness({ api, portal,
            processingEnabled: () => true, portalEnabled: () => true });
        await expect(readiness.check()).resolves.toBe('failed');
        finishPrice();
        await Promise.resolve();
        expect(readiness.enabled()).toBe(false);
        verifyPortal.mockResolvedValue('bpc_ABCDEFGH');
        await expect(readiness.check()).resolves.toBe('failed');
        expect(verifyPortal).toHaveBeenCalledOnce();
    });

    it('fails closed for permission errors without propagating Stripe response text', async () => {
        vi.stubEnv('STRIPE_MEMBERSHIP_CHECKOUT_ENABLED', 'true');
        const { readiness, request } = fixture();
        request.mockImplementation(async () => Response.json({ error: {
            type: 'invalid_request_error', message: 'sensitive response must stay private',
        } }, { status: 403 }));
        await expect(readiness.check()).resolves.toBe('failed');
        expect(readiness.enabled()).toBe(false);
        expect(request.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
    });

    it.each(['no-api', 'no-portal', 'wrong-mode', 'processing-off'])('skips reads for unavailable prerequisites: %s', async state => {
        const { api, portal, request } = fixture();
        const readiness = createStripeCheckoutReadiness({
            api: state === 'no-api' ? null : api,
            portal: state === 'no-portal' ? null : state === 'wrong-mode'
                ? { livemode: false, verifyDefaultConfiguration: vi.fn() } : portal,
            processingEnabled: () => state !== 'processing-off', portalEnabled: () => true,
        });
        await expect(readiness.check()).resolves.toBe('unavailable');
        expect(readiness.enabled()).toBe(false);
        expect(request).not.toHaveBeenCalled();
    });
});

describe('purchase rollback leaves existing members manageable', () => {
    it.each(['failed', 'rollback'] as const)('preserves status, grant, webhook, Portal and deletion guard after %s', async scenario => {
        vi.stubEnv('STRIPE_MEMBERSHIP_CHECKOUT_ENABLED', 'true');
        const { api, portal, readiness, gates } = fixture(scenario === 'failed' ? { ...price, active: false } : price);
        await expect(readiness.check()).resolves.toBe(scenario === 'failed' ? 'failed' : 'verified');
        if (scenario === 'rollback') expect(readiness.enabled()).toBe(true);
        if (scenario === 'rollback') vi.stubEnv('STRIPE_MEMBERSHIP_CHECKOUT_ENABLED', 'false');
        const auth = new RankedAuth(async () => true);
        const token = (await auth.issueLegacySession('Alice', 'right'))!.token;
        const status = { userId: 'Alice', active: true, periodEnd: null, lastGrantUtcDay: null,
            tickets: { ranked: 2, hint: 2 } };
        const store = {
            verifyUser: vi.fn(), blocked: vi.fn().mockResolvedValue(false), hasCurrentTerms: vi.fn().mockResolvedValue(true),
            status: vi.fn().mockResolvedValue(status), claim: vi.fn().mockResolvedValue({ ...status, credited: { ranked: 0, hint: 0 } }),
            preflight: vi.fn(), portalCustomer: vi.fn().mockResolvedValue({ customerId: 'cus_ABCDEFGH', livemode: true }),
            acquireReconciliation: vi.fn().mockResolvedValue({ token: reconciliationToken, retired: false }),
            releaseReconciliation: vi.fn().mockResolvedValue(undefined), applySnapshot: vi.fn().mockResolvedValue(undefined),
        } as unknown as StripeMembershipStore;
        const createCheckout = vi.spyOn(api, 'createCheckout');
        vi.spyOn(api, 'snapshot').mockResolvedValue({ subscriptionId: 'sub_ABCDEFGH' } as Awaited<ReturnType<typeof api.snapshot>>);
        const createPortal = vi.spyOn(portal, 'createSession').mockResolvedValue('https://billing.stripe.com/p/session/live_ABCDEFGH');
        const app = express();
        app.use(createStripeWebhookRouter(api, store, config.webhookSecret, () => gates.processing));
        app.use(createStripeMembershipRouter(auth, api, store, new AccountWriteGate(),
            () => gates.processing, portal, () => gates.portal, readiness.enabled));
        const server = http.createServer(app);
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/membership/stripe`;
        const post = { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' };
        try {
            expect((await fetch(`${base}/checkout`, post)).status).toBe(503);
            expect(createCheckout).not.toHaveBeenCalled();
            expect(store.preflight).not.toHaveBeenCalled();
            expect((await fetch(`${base}/status`, { headers: post.headers })).status).toBe(200);
            expect((await fetch(`${base}/daily-grant`, post)).status).toBe(200);
            expect((await fetch(`${base}/portal`, post)).status).toBe(200);
            expect(createPortal).toHaveBeenCalledExactlyOnceWith('cus_ABCDEFGH');
            const t = Math.floor(Date.now() / 1000);
            const body = JSON.stringify({ id: 'evt_ABCDEFGH', type: 'customer.subscription.updated',
                created: t, api_version: QG_STRIPE_API_VERSION, livemode: true, data: { object: { id: 'sub_ABCDEFGH' } } });
            const signature = createHmac('sha256', config.webhookSecret).update(`${t}.${body}`).digest('hex');
            expect((await fetch(`${base}/webhook`, { method: 'POST', body,
                headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${signature}` } })).status).toBe(200);
            expect(store.applySnapshot).toHaveBeenCalledOnce();
            // Only mocked Stripe responses: prove the deletion cancellation is still invoked.
            const links = vi.fn().mockResolvedValue({ intents: [{ checkoutId: 'cs_live_ABCDEFGH', livemode: true }],
                memberships: [{ checkoutId: 'cs_live_ABCDEFGH', subscriptionId: 'sub_ABCDEFGH' }] });
            const request = vi.fn(async (url: string, init?: RequestInit) => Response.json(url.includes('/checkout/')
                ? { id: 'cs_live_ABCDEFGH', livemode: true, client_reference_id: 'Alice', status: 'complete',
                    subscription: 'sub_ABCDEFGH', customer: 'cus_ABCDEFGH' }
                : { id: 'sub_ABCDEFGH', livemode: true, customer: 'cus_ABCDEFGH',
                    status: init?.method === 'DELETE' ? 'canceled' : 'active' }));
            const retire = vi.fn().mockResolvedValue(undefined);
            await createStripeCancellationGuard(links, { live: config.secretKey }, request as unknown as typeof fetch, retire)('Alice');
            expect(request.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
            expect(retire).toHaveBeenCalledOnce();
            expect(readiness.enabled()).toBe(false);
        } finally {
            server.closeAllConnections();
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    });
});
