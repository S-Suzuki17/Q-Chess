/** Server-owned commercial terms. Never accept a Stripe Price or an amount from a client. */
export const COMMERCE_SKUS = Object.freeze([
    'standard_monthly', 'plus_monthly', 'hints_1', 'hints_13', 'hints_27',
    'hints_44', 'hints_77', 'hints_166',
] as const);
export type CommerceSku = typeof COMMERCE_SKUS[number];
/** Reviewed server configuration only. Never deserialize this from a checkout request. */
export interface CommerceCheckoutAuthority {
    readonly livemode: boolean;
    readonly products: Readonly<Partial<Record<CommerceSku, CommerceProduct>>>;
}
export interface CommerceProduct {
    readonly sku: CommerceSku | 'legacy_monthly';
    readonly priceId: string;
    readonly amount: number;
    readonly currency: 'usd';
    readonly taxBehavior: 'inclusive';
    readonly checkoutMode: 'subscription' | 'payment';
    readonly interval: 'month' | null;
    readonly intervalCount: 1 | null;
    readonly hintTickets: number;
}

function product(sku: CommerceProduct['sku'], priceId: string, amount: number,
    checkoutMode: CommerceProduct['checkoutMode'], hintTickets = 0): CommerceProduct {
    return Object.freeze({ sku, priceId, amount, currency: 'usd', taxBehavior: 'inclusive',
        checkoutMode, interval: checkoutMode === 'subscription' ? 'month' : null,
        intervalCount: checkoutMode === 'subscription' ? 1 : null, hintTickets });
}

export const COMMERCE_CATALOG: Readonly<Record<CommerceSku, CommerceProduct>> = Object.freeze({
    standard_monthly: product('standard_monthly', 'price_1UNTrJQWzwYDIuXWJn9XTiRW', 300, 'subscription'),
    plus_monthly: product('plus_monthly', 'price_1UNTrJQWzwYDIuXWtdNlAMnV', 600, 'subscription', 10),
    hints_1: product('hints_1', 'price_1UNTrQQWzwYDIuXWcVtcwG4E', 100, 'payment', 1),
    hints_13: product('hints_13', 'price_1UNTrQQWzwYDIuXWIV6hySm7', 1000, 'payment', 13),
    hints_27: product('hints_27', 'price_1UNTrWQWzwYDIuXWw5V6sXJ7', 2000, 'payment', 27),
    hints_44: product('hints_44', 'price_1UNTrWQWzwYDIuXWkZ8dH9QB', 3000, 'payment', 44),
    hints_77: product('hints_77', 'price_1UNTrbQWzwYDIuXWzhEumZF2', 5000, 'payment', 77),
    hints_166: product('hints_166', 'price_1UNTrcQWzwYDIuXWuZzJ38iY', 10000, 'payment', 166),
});

/** Existing subscriptions retain their original terms; this is not a public SKU. */
export const LEGACY_MEMBERSHIP_PRODUCT = product('legacy_monthly',
    'price_1ULM9fQWzwYDIuXWgs5Uj3yt', 299, 'subscription');

export function isCommerceSku(value: unknown): value is CommerceSku {
    return typeof value === 'string' && Object.hasOwn(COMMERCE_CATALOG, value);
}

/**
 * Source gate, deliberately independent of prices and environment sales flags.
 * Activation requires genuine provider canonical/risk/deletion proof plus
 * native live-only consumption/recovery proof on matching ledger SQL.
 * Sandbox sources stay test-only; verify the final integrated release artifact.
 */
export function readyCommerceSkus(): readonly CommerceSku[] { return COMMERCE_SKUS; }

/** Take an immutable mode-specific snapshot; an authority cannot change product terms. */
export function snapshotCommerceAuthority(authority: CommerceCheckoutAuthority, livemode: boolean): CommerceCheckoutAuthority {
    if (!authority || authority.livemode !== livemode || !authority.products || typeof authority.products !== 'object'
        || Array.isArray(authority.products)) throw new Error('COMMERCE_CATALOG_INVALID');
    const products: Partial<Record<CommerceSku, CommerceProduct>> = {};
    const prices = new Set<string>();
    for (const [sku, value] of Object.entries(authority.products)) {
        if (!isCommerceSku(sku) || !value || typeof value !== 'object'
            || typeof value.priceId !== 'string' || !/^price_[A-Za-z0-9]{8,200}$/.test(value.priceId)
            || value.priceId === LEGACY_MEMBERSHIP_PRODUCT.priceId || prices.has(value.priceId)) throw new Error('COMMERCE_CATALOG_INVALID');
        const expected = COMMERCE_CATALOG[sku];
        for (const key of ['sku','amount','currency','taxBehavior','checkoutMode','interval','intervalCount','hintTickets'] as const) {
            if (value[key] !== expected[key]) throw new Error('COMMERCE_CATALOG_INVALID');
        }
        products[sku] = Object.freeze({ ...expected, priceId: value.priceId });
        prices.add(value.priceId);
    }
    return Object.freeze({ livemode, products: Object.freeze(products) });
}

const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

/** Archived prices remain valid for already purchased historical entitlements. */
export function matchesCommercePrice(value: unknown, expected: CommerceProduct,
    livemode: boolean, requireActive = false): boolean {
    if (!object(value) || value.id !== expected.priceId || value.livemode !== livemode
        || (requireActive && value.active !== true) || value.currency !== expected.currency
        || value.unit_amount !== expected.amount || value.tax_behavior !== expected.taxBehavior
        // The pinned SDK materializes decimal fields as Decimal objects.
        || (value.unit_amount_decimal != null && String(value.unit_amount_decimal) !== String(expected.amount))) return false;
    if (expected.checkoutMode === 'payment') return value.type === 'one_time' && value.recurring === null;
    return value.type === 'recurring' && object(value.recurring)
        && value.recurring.interval === expected.interval && value.recurring.interval_count === expected.intervalCount
        && (value.recurring.usage_type === undefined || value.recurring.usage_type === 'licensed');
}

/** Mode-specific metadata avoids invalid mixed payment/subscription parameters. */
export function commerceCheckoutForm(expected: CommerceProduct, userId: string,
    successUrl: string, cancelUrl: string, automaticTax: boolean): URLSearchParams {
    const form = new URLSearchParams({
        mode: expected.checkoutMode,
        'line_items[0][price]': expected.priceId,
        'line_items[0][quantity]': '1',
        client_reference_id: userId,
        success_url: successUrl,
        cancel_url: cancelUrl,
        'metadata[qgambit_sku]': expected.sku,
        'automatic_tax[enabled]': String(automaticTax),
        'managed_payments[enabled]': 'false',
    });
    const metadata = expected.checkoutMode === 'subscription' ? 'subscription_data' : 'payment_intent_data';
    form.set(`${metadata}[metadata][qgambit_user_id]`, userId);
    form.set(`${metadata}[metadata][qgambit_sku]`, expected.sku);
    return form;
}
