'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {circuitAccess} from '../lib/circuitAccess';
import {campaignStore} from '../lib/campaignStore';
import {createCampaignSync,parseCloudProgress,type SyncState} from '../lib/campaignSync';
import {requestAccountProfile} from '../lib/accountProfile';
export function useCampaignCloud(enabled=true){
    const access=useSyncExternalStore(circuitAccess.subscribe,circuitAccess.getSnapshot,circuitAccess.getServerSnapshot);
    const [state,setState]=useState<SyncState>('loading');
    const sync=useRef<ReturnType<typeof createCampaignSync>|null>(null);
    useEffect(()=>{
        const id=access.userId;if(!id||!enabled)return;
        campaignStore.selectOwner(id);
        const controller=createCampaignSync(campaignStore,id,async body=>parseCloudProgress(await requestAccountProfile('/account/progress',id,body)),setState);
        sync.current=controller;let timer:ReturnType<typeof setTimeout>|undefined;
        let changes=campaignStore.getChanges();
        const unsubscribe=campaignStore.subscribe(()=>{
            const latest=campaignStore.getChanges();if(latest===changes||campaignStore.getOwner()!==id)return;changes=latest;
            setState('pending');clearTimeout(timer);timer=setTimeout(()=>void controller.flush(),3000);
        });
        void controller.flush();
        const refresh=()=>{if(document.visibilityState==='visible')void controller.flush();};
        const interval=setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);window.addEventListener('online',refresh);
        return()=>{controller.stop();if(sync.current===controller)sync.current=null;unsubscribe();clearTimeout(timer);clearInterval(interval);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('online',refresh);};
    },[access.userId,access.revision,enabled]);
    return {userId:access.userId,state,retry:()=>void sync.current?.flush()};
}
