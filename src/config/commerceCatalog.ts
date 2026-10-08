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
    if (product.kind === 'payment') return japanese ? '練習以外の対局で1回につきヒント券1枚を使用します。練習・チュートリアルのヒントは無料です。自動更新はありません。' : 'Use 1 hint ticket per hint outside practice. Practice and tutorial hints are free. No automatic renewal.';
    const base = japanese ? 'オンライン・ランク戦が無制限、広告なし。' : 'Unlimited online and ranked matches, no ads.';
    return base + (product.hints ? (japanese ? '支払済みの購読期間ごとにヒント10枚。' : ' 10 hints per paid monthly subscription period.') : '');
}

export function commercePaymentTerms(product: CommerceProduct, japanese = false) {
    const methods = japanese
        ? '支払方法はStripe Checkoutに表示します。為替換算・カード会社手数料が発生する場合があります。'
        : 'Payment methods are shown at Stripe Checkout. Currency conversion and card-provider fees may apply. ';
    const schedule = product.kind === 'payment'
        ? (japanese ? '購入時に1回だけ請求します。自動更新はありません。' : 'Charged once at purchase. No automatic renewal.')
        : (japanese ? '初回購入時と毎月の更新時に請求します。解約すると次回の更新を停止し、支払済み期間の終了まで利用できます。'
            : 'Charged at purchase and each monthly renewal. Cancellation stops the next renewal; access continues through the paid period.');
    return methods + schedule;
}
