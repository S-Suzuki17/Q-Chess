import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({android:vi.fn(()=>true),api:vi.fn(),products:vi.fn(),purchase:vi.fn(),restore:vi.fn(),open:vi.fn(),resetAds:vi.fn(),dispatch:vi.fn()}));
vi.mock('@capacitor/core',()=>({registerPlugin:()=>({commerceProducts:mock.products,commercePurchase:mock.purchase,commerceRestore:mock.restore})}));
vi.mock('@capacitor/browser',()=>({Browser:{open:mock.open}}));
vi.mock('./nativeAds',()=>({isAndroidApp:mock.android}));
vi.mock('./nativeRewards',()=>({requestRewardApi:mock.api}));
vi.mock('./dailyLoginRewards',()=>({DAILY_LOGIN_REWARD_CHANGED_EVENT:'fixture-balance-change'}));
vi.mock('./sharedAdEligibility',()=>({resetAdEntitlement:mock.resetAds}));
import {buyNativeCommerce,restoreNativeCommerce,nativeCommercePrices,manageNativeCommerce,readNativeCommerce} from './nativeCommerce';
const price={sku:'hints_13' as const,price:'¥1,500',currency:'JPY',priceMicros:'1500000000',period:'' as const};
const intent={userId:'alice',sku:'hints_13',accountId:'a'.repeat(64),intentId:'b'.repeat(64)};
beforeEach(()=>{vi.resetAllMocks();mock.android.mockReturnValue(true);vi.stubEnv('NEXT_PUBLIC_NATIVE_COMMERCE_ENABLED','true');vi.stubGlobal('window',{dispatchEvent:mock.dispatch});mock.api.mockResolvedValue(intent);});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('native commerce bridge trusts only server and Google boundaries',()=>{
 it('uses provider regional price, rejects duplicates and never invents unavailable products',async()=>{
  mock.products.mockResolvedValue({products:[price]});expect(await nativeCommercePrices()).toEqual([price]);
  mock.products.mockResolvedValue({products:[price,price]});await expect(nativeCommercePrices()).rejects.toThrow('UNAVAILABLE');
  mock.products.mockResolvedValue({products:[{...price,priceMicros:'0'}]});await expect(nativeCommercePrices()).rejects.toThrow('UNAVAILABLE');
  mock.products.mockResolvedValue({products:[]});expect(await nativeCommercePrices()).toEqual([]);
 });
 it('canceled flow releases only its intent and does not submit or grant a receipt',async()=>{
  mock.purchase.mockResolvedValue({status:'cancelled',purchases:[]});expect(await buyNativeCommerce('alice',price,()=>true)).toBe('cancelled');
  expect(mock.purchase).toHaveBeenCalledWith({...price,accountId:intent.accountId,intentId:intent.intentId});expect(mock.api).toHaveBeenLastCalledWith('alice','/commerce/play/intent/cancel',{intentId:intent.intentId});expect(mock.dispatch).not.toHaveBeenCalled();
 });
 it('price change releases the unlaunched flow but an ambiguous failure preserves recovery',async()=>{
  mock.purchase.mockRejectedValueOnce(new Error('PRICE_CHANGED'));await expect(buyNativeCommerce('alice',price,()=>true)).rejects.toThrow('PRICE_CHANGED');expect(mock.api).toHaveBeenCalledTimes(2);
  mock.api.mockClear();mock.purchase.mockRejectedValueOnce(new Error('network'));await expect(buyNativeCommerce('alice',price,()=>true)).rejects.toThrow('network');expect(mock.api).toHaveBeenCalledTimes(1);
 });
 it('identity changes before purchase or after callback cannot submit another account receipt',async()=>{
  let allowed=true;mock.api.mockImplementationOnce(async()=>{allowed=false;return intent;});await expect(buyNativeCommerce('alice',price,()=>allowed)).rejects.toThrow();expect(mock.purchase).not.toHaveBeenCalled();
  allowed=true;mock.restore.mockImplementationOnce(async()=>{allowed=false;return{purchases:[{sku:'hints_13',state:'purchased',purchaseToken:'private-fixture-token'}]};});await expect(restoreNativeCommerce('alice',()=>allowed)).rejects.toThrow('AUTH_REQUIRED');expect(mock.dispatch).not.toHaveBeenCalled();
 });
 it('an unavailable subscription product releases its intent so the corrected catalog can be retried',async()=>{
  const subscription={...price,sku:'plus_monthly' as const,period:'P1M' as const};let busy=false;
  mock.api.mockImplementation(async(_user,path)=>{
   if(path==='/commerce/play/intent/cancel'){busy=false;return {};}
   if(busy)throw new Error('BUSY');busy=true;return {...intent,sku:subscription.sku};
  });
  mock.purchase.mockRejectedValueOnce(new Error('PRODUCT_UNAVAILABLE')).mockResolvedValueOnce({status:'received',purchases:[]});
  await expect(buyNativeCommerce('alice',subscription,()=>true)).rejects.toThrow('PRODUCT_UNAVAILABLE');
  expect(busy).toBe(false);expect(await buyNativeCommerce('alice',subscription,()=>true)).toBe('done');
  expect(mock.purchase).toHaveBeenCalledTimes(2);
 });
 it('pending has no token submission; committed receipt refreshes state without minting locally',async()=>{
  mock.restore.mockResolvedValueOnce({purchases:[{sku:'hints_13',state:'pending'}]});expect(await restoreNativeCommerce('alice',()=>true)).toBe('pending');expect(mock.api).not.toHaveBeenCalled();
  mock.restore.mockResolvedValueOnce({purchases:[{sku:'hints_13',state:'purchased',purchaseToken:'private-fixture-token'}]});mock.api.mockResolvedValueOnce({userId:'alice',reconciliationPending:false,deliveryPending:true});expect(await restoreNativeCommerce('alice',()=>true)).toBe('pending');expect(mock.resetAds).toHaveBeenCalled();expect(mock.api).toHaveBeenCalledWith('alice','/commerce/play/receipt',{sku:'hints_13',purchaseToken:'private-fixture-token'});
 });
 it('server owner mismatch and unknown balance remain unavailable',async()=>{
  mock.api.mockResolvedValueOnce({userId:'bob',ready:true,enabled:true});await expect(readNativeCommerce('alice')).rejects.toThrow('UNAVAILABLE');
  mock.api.mockResolvedValueOnce({userId:'alice',ready:false,enabled:false});expect((await readNativeCommerce('alice')).ready).toBe(false);
 });
 it('Web has no native purchase flow and management opens only the fixed Play destination',async()=>{
  mock.android.mockReturnValue(false);await expect(buyNativeCommerce('alice',price,()=>true)).rejects.toThrow('AUTH_REQUIRED');expect(mock.api).not.toHaveBeenCalled();mock.android.mockReturnValue(true);await manageNativeCommerce('plus_monthly');expect(mock.open).toHaveBeenCalledWith({url:'https://play.google.com/store/account/subscriptions?package=com.qgambit.app&sku=qg_plus_monthly'});
 });
});
