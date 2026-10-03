import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { RankedAuth } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { createStripeMembershipRouter } from './StripeMembershipRoutes';
import type { StripeMembershipApi } from './StripeMembership';
import type { StripeMembershipStore } from './StripeMembershipStore';
import { StripePortalApi } from './StripePortal';

const config = { secretKey: 'sk_test_ABCDEFGH', mode: 'test' as const,
    returnUrl: 'https://q-gambit.com/' };
const portalUrl = 'https://billing.stripe.com/p/session/test_ABCDEFGH';
const features = { payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none' },
    subscription_update: { enabled: false } };
const portalConfiguration = { id: 'bpc_ABCDEFGH', active: true, is_default: true,
    livemode: false, features };
const portalSession = { id: 'bps_ABCDEFGH', object: 'billing_portal.session',
    customer: 'cus_ABCDEFGH', configuration: portalConfiguration.id,
    return_url: config.returnUrl, livemode: false, url: portalUrl };

describe('server-owned Stripe Billing Portal', () => {
    it('creates a session only after the default portal enables payment changes and period-end cancellation', async () => {
        const request = vi.fn(async (url: string, _init?: RequestInit) => Response.json(url.includes('/configurations?')
            ? { data: [portalConfiguration], has_more: false } : portalSession));
        const api = new StripePortalApi(config, request as unknown as typeof fetch);
        await expect(api.createSession('cus_ABCDEFGH')).resolves.toBe(portalUrl);
        expect(request).toHaveBeenCalledTimes(2);
        const body = request.mock.calls[1][1] as RequestInit;
        expect(String(body.body)).toContain('customer=cus_ABCDEFGH');
        expect(String(body.body)).toContain('configuration=bpc_ABCDEFGH');
    });

    it('fails closed for wrong modes, missing cancellation, unsafe URLs and client-like customer IDs', async () => {
        expect(() => new StripePortalApi({ ...config, mode: 'live' })).toThrow('STRIPE_PORTAL_CONFIG_REQUIRED');
        expect(() => new StripePortalApi({ ...config, returnUrl: 'https://evil.example/' }))
            .toThrow('STRIPE_PORTAL_CONFIG_REQUIRED');
        const wrongFeatures = vi.fn(async () => Response.json({ data: [{ ...portalConfiguration,
            features: { ...features, subscription_cancel: { enabled: true, mode: 'immediately' } } }],
        has_more: false }));
        await expect(new StripePortalApi(config, wrongFeatures as unknown as typeof fetch)
            .createSession('cus_ABCDEFGH')).rejects.toThrow('STRIPE_PORTAL_FEATURES_NOT_READY');
        const unsafeUrl = vi.fn(async (url: string) => Response.json(url.includes('/configurations?')
            ? { data: [portalConfiguration], has_more: false }
            : { ...portalSession, url: 'https://billing.stripe.com.evil.example/p/session/test_ABCDEFGH' }));
        await expect(new StripePortalApi(config, unsafeUrl as unknown as typeof fetch)
            .createSession('cus_ABCDEFGH')).rejects.toThrow('STRIPE_PORTAL_SESSION_INVALID');
        await expect(new StripePortalApi(config, unsafeUrl as unknown as typeof fetch)
            .createSession('cus_')).rejects.toThrow('STRIPE_PORTAL_CUSTOMER_INVALID');
    });

    it('uses only owner-scoped DB customer, never request body, and keeps portal flag OFF by default', async () => {
        const auth = new RankedAuth(async (id, password) => id === 'Alice' && password === 'right');
        const token = (await auth.issueLegacySession('Alice', 'right'))!.token;
        const store = { verifyUser: vi.fn().mockResolvedValue(null), blocked: vi.fn().mockResolvedValue(false),
            status: vi.fn().mockResolvedValue({ userId: 'Alice', active: true, periodEnd: null,
                lastGrantUtcDay: null, tickets: { ranked: 0, hint: 0 } }),
            portalCustomer: vi.fn().mockResolvedValue({ customerId: 'cus_OWNED123',
                subscriptionId: 'sub_OWNED123', livemode: false }),
        } as unknown as StripeMembershipStore;
        const createSession = vi.fn().mockResolvedValue(portalUrl);
        const portal = { livemode: false, createSession } as unknown as StripePortalApi;
        let portalOn = false;
        const app = express();
        app.use(createStripeMembershipRouter(auth, { livemode: false } as unknown as StripeMembershipApi,
            store, new AccountWriteGate(), () => true, portal, () => portalOn));
        const server = http.createServer(app);
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const post = (body = '{}') => fetch(`${base}/membership/stripe/portal`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json' }, body,
        });
        try {
            expect((await post()).status).toBe(503);
            expect(createSession).not.toHaveBeenCalled();
            portalOn = true;
            expect((await fetch(`${base}/membership/stripe/portal`, { method: 'POST',
                headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(401);
            expect((await post('{"customerId":"cus_ATTACKER1"}')).status).toBe(400);
            expect(createSession).not.toHaveBeenCalled();
            const result = await post();
            expect(result.status).toBe(200);
            expect(await result.json()).toEqual({ url: portalUrl });
            expect(store.portalCustomer).toHaveBeenCalledWith('Alice', false);
            expect(createSession).toHaveBeenCalledExactlyOnceWith('cus_OWNED123');
            (store.portalCustomer as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
                customerId: 'cus_LIVECUSTOMER', subscriptionId: 'sub_LIVESUB123', livemode: true,
            });
            expect((await post()).status).toBe(503);
            expect(createSession).toHaveBeenCalledTimes(1);
        } finally {
            server.closeAllConnections();
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    });
});
