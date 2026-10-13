import {createHash} from 'node:crypto';
import {PLAY_COMMERCE_PACKAGE,playCommerceProduct} from './PlayCommerceCatalog';
import type {CommerceSku} from './CommerceCatalog';
import {PlayCommerceError,invalidPlayPurchase as fail,playObject as object,playPresent as present,
    playEmptyMessage,playBinding as binding,playToken,playOrderId as order,parsePlayTimestamp,playNowNanoseconds} from './PlayCommerceValues';
export {PlayCommerceError} from './PlayCommerceValues';

/** A DB-owned random account generation, never a reusable player name/id. */
export const playCommerceAccountId=(bindingId:string)=>{if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(bindingId))throw new PlayCommerceError('ACCOUNT_MISMATCH');return createHash('sha256').update(`${PLAY_COMMERCE_PACKAGE}:commerce:${bindingId}`).digest('hex');};
export const playCommerceReceiptHash=(token:string)=>createHash('sha256').update(`${PLAY_COMMERCE_PACKAGE}:commerce:${token}`).digest('hex');
export type PlayAccountIdentifiers=Readonly<{accountId:string|null;intentId:string|null}>;
export type PlayOutOfAppContext=Readonly<{
    expiredPurchaseTokenHash:string|null;
    expiredExternalAccountIdentifiers:PlayAccountIdentifiers|null;
}>;
export type PlayOwnershipContext=Readonly<{
    kind:'direct'|'out_of_app'|'stored_token';
    requiresDatabaseMatch:true;
    persistBeforeAcknowledgement:boolean;
    linkedTokenHash:string|null;
    outOfApp:PlayOutOfAppContext|null;
}>;
export type PlayCommerceProof={
    sku:CommerceSku;productId:string;type:'inapp'|'subs';orderId:string|null;
    accountId:string|null;intentId:string|null;ownership:PlayOwnershipContext;
    test:boolean;state:string;periodEnd:string|null;active:boolean;cancelAtPeriodEnd:boolean;
    /** Current purchase phase, distinct from the accounting phase on orders.get. */
    currentOfferPhase:'BASE'|'FREE_TRIAL'|'INTRODUCTORY'|'PRORATION'|null;
    /** Subs are ALWAYS zero here. Inapp quantity still needs orders.get + DB fences before credit. */
    hints:number;refundableQuantity:number|null;purchaseCompletionTime:string|null;
    consumed:boolean;acknowledged:boolean;
};

function identifiers(raw:unknown):PlayAccountIdentifiers|null {
    if(!present(raw))return null;
    if(!object(raw))return fail();
    const accountId=present(raw.obfuscatedExternalAccountId)?binding(raw.obfuscatedExternalAccountId):null;
    const intentId=present(raw.obfuscatedExternalProfileId)?binding(raw.obfuscatedExternalProfileId):null;
    // externalAccountId is a different, unsupported identity scheme; never use it as a fallback.
    if(!accountId&&!intentId)return fail();
    return Object.freeze({accountId,intentId});
}
function subscriptionOfferPhase(value:unknown):PlayCommerceProof['currentOfferPhase'] {
    if(!present(value))return null;
    if(!object(value))return fail();
    const keys=['basePrice','freeTrial','introductoryPrice','prorationPeriod'];
    const set=keys.filter(key=>present(value[key]));
    if(set.length!==1||Object.keys(value).some(key=>!keys.includes(key)))return fail();
    const key=set[0],selected=value[key];
    if(key==='prorationPeriod'){
        if(!object(selected)||Object.keys(selected).some(name=>name!=='originalOfferPhaseType')
            ||present(selected.originalOfferPhaseType)&&!['ORIGINAL_OFFER_PHASE_TYPE_UNSPECIFIED','BASE','INTRODUCTORY','FREE_TRIAL'].includes(selected.originalOfferPhaseType as string))return fail();
        return 'PRORATION';
    }
    if(!playEmptyMessage(selected))return fail();
    return key==='basePrice'?'BASE':key==='freeTrial'?'FREE_TRIAL':'INTRODUCTORY';
}

function subscriptionOwnership(raw:Record<string,unknown>) {
    const current=identifiers(raw.externalAccountIdentifiers);
    const linkedTokenHash=present(raw.linkedPurchaseToken)?playCommerceReceiptHash(playToken(raw.linkedPurchaseToken)):null;
    let outOfApp:PlayOutOfAppContext|null=null;
    if(present(raw.outOfAppPurchaseContext)){
        if(!object(raw.outOfAppPurchaseContext))return fail();
        const context=raw.outOfAppPurchaseContext;
        const expiredPurchaseTokenHash=present(context.expiredPurchaseToken)?playCommerceReceiptHash(playToken(context.expiredPurchaseToken)):null;
        const expiredExternalAccountIdentifiers=identifiers(context.expiredExternalAccountIdentifiers);
        if(!expiredPurchaseTokenHash&&!expiredExternalAccountIdentifiers)return fail();
        outOfApp=Object.freeze({expiredPurchaseTokenHash,expiredExternalAccountIdentifiers});
    }
    const ownership:PlayOwnershipContext=Object.freeze({kind:outOfApp?'out_of_app':current?.accountId&&current.intentId?'direct':'stored_token',
        requiresDatabaseMatch:true,persistBeforeAcknowledgement:outOfApp!==null,linkedTokenHash,outOfApp});
    return {accountId:current?.accountId??null,intentId:current?.intentId??null,ownership};
}

/** Normalize canonical v2 JSON only. Access, owner resolution and paid-period credit are separate. */
export function parsePlayCommerceProof(sku:CommerceSku,raw:unknown,now=Date.now()):PlayCommerceProof {
    const product=playCommerceProduct(sku);if(!product||!object(raw))return fail();
    const nowNanos=playNowNanoseconds(now);
    if(!['ACKNOWLEDGEMENT_STATE_PENDING','ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'].includes(raw.acknowledgementState as string))return fail();
    const acknowledged=raw.acknowledgementState==='ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
    if(product.type==='inapp'){
        const items=raw.productLineItem;if(!Array.isArray(items)||items.length!==1||!object(items[0]))return fail();
        const item=items[0],details=item.productOfferDetails;
        if(item.productId!==product.productId||!object(details)||details.quantity!==1||details.purchaseOptionId!==product.purchaseOptionId
            ||present(details.offerId)||present(details.rentOfferDetails)||present(details.preorderOfferDetails)
            ||!['CONSUMPTION_STATE_YET_TO_BE_CONSUMED','CONSUMPTION_STATE_CONSUMED'].includes(details.consumptionState as string))return fail();
        const refundableQuantity=present(details.refundableQuantity)?details.refundableQuantity:null;
        if(refundableQuantity!==null&&refundableQuantity!==0&&refundableQuantity!==1)return fail();
        if(!object(raw.purchaseStateContext))return fail();const state=raw.purchaseStateContext.purchaseState;
        if(!['PURCHASED','PENDING','CANCELLED'].includes(state as string))return fail();
        const test=present(raw.testPurchaseContext);
        if(test&&(!object(raw.testPurchaseContext)||raw.testPurchaseContext.fopType!=='TEST'))return fail();
        const completion=present(raw.purchaseCompletionTime)?parsePlayTimestamp(raw.purchaseCompletionTime):null;
        if(state==='PURCHASED'&&!completion||completion&&completion.epochNanoseconds>nowNanos)return fail();
        const accountId=binding(raw.obfuscatedExternalAccountId),intentId=binding(raw.obfuscatedExternalProfileId);
        const consumed=details.consumptionState==='CONSUMPTION_STATE_CONSUMED';
        return {sku,productId:product.productId,type:'inapp',accountId,intentId,test,state:state as string,
            orderId:state==='PURCHASED'?order(raw.orderId):null,active:false,periodEnd:null,cancelAtPeriodEnd:false,
            hints:state==='PURCHASED'&&refundableQuantity===1&&!consumed?product.hints:0,refundableQuantity:refundableQuantity as 0|1|null,
            purchaseCompletionTime:completion?.iso??null,consumed,acknowledged,currentOfferPhase:null,
            ownership:Object.freeze({kind:'direct',requiresDatabaseMatch:true,persistBeforeAcknowledgement:false,linkedTokenHash:null,outOfApp:null})};
    }
    const items=raw.lineItems;if(!Array.isArray(items)||items.length!==1||!object(items[0]))return fail();
    const item=items[0],state=raw.subscriptionState;
    if(item.productId!==product.productId||!object(item.offerDetails)||item.offerDetails.basePlanId!==product.basePlanId||present(item.offerDetails.offerId)
        ||!object(item.autoRenewingPlan)||present(item.autoRenewingPlan.autoRenewEnabled)&&typeof item.autoRenewingPlan.autoRenewEnabled!=='boolean'
        ||present(item.autoRenewingPlan.installmentDetails)||present(item.prepaidPlan)||present(item.deferredItemReplacement)||present(item.deferredItemRemoval))return fail();
    if(!['SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_PAUSED','SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'].includes(state as string))return fail();
    const test=present(raw.testPurchase);if(test&&!playEmptyMessage(raw.testPurchase))return fail();
    const pending=state==='SUBSCRIPTION_STATE_PENDING'||state==='SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED';
    const expiry=present(item.expiryTime)?parsePlayTimestamp(item.expiryTime):null;
    const latestOrder=present(item.latestSuccessfulOrderId)?order(item.latestSuccessfulOrderId):null;
    if(!pending&&!expiry)return fail();
    const active=!pending&&['SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_IN_GRACE_PERIOD'].includes(state as string)&&expiry!.epochNanoseconds>nowNanos;
    return {sku,productId:product.productId,type:'subs',...subscriptionOwnership(raw),test,state:state as string,
        orderId:pending?null:latestOrder,periodEnd:pending?null:expiry!.iso,active,currentOfferPhase:subscriptionOfferPhase(item.offerPhase),
        cancelAtPeriodEnd:item.autoRenewingPlan.autoRenewEnabled!==true,hints:0,refundableQuantity:null,purchaseCompletionTime:null,consumed:false,acknowledged};
}
