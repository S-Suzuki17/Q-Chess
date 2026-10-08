import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStripeWebhookRouter } from './StripeMembershipRoutes';
import type { StripeMembershipApi } from './StripeMembership';
import type { StripeMembershipStore } from './StripeMembershipStore';
import { StripeCommerceEvidence } from './StripeCommerceEvidence';
import { StripeCommerceFulfillment } from './StripeCommerceFulfillment';
import { commerceEvidenceFixture } from './fixtures/stripeCommerceEvidenceFixture.test';

const servers: http.Server[] = [];
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } });
async function mount(f: ReturnType<typeof commerceEvidenceFixture>) {
    const legacy = { livemode: f.config.livemode, eventSubscriptionId: vi.fn(() => null),
        snapshot: vi.fn(), resolveReversal: vi.fn(async () => []), reversalContext: vi.fn() };
    const membership = { ...f.store, applySnapshot: vi.fn(), applyReversal: vi.fn() };
    const fulfillment = new StripeCommerceFulfillment(new StripeCommerceEvidence(f.config, f.request), f.store, f.secret);
    const app = express();
    app.use(createStripeWebhookRouter(legacy as unknown as StripeMembershipApi,
        membership as unknown as StripeMembershipStore, f.secret, () => true, fulfillment));
    const server = http.createServer(app); servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const deliver = async (type?: string, patch?: Record<string, unknown>, invalidSignature = false) => {
        const s = f.signed(type, patch);
        return fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/membership/stripe/webhook`, {
            method: 'POST', headers: { 'content-type': 'application/json', ...s.headers,
                ...(invalidSignature ? { 'stripe-signature': 'invalid' } : {}) }, body: s.body.toString(),
        });
    };
    return { legacy, membership, deliver };
}
describe('mounted shared Stripe webhook routes canonical new commerce before legacy handling', () => {
    for (const legacy of [false, true]) for (const livemode of [false, true]) {
        it.each(['customer.subscription.deleted', 'invoice.paid', 'checkout.session.completed',
            'checkout.session.async_payment_failed'])(
            `acknowledges trusted retirement before provider/intent reads (legacy=${legacy}, live=${livemode}, %s)`, async type => {
                const f = commerceEvidenceFixture('plus_monthly', livemode); const m = await mount(f);
                if (legacy) f.checkout.metadata = { qgambit_sku: 'legacy_monthly' as never };
                f.request.mockRejectedValue(new Error('provider unavailable after erasure'));
                vi.mocked(f.store.checkoutIntent).mockResolvedValue(null);
                vi.mocked(f.store.acquireReconciliation).mockResolvedValue({ token: null, retired: true });
                expect((await m.deliver(type)).status).toBe(200);
                expect(f.store.acquireReconciliation).toHaveBeenCalledExactlyOnceWith(f.subscription.id, livemode);
                expect(f.request).not.toHaveBeenCalled(); expect(f.store.checkoutIntent).not.toHaveBeenCalled();
                expect(f.store.releaseReconciliation).not.toHaveBeenCalled();
                expect(f.store.fulfillSubscription).not.toHaveBeenCalled(); expect(f.store.fulfillOneTime).not.toHaveBeenCalled();
                expect(m.membership.applySnapshot).not.toHaveBeenCalled(); expect(m.membership.applyReversal).not.toHaveBeenCalled();
                expect(m.legacy.eventSubscriptionId).not.toHaveBeenCalled();
            });
    }
    it.each(['hints_13', 'plus_monthly', 'standard_monthly'] as const)('durably fulfills %s before acknowledging', async sku => {
        const f = commerceEvidenceFixture(sku); const m = await mount(f);
        expect((await m.deliver()).status).toBe(200);
        expect(sku.startsWith('hints') ? f.store.fulfillOneTime : f.store.fulfillSubscription).toHaveBeenCalledOnce();
        expect(m.legacy.eventSubscriptionId).not.toHaveBeenCalled();
    });
    it('rejects bad signatures and mode mismatch before provider or database reads', async () => {
        const f = commerceEvidenceFixture(); const m = await mount(f);
        expect((await m.deliver(undefined, undefined, true)).status).toBe(400);
        expect((await m.deliver(undefined, { livemode: true })).status).toBe(400);
        expect(f.request).not.toHaveBeenCalled(); expect(f.store.checkoutIntent).not.toHaveBeenCalled();
    });
    it('does not acknowledge DB failure, and safely retries a durable duplicate', async () => {
        const f = commerceEvidenceFixture('hints_13'); const m = await mount(f);
        vi.mocked(f.store.fulfillOneTime).mockRejectedValueOnce(new Error('db unavailable'))
            .mockResolvedValueOnce({ applied: true, duplicate: false, credited: 13 })
            .mockResolvedValueOnce({ applied: false, duplicate: true, credited: 0 });
        const failed = await m.deliver(); expect(failed.status).toBe(503); expect(failed.headers.get('retry-after')).toBe('60');
        expect((await m.deliver()).status).toBe(200); expect((await m.deliver()).status).toBe(200);
        expect(m.legacy.eventSubscriptionId).not.toHaveBeenCalled();
    });
    it('returns an explicit retryable reconciliation review for missing original consent evidence', async () => {
        const f = commerceEvidenceFixture('hints_13'); const m = await mount(f);
        vi.mocked(f.store.fulfillOneTime).mockRejectedValueOnce(new Error('COMMERCE_RECONCILIATION_REVIEW_REQUIRED'));
        const response = await m.deliver(); expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ code: 'COMMERCE_RECONCILIATION_REVIEW_REQUIRED' });
        expect(response.headers.get('retry-after')).toBe('60');
    });
    it('never falls through to legacy ACK for an app checkout with missing DB ownership', async () => {
        const f = commerceEvidenceFixture('hints_13'); const m = await mount(f);
        vi.mocked(f.store.checkoutIntent).mockResolvedValue(null);
        expect((await m.deliver()).status).toBe(503);
        expect(f.store.fulfillOneTime).not.toHaveBeenCalled(); expect(m.legacy.eventSubscriptionId).not.toHaveBeenCalled();
    });
    it('leaves unsupported new-SKU asynchronous failure policy retryable, outside the legacy snapshot path', async () => {
        const f = commerceEvidenceFixture('plus_monthly'); const m = await mount(f);
        const response = await m.deliver('checkout.session.async_payment_failed');
        expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'COMMERCE_EVENT_UNSUPPORTED' });
        expect(m.legacy.eventSubscriptionId).not.toHaveBeenCalled(); expect(f.store.fulfillSubscription).not.toHaveBeenCalled();
    });
    it('releases the subscription lease and retries provider failures', async () => {
        const f = commerceEvidenceFixture(); const m = await mount(f);
        f.price.tax_behavior = 'exclusive';
        expect((await m.deliver()).status).toBe(503);
        expect(f.store.releaseReconciliation).toHaveBeenCalledOnce(); expect(f.store.fulfillSubscription).not.toHaveBeenCalled();
    });
    it('holds one lease through new canonical fulfillment and keeps its release failure retryable', async () => {
        const f = commerceEvidenceFixture(); const m = await mount(f);
        vi.mocked(f.store.releaseReconciliation).mockRejectedValueOnce(new Error('release failed'));
        expect((await m.deliver()).status).toBe(503);
        const acquire = vi.mocked(f.store.acquireReconciliation), grant = vi.mocked(f.store.fulfillSubscription);
        const release = vi.mocked(f.store.releaseReconciliation);
        expect(acquire).toHaveBeenCalledOnce(); expect(grant).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledOnce();
        expect(acquire.mock.invocationCallOrder[0]).toBeLessThan(f.request.mock.invocationCallOrder[0]);
        expect(grant.mock.invocationCallOrder[0]).toBeLessThan(release.mock.invocationCallOrder[0]);
    });
    it('does not fetch provider state or route to legacy while another reconciler owns the lease', async () => {
        const f = commerceEvidenceFixture(); const m = await mount(f);
        vi.mocked(f.store.acquireReconciliation).mockResolvedValue({ token: null, retired: false });
        expect((await m.deliver()).status).toBe(503);
        expect(f.request).not.toHaveBeenCalled(); expect(f.store.checkoutIntent).not.toHaveBeenCalled();
        expect(f.store.fulfillSubscription).not.toHaveBeenCalled(); expect(m.legacy.eventSubscriptionId).not.toHaveBeenCalled();
    });
    it('preserves legacy dispatch when no new-SKU DB binding or metadata exists', async () => {
        const f = commerceEvidenceFixture(); const m = await mount(f);
        f.checkout.metadata = { qgambit_sku: 'legacy_monthly' as never };
        vi.mocked(f.store.checkoutIntent).mockResolvedValue(null);
        expect((await m.deliver()).status).toBe(202);
        expect(m.legacy.eventSubscriptionId).toHaveBeenCalledOnce(); expect(f.store.fulfillSubscription).not.toHaveBeenCalled();
    });
    it('releases the routing lease before legacy processing reacquires and reads its canonical snapshot', async () => {
        const f = commerceEvidenceFixture(); const m = await mount(f);
        f.checkout.metadata = { qgambit_sku: 'legacy_monthly' as never };
        vi.mocked(f.store.checkoutIntent).mockResolvedValue(null);
        m.legacy.eventSubscriptionId.mockReturnValue(f.subscription.id as never);
        m.legacy.snapshot.mockResolvedValue({ subscriptionId: f.subscription.id });
        expect((await m.deliver()).status).toBe(200);
        const acquire = vi.mocked(f.store.acquireReconciliation), release = vi.mocked(f.store.releaseReconciliation);
        expect(acquire).toHaveBeenCalledTimes(2); expect(release).toHaveBeenCalledTimes(2);
        expect(release.mock.invocationCallOrder[0]).toBeLessThan(acquire.mock.invocationCallOrder[1]);
        expect(acquire.mock.invocationCallOrder[1]).toBeLessThan(m.legacy.snapshot.mock.invocationCallOrder[0]);
        expect(f.store.fulfillSubscription).not.toHaveBeenCalled(); expect(m.membership.applySnapshot).toHaveBeenCalledOnce();
    });
    it('routes canonical one-time risk through the source ledger before acknowledgement', async () => {
        const f = commerceEvidenceFixture('hints_13'); const m = await mount(f);
        f.records['invoice_payments:null'] = { has_more: false, data: [] };
        expect((await m.deliver('charge.refunded', { data: { object: f.charge } })).status).toBe(200);
        expect(f.store.applySourceRisk).toHaveBeenCalledWith(expect.objectContaining({
            invoiceId: null, paymentSource: expect.objectContaining({ chargeId: f.charge.id, riskState: 'clear' }),
        }));
        expect(m.legacy.resolveReversal).not.toHaveBeenCalled(); expect(f.store.fulfillOneTime).not.toHaveBeenCalled();
    });
    it('rejects incomplete canonical credit notes before touching the legacy reversal path', async () => {
        const f = commerceEvidenceFixture(); const m = await mount(f);
        f.records['credit_notes/cn_FIXTURECREDITNOTE'] = { id: 'cn_FIXTURECREDITNOTE', livemode: false, invoice: f.invoice.id };
        expect((await m.deliver('credit_note.created', { data: { object: { id: 'cn_FIXTURECREDITNOTE' } } })).status).toBe(503);
        expect(m.legacy.resolveReversal).not.toHaveBeenCalled(); expect(f.store.fulfillSubscription).not.toHaveBeenCalled();
    });
});
