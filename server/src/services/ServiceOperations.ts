import type {SupabaseClient} from '@supabase/supabase-js';
import type {RequestHandler} from 'express';

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
export function createServiceOperations(load:()=>Promise<ServiceStatus>,now=Date.now) {
    let cached:ServiceStatus|undefined,until=0,failedUntil=0,pending:Promise<ServiceStatus>|undefined;
    const read=async()=>{
        if(cached&&now()<until)return cached;
        if(now()<failedUntil)throw new Error('STATUS_UNAVAILABLE');
        if(!pending)pending=load().then(value=>{cached=value;until=now()+5000;return value;}).catch(()=>{failedUntil=now()+5000;throw new Error('STATUS_UNAVAILABLE');}).finally(()=>{pending=undefined;});
        // An expired success is not used when the status source fails.
        return pending;
    };
    const admission=async(client?:{protocol?:unknown;platform?:unknown;build?:unknown}):Promise<string|null>=>{
        try{
            const state=await read();
            if(state.maintenance)return 'MAINTENANCE';
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
    return {read,admission,loginGuard,acceptingNewMatches:()=>!!cached&&now()<until&&!cached.maintenance};
}
export const createServiceStatusLoader=(client:SupabaseClient)=>async()=>{
    const {data,error}=await client.from('system_status').select('maintenance_mode,announcement_en,announcement_ja,announcements,minimum_android_build,minimum_protocol,updated_at').eq('id',1).single();
    if(error)throw new Error('STATUS_UNAVAILABLE');return parseServiceStatus(data);
};
