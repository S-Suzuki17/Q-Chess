import type {SupabaseClient} from '@supabase/supabase-js';
import type {VerifiedAdReward} from './AdMobVerification';
export type AdKind='hint'|'online';
export interface AdRewardStore {
 ready():Promise<boolean>;
 verifyUser(token:string):Promise<string|null>;
 balance(userId:string):Promise<Record<AdKind,number>>;
 intent(userId:string,kind:AdKind):Promise<string>;
 status(userId:string,id:string):Promise<'pending'|'credited'|'missing'>;
 credit(reward:VerifiedAdReward):Promise<'credited'|'duplicate'|'ignored'>;
}
export function createAdRewardStore(client:SupabaseClient,verifyUser:AdRewardStore['verifyUser']):AdRewardStore{
 const rpc=async(name:string,args:Record<string,unknown>={})=>{
  const {data,error}=await client.rpc(name,args).abortSignal(AbortSignal.timeout(5000));
  if(error)throw new Error('Ad storage unavailable');return data;
 };
 let readyUntil=0;
 return{
  verifyUser,
  async ready(){if(Date.now()<readyUntil)return true;try{if(await rpc('ad_ticket_reward_protocol')!==2)return false;readyUntil=Date.now()+5000;return true;}catch{return false;}},
  async balance(userId){
   const data=await rpc('ad_ticket_reward_balance',{p_user_id:userId});
   if(!data||!['hint','online'].every(key=>Number.isSafeInteger(data[key])&&data[key]>=0))throw new Error('Ad balance unavailable');
   return{hint:data.hint,online:data.online};
  },
  async intent(userId,kind){
   const id=await rpc('create_ad_ticket_reward',{p_user_id:userId,p_kind:kind});
   if(typeof id!=='string'||!/^\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))throw new Error('Ad intent unavailable');return id;
  },
  async status(userId,id){
   const status=await rpc('ad_ticket_reward_status',{p_user_id:userId,p_intent:id});
   if(!['pending','credited','missing'].includes(status))throw new Error('Ad status unavailable');return status;
  },
  async credit(reward){
   const data=await rpc('credit_ad_ticket_reward',{p_intent:reward.intentId,p_kind:reward.kind,p_transaction:reward.transactionId,p_timestamp:reward.timestamp,p_evidence_sha256:reward.evidenceSha256});
   if(!data||!['credited','duplicate','ignored'].includes(data.status))throw new Error('Ad credit unavailable');return data.status;
  },
 };
}
