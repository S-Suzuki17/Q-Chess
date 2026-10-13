import {PLAY_COMMERCE_PACKAGE,playCommerceProduct} from './PlayCommerceCatalog';
import type {CommerceSku} from './CommerceCatalog';
import {playCommerceReceiptHash,type PlayCommerceProof} from './PlayCommerceProof';
import {invalidPlayPurchase as fail,playObject as object,playPresent as present,playEmptyMessage,
    playToken,playOrderId,parsePlayTimestamp,parsePlayMoney,playNowNanoseconds,type PlayMoney} from './PlayCommerceValues';

export type PlayPaidOrderContext=Readonly<{
    /** Server-selected package/token used to fetch the canonical purchase; never native JSON. */
    packageName:typeof PLAY_COMMERCE_PACKAGE;
    purchaseToken:string;
    purchase:PlayCommerceProof;
    now?:number;
}>;
/** Comes only from an immutable server ledger binding; never from a client or RTDN body. */
export type PlayHistoricalOrderContext=Readonly<{
    packageName:typeof PLAY_COMMERCE_PACKAGE;purchaseToken:string;orderId:string;test:boolean;now?:number;
}>;
export type PlayPaidOrderReason='PAID_ORDER'|'ORDER_NOT_PROCESSED'|'REFUND_OR_CANCELLATION'|'REFUND_PENDING'
    |'ZERO_PAYMENT'|'UNSUPPORTED_PHASE'|'PURCHASE_PHASE_UNSUPPORTED'|'PURCHASE_NOT_GRANTABLE';
export type PlayCommercePaidOrder=Readonly<{
    sku:CommerceSku;productId:string;type:'subs'|'inapp';orderId:string;tokenHash:string;test:boolean;
    /** Stable across restore/expiry/deferral/mode observations. Mode is an immutable DB attribute. */
    orderKey:string;
    state:string;paid:boolean;reason:PlayPaidOrderReason;candidateHints:number;
    /** JSON-safe integer nanos in the buyer's currency. */
    money:Readonly<{currencyCode:string;amountNanos:string}>;
    processedAt:string|null;
    /** Accounting snapshot ONLY; never use this to replace subscription access expiry. */
    paidPeriod:Readonly<{start:string;end:string}>|null;
    offerPhase:'BASE'|'FREE_TRIAL'|'INTRODUCTORY'|'PRORATION'|null;
    requiresDatabaseGrantFence:true;
}>;

function sameMoney(a:PlayMoney,b:PlayMoney) {
    if(a.currencyCode!==b.currencyCode||a.amountNanos!==b.amountNanos)return fail();
}
function nonnegativeMoney(value:unknown,currency:string) {
    const money=parsePlayMoney(value);
    if(money.currencyCode!==currency||money.amountNanos<0n)return fail();
    return money;
}
function refundSignal(history:Record<string,unknown>,currency:string,lastNanos:bigint) {
    let completed=false,pending=false;
    const eventTime=(value:unknown)=>{
        const parsed=parsePlayTimestamp(value);if(parsed.epochNanoseconds>lastNanos)return fail();return parsed;
    };
    const refundDetails=(value:unknown)=>{
        if(!present(value))return;
        if(!object(value))return fail();
        nonnegativeMoney(value.total,currency);
        if(present(value.tax))nonnegativeMoney(value.tax,currency);
    };
    for(const name of ['cancellationEvent','refundEvent']){
        const event=history[name];if(!present(event))continue;
        if(!object(event))return fail();eventTime(event.eventTime);completed=true;
        if(name==='refundEvent')refundDetails(event.refundDetails);
    }
    if(present(history.partialRefundEvents)){
        if(!Array.isArray(history.partialRefundEvents))return fail();
        for(const event of history.partialRefundEvents){
            if(!object(event)||!['PENDING','PROCESSED_SUCCESSFULLY'].includes(event.state as string))return fail();
            const created=eventTime(event.createTime);
            const processed=present(event.processTime)?eventTime(event.processTime):null;
            if(event.state==='PROCESSED_SUCCESSFULLY'&&!processed||processed&&processed.epochNanoseconds<created.epochNanoseconds)return fail();
            refundDetails(event.refundDetails);
            if(event.state==='PROCESSED_SUCCESSFULLY')completed=true;else pending=true;
        }
    }
    return {completed,pending};
}
function phase(details:Record<string,unknown>):PlayCommercePaidOrder['offerPhase'] {
    const legacy=details.offerPhase;
    if(present(legacy)&&!['BASE','FREE_TRIAL','INTRODUCTORY'].includes(legacy as string))return fail();
    // The deprecated enum alone cannot distinguish proration from a genuine base period.
    if(!present(details.offerPhaseDetails))return null;
    if(!object(details.offerPhaseDetails))return fail();
    const value=details.offerPhaseDetails;
    const keys=['baseDetails','freeTrialDetails','introductoryPriceDetails','prorationPeriodDetails'];
    const set=keys.filter(key=>present(value[key]));
    if(set.length!==1||Object.keys(value).some(key=>!keys.includes(key)))return fail();
    const key=set[0],selected=value[key];
    if(key==='prorationPeriodDetails'){
        if(!object(selected)||present(selected.originalOfferPhase)&&!['BASE','FREE_TRIAL','INTRODUCTORY'].includes(selected.originalOfferPhase as string))return fail();
        return 'PRORATION';
    }
    if(!playEmptyMessage(selected))return fail();
    const normalized=key==='baseDetails'?'BASE':key==='freeTrialDetails'?'FREE_TRIAL':'INTRODUCTORY';
    if(present(legacy)&&legacy!==normalized)return fail();
    return normalized;
}

/**
 * Pure normalization of orders.get, bound to one canonical purchase response.
 * API authentication, immutable owner/generation, order idempotence, ledger,
 * refund reconciliation and acknowledgement/consume outbox remain caller duties.
 */
export function parsePlayCommercePaidOrder(sku:CommerceSku,raw:unknown,context:PlayPaidOrderContext):PlayCommercePaidOrder {
    const product=playCommerceProduct(sku),purchase=context?.purchase;
    if(!product||!purchase||context.packageName!==PLAY_COMMERCE_PACKAGE
        ||purchase.sku!==sku||purchase.productId!==product.productId||purchase.type!==product.type||typeof purchase.test!=='boolean')return fail();
    if(!purchase.orderId)return fail();
    return normalizeBoundOrder(sku,raw,{packageName:context.packageName,purchaseToken:context.purchaseToken,orderId:purchase.orderId,test:purchase.test,now:context.now},purchase);
}

/** Historical orders never impersonate the current Purchases order or alter access expiry. */
export function parsePlayCommerceHistoricalOrder(sku:CommerceSku,raw:unknown,context:PlayHistoricalOrderContext):PlayCommercePaidOrder {
    return normalizeBoundOrder(sku,raw,context,null);
}
function normalizeBoundOrder(sku:CommerceSku,raw:unknown,context:PlayHistoricalOrderContext,purchase:PlayCommerceProof|null):PlayCommercePaidOrder {
    const product=playCommerceProduct(sku);
    if(!product||!object(raw)||!context||context.packageName!==PLAY_COMMERCE_PACKAGE||typeof context.test!=='boolean')return fail();
    const token=playToken(context.purchaseToken),orderId=playOrderId(raw.orderId);
    if(raw.purchaseToken!==token||playOrderId(context.orderId)!==orderId)return fail();
    if(!['PENDING','PROCESSED','CANCELED','PENDING_REFUND','PARTIALLY_REFUNDED','REFUNDED'].includes(raw.state as string))return fail();
    if(!Array.isArray(raw.lineItems)||raw.lineItems.length!==1||!object(raw.lineItems[0]))return fail();
    const item=raw.lineItems[0];if(item.productId!==product.productId||present(item.paidAppDetails))return fail();
    const total=parsePlayMoney(raw.total);if(total.amountNanos<0n)return fail();
    sameMoney(total,nonnegativeMoney(item.total,total.currencyCode));
    nonnegativeMoney(item.listingPrice,total.currencyCode);
    if(present(raw.tax)!==present(item.tax))return fail();
    if(present(raw.tax))sameMoney(nonnegativeMoney(raw.tax,total.currencyCode),nonnegativeMoney(item.tax,total.currencyCode));
    const created=parsePlayTimestamp(raw.createTime),last=parsePlayTimestamp(raw.lastEventTime);
    const nowNanos=playNowNanoseconds(context.now??Date.now());
    if(last.epochNanoseconds<created.epochNanoseconds||last.epochNanoseconds>nowNanos||!object(raw.orderHistory))return fail();
    const history=raw.orderHistory;
    let processed:ReturnType<typeof parsePlayTimestamp>|null=null;
    if(present(history.processedEvent)){
        if(!object(history.processedEvent))return fail();
        processed=parsePlayTimestamp(history.processedEvent.eventTime);
        if(processed.epochNanoseconds<created.epochNanoseconds||processed.epochNanoseconds>last.epochNanoseconds)return fail();
    }
    if(raw.state==='PROCESSED'&&!processed)return fail();
    const refund=refundSignal(history,total.currencyCode,last.epochNanoseconds);
    let paidPeriod:PlayCommercePaidOrder['paidPeriod']=null;
    let offerPhase:PlayCommercePaidOrder['offerPhase']=null;
    if(product.type==='subs'){
        const details=item.subscriptionDetails;
        if(present(item.oneTimePurchaseDetails)||!object(details)||details.basePlanId!==product.basePlanId||present(details.offerId))return fail();
        offerPhase=phase(details);
        if(present(details.servicePeriodStartTime)!==present(details.servicePeriodEndTime))return fail();
        if(present(details.servicePeriodStartTime)){
            const start=parsePlayTimestamp(details.servicePeriodStartTime),end=parsePlayTimestamp(details.servicePeriodEndTime);
            if(end.epochNanoseconds<=start.epochNanoseconds)return fail();
            // A future service period cannot fund current hints. Do not derive a period from expiryTime.
            if(start.epochNanoseconds>nowNanos)return fail();
            paidPeriod=Object.freeze({start:start.iso,end:end.iso});
        }
        if(raw.state==='PROCESSED'&&offerPhase==='BASE'&&!paidPeriod)return fail();
    }else{
        const details=item.oneTimePurchaseDetails;
        if(present(item.subscriptionDetails)||!object(details)||details.quantity!==1||details.purchaseOptionId!==product.purchaseOptionId
            ||present(details.offerId)||present(details.preorderDetails)||present(details.rentalDetails))return fail();
    }
    let reason:PlayPaidOrderReason='PAID_ORDER';
    if(refund.completed||['CANCELED','PARTIALLY_REFUNDED','REFUNDED'].includes(raw.state as string))reason='REFUND_OR_CANCELLATION';
    else if(refund.pending||raw.state==='PENDING_REFUND')reason='REFUND_PENDING';
    else if(raw.state!=='PROCESSED')reason='ORDER_NOT_PROCESSED';
    else if(total.amountNanos===0n)reason='ZERO_PAYMENT';
    else if(product.type==='subs'&&offerPhase!=='BASE')reason='UNSUPPORTED_PHASE';
    // Purchases and Orders are separate snapshots. Keep access, but hold new credit
    // when an explicit current phase conflicts with the supported BASE order.
    else if(purchase&&product.type==='subs'&&present(purchase.currentOfferPhase)&&purchase.currentOfferPhase!=='BASE')reason='PURCHASE_PHASE_UNSUPPORTED';
    else if(purchase&&(product.type==='inapp'&&(purchase.state!=='PURCHASED'||purchase.refundableQuantity!==1||purchase.consumed)
        ||product.type==='subs'&&['SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'].includes(purchase.state)))reason='PURCHASE_NOT_GRANTABLE';
    const paid=reason==='PAID_ORDER';
    return Object.freeze({sku,productId:product.productId,type:product.type,orderId,tokenHash:playCommerceReceiptHash(token),test:context.test,
        orderKey:`${PLAY_COMMERCE_PACKAGE}:play-order:${orderId}`,state:raw.state as string,paid,reason,
        candidateHints:paid?product.hints:0,money:Object.freeze({currencyCode:total.currencyCode,amountNanos:total.amountNanos.toString()}),
        processedAt:processed?.iso??null,paidPeriod,offerPhase,requiresDatabaseGrantFence:true});
}
