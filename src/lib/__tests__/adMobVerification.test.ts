import {generateKeyPairSync,sign} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {AdMobVerification} from '../../../server/src/services/AdMobVerification';

const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const now=Date.now();
const intent='00000000-0000-4000-8000-000000000001';
const body=`ad_unit=8141474158&custom_data=${intent}&reward_amount=3&reward_item=hint_uses&timestamp=${now}&transaction_id=abcdef0123456789`;
const signed=(value:string)=>`${value}&signature=${sign('sha256',Buffer.from(value),privateKey).toString('base64url')}&key_id=7`;
function fixture(){
 const fetchKeys=vi.fn(async()=>({keys:[{keyId:7,pem:publicKey.export({type:'spki',format:'pem'}).toString()}]}));
 return{verifier:new AdMobVerification(fetchKeys,()=>now),fetchKeys};
}
describe('AdMob SSV signature verification (no real impressions)',()=>{
 it('accepts signed evidence and caches public keys',async()=>{
  const {verifier,fetchKeys}=fixture();
  expect(await verifier.verifyQuery(signed(body))).toEqual({kind:'hint',intentId:intent,transactionId:'abcdef0123456789',timestamp:now});
  await verifier.verifyQuery(signed(body));expect(fetchKeys).toHaveBeenCalledOnce();
 });
 it('rejects altered signed bytes, duplicate parameters and unknown keys',async()=>{
  const {verifier}=fixture();
  expect(await verifier.verifyQuery(signed(body).replace('hint_uses','online_uses'))).toBeNull();
  expect(await verifier.verifyQuery(signed(body+'&reward_amount=3'))).toBeNull();
  expect(await verifier.verifyQuery(signed(body).replace('key_id=7','key_id=8'))).toBeNull();
 });
 it('rejects other units, wrong reward, invalid intent and future timestamp even with a valid signature',async()=>{
  const {verifier}=fixture();
  for(const invalid of [body.replace('8141474158','6713289529'),body.replace('reward_amount=3','reward_amount=300'),body.replace(intent,'arbitrary-client-id'),body.replace(String(now),String(now+3600000))]){
   expect(await verifier.verifyQuery(signed(invalid))).toBeNull();
  }
 });
 it('fails closed when the key service is unavailable',async()=>{
  const verifier=new AdMobVerification(async()=>{throw new Error('offline');});
  await expect(verifier.verifyQuery(signed(body))).rejects.toThrow('offline');
 });
});
