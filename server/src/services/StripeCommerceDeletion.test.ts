import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { COMMERCE_CATALOG } from './CommerceCatalog';
import { createStripeCancellationGuard, createStripeDeletionLinkSource } from './StripeCancellation';
import { cancelStripeCommerceCheckouts, createStripeCommerceDeletionLinkSource, createStripeRetireCommerceCheckouts,
    type CommerceDeletionIntent } from './StripeCommerceDeletion';

const key = { test: 'sk_test_DeletionFixture123' };
function fixture(fulfilled = false) {
    const intent: CommerceDeletionIntent = { checkoutId: 'cs_test_DeletePending123', userId: 'Alice',
        sku: 'hints_13', priceId: 'price_DeletePending123', amountTotal: 1000, currency: 'usd', livemode: false, fulfilled };
    const session = { id: intent.checkoutId, livemode: false, client_reference_id: 'Alice', mode: 'payment',
        subscription: null, customer: null, metadata: { qgambit_sku: 'hints_13' }, amount_total: 1000,
        currency: 'usd', status: fulfilled ? 'complete' : 'open', payment_status: fulfilled ? 'paid' : 'unpaid',
        payment_intent: fulfilled ? 'pi_DeletePending123' : null as string | null };
    const payment = { id: 'pi_DeletePending123', livemode: false, amount: 1000, amount_received: 1000,
        amount_capturable: 0, currency: 'usd', status: 'succeeded', customer: null,
        metadata: { qgambit_user_id: 'Alice', qgambit_sku: 'hints_13' } };
    const price = { id: intent.priceId, livemode: false, type: 'one_time', recurring: null, unit_amount: 1000,
        currency: 'usd', tax_behavior: 'inclusive' };
    const lines = { data: [{ quantity: 1, price }], has_more: false };
    const retire = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith('/line_items')) return Response.json(lines);
        if (path.includes('/payment_intents/')) return Response.json(payment);
        if (path.endsWith('/expire')) {
            expect(init?.method).toBe('POST'); session.status = 'expired';
        }
        return Response.json(session);
    });
    const run = () => cancelStripeCommerceCheckouts('Alice', [intent], key, request, retire);
    return { intent, session, payment, price, lines, retire, request, run };
}
function clientFixture(rows: Record<string, any[]> = {}, overrides: Record<string, any> = {}) {
    const from = vi.fn((table: string) => {
        const query = { select: vi.fn(() => query), eq: vi.fn(() => query), limit: vi.fn(() => query),
            abortSignal: vi.fn(async () => ({ data: rows[table] ?? [], error: null,
                count: (rows[table] ?? []).length, ...overrides[table] })) };
        return query;
    });
    const rpc = vi.fn(() => ({ abortSignal: vi.fn(async () => ({ data: 1, error: null })) }));
    return { from, rpc, client: { from, rpc } as unknown as SupabaseClient };
}
const row = (f: ReturnType<typeof fixture>) => ({ checkout_id: f.intent.checkoutId, user_id: 'Alice',
    sku: f.intent.sku, price_id: f.intent.priceId, amount_total: f.intent.amountTotal, currency: 'usd', livemode: false });

describe('one-time Stripe cancellation before erasure', () => {
    it('expires an owned unpaid Checkout, verifies it by fresh GET, then persists anonymous retirement', async () => {
        const f = fixture(); await f.run();
        expect(f.request.mock.calls.map(([url, init]) => [new URL(String(url)).pathname, init?.method ?? 'GET']))
            .toEqual([['/v1/checkout/sessions/' + f.intent.checkoutId, 'GET'],
                ['/v1/checkout/sessions/' + f.intent.checkoutId + '/line_items', 'GET'],
                ['/v1/checkout/sessions/' + f.intent.checkoutId + '/expire', 'POST'],
                ['/v1/checkout/sessions/' + f.intent.checkoutId, 'GET']]);
        expect(f.retire).toHaveBeenCalledExactlyOnceWith('Alice', [
            { checkoutId: f.intent.checkoutId, livemode: false, terminalState: 'expired' }]);
        expect(f.request.mock.invocationCallOrder.at(-1)).toBeLessThan(f.retire.mock.invocationCallOrder[0]);
    });
    it('retires an already paid, fulfilled purchase without requesting subscription cancellation or refund', async () => {
        const f = fixture(true); await f.run();
        expect(f.retire).toHaveBeenCalledExactlyOnceWith('Alice', [
            { checkoutId: f.intent.checkoutId, livemode: false, terminalState: 'completed_paid' }]);
        expect(f.request.mock.calls.every(([,init]) => (init?.method ?? 'GET') === 'GET')).toBe(true);
    });
    it('keeps paid-but-unfulfilled settlement unresolved instead of inventing credit or a refund policy', async () => {
        const f = fixture(true); f.intent.fulfilled = false;
        await expect(f.run()).rejects.toThrow('UNAVAILABLE'); expect(f.retire).not.toHaveBeenCalled();
    });
    it('fails closed when payment wins an expiry race but has not been fulfilled', async () => {
        const f = fixture(); const request = f.request.getMockImplementation()!;
        f.request.mockImplementation(async (input, init) => {
            if (String(input).endsWith('/expire')) {
                f.session.status = 'complete'; f.session.payment_status = 'paid';
                f.session.payment_intent = f.payment.id;
                return Response.json({ error: { message: 'Already completed', type: 'invalid_request_error' } }, { status: 400 });
            }
            return request(input, init);
        });
        await expect(f.run()).rejects.toThrow('UNAVAILABLE'); expect(f.retire).not.toHaveBeenCalled();
        expect(f.request.mock.calls.filter(([url]) => String(url).endsWith(f.intent.checkoutId))).toHaveLength(2);
    });
    it('allows verified expired sessions with a canceled unpaid PaymentIntent', async () => {
        const f = fixture(); f.session.status = 'expired'; f.session.payment_intent = f.payment.id;
        f.payment.status = 'canceled'; f.payment.amount_received = 0;
        await f.run(); expect(f.retire).toHaveBeenCalledOnce();
    });
    it.each(['open', 'processing', 'requires_action', 'requires_capture', 'requires_payment_method', 'requires_confirmation'])('does not retire a %s PaymentIntent', async status => {
        const f = fixture(true); f.payment.status = status;
        await expect(f.run()).rejects.toThrow('UNAVAILABLE'); expect(f.retire).not.toHaveBeenCalled();
    });
    it.each([
        ['foreign owner', (f: ReturnType<typeof fixture>) => { f.session.client_reference_id = 'Bob'; }],
        ['foreign mode', (f: ReturnType<typeof fixture>) => { f.session.livemode = true; }],
        ['foreign checkout', (f: ReturnType<typeof fixture>) => { f.session.id = 'cs_test_ForeignDelete123'; }],
        ['wrong SKU', (f: ReturnType<typeof fixture>) => { f.session.metadata.qgambit_sku = 'hints_27'; }],
        ['wrong price', (f: ReturnType<typeof fixture>) => { f.price.id = 'price_ForeignDelete123'; }],
        ['wrong amount', (f: ReturnType<typeof fixture>) => { f.session.amount_total = 999; }],
        ['multiple line items', (f: ReturnType<typeof fixture>) => { f.lines.data.push(f.lines.data[0]); }],
        ['incomplete inventory', (f: ReturnType<typeof fixture>) => { f.lines.has_more = true; }],
    ])('rejects %s before mutating a Checkout', async (_name, change) => {
        const f = fixture(); change(f);
        await expect(f.run()).rejects.toThrow('UNAVAILABLE'); expect(f.retire).not.toHaveBeenCalled();
        expect(f.request.mock.calls.every(([,init]) => (init?.method ?? 'GET') === 'GET')).toBe(true);
    });
    it.each([
        ['PI owner', (f: ReturnType<typeof fixture>) => { f.payment.metadata.qgambit_user_id = 'Bob'; }],
        ['PI mode', (f: ReturnType<typeof fixture>) => { f.payment.livemode = true; }],
        ['PI amount', (f: ReturnType<typeof fixture>) => { f.payment.amount_received = 999; }],
        ['PI capture', (f: ReturnType<typeof fixture>) => { f.payment.amount_capturable = 1; }],
        ['unpaid complete', (f: ReturnType<typeof fixture>) => { f.session.payment_status = 'unpaid'; }],
    ])('keeps erasure blocked for %s', async (_name, change) => {
        const f = fixture(true); change(f);
        await expect(f.run()).rejects.toThrow('UNAVAILABLE'); expect(f.retire).not.toHaveBeenCalled();
    });
    it('does not accept an unverified expire response if GET still says open', async () => {
        const f = fixture(); const request = f.request.getMockImplementation()!;
        f.request.mockImplementation(async (input, init) => String(input).endsWith('/expire')
            ? Response.json({ ...f.session, status: 'expired' }) : request(input, init));
        await expect(f.run()).rejects.toThrow('UNAVAILABLE'); expect(f.retire).not.toHaveBeenCalled();
    });
    it('keeps erasure blocked when retirement fails after verified external expiry', async () => {
        const f = fixture(); f.retire.mockRejectedValue(new Error('DB unavailable'));
        await expect(f.run()).rejects.toThrow('DB unavailable'); expect(f.session.status).toBe('expired');
    });
    it('composes the complete commerce inventory with the existing account guard explicitly', async () => {
        const f = fixture(); const retireSubscriptions = vi.fn().mockResolvedValue(undefined);
        const source = async () => ({ intents: [], memberships: [], commerce: [f.intent] });
        await createStripeCancellationGuard(source, key, f.request, retireSubscriptions,
            { releaseEnabled: true, retire: f.retire })('Alice');
        expect(f.retire).toHaveBeenCalledOnce(); expect(retireSubscriptions).not.toHaveBeenCalled();
        await expect(createStripeCancellationGuard(source, key, f.request, retireSubscriptions)('Alice')).rejects.toThrow('UNAVAILABLE');
    });
    it('cannot silently use an empty legacy inventory with the commerce option enabled', async () => {
        const f = fixture();
        await expect(createStripeCancellationGuard(async () => ({ intents: [], memberships: [] }), key, f.request,
            vi.fn(), { releaseEnabled: true, retire: f.retire })('Alice')).rejects.toThrow('UNAVAILABLE');
        expect(f.request).not.toHaveBeenCalled(); expect(f.retire).not.toHaveBeenCalled();
    });
});

describe('commerce deletion inventory and adapter', () => {
    it('explicitly closed legacy inventory never touches pending commerce tables or protocol RPC', async () => {
        const f = clientFixture(); await expect(createStripeDeletionLinkSource(f.client, false)('Alice')).resolves.toEqual({ intents: [], memberships: [] });
        expect(f.from.mock.calls.map(([table]) => table)).toEqual(['stripe_checkout_intents','stripe_memberships']);
        expect(f.rpc).not.toHaveBeenCalled();
    });
    it('includes one-time intents in the released default inventory', async () => {
        const purchase = fixture(), f = clientFixture({ stripe_commerce_checkout_intents: [row(purchase)] });
        await expect(createStripeDeletionLinkSource(f.client)('Alice')).resolves.toEqual({
            intents: [], memberships: [], commerce: [purchase.intent],
        });
        expect(f.rpc).toHaveBeenCalledWith('stripe_commerce_deletion_protocol_version');
    });
    it('requires the forward protocol before querying commerce inventory', async () => {
        const f = clientFixture(); f.rpc.mockReturnValue({ abortSignal: vi.fn(async () => ({ data: 0, error: null })) });
        await expect(createStripeCommerceDeletionLinkSource(f.client)('Alice')).rejects.toThrow('UNAVAILABLE');
        expect(f.from).not.toHaveBeenCalled();
    });
    it('separates payment inventory from subscription duplication and attaches only real purchase rows', async () => {
        const f = fixture(), sub = { ...row(f), checkout_id: 'cs_test_DeleteSubscription123', sku: 'plus_monthly',
            price_id: 'price_DeleteSubscription123', amount_total: COMMERCE_CATALOG.plus_monthly.amount };
        const c = clientFixture({ stripe_commerce_checkout_intents: [row(f), sub],
            stripe_one_time_purchases: [{ checkout_id: f.intent.checkoutId, user_id: 'Alice', livemode: false }] });
        await expect(createStripeCommerceDeletionLinkSource(c.client)('Alice')).resolves.toEqual([{ ...f.intent, fulfilled: true }]);
    });
    it.each(['count mismatch','foreign binding','wrong purchase mode','missing purchase intent'])('rejects %s', async change => {
        const f = fixture(), r = row(f), rows: Record<string, any[]> = { stripe_commerce_checkout_intents: [r] };
        const overrides: Record<string, any> = {};
        if (change === 'count mismatch') overrides.stripe_commerce_checkout_intents = { count: 2 };
        if (change === 'foreign binding') r.user_id = 'Bob';
        if (change === 'wrong purchase mode') rows.stripe_one_time_purchases = [{ checkout_id: f.intent.checkoutId, user_id: 'Alice', livemode: true }];
        if (change === 'missing purchase intent') rows.stripe_one_time_purchases = [{ checkout_id: 'cs_test_UnboundDelete123', user_id: 'Alice', livemode: false }];
        const c = clientFixture(rows, overrides);
        await expect(createStripeCommerceDeletionLinkSource(c.client)('Alice')).rejects.toThrow('UNAVAILABLE');
    });
    it('sends terminal identifiers only to the new RPC and propagates failure', async () => {
        const c = clientFixture(), data = [{ checkoutId: 'cs_test_DeletePending123', livemode: false, terminalState: 'expired' as const }];
        await createStripeRetireCommerceCheckouts(c.client)('Alice', data);
        expect(c.rpc).toHaveBeenCalledExactlyOnceWith('retire_stripe_commerce_account_checkouts', { p_user_id: 'Alice', p_checkouts: data });
        c.rpc.mockReturnValue({ abortSignal: vi.fn(async () => ({ data: null, error: new Error('unavailable') })) } as any);
        await expect(createStripeRetireCommerceCheckouts(c.client)('Alice', data)).rejects.toThrow('UNAVAILABLE');
    });
});
