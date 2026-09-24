import {emptyCampaign,parseCampaign,type CampaignProgress} from '../config/campaign';
import type {createCampaignStore} from './campaignStore';
export type CloudProgress={revision:number;progress:CampaignProgress|null;saved?:boolean};
export type SyncState='loading'|'saved'|'pending'|'error';
export const serializeProgress=(p:CampaignProgress)=>JSON.stringify(p,(key,value)=>key==='foundersOwned'?undefined:value);
/** Single owner, single flight; stale callbacks never cross an account switch. */
export function createCampaignSync(store:ReturnType<typeof createCampaignStore>,owner:string,request:(body?:unknown)=>Promise<CloudProgress>,notify:(state:SyncState)=>void){
    let active=true,pending:Promise<void>|null=null;
    const current=()=>active&&store.getOwner()===owner;
    const flush=()=>{
        if(pending)return pending;
        if(!current())return Promise.resolve();
        pending=(async()=>{
            notify('loading');
            try{
                let remote=await request();
                if(!current())return;
                store.load();store.mergeCloud(remote.progress??emptyCampaign(),store.hasPending()||remote.progress===null);
                for(let attempt=0;attempt<3&&current();attempt++){
                    const local=store.getSnapshot().progress;
                    if(remote.progress&&serializeProgress(local)===serializeProgress(remote.progress)){store.acknowledge();notify('saved');return;}
                    const generation=store.getChanges();
                    remote=await request({revision:remote.revision,progress:JSON.parse(serializeProgress(local))});
                    if(!current())return;
                    const newer=store.getChanges()!==generation;
                    store.mergeCloud(remote.progress??emptyCampaign(),newer||!remote.saved);
                    if(remote.saved&&!newer&&remote.progress&&serializeProgress(store.getSnapshot().progress)===serializeProgress(remote.progress)){store.acknowledge();notify('saved');return;}
                }
                if(current())notify('pending');
            }catch{if(current())notify('error');}
        })().finally(()=>{pending=null;});
        return pending;
    };
    return {flush,stop:()=>{active=false;}};
}
export function parseCloudProgress(value:Record<string,unknown>):CloudProgress {
    if(!Number.isSafeInteger(value.revision)||(value.revision as number)<0||(value.progress!==null&&(!value.progress||typeof value.progress!=='object')))throw new Error('UNAVAILABLE');
    // Preserve selected IDs, not ownership. The store revalidates founders access
    // against the separate server-verified entitlement before anything renders.
    const progress=value.progress===null?null:parseCampaign(JSON.stringify(value.progress),true);
    if(progress)delete progress.foundersOwned;
    return {revision:value.revision as number,progress,saved:value.saved===true};
}
