export type RewardKind='hint'|'online';
export type RewardOutcome='credited'|'pending'|'cancelled'|'unavailable'|'busy';
type Dependencies={
 enabled:()=>boolean;
 request:(userId:string,path:string,body?:unknown)=>Promise<Record<string,unknown>>;
 show:(kind:RewardKind,proof:{userId:string;intentId:string})=>Promise<string>;
 wait:(ms:number)=>Promise<void>;
};
/** Serializes the complete intent -> SDK -> server confirmation sequence, not
 * just the SDK display. No client event is allowed to mutate a balance. */
export function createRewardFlow(deps:Dependencies){
 let active=false;
 return async(userId:string,kind:RewardKind):Promise<RewardOutcome>=>{
  if(!deps.enabled())return 'unavailable';
  if(active)return 'busy';
  active=true;let earned=false;
  try{
   const {intentId}=await deps.request(userId,'/ads/reward',{kind});
   if(typeof intentId!=='string'||!/^\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(intentId))return 'unavailable';
   const result=await deps.show(kind,{userId:intentId,intentId});
   if(result!=='earned')return result==='dismissed'?'cancelled':result==='busy'?'busy':'unavailable';
   earned=true;
   for(let i=0;i<5;i++){
    const data=await deps.request(userId,`/ads/reward/${intentId}`);
    if(data.status==='credited')return 'credited';
    if(i<4)await deps.wait(1500);
   }
   return 'pending';
  }catch{
   // Losing network after watching must not misleadingly say no ad was viewed.
   // The durable server balance updates when SSV arrives, even if the app closes.
   return earned?'pending':'unavailable';
  }finally{active=false;}
 };
}
