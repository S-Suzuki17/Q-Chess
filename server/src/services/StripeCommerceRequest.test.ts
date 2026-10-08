import { describe, expect, it, vi } from 'vitest';
import { createStripeClient, stripeRequest } from './StripeClient';
import { QG_STRIPE_API_VERSION } from './StripeApiVersion';

/** Tests the actual SDK serializer over a local fake fetch, never a Stripe account. */
function transport() {
    const request = vi.fn(async () => new Response(JSON.stringify({ object: 'list', data: [], has_more: false }), {
        status: 200, headers: { 'content-type': 'application/json' },
    }));
    const client = createStripeClient('sk_test_LOCAL_FIXTURE_ONLY', request);
    return { request, client };
}

describe('canonical commerce SDK request scope', () => {
    it.each([
        ['subscription', 'sub_FIXTURECOMMERCE'],
        ['payment_intent', 'pi_FIXTURECOMMERCE'],
    ])('preserves the %s selector through the actual SDK', async (selector, id) => {
        const { client, request } = transport();
        await stripeRequest(client, `checkout/sessions?${selector}=${id}&limit=100`);
        expect(request).toHaveBeenCalledOnce();
        const [input, init] = request.mock.calls[0] as unknown as [string, RequestInit];
        const url = new URL(input);
        expect(url.origin).toBe('https://api.stripe.com');
        expect(url.pathname).toBe('/v1/checkout/sessions');
        expect(Object.fromEntries(url.searchParams)).toEqual({ [selector]: id, limit: '100' });
        expect(init.method).toBe('GET');
        expect(new Headers(init.headers).get('stripe-version')).toBe(QG_STRIPE_API_VERSION);
    });

    it.each([
        'checkout/sessions',
        'checkout/sessions?subscription=',
        'checkout/sessions?payment_intent=',
        'checkout/sessions?subscription=sub_FIXTURECOMMERCE&payment_intent=pi_FIXTURECOMMERCE',
    ])('rejects missing or ambiguous selectors without an unscoped request: %s', async path => {
        const { client, request } = transport();
        await expect(stripeRequest(client, path)).rejects.toThrow('STRIPE_CHECKOUT_SELECTOR_REQUIRED');
        expect(request).not.toHaveBeenCalled();
    });

    it('can retrieve canonical credit-note evidence used by risk routing', async () => {
        const { client, request } = transport();
        await stripeRequest(client, 'credit_notes/cn_FIXTURECOMMERCE');
        expect(request).toHaveBeenCalledOnce();
        const [input, init] = request.mock.calls[0] as unknown as [string, RequestInit];
        expect(new URL(input).pathname).toBe('/v1/credit_notes/cn_FIXTURECOMMERCE');
        expect(init.method).toBe('GET');
    });
    it.each(['refunds','disputes','radar/early_fraud_warnings'])('scopes %s lists to the exact charge and permits GET only', async resource => {
        const { client, request } = transport();
        await stripeRequest(client, `${resource}?charge=ch_FIXTURECOMMERCE&limit=100`);
        const [input, init] = request.mock.calls[0] as unknown as [string, RequestInit];
        expect(new URL(input).pathname).toBe(`/v1/${resource}`);
        expect(Object.fromEntries(new URL(input).searchParams)).toEqual({ charge: 'ch_FIXTURECOMMERCE', limit: '100' });
        expect(init.method).toBe('GET');
        await expect(stripeRequest(client, resource)).rejects.toThrow('STRIPE_CHARGE_SELECTOR_REQUIRED');
        await expect(stripeRequest(client, `${resource}?charge=`)).rejects.toThrow('STRIPE_CHARGE_SELECTOR_REQUIRED');
        await expect(stripeRequest(client, `${resource}?charge=ch_FIXTURECOMMERCE`, { method: 'POST' })).rejects.toThrow('STRIPE_RISK_READ_ONLY');
        expect(request).toHaveBeenCalledOnce();
    });
    it.each([['refunds','re_FIXTURECOMMERCE'],['disputes','dp_FIXTURECOMMERCE'],
        ['radar/early_fraud_warnings','issfr_FIXTURECOMMERCE']])('retrieves %s canonical evidence without writes', async (resource, id) => {
        const { client, request } = transport();
        await stripeRequest(client, `${resource}/${id}`);
        const [input, init] = request.mock.calls[0] as unknown as [string, RequestInit];
        expect(new URL(input).pathname).toBe(`/v1/${resource}/${id}`);
        expect(init.method).toBe('GET');
        await expect(stripeRequest(client, `${resource}/${id}`, { method: 'DELETE' })).rejects.toThrow('STRIPE_RISK_READ_ONLY');
        expect(request).toHaveBeenCalledOnce();
    });

});
