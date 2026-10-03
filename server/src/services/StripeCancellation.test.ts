import { describe, expect, it, vi } from 'vitest';
import { createStripeCancellationGuard, type StripeDeletionLinks } from './StripeCancellation';

const testIntent = { checkoutId: 'cs_test_ABCDEFGH', livemode: false };
const completeSession = { id: testIntent.checkoutId, livemode: false, status: 'complete',
    client_reference_id: 'Alice', subscription: 'sub_ABCDEFGH', customer: 'cus_ABCDEFGH' };
const subscription = { id: 'sub_ABCDEFGH', customer: 'cus_ABCDEFGH', livemode: false, status: 'active' };
const linkSource = (links: StripeDeletionLinks) => vi.fn(async () => links);
const key = { test: 'sk_test_ABCDEFGH' };

describe('Stripe cancellation before permanent account deletion', () => {
    it('does not call Stripe when the server-owned inventory is empty', async () => {
        const source = linkSource({ intents: [], memberships: [] });
        const request = vi.fn();
        await createStripeCancellationGuard(source, {}, request as unknown as typeof fetch)('Alice');
        expect(request).not.toHaveBeenCalled();
    });
    it('expires an open Checkout Session before erasing its account', async () => {
        const source = linkSource({ intents: [testIntent], memberships: [] });
        const request = vi.fn(async (url: string, init: RequestInit) => Response.json({
            ...completeSession, status: init.method === 'POST' ? 'expired' : 'open', subscription: null,
        }));
        await createStripeCancellationGuard(source, key, request as unknown as typeof fetch)('Alice');
        expect(request).toHaveBeenCalledTimes(2);
        expect(request.mock.calls[1][0]).toContain('/expire');
    });
    it('cancels a completed paid subscription immediately, then safely retries', async () => {
        const source = linkSource({ intents: [testIntent], memberships: [{
            subscriptionId: subscription.id, checkoutId: testIntent.checkoutId,
        }] });
        let canceled = false;
        const request = vi.fn(async (url: string, init: RequestInit) => Response.json(
            url.includes('/checkout/sessions/') ? completeSession : {
                ...subscription, status: init.method === 'DELETE' || canceled ? 'canceled' : 'active',
            }));
        const guardedRequest = vi.fn(async (url: string, init: RequestInit) => {
            const response = await request(url, init);
            if (init.method === 'DELETE') canceled = true;
            return response;
        });
        const guard = createStripeCancellationGuard(source, key, guardedRequest as unknown as typeof fetch);
        await guard('Alice');
        expect(canceled).toBe(true);
        expect(guardedRequest.mock.calls.filter(([, init]) => init.method === 'DELETE')).toHaveLength(1);
        await guard('Alice');
        expect(guardedRequest.mock.calls.filter(([, init]) => init.method === 'DELETE')).toHaveLength(1);
    });
    it('fails closed on missing key, foreign identity or unverified cancellation', async () => {
        const source = linkSource({ intents: [testIntent], memberships: [] });
        const complete = vi.fn(async () => Response.json(completeSession));
        await expect(createStripeCancellationGuard(source, {}, complete as unknown as typeof fetch)('Alice'))
            .rejects.toThrow();
        expect(complete).not.toHaveBeenCalled();
        const foreign = vi.fn(async () => Response.json({ ...completeSession, client_reference_id: 'Bob' }));
        await expect(createStripeCancellationGuard(source, key, foreign as unknown as typeof fetch)('Alice'))
            .rejects.toThrow();
        const notCanceled = vi.fn(async (url: string) => Response.json(
            url.includes('/checkout/sessions/') ? completeSession : subscription));
        await expect(createStripeCancellationGuard(source, key, notCanceled as unknown as typeof fetch)('Alice'))
            .rejects.toThrow();
    });
    it('keeps completed but not yet projected Checkout subscriptions in the cancellation set', async () => {
        const source = linkSource({ intents: [testIntent], memberships: [] });
        const request = vi.fn(async (url: string, init: RequestInit) => Response.json(
            url.includes('/checkout/sessions/') ? completeSession : {
                ...subscription, status: init.method === 'DELETE' ? 'canceled' : 'active',
            }));
        await createStripeCancellationGuard(source, key, request as unknown as typeof fetch)('Alice');
        expect(request.mock.calls.some(([url, init]) => url.includes('/subscriptions/') && init.method === 'DELETE'))
            .toBe(true);
    });
});
