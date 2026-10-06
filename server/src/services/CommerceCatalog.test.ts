import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMERCE_CATALOG, COMMERCE_SKUS, LEGACY_MEMBERSHIP_PRODUCT, commerceCheckoutForm,
    isCommerceSku, matchesCommercePrice, readyCommerceSkus, snapshotCommerceAuthority } from './CommerceCatalog';
import { StripeMembershipApi } from './StripeMembership';
import { commerceEvidenceFixture } from './fixtures/stripeCommerceEvidenceFixture.test';

afterEach(() => vi.unstubAllEnvs());

describe('server-owned commerce catalog (no real Stripe operations)', () => {
    it.each([false, true])('accepts an immutable reviewed catalog only for its exact mode (%s)', async livemode => {
        const f = commerceEvidenceFixture('hints_13', livemode, 0);
        const supplied = { ...COMMERCE_CATALOG.hints_13, priceId: f.intent.priceId };
        const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            const url = new URL(String(input));
            if (url.pathname === '/v1/checkout/sessions' && init?.method === 'POST') {
                expect(new URLSearchParams(String(init.body)).get('line_items[0][price]')).toBe(f.intent.priceId);
                return new Response(JSON.stringify({ ...f.checkout, status: 'open',
                    expires_at: Math.floor(Date.now() / 1000) + 3600,
                    url: `https://checkout.stripe.com/c/pay/${f.intent.checkoutId}` }), { status: 200 });
            }
            return f.request(input, init);
        });
        const config = { mode: livemode ? 'live' as const : 'test' as const, secretKey: f.config.secretKey,
            webhookSecret: f.secret, priceId: livemode ? LEGACY_MEMBERSHIP_PRODUCT.priceId : 'price_FIXTURELEGACY',
            successUrl: 'https://q-gambit.com/', cancelUrl: 'https://q-gambit.com/',
            automaticTaxEnabled: true, taxRegistrationConfirmed: true };
        const api = new StripeMembershipApi(config, request, { livemode, products: { hints_13: supplied } });
        supplied.priceId = 'price_MUTATEDAFTER';
        expect(api.availableCheckoutSkus()).toEqual(['hints_13']);
        expect(await api.createCheckout('Alice', 'hints_13')).toMatchObject({ priceId: f.intent.priceId });
        await expect(api.createCheckout('Alice', 'plus_monthly')).rejects.toThrow('SKU_NOT_READY');
        expect(() => new StripeMembershipApi(config, request, { livemode: !livemode, products: {} })).toThrow('COMMERCE_CATALOG_INVALID');
        expect(readyCommerceSkus()).toEqual([]);
    });
    it.each([{ amount: 999 }, { currency: 'eur' }, { hintTickets: 99 }, { taxBehavior: 'exclusive' },
        { interval: 'year' }, { checkoutMode: 'payment' }, { sku: 'plus_monthly' }, { priceId: LEGACY_MEMBERSHIP_PRODUCT.priceId }])(
        'rejects a reviewed-catalog injection that changes approved terms: %j', patch => {
            expect(() => snapshotCommerceAuthority({ livemode: false,
                products: { standard_monthly: { ...COMMERCE_CATALOG.standard_monthly, ...patch } as never } }, false)).toThrow();
        });
    it('binds each public SKU to one exact price, amount, mode and quantity', () => {
        expect(COMMERCE_SKUS).toEqual(['standard_monthly', 'plus_monthly', 'hints_1', 'hints_13',
            'hints_27', 'hints_44', 'hints_77', 'hints_166']);
        expect(COMMERCE_SKUS.map(sku => COMMERCE_CATALOG[sku].amount)).toEqual([300, 600, 100, 1000, 2000, 3000, 5000, 10000]);
        expect(COMMERCE_SKUS.map(sku => COMMERCE_CATALOG[sku].hintTickets)).toEqual([0, 10, 1, 13, 27, 44, 77, 166]);
        expect(new Set(Object.values(COMMERCE_CATALOG).map(value => value.priceId)).size).toBe(8);
        expect(Object.isFrozen(COMMERCE_CATALOG)).toBe(true);
        expect(Object.values(COMMERCE_CATALOG).every(Object.isFrozen)).toBe(true);
        expect(LEGACY_MEMBERSHIP_PRODUCT.amount).toBe(299);
        expect(isCommerceSku('legacy_monthly')).toBe(false);
    });

    it.each([null, undefined, 1, {}, [], 'constructor', '__proto__', 'hasOwnProperty',
        'price_1UNTrJQWzwYDIuXWJn9XTiRW', 'Standard_monthly', 'standard_monthly '])('rejects non-SKU input %j', value => {
        expect(isCommerceSku(value)).toBe(false);
    });

    for (const sku of COMMERCE_SKUS) {
        const product = COMMERCE_CATALOG[sku];
        for (const livemode of [true, false]) {
            const price = { id: product.priceId, livemode, active: true, currency: 'usd',
                unit_amount: product.amount, unit_amount_decimal: String(product.amount), tax_behavior: 'inclusive',
                type: product.checkoutMode === 'subscription' ? 'recurring' : 'one_time',
                recurring: product.interval ? { interval: 'month', interval_count: 1, usage_type: 'licensed' } : null };
            it(`${sku} verifies exact Price terms in ${livemode ? 'live' : 'test'} mode`, () => {
                expect(matchesCommercePrice(price, product, livemode, true)).toBe(true);
                for (const patch of [{ id: LEGACY_MEMBERSHIP_PRODUCT.priceId }, { livemode: !livemode },
                    { active: false }, { currency: 'jpy' }, { unit_amount: product.amount + 1 },
                    { unit_amount: 299 }, { unit_amount_decimal: String(product.amount + 1) },
                    { tax_behavior: 'exclusive' }, { recurring: { interval: 'year', interval_count: 1 } },
                    { recurring: { interval: 'month', interval_count: 2 } },
                    { recurring: { interval: 'month', interval_count: 1, usage_type: 'metered' } },
                    { type: product.checkoutMode === 'subscription' ? 'one_time' : 'recurring' }]) {
                    expect(matchesCommercePrice({ ...price, ...patch }, product, livemode, true), JSON.stringify(patch)).toBe(false);
                }
            });
        }
        it(`${sku} sends only its payment mode's metadata`, () => {
            const form = commerceCheckoutForm(product, 'Alice', 'https://q-gambit.com/', 'https://q-gambit.com/', false);
            expect(form.get('mode')).toBe(product.checkoutMode);
            expect(form.get('line_items[0][price]')).toBe(product.priceId);
            expect(form.get('line_items[0][quantity]')).toBe('1');
            expect(form.get('metadata[qgambit_sku]')).toBe(sku);
            expect(form.get('automatic_tax[enabled]')).toBe('false');
            expect(form.get('managed_payments[enabled]')).toBe('false');
            const target = product.checkoutMode === 'payment' ? 'payment_intent_data' : 'subscription_data';
            const other = product.checkoutMode === 'payment' ? 'subscription_data' : 'payment_intent_data';
            expect(form.get(`${target}[metadata][qgambit_user_id]`)).toBe('Alice');
            expect(form.get(`${target}[metadata][qgambit_sku]`)).toBe(sku);
            expect([...form.keys()].some(key => key.startsWith(other))).toBe(false);
        });
    }

    it('keeps all new sales closed independently of legacy sales flags and known live IDs', async () => {
        vi.stubEnv('STRIPE_MEMBERSHIP_CHECKOUT_ENABLED', 'true');
        vi.stubEnv('STRIPE_MEMBERSHIP_PORTAL_ENABLED', 'true');
        const request = vi.fn();
        const api = new StripeMembershipApi({ mode: 'live', secretKey: 'sk_live_FAKEKEY12345',
            webhookSecret: 'whsec_FAKESECRET12345', priceId: LEGACY_MEMBERSHIP_PRODUCT.priceId,
            successUrl: 'https://q-gambit.com/', cancelUrl: 'https://q-gambit.com/' }, request);
        expect(readyCommerceSkus()).toEqual([]);
        expect(api.availableCheckoutSkus()).toEqual([]);
        for (const sku of COMMERCE_SKUS) await expect(api.createCheckout('Alice', sku)).rejects.toThrow('SKU_NOT_READY');
        await expect(api.createCheckout('Alice', COMMERCE_CATALOG.hints_1.priceId as never)).rejects.toThrow('INVALID_SKU');
        expect(request).not.toHaveBeenCalled();
    });
});
