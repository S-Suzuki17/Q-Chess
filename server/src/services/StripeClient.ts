import Stripe from 'stripe';
import { QG_STRIPE_API_VERSION } from './StripeApiVersion';

/** One maintained SDK, schema and timeout for billing, portal and deletion. */
export function createStripeClient(key: string, request: typeof fetch = fetch): Stripe {
    return new Stripe(key, {
        apiVersion: QG_STRIPE_API_VERSION,
        httpClient: Stripe.createFetchHttpClient(request),
        timeout: 6000,
        maxNetworkRetries: 0, // Webhook/RPC retries preserve the application receipt.
        telemetry: false,
        appInfo: { name: 'Q-Gambit', version: '1', url: 'https://q-gambit.com' },
    });
}

function parameters(body: RequestInit['body']): Record<string, unknown> {
    if (!body) return {};
    const result: Record<string, unknown> = {};
    for (const [key, value] of new URLSearchParams(body as string)) {
        const segments = key.replaceAll(']', '').split('[');
        let parent = result;
        segments.forEach((segment, index) => {
            if (index === segments.length - 1) parent[segment] = value;
            else parent = (parent[segment] ??= {}) as Record<string, unknown>;
        });
    }
    return result;
}

/** Dispatch through typed SDK resources; fetch injection is only a test seam. */
export async function stripeRequest(client: Stripe, path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const url = new URL(`https://api.stripe.com/v1/${path}`);
    const parts = url.pathname.slice(4).split('/').map(decodeURIComponent);
    const method = init?.method ?? 'GET';
    const body = parameters(init?.body);
    const options: Stripe.RequestOptions = {};
    const idempotency = new Headers(init?.headers).get('Idempotency-Key');
    if (idempotency) options.idempotencyKey = idempotency;
    let data: unknown;
    if (parts[0] === 'prices' && parts[1]) data = await client.prices.retrieve(parts[1]);
    else if (parts[0] === 'subscriptions' && parts[1]) data = method === 'DELETE'
        ? await client.subscriptions.cancel(parts[1], { invoice_now: false, prorate: false })
        : await client.subscriptions.retrieve(parts[1]);
    else if (parts[0] === 'invoices' && parts[1]) data = await client.invoices.retrieve(parts[1]);
    else if (parts[0] === 'charges' && parts[1]) data = await client.charges.retrieve(parts[1]);
    else if (parts[0] === 'payment_intents' && parts[1]) data = await client.paymentIntents.retrieve(parts[1]);
    else if (parts[0] === 'invoice_payments') data = await client.invoicePayments.list({
        limit: 100, status: 'paid',
        ...(url.searchParams.has('invoice') ? { invoice: url.searchParams.get('invoice')! } : {}),
        ...(url.searchParams.has('payment[payment_intent]') ? { payment: {
            type: 'payment_intent', payment_intent: url.searchParams.get('payment[payment_intent]')!,
        } } : {}),
        ...(url.searchParams.has('starting_after') ? { starting_after: url.searchParams.get('starting_after')! } : {}),
    });
    else if (parts[0] === 'checkout' && parts[1] === 'sessions') {
        if (parts[3] === 'expire') data = await client.checkout.sessions.expire(parts[2]);
        else if (parts[3] === 'line_items') data = await client.checkout.sessions.listLineItems(parts[2], { limit: 2 });
        else if (parts[2]) data = await client.checkout.sessions.retrieve(parts[2]);
        else if (method === 'POST') data = await client.checkout.sessions.create(body as unknown as Stripe.Checkout.SessionCreateParams, options);
        else data = await client.checkout.sessions.list({ subscription: url.searchParams.get('subscription')!, limit: 100 });
    } else if (parts[0] === 'billing_portal' && parts[1] === 'configurations') {
        data = await client.billingPortal.configurations.list({ limit: 100 });
    } else if (parts[0] === 'billing_portal' && parts[1] === 'sessions' && method === 'POST') {
        data = await client.billingPortal.sessions.create(body as unknown as Stripe.BillingPortal.SessionCreateParams, options);
    } else throw new Error('UNSUPPORTED_STRIPE_RESOURCE');
    return data as unknown as Record<string, unknown>;
}
