import type {SupabaseClient} from '@supabase/supabase-js';
import type {RequestHandler} from 'express';
import {isRankedUserId} from './RankedAuth';

export interface ServiceStatus {
    maintenance: boolean;
    minimumAndroidBuild: number;
    minimumProtocol: number;
    announcement: Record<string,string>;
    revision: string;
}
export function parseServiceStatus(value:unknown):ServiceStatus {
    if(!value||typeof value!=='object')throw new Error('STATUS_UNAVAILABLE');
    const row=value as Record<string,unknown>;
    if(typeof row.maintenance_mode!=='boolean')throw new Error('STATUS_UNAVAILABLE');
    const number=(key:string)=>{const n=row[key]??0;if(!Number.isSafeInteger(n)||(n as number)<0)throw new Error('STATUS_UNAVAILABLE');return n as number;};
    const announcement:Record<string,string>={};
    for(const lang of ['en','ja','zh','ru','fr','de','es','tr','pl','hi','pt','ta']){
        const text=(row.announcements as Record<string,unknown>|undefined)?.[lang]??row[`announcement_${lang}`];
        if(typeof text==='string'&&text.trim())announcement[lang]=text.trim().slice(0,2000);
    }
    return {maintenance:row.maintenance_mode,minimumAndroidBuild:number('minimum_android_build'),minimumProtocol:number('minimum_protocol'),announcement,revision:typeof row.updated_at==='string'?row.updated_at:''};
}
/** Every Tuesday 11:00 <= JST < 14:00, equivalently 02:00 <= UTC < 05:00. */
export function scheduledMaintenanceAt(timestamp:number):boolean {
    const utc=new Date(timestamp);
    return utc.getUTCDay()===2&&utc.getUTCHours()>=2&&utc.getUTCHours()<5;
}
export function createServiceOperations(load:()=>Promise<ServiceStatus>,now=Date.now) {
    let cached:ServiceStatus|undefined,until=0,failedUntil=0,pending:Promise<ServiceStatus>|undefined;
    const readStored=async()=>{
        if(cached&&now()<until)return cached;
        if(now()<failedUntil)throw new Error('STATUS_UNAVAILABLE');
        if(!pending)pending=load().then(value=>{cached=value;until=now()+5000;return value;}).catch(()=>{failedUntil=now()+5000;throw new Error('STATUS_UNAVAILABLE');}).finally(()=>{pending=undefined;});
        // An expired success is not used when the status source fails.
        return pending;
    };
    // Cache the operator's status only. Recompute the schedule for each caller,
    // so a warm five-second cache never postpones either time boundary.
    const read=async()=>{
        const state=await readStored();
        return {...state,maintenance:state.maintenance||scheduledMaintenanceAt(now())};
    };
    const admission=async(client?:{protocol?:unknown;platform?:unknown;build?:unknown}):Promise<string|null>=>{
        try{
            const state=await readStored();
            if(state.maintenance||scheduledMaintenanceAt(now()))return 'MAINTENANCE';
            if(state.minimumProtocol>0&&(!Number.isSafeInteger(client?.protocol)||(client!.protocol as number)<state.minimumProtocol))return 'UPDATE_REQUIRED';
            if(client?.platform==='android'&&state.minimumAndroidBuild>0&&(!Number.isSafeInteger(client.build)||(client.build as number)<state.minimumAndroidBuild))return 'UPDATE_REQUIRED';
            return null;
        }catch{return 'SERVICE_UNAVAILABLE';}
    };
    const loginGuard:RequestHandler=async(req,res,next)=>{
        if(!['/auth/register','/auth/ranked-session'].includes(req.path)){next();return;}
        const code=await admission({protocol:Number(req.headers['x-qg-protocol']),platform:req.headers['x-qg-platform'],build:Number(req.headers['x-qg-build'])});
        if(code){res.setHeader('Cache-Control','no-store');res.setHeader('Retry-After','30');res.status(code==='UPDATE_REQUIRED'?426:503).json({code});return;}next();
    };
    // Synchronous final fence after all admission awaits. A stale status never
    // starts a new engine; existing engines and reconnections do not use it.
    const newMatchError=():string|null=>{
        if(scheduledMaintenanceAt(now())||cached?.maintenance)return 'MAINTENANCE';
        return !cached||now()>=until?'SERVICE_UNAVAILABLE':null;
    };
    return {read,admission,loginGuard,newMatchError,acceptingNewMatches:()=>newMatchError()===null};
}
export const createServiceStatusLoader=(client:SupabaseClient)=>async()=>{
    const {data,error}=await client.from('system_status').select('maintenance_mode,announcement_en,announcement_ja,announcements,minimum_android_build,minimum_protocol,updated_at').eq('id',1).single();
    if(error)throw new Error('STATUS_UNAVAILABLE');return parseServiceStatus(data);
};

/** Explicit OAuth callbacks enter here. Existing-session inspection/reconnect stays separate. */
export function createOAuthAdmissionHandler(operations:Pick<ReturnType<typeof createServiceOperations>,'admission'>,verifyUser:(token:string)=>Promise<string|null>):RequestHandler {
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
  const client={protocol:Number(req.headers['x-qg-protocol']),platform:req.headers['x-qg-platform'],build:Number(req.headers['x-qg-build'])};
  const reject=(code:string)=>{res.setHeader('Retry-After','30');res.status(code==='UPDATE_REQUIRED'?426:503).json({code});};
  try{
   const unavailable=await operations.admission(client);if(unavailable){reject(unavailable);return;}
   const token=/^Bearer ([-\w]+\.[-\w]+\.[-\w]+)$/i.exec(req.headers.authorization??'')?.[1];
   if(!token||token.length>8192||Object.keys(req.query).length){res.status(401).json({code:'AUTH_REQUIRED'});return;}
   const userId=await verifyUser(token);
   if(!isRankedUserId(userId)){res.status(401).json({code:'AUTH_REQUIRED'});return;}
   // The provider check can cross the scheduled boundary or refresh the cache.
   const finalUnavailable=await operations.admission(client);if(finalUnavailable){reject(finalUnavailable);return;}
   res.json({userId,admitted:true});
  }catch{reject('SERVICE_UNAVAILABLE');}
 };
}
