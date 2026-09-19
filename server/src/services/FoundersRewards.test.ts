import {describe,it,expect,vi} from 'vitest';
import {claimFounders,receiptHash,FOUNDERS_PRODUCT,type FoundersStore,type PlayRewardVerifier} from './FoundersRewards';
const token='valid-play-reward-token-0123456789';
function fixture(){
 const rows=new Map<string,string>(),users=new Map<string,string>();
 const store:FoundersStore={verifyUser:async()=>null,owned:async id=>users.has(id),receiptOwner:async hash=>rows.get(hash)??null,
  grant:vi.fn(async(id,hash)=>{if(rows.get(hash)===id)return 'owned';if(rows.has(hash)||users.has(id))return 'conflict';rows.set(hash,id);users.set(id,hash);return 'granted';})};
 const play:PlayRewardVerifier={verify:vi.fn(async()=>({purchaseState:0,consumptionState:0})),consume:vi.fn(async()=>{})};
 return{store,play,rows,users};
}
describe('Play pre-registration entitlement',()=>{
 it('accepts a verified promo without order ID and stores before consuming',async()=>{
  const f=fixture();vi.mocked(f.play.consume).mockImplementation(async()=>{expect(f.rows.get(receiptHash(token))).toBe('alice');});
  expect(await claimFounders('alice',token,f.store,f.play)).toEqual({owned:true,deliveryPending:false});
 });
 it.each([{purchaseState:1,consumptionState:0},{purchaseState:2,consumptionState:0},{purchaseState:0},{purchaseState:0,consumptionState:0,productId:'wrong'},{purchaseState:0,consumptionState:0,quantity:2},{purchaseState:0,consumptionState:0,purchaseType:0},{purchaseState:0,consumptionState:0,obfuscatedExternalAccountId:'other'}])('rejects invalid/non-completed proof %j',async value=>{
  const f=fixture();vi.mocked(f.play.verify).mockResolvedValue(value);
  await expect(claimFounders('alice',token,f.store,f.play)).rejects.toMatchObject({code:'NOT_ELIGIBLE'});
  expect(f.store.grant).not.toHaveBeenCalled();expect(f.play.consume).not.toHaveBeenCalled();
 });
 it('allows license-test receipts only behind a separate test flag',async()=>{
  const f=fixture();vi.mocked(f.play.verify).mockResolvedValue({purchaseState:0,consumptionState:0,productId:FOUNDERS_PRODUCT,purchaseType:0});
  expect((await claimFounders('alice',token,f.store,f.play,true)).owned).toBe(true);
 });
 it('retains grant on consume outage and makes retry idempotent',async()=>{
  const f=fixture();vi.mocked(f.play.consume).mockRejectedValueOnce(new Error('offline'));
  expect((await claimFounders('alice',token,f.store,f.play)).deliveryPending).toBe(true);
  expect((await claimFounders('alice',token,f.store,f.play)).deliveryPending).toBe(false);
  expect(f.rows.size).toBe(1);
 });
 it('rejects cross-account and duplicate-product attempts without moving ownership',async()=>{
  const f=fixture();await claimFounders('alice',token,f.store,f.play);
  await expect(claimFounders('bob',token,f.store,f.play)).rejects.toMatchObject({code:'ALREADY_LINKED'});
  await expect(claimFounders('alice',token+'new',f.store,f.play)).rejects.toMatchObject({code:'ALREADY_LINKED'});
  expect(f.rows.size).toBe(1);
 });
 it('does not mint ownership from a previously consumed token',async()=>{
  const f=fixture();vi.mocked(f.play.verify).mockResolvedValue({purchaseState:0,consumptionState:1});
  await expect(claimFounders('alice',token,f.store,f.play)).rejects.toMatchObject({code:'NOT_ELIGIBLE'});
  f.rows.set(receiptHash(token),'alice');f.users.set('alice',receiptHash(token));
  expect((await claimFounders('alice',token,f.store,f.play)).owned).toBe(true);expect(f.play.consume).not.toHaveBeenCalled();
 });
 it('rejects malicious tokens before any upstream call',async()=>{
  const f=fixture();for(const value of ['x','x'.repeat(4097),'../../other/product','token?alt=media#', 'fake token with space']){
   await expect(claimFounders('alice',value,f.store,f.play)).rejects.toMatchObject({code:'NOT_ELIGIBLE'});
  }expect(f.play.verify).not.toHaveBeenCalled();
 });
 it('fails closed on verification or persistence failure',async()=>{
  const f=fixture();vi.mocked(f.play.verify).mockRejectedValueOnce(new Error('upstream'));
  await expect(claimFounders('alice',token,f.store,f.play)).rejects.toThrow();expect(f.store.grant).not.toHaveBeenCalled();
  vi.mocked(f.store.grant).mockRejectedValueOnce(new Error('db'));
  await expect(claimFounders('alice',token,f.store,f.play)).rejects.toThrow();expect(f.play.consume).not.toHaveBeenCalled();
 });
});
