import {COMMERCE_CATALOG,type CommerceSku} from './CommerceCatalog';

/** Proposed Play IDs. Not yet configured/active in Console; no price or client amount authority. */
export const PLAY_COMMERCE_PACKAGE='com.qgambit.app';
export const PLAY_COMMERCE_PRODUCTS=Object.freeze(Object.fromEntries(Object.values(COMMERCE_CATALOG).map(product=>[
    product.sku,Object.freeze({sku:product.sku,productId:'qg_'+product.sku,type:product.checkoutMode==='subscription'?'subs' as const:'inapp' as const,
        basePlanId:product.checkoutMode==='subscription'?'monthly':null,purchaseOptionId:product.checkoutMode==='payment'?'buy':null,hints:product.hintTickets}),
])) as Record<CommerceSku,Readonly<{sku:CommerceSku;productId:string;type:'subs'|'inapp';basePlanId:string|null;purchaseOptionId:string|null;hints:number}>>);
export const playCommerceProduct=(sku:unknown)=>typeof sku==='string'&&Object.hasOwn(PLAY_COMMERCE_PRODUCTS,sku)?PLAY_COMMERCE_PRODUCTS[sku as CommerceSku]:null;
