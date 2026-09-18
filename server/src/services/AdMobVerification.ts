import {createPublicKey,verify} from 'node:crypto';

const KEY_URL='https://www.gstatic.com/admob/reward/verifier-keys.json';
const UNITS:Record<string,{kind:'hint'|'online';item:string}>={
 '8141474158':{kind:'hint',item:'hint_uses'},
 '2288802662':{kind:'online',item:'online_uses'},
};
type KeySet={keys:{keyId:number;pem:string}[]};
export type VerifiedAdReward={kind:'hint'|'online';intentId:string;transactionId:string;timestamp:number};

/** Verifies Google evidence only. The caller must additionally atomically check a
 * server-issued, unexpired intent and unique transaction before granting credit.
 * Never accept a client "earned" event as input to a credit operation. */
export class AdMobVerification {
 private keys=new Map<string,string>();
 private expires=0;
 private refreshing?:Promise<void>;
 constructor(private fetchKeys:()=>Promise<KeySet>=async()=>{
  const response=await fetch(KEY_URL,{signal:AbortSignal.timeout(5000),redirect:'error'});
  if(!response.ok)throw new Error('AdMob key service unavailable');
  return response.json() as Promise<KeySet>;
 },private now=Date.now){}
 private async refresh(){
  await(this.refreshing??=(async()=>{
   const data=await this.fetchKeys();
   if(!Array.isArray(data.keys)||!data.keys.length||data.keys.length>20)throw new Error('Invalid AdMob keys');
   const keys=new Map<string,string>();
   for(const key of data.keys){
    if(!Number.isSafeInteger(key.keyId)||typeof key.pem!=='string'||key.pem.length>4096)throw new Error('Invalid AdMob key');
    if(createPublicKey(key.pem).asymmetricKeyType!=='ec')throw new Error('Invalid AdMob key type');
    keys.set(String(key.keyId),key.pem);
   }
   this.keys=keys;this.expires=this.now()+3600000;
  })().finally(()=>{this.refreshing=undefined;}));
 }
 async verifyQuery(rawQuery:string):Promise<VerifiedAdReward|null>{
  // The signature covers the original bytes, not re-encoded URLSearchParams.
  if(rawQuery.length>8192)return null;
  const match=/^(.+)&signature=([^&]+)&key_id=(\d+)$/.exec(rawQuery);
  if(!match)return null;
  const params=new URLSearchParams(rawQuery),seen=new Set<string>();
  for(const key of params.keys()){if(seen.has(key))return null;seen.add(key);}
  const signature=params.get('signature')!;
  if(!/^[A-Za-z0-9_-]{70,110}={0,2}$/.test(signature))return null;
  if(this.now()>=this.expires)await this.refresh();
  const pem=this.keys.get(match[3]);
  if(!pem)return null; // Unknown IDs cannot force unbounded outbound refreshes.
  try{if(!verify('sha256',Buffer.from(match[1],'utf8'),pem,Buffer.from(signature,'base64url')))return null;}catch{return null;}
  const unit=(params.get('ad_unit')??'').replace(/^ca-app-pub-1116866075179199\//,'');
  const config=UNITS[unit];
  const timestamp=Number(params.get('timestamp'));
  const intentId=params.get('custom_data')??'',transactionId=params.get('transaction_id')??'';
  if(!config||params.get('reward_amount')!=='3'||params.get('reward_item')!==config.item)return null;
  if(!Number.isSafeInteger(timestamp)||timestamp<=0||timestamp>this.now()+300000)return null;
  if(!/^[0-9a-f-]{36}$/i.test(intentId)||!/^\w{8,128}$/.test(transactionId))return null;
  return{kind:config.kind,intentId,transactionId,timestamp};
 }
}
