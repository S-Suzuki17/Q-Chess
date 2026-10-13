import {describe,it,expect,vi} from 'vitest';
import {playCommerceVerifier} from './PlayCommerceVerifier';
import {playTokenVault} from './PlayCommerceTokenVault';
const now=Date.parse('2026-10-13T10:00:00Z'),token='fixture-only-token-for-commerce',account='a'.repeat(64),intent='b'.repeat(64);
const purchase=()=>({lineItems:[{productId:'qg_plus_monthly',expiryTime:'2026-11-12T00:00:00Z',latestSuccessfulOrderId:'GPA.1234-5678-9012-34567..0',autoRenewingPlan:{autoRenewEnabled:true},offerDetails:{basePlanId:'monthly'}}],externalAccountIdentifiers:{obfuscatedExternalAccountId:account,obfuscatedExternalProfileId:intent},subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING'});
const money={currencyCode:'JPY',units:'980',nanos:0};
const order=()=>({orderId:'GPA.1234-5678-9012-34567..0',purchaseToken:token,state:'PROCESSED',createTime:'2026-10-12T00:00:00Z',lastEventTime:'2026-10-12T00:00:01Z',total:money,
    lineItems:[{productId:'qg_plus_monthly',listingPrice:money,total:money,subscriptionDetails:{basePlanId:'monthly',offerPhaseDetails:{baseDetails:{}},servicePeriodStartTime:'2026-10-12T00:00:00Z',servicePeriodEndTime:'2026-11-12T00:00:00Z'}}],orderHistory:{processedEvent:{eventTime:'2026-10-12T00:00:01Z'}}});
describe('Play Publisher acquisition boundary',()=>{
    it('binds canonical v2 and Orders requests to fixed package and supplied server token',async()=>{
        const request=vi.fn().mockResolvedValueOnce(purchase()).mockResolvedValueOnce(order());
        const value=await playCommerceVerifier(request,()=>now).verify('plus_monthly',token);
        expect(request.mock.calls.map(args=>args[0])).toEqual([
            '/androidpublisher/v3/applications/com.qgambit.app/purchases/subscriptionsv2/tokens/'+token,
            '/androidpublisher/v3/applications/com.qgambit.app/orders/GPA.1234-5678-9012-34567..0']);
        expect(value.purchase.hints).toBe(0);expect(value.order?.candidateHints).toBe(10);expect(value.orderUnavailable).toBe(false);
        expect(request).toHaveBeenCalledTimes(2);
    });
    it.each(['outage','mismatch'] as const)('defers grants and delivery when Orders has %s',async reason=>{
        const request=vi.fn().mockResolvedValueOnce(purchase());
        if(reason==='outage')request.mockRejectedValueOnce(new Error('upstream'));
        else request.mockResolvedValueOnce({...order(),purchaseToken:'unrelated-token-only'});
        const value=await playCommerceVerifier(request,()=>now).verify('plus_monthly',token);
        expect(value.order).toBeNull();expect(value.orderUnavailable).toBe(true);expect(value.purchase.hints).toBe(0);
        expect(request.mock.calls.every(args=>!args[1])).toBe(true);
    });
    it('does not acknowledge while verifying, and rejects the wrong delivery operation',async()=>{
        const request=vi.fn().mockResolvedValue(undefined),verifier=playCommerceVerifier(request);
        await expect(verifier.deliver('plus_monthly',token,'consume')).rejects.toThrow('INVALID_PURCHASE');
        expect(request).not.toHaveBeenCalled();
        await verifier.deliver('hints_13',token,'consume');
        expect(request).toHaveBeenCalledWith('/androidpublisher/v3/applications/com.qgambit.app/purchases/products/qg_hints_13/tokens/'+token+':consume','POST');
    });
});
describe('Play token encryption at rest',()=>{
    it('requires an explicitly supplied valid key and round trips without plaintext output',()=>{
        expect(playTokenVault(undefined)).toBeNull();expect(playTokenVault('too-short')).toBeNull();
        const vault=playTokenVault('ab'.repeat(32))!,hash='c'.repeat(64),a=vault.seal(token,hash),b=vault.seal(token,hash);
        expect(a).not.toContain(token);expect(a).not.toBe(b);expect(vault.open(a,hash)).toBe(token);
    });
    it('rejects moving ciphertext to a different receipt, tampering, or an incorrect key',()=>{
        const vault=playTokenVault('ab'.repeat(32))!,hash='c'.repeat(64),sealed=vault.seal(token,hash);
        expect(()=>vault.open(sealed,'d'.repeat(64))).toThrow('UNAVAILABLE');
        expect(()=>playTokenVault('cd'.repeat(32))!.open(sealed,hash)).toThrow('UNAVAILABLE');
        const parts=sealed.split('.');parts[2]=(parts[2][0]==='a'?'b':'a')+parts[2].slice(1);
        expect(()=>vault.open(parts.join('.'),hash)).toThrow('UNAVAILABLE');
    });
});
