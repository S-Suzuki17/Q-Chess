import {describe,it,expect} from 'vitest';
import {parsePlayCommerceProof,playCommerceAccountId,playCommerceReceiptHash} from './PlayCommerceProof';
import {PLAY_COMMERCE_PRODUCTS} from './PlayCommerceCatalog';
const account='a'.repeat(64),intent='b'.repeat(64),now=Date.parse('2026-10-13T00:00:00Z');
const hint=()=>({productLineItem:[{productId:'qg_hints_13',productOfferDetails:{quantity:1,purchaseOptionId:'buy',refundableQuantity:1,consumptionState:'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'}}],purchaseStateContext:{purchaseState:'PURCHASED'},orderId:'GPA.1234-5678-9012-34567',obfuscatedExternalAccountId:account,obfuscatedExternalProfileId:intent,purchaseCompletionTime:'2026-10-12T00:00:00Z',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING'});
const sub=()=>({lineItems:[{productId:'qg_plus_monthly',expiryTime:'2026-11-12T00:00:00Z',latestSuccessfulOrderId:'GPA.1234-5678-9012-34567..0',autoRenewingPlan:{autoRenewEnabled:true},offerDetails:{basePlanId:'monthly'}}],externalAccountIdentifiers:{obfuscatedExternalAccountId:account,obfuscatedExternalProfileId:intent},subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING'});
describe('canonical Play proof (no network or credential)',()=>{
    it('retains the existing eight SKU quantities; Play IDs are proposed, not prices',()=>{
        expect(Object.values(PLAY_COMMERCE_PRODUCTS).map(p=>p.hints)).toEqual([0,10,1,13,27,44,77,166]);
        expect(Object.values(PLAY_COMMERCE_PRODUCTS).every(p=>!Object.hasOwn(p,'price'))).toBe(true);
    });
    it('requires a random account generation, distinguishes recreated accounts and namespaces tokens',()=>{
        expect(()=>playCommerceAccountId('Alice')).toThrow();
        expect(playCommerceAccountId('11111111-1111-4111-8111-111111111111')).not.toBe(playCommerceAccountId('22222222-2222-4222-8222-222222222222'));
        expect(playCommerceReceiptHash('fixture-token-without-secrets')).toHaveLength(64);
    });
    it('normalizes a paid one-time canonical purchase without trusting client credit',()=>{expect(parsePlayCommerceProof('hints_13',hint(),now)).toMatchObject({hints:13,orderId:'GPA.1234-5678-9012-34567',accountId:account,intentId:intent,test:false,consumed:false});});
    it.each(['PENDING','CANCELLED'])('%s has no purchased hints',state=>{const value=hint();value.purchaseStateContext.purchaseState=state;expect(parsePlayCommerceProof('hints_13',value,now).hints).toBe(0);});
    it('consumed proof is marked so the store can reject minting an unseen token',()=>{const value=hint();value.productLineItem[0].productOfferDetails.consumptionState='CONSUMPTION_STATE_CONSUMED';expect(parsePlayCommerceProof('hints_13',value,now).consumed).toBe(true);});
    it('rejects quantity/product/option changes, missing binding and unknown consumption state',()=>{
        for(const change of [(v:ReturnType<typeof hint>)=>v.productLineItem[0].productOfferDetails.quantity=2,(v:ReturnType<typeof hint>)=>v.productLineItem[0].productId='qg_hints_166',(v:ReturnType<typeof hint>)=>v.productLineItem[0].productOfferDetails.purchaseOptionId='rent',(v:ReturnType<typeof hint>)=>v.obfuscatedExternalAccountId='',(v:ReturnType<typeof hint>)=>v.productLineItem[0].productOfferDetails.consumptionState='UNKNOWN']){const value=hint();change(value);expect(()=>parsePlayCommerceProof('hints_13',value,now)).toThrow('INVALID_PURCHASE');}
    });
    it('keeps test receipt mode visible, never conflates it with live',()=>{const value={...hint(),testPurchaseContext:{fopType:'TEST'}};expect(parsePlayCommerceProof('hints_13',value,now).test).toBe(true);expect(()=>parsePlayCommerceProof('hints_13',{...value,testPurchaseContext:{fopType:'UNKNOWN'}},now)).toThrow();});
    it.each(['SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_IN_GRACE_PERIOD'])('[delta] %s proves access only; paid-order hints are separate',state=>{const value=sub();value.subscriptionState=state;expect(parsePlayCommerceProof('plus_monthly',value,now)).toMatchObject({active:true,hints:0,orderId:'GPA.1234-5678-9012-34567..0'});});
    it.each(['SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_PAUSED','SUBSCRIPTION_STATE_EXPIRED'])('[delta] %s stops access without returning another hint grant',state=>{const value=sub();value.subscriptionState=state;expect(parsePlayCommerceProof('plus_monthly',value,now)).toMatchObject({active:false,hints:0});});
    it('grace/deferral does not change the paid order key; expiry alone is not a grant id',()=>{const a=sub(),b=sub();b.lineItems[0].expiryTime='2026-11-19T00:00:00Z';b.subscriptionState='SUBSCRIPTION_STATE_IN_GRACE_PERIOD';expect(parsePlayCommerceProof('plus_monthly',a,now).orderId).toBe(parsePlayCommerceProof('plus_monthly',b,now).orderId);});
    it('pending subscription has no paid-period credit or active entitlement',()=>{const value=sub();value.subscriptionState='SUBSCRIPTION_STATE_PENDING';expect(parsePlayCommerceProof('plus_monthly',value,now)).toMatchObject({active:false,hints:0,orderId:null,periodEnd:null});});
    it('rejects a different base plan and missing paid order',()=>{const a=sub();a.lineItems[0].offerDetails.basePlanId='annual';expect(()=>parsePlayCommerceProof('plus_monthly',a,now)).toThrow();const b=sub();b.lineItems[0].latestSuccessfulOrderId='';expect(()=>parsePlayCommerceProof('plus_monthly',b,now)).toThrow();});
});
