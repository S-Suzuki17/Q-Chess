import type {SupabaseClient} from '@supabase/supabase-js';
import type {VerifiedAdReward} from './AdMobVerification';
export type AdKind='hint'|'online';
export interface AdRewardStore {
 verifyUser(token:string):Promise<string|null>;
 balance(userId:string):Promise<Record<AdKind,number>>;
 intent(userId:string,kind:AdKind):Promise<string>;
 status(userId:string,id:string):Promise<'pending'|'credited'|'missing'>;
 credit(reward:VerifiedAdReward):Promise<boolean>;
 consume(userId:string,kind:AdKind,id:string):Promise<boolean>;
}
export function createAdRewardStore(client:SupabaseClient,verifyUser:AdRewardStore['verifyUser']):AdRewardStore{
 const check=(error:unknown)=>{if(error)throw new Error('Ad storage unavailable');};
 return{
  verifyUser,
  async balance(userId){
   const {data,error}=await client.from('ad_allowances').select('kind,day,used,bonus').eq('user_id',userId);check(error);
   const today=new Date().toISOString().slice(0,10),balance={hint:3,online:3};
   for(const row of data??[])if(row.kind==='hint'||row.kind==='online')balance[row.kind as AdKind]=Math.max(0,3-(row.day===today?row.used:0))+row.bonus;
   return balance;
  },
  async intent(userId,kind){
   const {data,error}=await client.from('ad_reward_intents').insert({user_id:userId,kind}).select('id').single();check(error);
   if(!data?.id)throw new Error('Ad intent unavailable');return data.id;
  },
  async status(userId,id){
   const {data,error}=await client.from('ad_reward_intents').select('credited_at').eq('id',id).eq('user_id',userId).maybeSingle();check(error);
   return !data?'missing':data.credited_at?'credited':'pending';
  },
  async credit(reward){
   const {data,error}=await client.rpc('ad_credit',{p_intent:reward.intentId,p_kind:reward.kind,p_transaction:reward.transactionId,p_timestamp:reward.timestamp});check(error);return data===true;
  },
  async consume(userId,kind,id){
   const {data,error}=await client.rpc('ad_consume',{p_user:userId,p_kind:kind,p_action:id});check(error);return data===true;
  },
 };
}
