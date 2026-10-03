import { invoiceFixture, paymentFixture, reconciliationToken } from './StripeTestFixtures';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { QG_LIVE_MONTHLY_PRICE_ID, StripeMembershipApi, type StripeEvent } from './StripeMembership';
import { createStripeMembershipStore } from './StripeMembershipStore';

const wrongPrice = 'price_OTHER12345';

for (const mode of ['test', 'live'] as const) {
    describe(`${mode} subscription price-change reconciliation`, () => {
        const intendedPrice = mode === 'live' ? QG_LIVE_MONTHLY_PRICE_ID : 'price_ORIGINAL123';
        const config = {
            mode, secretKey: `sk_${mode}_FAKEKEY12345`, webhookSecret: 'whsec_FAKESECRET12345',
            priceId: intendedPrice, successUrl: 'https://q-gambit.com/', cancelUrl: 'https://q-gambit.com/',
        };
        const subscription = {
            id: 'sub_ABCDEFGH', livemode: mode === 'live', customer: 'cus_ABCDEFGH',
            status: 'active', latest_invoice: 'in_ABCDEFGH', current_period_end: 1800000000,
            cancel_at_period_end: false, automatic_tax: { enabled: false },
            items: { data: [{ price: { id: wrongPrice }, quantity: 1 }], has_more: false },
        };
        const checkout = {
            id: `cs_${mode}_ABCDEFGH`, livemode: mode === 'live', mode: 'subscription',
            subscription: subscription.id, customer: subscription.customer,
            client_reference_id: 'Alice', status: 'complete', payment_status: 'paid',
        };
        const event: StripeEvent = {
            id: 'evt_ABCDEFGH', type: 'customer.subscription.updated', created: 1790000000,
            livemode: mode === 'live', data: { object: { id: subscription.id } },
            payloadHash: 'a'.repeat(64),
        };

        it('projects the verified changed price as ineligible without querying or granting from its invoice', async () => {
            const request = vi.fn(async (url: string) => {
                if (url.includes('/subscriptions/')) return Response.json(subscription);
                if (url.includes('/checkout/sessions?')) return Response.json({ data: [checkout], has_more: false });
                throw new Error('invoice must not be used for an off-price subscription');
            });
            const api = new StripeMembershipApi(config, request as unknown as typeof fetch);
            const changed = await api.snapshot(event);
            expect(changed).toMatchObject({ userId: 'Alice', checkoutId: checkout.id,
                priceId: wrongPrice, status: 'unpaid', paidNewPeriod: false, livemode: mode === 'live' });
            expect(request).toHaveBeenCalledTimes(2);
            const invoiceEvent: StripeEvent = { ...event, type: 'invoice.paid',
                data: { object: { id: subscription.latest_invoice, parent: invoiceFixture().parent } } };
            expect((await api.snapshot(invoiceEvent))?.paidNewPeriod).toBe(false);
        });

        it('withholds access for extra items or increased quantity, even when the intended Price remains', async () => {
            const current = { ...subscription, items: { data: [
                { price: { id: intendedPrice }, quantity: 1 },
                { price: { id: wrongPrice }, quantity: 1 },
            ], has_more: false } };
            const request = vi.fn(async (url: string) => Response.json(url.includes('/subscriptions/')
                ? current : { data: [checkout], has_more: false }));
            const api = new StripeMembershipApi(config, request as unknown as typeof fetch);
            const extra = await api.snapshot(event);
            expect(extra?.status).toBe('unpaid');
            expect(extra?.priceId).not.toBe(intendedPrice);
            current.items.data = [{ price: { id: intendedPrice }, quantity: 2 }];
            const quantity = await api.snapshot(event);
            expect(quantity?.status).toBe('unpaid');
            expect(quantity?.paidNewPeriod).toBe(false);
            current.items.data = [{ price: { id: intendedPrice }, quantity: 1 }];
            current.items.has_more = true;
            expect((await api.snapshot(event))?.status).toBe('unpaid');
        });

        it('retains a canceled state and never authorizes a missing owner-bound Checkout', async () => {
            const canceled = { ...subscription, status: 'canceled' };
            let sessions = [checkout];
            const request = vi.fn(async (url: string) => Response.json(url.includes('/subscriptions/')
                ? canceled : { data: sessions, has_more: false }));
            const api = new StripeMembershipApi(config, request as unknown as typeof fetch);
            expect((await api.snapshot(event))?.status).toBe('canceled');
            sessions = [{ ...checkout, customer: 'cus_WRONG1234' }];
            await expect(api.snapshot(event)).rejects.toThrow();
        });

        it('sends an off-price projection to the mode-specific DB RPC, never a paid-period marker', async () => {
            const rpc = vi.fn((name: string, args: Record<string, unknown>) => ({
                abortSignal: vi.fn().mockResolvedValue({ data: { applied: true, duplicate: false }, error: null }),
                name, args,
            }));
            const store = createStripeMembershipStore({ rpc } as unknown as SupabaseClient,
                async () => 'Alice', async () => false);
            await store.applySnapshot({
                eventId: event.id, eventPayloadHash: event.payloadHash, eventType: event.type,
                eventCreated: event.created, observedAt: new Date().toISOString(),
                subscriptionId: subscription.id, checkoutId: checkout.id, customerId: subscription.customer,
                userId: 'Alice', priceId: wrongPrice, status: 'unpaid',
                periodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
                paidNewPeriod: false, cancelAtPeriodEnd: false, reconciliationToken, livemode: mode === 'live',
            });
            expect(rpc).toHaveBeenCalledWith('apply_stripe_canonical_membership_snapshot',
            expect.objectContaining({ p_price_id: wrongPrice, p_status: 'unpaid', p_paid_new_period: false }));
        });
    });
}
