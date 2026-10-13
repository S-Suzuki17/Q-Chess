import {describe,it,expect} from 'vitest';
import {parsePlayCommerceProof,playCommerceReceiptHash,playCommerceAccountId} from './PlayCommerceProof';
import {parsePlayTimestamp} from './PlayCommerceValues';
const account='a'.repeat(64),intent='b'.repeat(64),now=Date.parse('2026-10-13T00:00:00Z');
const hint=():any=>({productLineItem:[{productId:'qg_hints_13',productOfferDetails:{quantity:1,purchaseOptionId:'buy',refundableQuantity:1,consumptionState:'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'}}],purchaseStateContext:{purchaseState:'PURCHASED'},orderId:'GPA.1234-5678-9012-34567',obfuscatedExternalAccountId:account,obfuscatedExternalProfileId:intent,purchaseCompletionTime:'2026-10-12T00:00:00Z',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING'});
const sub=():any=>({lineItems:[{productId:'qg_plus_monthly',expiryTime:'2026-11-12T00:00:00Z',latestSuccessfulOrderId:'GPA.1234-5678-9012-34567..0',autoRenewingPlan:{autoRenewEnabled:true},offerDetails:{basePlanId:'monthly'}}],externalAccountIdentifiers:{obfuscatedExternalAccountId:account,obfuscatedExternalProfileId:intent},subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING'});
describe('[delta] canonical Play parser contract',()=>{
    it('treats optional null exactly as absent, not as a test purchase or alternative plan',()=>{
        const value=sub();Object.assign(value,{testPurchase:null,linkedPurchaseToken:null,outOfAppPurchaseContext:null});
        Object.assign(value.lineItems[0],{prepaidPlan:null,deferredItemRemoval:null,deferredItemReplacement:null});value.lineItems[0].offerDetails.offerId=null;
        expect(parsePlayCommerceProof('plus_monthly',value,now)).toMatchObject({test:false,hints:0,active:true,ownership:{kind:'direct',outOfApp:null,linkedTokenHash:null}});
        const product=hint();product.testPurchaseContext=null;Object.assign(product.productLineItem[0].productOfferDetails,{offerId:null,rentOfferDetails:null,preorderOfferDetails:null});
        expect(parsePlayCommerceProof('hints_13',product,now)).toMatchObject({test:false,hints:13});
    });
    it.each([false,true,'',0,[],{unexpected:true}])('rejects malformed nonnull subscription testPurchase %j',marker=>{
        const value=sub();value.testPurchase=marker;expect(()=>parsePlayCommerceProof('plus_monthly',value,now)).toThrow('INVALID_PURCHASE');
    });
    it('accepts only the empty canonical subscription test message',()=>{const value=sub();value.testPurchase={};expect(parsePlayCommerceProof('plus_monthly',value,now).test).toBe(true);});
    it.each([false,[],{},'TEST',{fopType:null}])('rejects malformed product testPurchaseContext %j',marker=>{
        const value=hint();value.testPurchaseContext=marker;expect(()=>parsePlayCommerceProof('hints_13',value,now)).toThrow('INVALID_PURCHASE');
    });
    it.each([0,null,undefined])('does not turn refundableQuantity %j into a new grant',remaining=>{
        const value=hint();value.productLineItem[0].productOfferDetails.refundableQuantity=remaining;
        expect(parsePlayCommerceProof('hints_13',value,now)).toMatchObject({hints:0,refundableQuantity:remaining??null});
    });
    it.each([-1,2,0.5,'1',false])('rejects malformed refundableQuantity %j',remaining=>{
        const value=hint();value.productLineItem[0].productOfferDetails.refundableQuantity=remaining;expect(()=>parsePlayCommerceProof('hints_13',value,now)).toThrow();
    });
    it('does not issue new hints for an already consumed canonical product',()=>{
        const value=hint();value.productLineItem[0].productOfferDetails.consumptionState='CONSUMPTION_STATE_CONSUMED';
        expect(parsePlayCommerceProof('hints_13',value,now)).toMatchObject({hints:0,consumed:true});
    });
    it.each(['2026-02-30T00:00:00Z','2025-02-29T00:00:00Z','0000-01-01T00:00:00Z','2026-04-31T00:00:00Z',
        '2026-10-12T24:00:00Z','2026-10-12T00:00:60Z','2026-10-12T00:00:00+24:00','2026-10-12T00:00:00+00:60',
        '2026-10-12T00:00:00-00:00','2026-10-12T00:00:00.1234567890Z','2026-10-12T00:00:00','2026-10-12 00:00:00Z',
        '0001-01-01T00:00:00+00:01','9999-12-31T23:59:59-00:01'])('rejects impossible/non-Google timestamp %s',timestamp=>{
        const value=hint();value.purchaseCompletionTime=timestamp;expect(()=>parsePlayCommerceProof('hints_13',value,now)).toThrow('INVALID_PURCHASE');
    });
    it('preserves all nine fractional digits and resolves a valid offset exactly',()=>{
        const value=hint();value.purchaseCompletionTime='2024-02-29T05:30:00.123456789+05:30';
        expect(parsePlayCommerceProof('hints_13',value,now).purchaseCompletionTime).toBe('2024-02-29T00:00:00.123456789Z');
        expect(parsePlayTimestamp('0099-01-01T00:00:00Z').iso).toBe('0099-01-01T00:00:00.000000000Z');
    });
    it('compares expiry at nanosecond precision instead of truncating it to milliseconds',()=>{
        const value=sub();value.lineItems[0].expiryTime='2026-10-13T00:00:00.000000001Z';
        expect(parsePlayCommerceProof('plus_monthly',value,now).active).toBe(true);
        value.lineItems[0].expiryTime='2026-10-13T00:00:00.000000000Z';expect(parsePlayCommerceProof('plus_monthly',value,now).active).toBe(false);
    });
    it('rejects completion just one nanosecond in the future',()=>{const value=hint();value.purchaseCompletionTime='2026-10-13T00:00:00.000000001Z';expect(()=>parsePlayCommerceProof('hints_13',value,now)).toThrow();});
    it('normalizes default false autoRenewEnabled while keeping access proof separate',()=>{
        const value=sub();value.subscriptionState='SUBSCRIPTION_STATE_CANCELED';value.lineItems[0].autoRenewingPlan.autoRenewEnabled=null;
        expect(parsePlayCommerceProof('plus_monthly',value,now)).toMatchObject({active:true,cancelAtPeriodEnd:true,hints:0});
    });
    it('normalizes pre-ack out-of-app evidence without rebinding it to the current account',()=>{
        const value=sub();value.externalAccountIdentifiers=null;
        value.outOfAppPurchaseContext={expiredPurchaseToken:'expired-fixture-token-only',expiredExternalAccountIdentifiers:{obfuscatedExternalAccountId:account,obfuscatedExternalProfileId:intent}};
        const result=parsePlayCommerceProof('plus_monthly',value,now);
        expect(result).toMatchObject({accountId:null,intentId:null,hints:0,ownership:{kind:'out_of_app',requiresDatabaseMatch:true,persistBeforeAcknowledgement:true,
            outOfApp:{expiredPurchaseTokenHash:playCommerceReceiptHash('expired-fixture-token-only'),expiredExternalAccountIdentifiers:{accountId:account,intentId:intent}}}});
        expect(JSON.stringify(result)).not.toContain('expired-fixture-token-only');
        expect(JSON.parse(JSON.stringify(result)).ownership).toEqual(result.ownership);
    });
    it('keeps conflicting current and expired generations separate for the DB to reject',()=>{
        const value=sub(),retired=playCommerceAccountId('11111111-1111-4111-8111-111111111111'),recreated=playCommerceAccountId('22222222-2222-4222-8222-222222222222');
        value.externalAccountIdentifiers.obfuscatedExternalAccountId=recreated;
        value.outOfAppPurchaseContext={expiredExternalAccountIdentifiers:{obfuscatedExternalAccountId:retired,obfuscatedExternalProfileId:intent}};
        const result=parsePlayCommerceProof('plus_monthly',value,now);
        expect(result.accountId).toBe(recreated);expect(result.ownership.outOfApp?.expiredExternalAccountIdentifiers?.accountId).toBe(retired);
        expect(result.ownership).toMatchObject({kind:'out_of_app',requiresDatabaseMatch:true,persistBeforeAcknowledgement:true});expect(result.hints).toBe(0);
    });
    it('after acknowledgement and loss of out-of-app fields, requires an existing token owner',()=>{
        const value=sub();value.acknowledgementState='ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';delete value.externalAccountIdentifiers;
        expect(parsePlayCommerceProof('plus_monthly',value,now)).toMatchObject({accountId:null,intentId:null,hints:0,ownership:{kind:'stored_token',requiresDatabaseMatch:true,outOfApp:null}});
    });
    it.each([false,[],{}, {expiredPurchaseToken:'tiny'}, {expiredExternalAccountIdentifiers:{obfuscatedAccountId:account}}, {expiredExternalAccountIdentifiers:{externalAccountId:'unsupported-identity'}}])('rejects malformed/unusable out-of-app evidence %j',context=>{
        const value=sub();value.outOfAppPurchaseContext=context;expect(()=>parsePlayCommerceProof('plus_monthly',value,now)).toThrow();
    });
    it('hashes linked tokens as DB lookup material; emits no API replay instruction',()=>{
        const value=sub();value.linkedPurchaseToken='linked-fixture-token-only';const result=parsePlayCommerceProof('plus_monthly',value,now);
        expect(result.ownership.linkedTokenHash).toBe(playCommerceReceiptHash(value.linkedPurchaseToken));expect(JSON.stringify(result)).not.toContain(value.linkedPurchaseToken);
    });
    it('does not fill a missing current order from undocumented aliases or expiry',()=>{
        const value=sub();delete value.lineItems[0].latestSuccessfulOrderId;value.latestOrderId='GPA.1234-5678-9012-34567..99';
        expect(parsePlayCommerceProof('plus_monthly',value,now)).toMatchObject({active:true,orderId:null,hints:0});
    });
});
