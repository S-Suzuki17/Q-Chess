import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {AdMobVerification} from './AdMobVerification';
const id='00000000-0000-4000-8000-000000000001',now=Date.now();
const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),pem=keys.publicKey.export({format:'pem',type:'spki'}).toString();
const body=(change:Record<string,string>={})=>new URLSearchParams({ad_network:'5450213213286189855',ad_unit:'8141474158',custom_data:id,reward_amount:'3',reward_item:'hint_uses',timestamp:String(now),transaction_id:'abcdef12345678',user_id:id,...change}).toString();
const signed=(value:string)=>value+'&signature='+sign('sha256',Buffer.from(value),keys.privateKey).toString('base64url')+'&key_id=7';
const fixture=()=>new AdMobVerification(async()=>({keys:[{keyId:7,pem}]}),()=>now);
describe('AdMob original-byte ECDSA verifier',()=>{
 it('accepts independently signed live-unit evidence and stores only a digest of the signed bytes',async()=>{
  const value=body(),proof=await fixture().verifyQuery(signed(value));
  expect(proof).toEqual({kind:'hint',intentId:id,transactionId:'abcdef12345678',timestamp:now,evidenceSha256:createHash('sha256').update(value).digest('hex')});
  expect(proof).not.toHaveProperty('userId');expect(proof).not.toHaveProperty('signature');
 });
 it('accepts the online unit only with its configured fixed reward',async()=>{
  expect(await fixture().verifyQuery(signed(body({ad_unit:'2288802662',reward_item:'online_uses'})))).toMatchObject({kind:'online'});
 });
 it.each([
  {ad_unit:'2980646811'},{ad_unit:'5224354917'},{reward_amount:'300'},
  {reward_item:'online_uses'},{user_id:'actual-account'},{user_id:''},{custom_data:'------------------------------------'},
  {transaction_id:'bad&transaction'},{timestamp:String(now+300001)},{timestamp:'NaN'},
 ])('rejects even signed evidence with an invalid reward binding: %j',async change=>{
  expect(await fixture().verifyQuery(signed(body(change)))).toBeNull();
 });
 it('rejects tampering, duplicate parameters and misplaced signature before storage is possible',async()=>{
  const value=signed(body());expect(await fixture().verifyQuery(value.replace('reward_amount=3','reward_amount=4'))).toBeNull();
  expect(await fixture().verifyQuery(signed(body()+'&custom_data='+id))).toBeNull();
  expect(await fixture().verifyQuery(value+'&extra=1')).toBeNull();
 });
 it('coalesces provider key downloads and does not accept a different synthetic signer',async()=>{
  const load=vi.fn(async()=>({keys:[{keyId:7,pem}]})),verifier=new AdMobVerification(load,()=>now);
  await Promise.all([verifier.verifyQuery(signed(body())),verifier.verifyQuery(signed(body()))]);expect(load).toHaveBeenCalledOnce();
  const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const forged=body()+'&signature='+sign('sha256',Buffer.from(body()),other.privateKey).toString('base64url')+'&key_id=7';
  expect(await verifier.verifyQuery(forged)).toBeNull();
 });
});
