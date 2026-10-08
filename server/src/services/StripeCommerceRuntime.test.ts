import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStripeBillingRouters, COMMERCE_RUNTIME_RELEASE_VERIFIED } from './StripeBillingRuntime';
import { RankedAuth } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import type { StripeMembershipApi } from './StripeMembership';
import type { StripeMembershipStore } from './StripeMembershipStore';
import { commerceEvidenceFixture } from './fixtures/stripeCommerceEvidenceFixture.test';

let server: http.Server | undefined;
afterEach(async () => {
    vi.unstubAllEnvs();
    server?.closeAllConnections();
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    server = undefined;
});
describe('actual index billing composition preserves legacy while new commerce schema is unavailable', () => {
    it('supports an explicitly closed rollback runtime without constructing or reading a commerce adapter', async () => {
        vi.stubEnv('STRIPE_MEMBERSHIP_LIVE_ENABLED', 'true');
        vi.stubEnv('STRIPE_MEMBERSHIP_TEST_ENABLED', 'true');
        vi.stubEnv('STRIPE_MEMBERSHIP_CHECKOUT_ENABLED', 'true');
        const f = commerceEvidenceFixture('plus_monthly', true);
        const auth = new RankedAuth(async () => true);
        const token = (await auth.issueLegacySession('Alice', 'fixture-password'))!.token;
        const legacyStatus = { userId: 'Alice', active: true, cancelAtPeriodEnd: false,
            periodEnd: new Date(Date.now() + 86400_000).toISOString(), lastGrantUtcDay: null, tickets: { ranked: 3, hint: 3 } };
        const store = { blocked: vi.fn(async () => false), status: vi.fn(async () => legacyStatus),
            acquireReconciliation: vi.fn(async () => ({ token: '11111111-1111-4111-8111-111111111111', retired: false })),
            releaseReconciliation: vi.fn(async () => {}), applySnapshot: vi.fn(async () => {}) };
        const snapshot = { subscriptionId: 'sub_FIXTURELEGACY' };
        const api = { livemode: true, availableCheckoutSkus: vi.fn(() => ['standard_monthly']),
            eventSubscriptionId: vi.fn(() => snapshot.subscriptionId), snapshot: vi.fn(async () => snapshot) };
        const createStore = vi.fn(() => { throw new Error('pending commerce schema unavailable'); });
        const createStatusStore = vi.fn(() => { throw new Error('pending commerce status RPC unavailable'); });
        const routers = createStripeBillingRouters({ auth, api: api as unknown as StripeMembershipApi,
            store: store as unknown as StripeMembershipStore, gate: new AccountWriteGate(), webhookSecret: f.secret,
            processingEnabled: () => true, portalApi: null, portalEnabled: () => false, checkoutEnabled: () => true,
            commerce: { config: f.config, createStore, createStatusStore } }, false);
        const app = express(); app.use(routers.webhook); app.use(routers.membership);
        server = http.createServer(app); await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/membership/stripe/`;
        const response = await fetch(base + 'status', { headers: { authorization: `Bearer ${token}` } });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ enabled: true, ...legacyStatus, availableCheckoutSkus: [], canManageBilling: false });
        const signed = f.signed();
        expect((await fetch(base + 'webhook', { method: 'POST', headers: { 'content-type': 'application/json', ...signed.headers }, body: signed.body.toString() })).status).toBe(200);
        expect(store.applySnapshot).toHaveBeenCalledExactlyOnceWith({ ...snapshot, reconciliationToken: '11111111-1111-4111-8111-111111111111' });
        expect((await fetch(base + 'checkout', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: '{"sku":"standard_monthly"}' })).status).toBe(503);
        expect(COMMERCE_RUNTIME_RELEASE_VERIFIED).toBe(true);
        expect(createStore).not.toHaveBeenCalled(); expect(createStatusStore).not.toHaveBeenCalled();
        expect(f.request).not.toHaveBeenCalled();
    });
    it('index mounts this composition without overriding its source release gate', () => {
        const index = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
        expect(index).toContain("import { createStripeBillingRouters } from './services/StripeBillingRuntime'");
        expect(index).toContain('app.use(stripeBillingRouters.webhook)');
        expect(index).toContain('app.use(stripeBillingRouters.membership)');
        expect(index).toContain('createStore: () => supabaseService.stripeCommerceStore()');
        expect(index).toContain('createStatusStore: () => supabaseService.stripeCommerceStatusStore()');
        expect(index).not.toContain('new StripeCommerceFulfillment');
        expect(index).not.toMatch(/createStripeBillingRouters\([\s\S]*?\},\s*true/);
    });
});
