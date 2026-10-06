import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createStripeCommerceStore, parseCommerceCheckoutIntent } from './StripeCommerceStore';
import { commerceEvidenceFixture } from './fixtures/stripeCommerceEvidenceFixture.test';

function fixture() {
    const f = commerceEvidenceFixture('hints_13');
    const row = { checkout_id: f.intent.checkoutId, user_id: 'Alice', sku: f.sku, price_id: f.intent.priceId,
        amount_total: f.intent.amountTotal, currency: 'usd', livemode: false };
    const results: { data: unknown; error: unknown }[] = [];
    const eq = vi.fn(); const abortSignal = vi.fn();
    const query = { select: vi.fn(), eq, abortSignal, maybeSingle: vi.fn(async () => results.shift()) };
    query.select.mockReturnValue(query); eq.mockReturnValue(query); abortSignal.mockReturnValue(query);
    const from = vi.fn((_table: string) => query);
    const rpc = vi.fn(() => ({ abortSignal: vi.fn(async () => results.shift()) }));
    const store = createStripeCommerceStore({ from, rpc } as unknown as SupabaseClient, f.store);
    return { ...f, row, results, from, rpc, eq, abortSignal, subject: store };
}
describe('new commerce DB adapter fails closed', () => {
    it('registers the complete server-owned SKU contract with the atomic commerce RPC', async () => {
        const f = fixture(); const expiresAt = new Date(Date.now() + 3600_000).toISOString();
        f.results.push({ data: null, error: null });
        await f.subject.registerCheckoutIntent(f.intent, expiresAt);
        expect(f.rpc).toHaveBeenCalledExactlyOnceWith('register_stripe_commerce_checkout_intent', {
            p_user_id: 'Alice', p_checkout_id: f.intent.checkoutId, p_sku: 'hints_13',
            p_price_id: f.intent.priceId, p_amount_total: 1000, p_currency: 'usd',
            p_livemode: false, p_expires_at: expiresAt,
        });
        f.results.push({ data: null, error: new Error('ownership collision') });
        await expect(f.subject.registerCheckoutIntent(f.intent, expiresAt)).rejects.toThrow('COMMERCE_STORE_UNAVAILABLE');
    });
    it('rejects malformed registration without touching the database', async () => {
        const f = fixture(); const expiry = new Date(Date.now() + 3600_000).toISOString();
        await expect(f.subject.registerCheckoutIntent({ ...f.intent, amountTotal: 1 }, expiry)).rejects.toThrow();
        await expect(f.subject.registerCheckoutIntent(f.intent, '2000-01-01')).rejects.toThrow();
        expect(f.rpc).not.toHaveBeenCalled();
    });
    it('reads and validates stored intent and its mode-specific reviewed binding', async () => {
        const f = fixture(); f.results.push({ data: f.row, error: null },
            { data: { sku: f.sku, price_id: f.intent.priceId, livemode: false }, error: null });
        await expect(f.subject.checkoutIntent(f.intent.checkoutId, false)).resolves.toEqual(f.intent);
        expect(f.from.mock.calls.map(call => call[0])).toEqual(['stripe_commerce_checkout_intents','stripe_commerce_price_bindings']);
        expect(f.eq).toHaveBeenCalledWith('livemode', false);
        expect(f.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    });
    it('returns null only for an absent intent, never for a DB error', async () => {
        const f = fixture(); f.results.push({ data: null, error: null });
        await expect(f.subject.checkoutIntent(f.intent.checkoutId, false)).resolves.toBeNull();
        f.results.push({ data: null, error: new Error('timeout') });
        await expect(f.subject.checkoutIntent(f.intent.checkoutId, false)).rejects.toThrow('COMMERCE_STORE_UNAVAILABLE');
    });
    it.each([{ amount_total: 999 },{ user_id: ' Alice' },{ user_id: '' },{ user_id: 'A\nB' },
        { sku: '__proto__' },{ sku: 'legacy_monthly' },{ currency: 'eur' },{ livemode: true },{ price_id: 'custom' }])(
        'rejects inconsistent stored row %j', patch => {
            const f = fixture(); expect(() => parseCommerceCheckoutIntent({ ...f.row, ...patch }, f.intent.checkoutId, false)).toThrow();
        });
    it.each([null, { sku: 'hints_13', price_id: 'price_DIFFERENT', livemode: false },
        { sku: 'hints_13', price_id: 'price_FIXTURECOMMERCE', livemode: true }])('rejects absent/mismatched reviewed binding %j', async binding => {
        const f = fixture(); f.results.push({ data: f.row, error: null }, { data: binding, error: null });
        await expect(f.subject.checkoutIntent(f.intent.checkoutId, false)).rejects.toThrow();
    });
    it('uses one atomic RPC and surfaces database errors for retry', async () => {
        const f = fixture(); const evidence = { ...f.intent, eventId: 'evt_FIXTURECOMMERCE', payloadHash: 'a'.repeat(64), paymentStatus: 'paid' as const };
        f.results.push({ data: { applied: true, duplicate: false, credited: 13 }, error: null });
        await expect(f.subject.fulfillOneTime(evidence)).resolves.toEqual({ applied: true, duplicate: false, credited: 13 });
        expect(f.rpc).toHaveBeenCalledWith('fulfill_stripe_commerce_one_time', { p_evidence: evidence });
        f.results.push({ data: null, error: new Error('rollback') });
        await expect(f.subject.fulfillOneTime(evidence)).rejects.toThrow('COMMERCE_STORE_UNAVAILABLE');
    });
    it.each([null, {}, { applied: true, duplicate: true, credited: 10 },{ applied: true, duplicate: false, credited: -1 },
        { applied: false, duplicate: false, credited: 0 },{ applied: true, duplicate: false, credited: 10 },
        { applied: false, duplicate: true, credited: 10 },{ applied: true, duplicate: false, credited: 1.2 },
        { applied: true, duplicate: false, credited: 167 },{ applied: true, duplicate: false, credited: 10, retired: true }])(
        'rejects malformed atomic result %j', async data => {
            const f = fixture(); f.results.push({ data, error: null });
            await expect(f.subject.fulfillOneTime({ ...f.intent, eventId: 'evt_FIXTURECOMMERCE', payloadHash: 'a'.repeat(64), paymentStatus: 'paid' })).rejects.toThrow();
        });
    it('does not swallow a current-terms lookup error', async () => {
        const f = fixture(); f.results.push({ data: null, error: new Error('db') });
        await expect(f.subject.hasCurrentTerms('Alice')).rejects.toThrow('TERMS_UNAVAILABLE');
    });
});
