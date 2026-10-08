import http from 'node:http';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QG_STRIPE_API_VERSION } from './StripeApiVersion';

const h = vi.hoisted(() => ({
    io: null as any,
    membership: null as any,
    api: null as any,
    newSchema: vi.fn(() => { throw new Error('Pending commerce schema is unavailable'); }),
}));

vi.mock('./RankedSessionRuntime', () => ({ createRankedSessionAuthority: () => ({
    verifySession: async (token: unknown) => token === 'ranked_synthetic_legacy_index'
        ? { userId: 'Alice', expiresAt: Date.now() + 60_000 } : null,
    issueLegacySession: async () => null, revokeSession: async () => false, revokeUserSessions: async () => 0,
}) }));
vi.mock('socket.io', async original => {
    const actual = await original<any>();
    return { ...actual, Server: class extends actual.Server {
        constructor(...args: any[]) { super(...args); h.io = this; }
    } };
});
vi.mock('./StripeMembership', async original => ({
    ...await original<any>(),
    // Provider reads are controlled; raw webhook signature verification stays real.
    StripeMembershipApi: class { constructor() { return h.api; } },
}));
// Preserve the pre-release legacy-only composition as an explicit fixture.
// The released index uses the real default gate; do not turn off receipt
// processing or retirement when pausing sales in production.
vi.mock('./StripeBillingRuntime', async original => {
    const actual = await original<typeof import('./StripeBillingRuntime')>();
    return { ...actual, createStripeBillingRouters: (options: Parameters<typeof actual.createStripeBillingRouters>[0]) =>
        actual.createStripeBillingRouters(options, false) };
});
vi.mock('./SupabaseService', () => ({ SupabaseService: class {
    constructor() { return new Proxy(this, { get: (_target, key) => ({
        stripeMembershipStore: () => h.membership,
        stripeCommerceStore: h.newSchema, stripeCommerceStatusStore: h.newSchema,
        verifyUser: async () => null, rankedReady: async () => true,
        getMatchRating: async () => 1000, recordUnratedMatch: async () => {},
        settleRankedMatch: async () => null, recordSecurityEvent: async () => {},
        restrictedAccounts: async () => [],
        accountDeletionStore: () => ({ blocked: async () => false }),
        accountSecurityStore: () => ({ restricted: async () => false }),
        serviceStatusLoader: () => async () => ({ maintenance: false, minimumAndroidBuild: 0,
            minimumProtocol: 0, announcement: {}, revision: '' }),
    } as any)[key] ?? (() => ({})) }); }
} }));
vi.mock('./PlayRewardVerifier', () => ({ createPlayRewardVerifier: () => () => {
    throw new Error('Provider traffic forbidden');
} }));

const secret = 'whsec_synthetic_index_only';
const token = 'ranked_synthetic_legacy_index';
const timers: ReturnType<typeof setTimeout>[] = [];
let server: http.Server, endpoint = '';

function request(path: string, body?: string, extraHeaders: Record<string, string> = {}) {
    return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }>((resolve, reject) => {
        const req = http.request(endpoint + path, { method: body === undefined ? 'GET' : 'POST',
            headers: { authorization: `Bearer ${token}`,
                ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...extraHeaders } }, res => {
            let value = '';
            res.setEncoding('utf8'); res.on('data', chunk => { value += chunk; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode!, headers: res.headers, body: JSON.parse(value) }); }
                catch (error) { reject(error); }
            });
        });
        req.on('error', reject); req.setTimeout(4000, () => req.destroy(new Error('Loopback HTTP timeout')));
        req.end(body);
    });
}

beforeAll(async () => {
    vi.stubEnv('STRIPE_BILLING_ENVIRONMENT', 'sandbox');
    vi.stubEnv('STRIPE_MEMBERSHIP_MODE', 'test');
    vi.stubEnv('STRIPE_MEMBERSHIP_TEST_ENABLED', 'true');
    vi.stubEnv('STRIPE_TEST_SECRET_KEY', 'sk_test_syntheticIndexOnly12345');
    vi.stubEnv('STRIPE_TEST_WEBHOOK_SECRET', secret);
    vi.stubEnv('STRIPE_TEST_PRICE_ID', 'price_IndexLegacy123');
    vi.stubEnv('STRIPE_TEST_SUCCESS_URL', 'https://q-gambit.com/');
    vi.stubEnv('STRIPE_TEST_CANCEL_URL', 'https://q-gambit.com/');
    vi.stubEnv('STRIPE_MEMBERSHIP_PORTAL_ENABLED', 'false');
    vi.stubEnv('STRIPE_AUTOMATIC_TAX_ENABLED', 'false');
    h.membership = {
        verifyUser: async () => null, blocked: async () => false, hasCurrentTerms: async () => true,
        status: vi.fn(async () => ({ userId: 'Alice', active: true,
            periodEnd: '2099-01-01T00:00:00.000Z', cancelAtPeriodEnd: false,
            lastGrantUtcDay: null, tickets: { ranked: 3, hint: 3 } })),
        acquireReconciliation: vi.fn(async () => ({ token: '00000000-0000-4000-8000-000000000001', retired: false })),
        releaseReconciliation: vi.fn(async () => {}), applySnapshot: vi.fn(async () => {}),
    };
    h.api = { livemode: false, availableCheckoutSkus: () => [],
        eventSubscriptionId: vi.fn(() => 'sub_IndexLegacy123'),
        snapshot: vi.fn(async () => ({ subscriptionId: 'sub_IndexLegacy123', userId: 'Alice' })),
    };
    const listen = http.Server.prototype.listen;
    vi.spyOn(http.Server.prototype, 'listen').mockImplementation(function(this: http.Server, ...args: any[]) {
        server = this; return listen.call(this, 0, '127.0.0.1', args.at(-1));
    } as any);
    const interval = globalThis.setInterval, timeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((...args: any[]) => {
        const timer = interval(...args as Parameters<typeof setInterval>); timers.push(timer); return timer;
    }) as typeof setInterval);
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((...args: any[]) => {
        const timer = timeout(...args as Parameters<typeof setTimeout>); timers.push(timer); return timer;
    }) as typeof setTimeout);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', () => { throw new Error('Provider traffic forbidden'); });
    await import('../index');
    if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve));
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
    if (h.io) await new Promise<void>(resolve => h.io.close(resolve));
    server?.closeAllConnections();
    for (const timer of timers) { clearTimeout(timer); clearInterval(timer); }
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

describe('actual index with an explicitly legacy-only billing fixture and pending commerce schema absent', () => {
    it('serves the owned legacy status without constructing or reading new commerce stores', async () => {
        const reply = await request('/membership/stripe/status');
        expect(reply.status).toBe(200);
        expect(reply.headers['cache-control']).toBe('no-store');
        expect(reply.body).toMatchObject({ userId: 'Alice', active: true, availableCheckoutSkus: [], tickets: { ranked: 3, hint: 3 } });
        expect(reply.body).not.toHaveProperty('commerce');
        expect(h.membership.status).toHaveBeenCalledWith('Alice', false);
        expect(h.newSchema).not.toHaveBeenCalled();
    });
    it('processes a signed legacy webhook without touching pending commerce schema', async () => {
        const now = Math.floor(Date.now() / 1000);
        const body = JSON.stringify({ id: 'evt_IndexLegacy123', type: 'customer.subscription.updated',
            created: now, api_version: QG_STRIPE_API_VERSION, livemode: false,
            data: { object: { id: 'sub_IndexLegacy123' } } });
        const signature = createHmac('sha256', secret).update(`${now}.${body}`).digest('hex');
        const reply = await request('/membership/stripe/webhook', body, { 'stripe-signature': `t=${now},v1=${signature}` });
        expect(reply.status).toBe(200);
        expect(reply.body).toEqual({ received: true });
        expect(h.membership.applySnapshot).toHaveBeenCalledOnce();
        expect(h.membership.releaseReconciliation).toHaveBeenCalledOnce();
        expect(h.newSchema).not.toHaveBeenCalled();
    });
    it('does not expose a new checkout while only legacy billing is enabled', async () => {
        const reply = await request('/membership/stripe/checkout', JSON.stringify({ sku: 'standard_monthly' }));
        expect(reply.status).toBe(503);
        expect(['FEATURE_DISABLED', 'SKU_NOT_READY']).toContain(reply.body.code);
        expect(h.newSchema).not.toHaveBeenCalled();
    });
});
