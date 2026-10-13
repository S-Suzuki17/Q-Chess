import {describe,it,expect} from 'vitest';
import {parsePlayCommerceProof} from './PlayCommerceProof';
import {parsePlayCommercePaidOrder,type PlayPaidOrderContext} from './PlayCommercePaidOrder';
import {parsePlayMoney} from './PlayCommerceValues';
const account='a'.repeat(64),intent='b'.repeat(64),now=Date.parse('2026-10-13T00:00:00Z'),token='current-fixture-token-only';
const sub=():any=>({lineItems:[{productId:'qg_plus_monthly',expiryTime:'2026-11-12T00:00:00Z',latestSuccessfulOrderId:'GPA.1234-5678-9012-34567..0',autoRenewingPlan:{autoRenewEnabled:true},offerDetails:{basePlanId:'monthly'}}],externalAccountIdentifiers:{obfuscatedExternalAccountId:account,obfuscatedExternalProfileId:intent},subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING'});
const money=()=>({currencyCode:'JPY',units:'980',nanos:0});
const order=():any=>({orderId:'GPA.1234-5678-9012-34567..0',purchaseToken:token,state:'PROCESSED',createTime:'2026-10-12T00:00:00Z',lastEventTime:'2026-10-12T00:00:01.123456789Z',total:money(),
    lineItems:[{productId:'qg_plus_monthly',listingPrice:money(),total:money(),subscriptionDetails:{basePlanId:'monthly',offerPhaseDetails:{baseDetails:{}},servicePeriodStartTime:'2026-10-12T00:00:00Z',servicePeriodEndTime:'2026-11-12T00:00:00Z'}}],
    orderHistory:{processedEvent:{eventTime:'2026-10-12T00:00:01.123456789Z'}}});
const context=(raw=sub()):PlayPaidOrderContext=>({packageName:'com.qgambit.app',purchaseToken:token,purchase:parsePlayCommerceProof('plus_monthly',raw,now),now});
describe('[delta] canonical paid order proof',()=>{
    it('uses the same canonical order/token/product/base plan and regional Money; remains a DB-fenced candidate',()=>{
        expect(parsePlayCommercePaidOrder('plus_monthly',order(),context())).toMatchObject({paid:true,candidateHints:10,reason:'PAID_ORDER',test:false,
            money:{currencyCode:'JPY',amountNanos:'980000000000'},processedAt:'2026-10-12T00:00:01.123456789Z',
            paidPeriod:{start:'2026-10-12T00:00:00.000000000Z',end:'2026-11-12T00:00:00.000000000Z'},offerPhase:'BASE',requiresDatabaseGrantFence:true});
    });
    it.each(['token','order','product','base','package','proofsku'])('rejects mismatched %s identity',part=>{
        const value=order(),ctx:any=context();
        if(part==='token')value.purchaseToken='different-fixture-token';if(part==='order')value.orderId='GPA.1234-5678-9012-34567..1';
        if(part==='product')value.lineItems[0].productId='qg_standard_monthly';if(part==='base')value.lineItems[0].subscriptionDetails.basePlanId='annual';
        if(part==='package')ctx.packageName='another.package';if(part==='proofsku')ctx.purchase.sku='standard_monthly';
        expect(()=>parsePlayCommercePaidOrder('plus_monthly',value,ctx)).toThrow('INVALID_PURCHASE');
    });
    it('does not accept the expired out-of-app token as payment for the new token',()=>{
        const raw=sub();raw.outOfAppPurchaseContext={expiredPurchaseToken:'expired-fixture-token-only'};
        const value=order();value.purchaseToken='expired-fixture-token-only';expect(()=>parsePlayCommercePaidOrder('plus_monthly',value,context(raw))).toThrow();
    });
    it.each(['PENDING','CANCELED','PENDING_REFUND','PARTIALLY_REFUNDED','REFUNDED'])('does not grant for order state %s',state=>{
        const value=order();value.state=state;expect(parsePlayCommercePaidOrder('plus_monthly',value,context())).toMatchObject({paid:false,candidateHints:0});
    });
    it('treats zero price as zero grants without guessing the configured USD price',()=>{
        const value=order();value.total.units='0';value.lineItems[0].total.units='0';
        expect(parsePlayCommercePaidOrder('plus_monthly',value,context())).toMatchObject({paid:false,candidateHints:0,reason:'ZERO_PAYMENT'});
    });
    it.each(['freeTrialDetails','introductoryPriceDetails','prorationPeriodDetails'])('rejects %s as a full monthly hint period',key=>{
        const value=order();value.lineItems[0].subscriptionDetails.offerPhaseDetails={[key]:{}};
        expect(parsePlayCommercePaidOrder('plus_monthly',value,context())).toMatchObject({paid:false,candidateHints:0,reason:'UNSUPPORTED_PHASE'});
    });
    it('does not infer a paid base period from deprecated offerPhase alone',()=>{
        const value=order();value.lineItems[0].subscriptionDetails.offerPhaseDetails=null;value.lineItems[0].subscriptionDetails.offerPhase='BASE';
        expect(parsePlayCommercePaidOrder('plus_monthly',value,context())).toMatchObject({paid:false,candidateHints:0,offerPhase:null});
    });
    it.each([{baseDetails:{},freeTrialDetails:{}},{baseDetails:false},{baseDetails:{unknown:1}},'BASE',{unknownPhase:{}}])('rejects malformed or conflicting phase details %j',phase=>{
        const value=order();value.lineItems[0].subscriptionDetails.offerPhaseDetails=phase;expect(()=>parsePlayCommercePaidOrder('plus_monthly',value,context())).toThrow();
    });
    it('rejects an old enum that contradicts the current base phase',()=>{const value=order();value.lineItems[0].subscriptionDetails.offerPhase='FREE_TRIAL';expect(()=>parsePlayCommercePaidOrder('plus_monthly',value,context())).toThrow();});
    it('holds pending refunds separately from completed revocations even when order state is PROCESSED',()=>{
        for(const state of ['PENDING','PROCESSED_SUCCESSFULLY']){
            const value=order();value.orderHistory.partialRefundEvents=[{state,createTime:value.createTime,...(state==='PROCESSED_SUCCESSFULLY'?{processTime:value.lastEventTime}:{}),refundDetails:{total:money()}}];
            expect(parsePlayCommercePaidOrder('plus_monthly',value,context())).toMatchObject({paid:false,candidateHints:0,reason:state==='PENDING'?'REFUND_PENDING':'REFUND_OR_CANCELLATION'});
        }
        const value=order();value.orderHistory.refundEvent={eventTime:value.lastEventTime,refundDetails:{total:money()}};
        expect(parsePlayCommercePaidOrder('plus_monthly',value,context()).candidateHints).toBe(0);
    });
    it('a completed refund still wins over another pending refund event',()=>{
        const value=order();value.state='PENDING_REFUND';
        expect(parsePlayCommercePaidOrder('plus_monthly',value,context()).reason).toBe('REFUND_PENDING');
        value.orderHistory.refundEvent={eventTime:value.lastEventTime,refundDetails:{total:money()}};
        expect(parsePlayCommercePaidOrder('plus_monthly',value,context()).reason).toBe('REFUND_OR_CANCELLATION');
    });
    it('accepts null optional history/offer fields without inventing refund events',()=>{
        const value=order();Object.assign(value.orderHistory,{partialRefundEvents:null,refundEvent:null,cancellationEvent:null});value.lineItems[0].subscriptionDetails.offerId=null;
        expect(parsePlayCommercePaidOrder('plus_monthly',value,context()).paid).toBe(true);
    });
    it('requires processedEvent.eventTime and ignores an invented processingTime alias',()=>{
        const value=order();value.processingTime=value.lastEventTime;delete value.orderHistory.processedEvent;
        expect(()=>parsePlayCommercePaidOrder('plus_monthly',value,context())).toThrow();
    });
    it.each(['missing','reversed','invalid','future'])('rejects %s paid period rather than deriving it from expiry',kind=>{
        const value=order(),details=value.lineItems[0].subscriptionDetails;
        if(kind==='missing'){delete details.servicePeriodStartTime;delete details.servicePeriodEndTime;}
        if(kind==='reversed')details.servicePeriodEndTime='2026-10-11T00:00:00Z';
        if(kind==='invalid')details.servicePeriodStartTime='2026-02-30T00:00:00Z';
        if(kind==='future')details.servicePeriodStartTime='2026-10-14T00:00:00Z';
        expect(()=>parsePlayCommercePaidOrder('plus_monthly',value,context())).toThrow();
    });
    it('keeps the same order key after expiry extension/grace/restore and never issues access-parser hints',()=>{
        const initial=parsePlayCommercePaidOrder('plus_monthly',order(),context());
        for(const state of ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_ACTIVE']){
            const raw=sub();raw.subscriptionState=state;raw.lineItems[0].expiryTime='2026-11-19T00:00:00Z';const ctx=context(raw);
            expect(ctx.purchase.hints).toBe(0);const result=parsePlayCommercePaidOrder('plus_monthly',order(),ctx);
            expect(result.orderKey).toBe(initial.orderKey);expect(result.paidPeriod).toEqual(initial.paidPeriod);expect(result.requiresDatabaseGrantFence).toBe(true);
        }
    });
    it('retains test/live mode without creating a second order key if its observation changes',()=>{
        const raw=sub();raw.testPurchase={};const test=parsePlayCommercePaidOrder('plus_monthly',order(),context(raw));
        expect(test.test).toBe(true);expect(test.orderKey).toBe(parsePlayCommercePaidOrder('plus_monthly',order(),context()).orderKey);
    });
    it('normalizes currency amounts larger than safe JS integers with exact nanos',()=>{
        const value=order(),large={currencyCode:'BHD',units:'9007199254740993',nanos:123456789};value.total=large;value.lineItems[0].total=large;value.lineItems[0].listingPrice=large;
        expect(parsePlayCommercePaidOrder('plus_monthly',value,context()).money).toEqual({currencyCode:'BHD',amountNanos:'9007199254740993123456789'});
        expect(parsePlayMoney({currencyCode:'EUR',units:null,nanos:1}).amountNanos).toBe(1n);
    });
    it.each([{currencyCode:'JPY',units:980,nanos:0},{currencyCode:'JPY',units:'1',nanos:-1},{currencyCode:'JPY',units:'0',nanos:1000000000},
        {currencyCode:'JPY',units:'9223372036854775808'}, {currencyCode:'JPY',units:'1.5'},{currencyCode:'jpy',units:'1'}])('rejects malformed Money %j',money=>{
        const value=order();value.total=money;expect(()=>parsePlayCommercePaidOrder('plus_monthly',value,context())).toThrow();
    });
    it.each(['currency','amount','listingCurrency'])('rejects inconsistent %s across the single canonical line and order',kind=>{
        const value=order();if(kind==='currency')value.lineItems[0].total.currencyCode='USD';if(kind==='amount')value.lineItems[0].total.nanos=1;if(kind==='listingCurrency')value.lineItems[0].listingPrice.currencyCode='USD';
        expect(()=>parsePlayCommercePaidOrder('plus_monthly',value,context())).toThrow();
    });
    it('requires canonical inapp refund remainder as well as the matching paid order',()=>{
        const canonical:any={productLineItem:[{productId:'qg_hints_13',productOfferDetails:{quantity:1,purchaseOptionId:'buy',refundableQuantity:1,consumptionState:'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'}}],purchaseStateContext:{purchaseState:'PURCHASED'},orderId:'GPA.1234-5678-9012-34567',obfuscatedExternalAccountId:account,obfuscatedExternalProfileId:intent,purchaseCompletionTime:'2026-10-12T00:00:01Z',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING'};
        const value=order();value.orderId=canonical.orderId;value.lineItems[0].productId='qg_hints_13';delete value.lineItems[0].subscriptionDetails;value.lineItems[0].oneTimePurchaseDetails={quantity:1,purchaseOptionId:'buy'};
        for(const remaining of [1,0,null]){canonical.productLineItem[0].productOfferDetails.refundableQuantity=remaining;
            const result=parsePlayCommercePaidOrder('hints_13',value,{packageName:'com.qgambit.app',purchaseToken:token,purchase:parsePlayCommerceProof('hints_13',canonical,now),now});
            expect(result.candidateHints).toBe(remaining===1?13:0);
        }
    });
});
