import {describe,it,expect,vi} from 'vitest';
import {createPlayCommerceService} from './PlayCommerceService';
import type {PlayCommerceStore} from './PlayCommerceStore';
import type {PlayCommerceVerifier} from './PlayCommerceVerifier';
import {playTokenVault} from './PlayCommerceTokenVault';
import {playCommerceReceiptHash} from './PlayCommerceProof';
const token='private-fixture-purchase-token',hash=playCommerceReceiptHash(token),vault=playTokenVault('ab'.repeat(32))!;
const proof={sku:'hints_13',productId:'qg_hints_13',type:'inapp',state:'PURCHASED',test:false,consumed:false,acknowledged:false,refundableQuantity:1};
const applied={userId:'alice',credited:13,duplicate:false,active:false,test:false,deliveryPending:true,reconciliationPending:false};
function fixture(){
 const store={verifyUser:vi.fn(),ready:vi.fn(async()=>true),status:vi.fn(),intent:vi.fn(),acquire:vi.fn(async()=> 'receipt-lease'),release:vi.fn(async()=>{}),apply:vi.fn(async()=>applied),claimDelivery:vi.fn(async()=>null),finishDelivery:vi.fn(async()=>{}),due:vi.fn(async()=>[]),deletionTokens:vi.fn(async()=>[]),tokenByHash:vi.fn(),historicalOrders:vi.fn(async()=>[]),applyHistorical:vi.fn(),advanceHistory:vi.fn(),canceledForDeletion:vi.fn()};
 const verifier={verify:vi.fn(async()=>({purchase:{...proof},order:null,orderUnavailable:false})),deliver:vi.fn(async()=>{}),historical:vi.fn(),cancel:vi.fn(async()=>{})};
 const service=createPlayCommerceService(store as unknown as PlayCommerceStore,verifier as unknown as PlayCommerceVerifier,vault);
 return{store,verifier,service};
}
describe('Play durable delivery and cancellation runtime',()=>{
 it('voided stored orders reconcile after the purchase token has stopped resolving',async()=>{
  const f=fixture(),orderId='GPA.1234-5678-9012-34567',order={orderId,reason:'REFUND_OR_CANCELLATION',paid:false};
  f.store.tokenByHash.mockResolvedValue({tokenHash:hash,sku:'hints_13',test:false,ciphertext:vault.seal(token,hash),historyCursor:-1});
  f.verifier.verify.mockRejectedValue(new Error('purchase token unavailable'));
  f.verifier.historical.mockResolvedValue(order);
  await f.service.notification(null,token,orderId);
  expect(f.verifier.verify).not.toHaveBeenCalled();
  expect(f.verifier.historical).toHaveBeenCalledWith('hints_13',token,orderId,false);
  expect(f.store.applyHistorical).toHaveBeenCalledWith(hash,'receipt-lease',order);
  expect(f.store.release).toHaveBeenCalledWith(hash,'receipt-lease');
 });
 it('unknown or invalid voided evidence cannot grant or bypass the canonical Orders check',async()=>{
  const f=fixture(),orderId='GPA.1234-5678-9012-34567';
  await expect(f.service.notification(null,token,orderId)).rejects.toThrow('BUSY');
  f.store.tokenByHash.mockResolvedValue({tokenHash:hash,sku:'plus_monthly',test:true,ciphertext:vault.seal(token,hash),historyCursor:-1});
  f.verifier.historical.mockRejectedValue(new Error('INVALID_PURCHASE'));
  await expect(f.service.notification(null,token,orderId)).rejects.toThrow('INVALID_PURCHASE');
  expect(f.store.applyHistorical).not.toHaveBeenCalled();expect(f.store.apply).not.toHaveBeenCalled();
  expect(f.store.release).toHaveBeenCalledWith(hash,'receipt-lease');
 });
 it('accounts without renewable subscriptions can erase without provider configuration',async()=>{
  const f=fixture();await createPlayCommerceService(f.store as unknown as PlayCommerceStore,null,null).beforeErase('alice');
  expect(f.verifier.verify).not.toHaveBeenCalled();expect(f.verifier.cancel).not.toHaveBeenCalled();
 });
 it('commits canonical evidence before returning, and receipt processing never consumes directly',async()=>{
  const f=fixture();expect(await f.service.receipt('hints_13',token,'alice')).toEqual(applied);expect(f.store.apply).toHaveBeenCalledWith(expect.objectContaining({userId:'alice',tokenHash:hash,lease:'receipt-lease'}));expect(f.verifier.deliver).not.toHaveBeenCalled();expect(f.store.release).toHaveBeenCalledWith(hash,'receipt-lease');
  expect(JSON.stringify(f.store.apply.mock.calls)).not.toContain(token);
 });
 it('DB failure or concurrent lease prevents external acknowledgement',async()=>{
  const f=fixture();f.store.apply.mockRejectedValueOnce(new Error('database'));await expect(f.service.receipt('hints_13',token,'alice')).rejects.toThrow('database');expect(f.verifier.deliver).not.toHaveBeenCalled();
  f.store.acquire.mockResolvedValueOnce(null as never);await expect(f.service.receipt('hints_13',token,'alice')).rejects.toThrow('BUSY');expect(f.verifier.verify).toHaveBeenCalledOnce();
 });
 it('a post-commit lease release failure does not misreport the committed grant',async()=>{const f=fixture();f.store.release.mockRejectedValueOnce(new Error('lost response'));expect((await f.service.receipt('hints_13',token,'alice')).credited).toBe(13);});
 it('crash after Google consumption but before outbox completion recovers without another consume',async()=>{
  const f=fixture(),job={tokenHash:hash,sku:'hints_13',ciphertext:vault.seal(token,hash),action:'consume',lease:'job-lease'};
  f.store.claimDelivery.mockResolvedValueOnce(job as never).mockResolvedValueOnce(job as never);
  f.verifier.deliver.mockImplementationOnce(async()=>{f.verifier.verify.mockResolvedValue({purchase:{...proof,consumed:true},order:null,orderUnavailable:false});});
  f.store.finishDelivery.mockRejectedValueOnce(new Error('crash'));await expect(f.service.deliver()).rejects.toThrow('crash');await f.service.deliver();
  expect(f.verifier.deliver).toHaveBeenCalledOnce();expect(f.store.finishDelivery).toHaveBeenLastCalledWith(job,true);
 });
 it('deletion requires verified renewal cancellation and cannot erase while configuration is missing',async()=>{
  const f=fixture(),row={tokenHash:hash,sku:'plus_monthly',ciphertext:vault.seal(token,hash),test:false,historyCursor:-1};f.store.deletionTokens.mockResolvedValue([row] as never);
  f.verifier.verify.mockResolvedValueOnce({purchase:{...proof,sku:'plus_monthly',type:'subs',cancelAtPeriodEnd:false,state:'SUBSCRIPTION_STATE_ACTIVE'} as never,order:null,orderUnavailable:false}).mockResolvedValueOnce({purchase:{...proof,sku:'plus_monthly',type:'subs',cancelAtPeriodEnd:true,state:'SUBSCRIPTION_STATE_CANCELED'} as never,order:null,orderUnavailable:false});
  await f.service.beforeErase('alice');expect(f.verifier.cancel).toHaveBeenCalledWith('plus_monthly',token);expect(f.store.canceledForDeletion).toHaveBeenCalledOnce();
  await expect(createPlayCommerceService(f.store as unknown as PlayCommerceStore,null,null).beforeErase('alice')).rejects.toThrow('UNAVAILABLE');
 });
 it('does not mark deletion canceled when the provider has not confirmed cancellation',async()=>{
  const f=fixture();f.store.deletionTokens.mockResolvedValue([{tokenHash:hash,sku:'plus_monthly',ciphertext:vault.seal(token,hash),test:false,historyCursor:-1}] as never);
  f.verifier.verify.mockResolvedValue({purchase:{...proof,sku:'plus_monthly',type:'subs',cancelAtPeriodEnd:false,state:'SUBSCRIPTION_STATE_ACTIVE'} as never,order:null,orderUnavailable:false});
  await expect(f.service.beforeErase('alice')).rejects.toThrow('UNAVAILABLE');expect(f.store.canceledForDeletion).not.toHaveBeenCalled();
 });
});
