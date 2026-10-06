import { reconciliationToken } from './StripeTestFixtures';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createStripeMembershipStore } from './StripeMembershipStore';

describe('Stripe service-role adapter', () => {
    it('accepts safe uncapped member balances but grants no more than 3 per day', async () => {
        let data = { userId: 'Alice', active: true, cancelAtPeriodEnd: false,
            periodEnd: '2026-11-03T00:00:00Z', lastGrantUtcDay: '2026-10-03',
            tickets: { ranked: 60, hint: 60 }, claimed: true, credited: { ranked: 1, hint: 2 } };
        const rpc = vi.fn((name: string) => ({ abortSignal: vi.fn().mockImplementation(async () =>
            ({ data: name === 'assert_stripe_billing_mode' ? true : data, error: null })) }));
        const store = createStripeMembershipStore({ rpc } as unknown as SupabaseClient,
            async () => 'Alice', async () => false);
        for (const live of [false, true]) {
            expect((await store.status('Alice', live)).tickets).toEqual({ ranked: 60, hint: 60 });
            expect((await store.claim('Alice', live)).credited).toEqual({ ranked: 1, hint: 2 });
        }
        for (const count of [61, 100_000, Number.MAX_SAFE_INTEGER]) {
            data = { ...data, tickets: { ranked: count, hint: count } };
            for (const live of [false, true]) expect((await store.status('Alice', live)).tickets)
                .toEqual({ ranked: count, hint: count });
        }
        for (const count of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) {
            data = { ...data, tickets: { ranked: count, hint: 60 } };
            await expect(store.status('Alice', true)).rejects.toThrow('MEMBERSHIP_UNAVAILABLE');
        }
        data = { ...data, tickets: { ranked: 60, hint: 60 }, credited: { ranked: 4, hint: 0 } };
        await expect(store.claim('Alice', true)).rejects.toThrow('MEMBERSHIP_UNAVAILABLE');
    });
    it('passes server-only checkout, immutable webhook hash, and grant arguments to exact RPCs', async () => {
        const calls: { name: string; args: Record<string, unknown> }[] = [];
        const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
            if (name !== 'assert_stripe_billing_mode') calls.push({ name, args });
            const data = name === 'assert_stripe_billing_mode' ? true : name === 'stripe_checkout_preflight' ? {
                eligible: true, reason: null, checkoutId: null, expiresAt: null,
            }
                : name === 'apply_stripe_canonical_membership_snapshot' ? { applied: true, duplicate: false }
                : name === 'apply_stripe_canonical_membership_reversal' ? { applied: true, duplicate: false, blocked: true }
                : name === 'claim_stripe_member_daily_grant_with_schedule' ? {
                    userId: 'Alice', active: true, cancelAtPeriodEnd: false, periodEnd: '2026-10-30T00:00:00Z',
                    lastGrantUtcDay: '2026-09-30', tickets: { ranked: 3, hint: 3 },
                    claimed: true, credited: { ranked: 3, hint: 3 },
                } : null;
            return { abortSignal: vi.fn().mockResolvedValue({ data, error: null }) };
        });
        const store = createStripeMembershipStore({ rpc } as unknown as SupabaseClient,
            async () => 'Alice', async () => false);
        expect(await store.preflight('Alice')).toEqual({
            eligible: true, reason: null, checkoutId: null, expiresAt: null,
        });
        await store.registerCheckoutIntent('Alice', 'cs_test_ABCDEFGH', 'price_ABCDEFGH', '2026-10-01T00:00:00Z');
        await store.applySnapshot({ eventId: 'evt_ABCDEFGH', eventPayloadHash: 'a'.repeat(64),
            eventType: 'invoice.paid', eventCreated: 1790726400,
            observedAt: '2026-09-30T00:00:00Z',
            subscriptionId: 'sub_ABCDEFGH', checkoutId: 'cs_test_ABCDEFGH', customerId: 'cus_ABCDEFGH',
            userId: 'Alice', priceId: 'price_ABCDEFGH', status: 'active',
            periodEnd: '2026-10-30T00:00:00Z', paidNewPeriod: false,
            cancelAtPeriodEnd: true, livemode: false, reconciliationToken });
        await store.applyReversal({ eventId: 'evt_REVERSAL1', eventPayloadHash: 'b'.repeat(64),
            eventType: 'charge.refunded', subscriptionId: 'sub_ABCDEFGH',
            reversedInvoiceId: 'in_ABCDEFGH', currentInvoiceId: 'in_ABCDEFGH',
            checkoutId: 'cs_test_ABCDEFGH', customerId: 'cus_ABCDEFGH', userId: 'Alice',
            periodEnd: '2026-10-30T00:00:00Z', livemode: false, reconciliationToken });
        expect((await store.claim('Alice')).credited).toEqual({ ranked: 3, hint: 3 });
        expect(calls.map(call => call.name)).toEqual([
            'stripe_checkout_preflight', 'register_stripe_checkout_intent',
            'apply_stripe_canonical_membership_snapshot', 'apply_stripe_canonical_membership_reversal',
            'claim_stripe_member_daily_grant_with_schedule',
        ]);
        expect(calls[1].args).toMatchObject({ p_user_id: 'Alice', p_checkout_id: 'cs_test_ABCDEFGH',
            p_price_id: 'price_ABCDEFGH', p_livemode: false, p_expires_at: '2026-10-01T00:00:00Z' });
        expect(calls[2].args).toMatchObject({ p_event_payload_hash: 'a'.repeat(64),
            p_event_created: 1790726400, p_livemode: false, p_paid_new_period: false,
            p_cancel_at_period_end: true });
        expect(calls[3].args).toMatchObject({ p_event_type: 'charge.refunded',
            p_reversed_invoice_id: 'in_ABCDEFGH', p_current_invoice_id: 'in_ABCDEFGH',
            p_user_id: 'Alice', p_livemode: false, p_token: reconciliationToken });
    });
    it('forwards only the verified new-period marker and rejects malformed reversal RPC receipts', async () => {
        const calls: Record<string, unknown>[] = [];
        const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
            calls.push({ name, ...args });
            const data = name === 'assert_stripe_billing_mode' ? true : name === 'apply_stripe_canonical_membership_snapshot'
                ? { applied: true, duplicate: false }
                : { applied: true, duplicate: false, blocked: 'yes' };
            return { abortSignal: vi.fn().mockResolvedValue({ data, error: null }) };
        });
        const store = createStripeMembershipStore({ rpc } as unknown as SupabaseClient,
            async () => 'Alice', async () => false);
        await store.applySnapshot({ eventId: 'evt_NEWPERIOD', eventPayloadHash: 'a'.repeat(64),
            eventType: 'invoice.paid', eventCreated: 1790726400,
            observedAt: '2026-09-30T00:00:00Z', subscriptionId: 'sub_ABCDEFGH',
            checkoutId: 'cs_test_ABCDEFGH', customerId: 'cus_ABCDEFGH', userId: 'Alice',
            priceId: 'price_ABCDEFGH', status: 'active', periodEnd: '2026-10-30T00:00:00Z',
            paidNewPeriod: true, cancelAtPeriodEnd: false, livemode: false, reconciliationToken });
        expect(calls[0].p_paid_new_period).toBe(true);
        await expect(store.applyReversal({ eventId: 'evt_REVERSAL1', eventPayloadHash: 'b'.repeat(64),
            eventType: 'charge.refunded', subscriptionId: 'sub_ABCDEFGH',
            reversedInvoiceId: 'in_ABCDEFGH', currentInvoiceId: 'in_ABCDEFGH',
            checkoutId: 'cs_test_ABCDEFGH', customerId: 'cus_ABCDEFGH', userId: 'Alice',
            periodEnd: '2026-10-30T00:00:00Z', livemode: false, reconciliationToken })).rejects.toThrow('MEMBERSHIP_UNAVAILABLE');
    });
    it('routes live writes to live-only RPCs and resolves the portal customer from the owner-scoped RPC', async () => {
        const calls: { name: string; args: Record<string, unknown> }[] = [];
        const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
            if (name !== 'assert_stripe_billing_mode') calls.push({ name, args });
            const data = name === 'assert_stripe_billing_mode' ? true : name === 'stripe_live_checkout_preflight'
                ? { eligible: true, reason: null, checkoutId: null, expiresAt: null }
                : name === 'stripe_portal_customer_for_user'
                    ? { manageable: true, customerId: 'cus_ABCDEFGH',
                        subscriptionId: 'sub_ABCDEFGH', livemode: true }
                    : name.startsWith('apply_stripe_canonical_')
                        ? { applied: true, duplicate: false, blocked: true }
                        : { userId: 'Alice', active: true, cancelAtPeriodEnd: true,
                            periodEnd: '2026-10-30T00:00:00Z',
                            lastGrantUtcDay: null, tickets: { ranked: 0, hint: 0 } };
            return { abortSignal: vi.fn().mockResolvedValue({ data, error: null }) };
        });
        const store = createStripeMembershipStore({ rpc } as unknown as SupabaseClient,
            async () => 'Alice', async () => false);
        await store.preflight('Alice', true);
        await store.registerCheckoutIntent('Alice', 'cs_live_ABCDEFGH',
            'price_1ULM9fQWzwYDIuXWgs5Uj3yt', '2026-10-01T00:00:00Z', true);
        await store.applySnapshot({ eventId: 'evt_ABCDEFGH', eventPayloadHash: 'a'.repeat(64),
            eventType: 'invoice.paid', eventCreated: 1790726400, observedAt: '2026-09-30T00:00:00Z',
            subscriptionId: 'sub_ABCDEFGH', checkoutId: 'cs_live_ABCDEFGH',
            customerId: 'cus_ABCDEFGH', userId: 'Alice', priceId: 'price_1ULM9fQWzwYDIuXWgs5Uj3yt',
            status: 'active', periodEnd: '2026-10-30T00:00:00Z', paidNewPeriod: true,
            cancelAtPeriodEnd: true, livemode: true, reconciliationToken });
        await store.applyReversal({ eventId: 'evt_REFUND123', eventPayloadHash: 'b'.repeat(64),
            eventType: 'charge.refunded', subscriptionId: 'sub_ABCDEFGH',
            reversedInvoiceId: 'in_ABCDEFGH', currentInvoiceId: 'in_ABCDEFGH',
            checkoutId: 'cs_live_ABCDEFGH', customerId: 'cus_ABCDEFGH', userId: 'Alice',
            periodEnd: '2026-10-30T00:00:00Z', livemode: true, reconciliationToken });
        await store.status('Alice', true);
        expect(await store.portalCustomer('Alice', true)).toEqual({ customerId: 'cus_ABCDEFGH',
            subscriptionId: 'sub_ABCDEFGH', livemode: true });
        expect(calls.map(({ name }) => name)).toEqual([
            'stripe_live_checkout_preflight', 'register_stripe_live_checkout_intent',
            'apply_stripe_canonical_membership_snapshot', 'apply_stripe_canonical_membership_reversal',
            'stripe_live_member_status_with_schedule', 'stripe_portal_customer_for_user',
        ]);
        expect(calls[1].args).not.toHaveProperty('p_livemode');
        expect(calls[2].args.p_livemode).toBe(true);
        expect(calls[2].args.p_cancel_at_period_end).toBe(true);
        expect(calls[3].args.p_livemode).toBe(true);
        expect(calls[5].args.p_livemode).toBe(true);
    });
    it('fails closed when portal ownership lookup is absent or malformed', async () => {
        let result: unknown = { manageable: false };
        const rpc = vi.fn((name: string) => ({ abortSignal: vi.fn().mockImplementation(async () => ({ data: name === 'assert_stripe_billing_mode' ? true : result, error: null })) }));
        const store = createStripeMembershipStore({ rpc } as unknown as SupabaseClient,
            async () => 'Alice', async () => false);
        expect(await store.portalCustomer('Alice', false)).toBeNull();
        result = { manageable: true, customerId: 'cus_ATTACKER123', subscriptionId: 'sub_ABCDEFGH' };
        await expect(store.portalCustomer('Alice', false)).rejects.toThrow('MEMBERSHIP_UNAVAILABLE');
        result = { manageable: true, customerId: 'cus_ABCDEFGH',
            subscriptionId: 'sub_ABCDEFGH', livemode: false };
        expect(await store.portalCustomer('Alice', false)).toMatchObject({ customerId: 'cus_ABCDEFGH' });
        await expect(store.portalCustomer('Alice', true)).rejects.toThrow('MEMBERSHIP_UNAVAILABLE');
    });
});
