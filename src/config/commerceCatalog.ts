/** Display-only product catalog. The server owns price IDs, fulfillment and release readiness. */
export const COMMERCE_PRODUCTS = [
    { sku: 'standard_monthly', amount: 300, kind: 'subscription', hints: 0 },
    { sku: 'plus_monthly', amount: 600, kind: 'subscription', hints: 10 },
    { sku: 'hints_1', amount: 100, kind: 'payment', hints: 1 },
    { sku: 'hints_13', amount: 1000, kind: 'payment', hints: 13 },
    { sku: 'hints_27', amount: 2000, kind: 'payment', hints: 27 },
    { sku: 'hints_44', amount: 3000, kind: 'payment', hints: 44 },
    { sku: 'hints_77', amount: 5000, kind: 'payment', hints: 77 },
    { sku: 'hints_166', amount: 10000, kind: 'payment', hints: 166 },
] as const;
export type CommerceSku = typeof COMMERCE_PRODUCTS[number]['sku'];
export type CommerceProduct = typeof COMMERCE_PRODUCTS[number];
export function isCommerceSku(value: unknown): value is CommerceSku {
    return typeof value === 'string' && COMMERCE_PRODUCTS.some(product => product.sku === value);
}
export function commerceProductText(product: CommerceProduct, japanese = false) {
    const total = `USD $${(product.amount / 100).toFixed(2)}`;
    if (product.kind === 'payment') return japanese
        ? `QUBEヒント ${product.hints}枚 · ${total}（1回払い）`
        : `${product.hints} QUBE hints · ${total} (one-time)`;
    const name = product.sku === 'plus_monthly' ? 'Plus' : 'Standard';
    return japanese ? `${name} · 月額総額 ${total}（税込）` : `${name} · ${total}/month total, tax included`;
}
export function commerceProductBenefits(product: CommerceProduct, japanese = false) {
    if (product.kind === 'payment') return japanese ? 'CPU練習で使えるヒント。自動更新はありません。' : 'Hints for CPU practice. No automatic renewal.';
    const base = japanese ? 'オンライン・ランク戦が無制限、広告なし。' : 'Unlimited online and ranked matches, no ads.';
    return base + (product.hints ? (japanese ? '支払済みの購読期間ごとにヒント10枚。' : ' 10 hints per paid monthly subscription period.') : '');
}
