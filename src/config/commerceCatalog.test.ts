import { expect, it } from 'vitest';
import { COMMERCE_PRODUCTS, commerceProductText, commercePaymentTerms, isCommerceSku } from './commerceCatalog';
it('keeps the exact approved display catalog independent of Stripe IDs', () => {
    expect(COMMERCE_PRODUCTS.map(p=>[p.sku,p.amount,p.hints])).toEqual([
        ['standard_monthly',300,0],['plus_monthly',600,10],['hints_1',100,1],['hints_13',1000,13],
        ['hints_27',2000,27],['hints_44',3000,44],['hints_77',5000,77],['hints_166',10000,166],
    ]);
    expect(isCommerceSku('__proto__')).toBe(false);expect(isCommerceSku('price_fake')).toBe(false);
    for(const p of COMMERCE_PRODUCTS) expect(commerceProductText(p,true)).toContain('USD');
});

it('distinguishes one-time payment from monthly renewal before checkout', () => {
    for (const product of COMMERCE_PRODUCTS) {
        const english = commercePaymentTerms(product), japanese = commercePaymentTerms(product, true);
        expect(english).toContain('Stripe Checkout'); expect(japanese).toContain('Stripe Checkout');
        if (product.kind === 'payment') {
            expect(english).toContain('Charged once at purchase. No automatic renewal.');
            expect(english).not.toContain('each monthly renewal');
            expect(japanese).toContain('1回だけ'); expect(japanese).not.toContain('毎月');
        } else {
            expect(english).toContain('each monthly renewal'); expect(english).toContain('Cancellation stops the next renewal');
            expect(japanese).toContain('毎月の更新'); expect(japanese).toContain('支払済み期間');
        }
    }
});
