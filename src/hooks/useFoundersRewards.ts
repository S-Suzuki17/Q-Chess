'use client';
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {User} from '../types/game';
import {useCircuitAccess} from './useCircuitAccess';
import {circuitAccess} from '../lib/circuitAccess';
import {campaignStore} from '../lib/campaignStore';
import {RANKED_SESSION_EVENT} from '../lib/rankedSession';
import {canRestorePlayRewards,foundersPurchaseAvailable,FoundersClientError,readFoundersStatus,restoreFounders,type FoundersErrorCode,type FoundersStatus} from '../lib/foundersRewards';

export function useFoundersRewards(user:User|null,locked:boolean){
    const {allowed,revision}=useCircuitAccess(user),userId=allowed&&user?user.id:null;
    const [result,setResult]=useState<FoundersStatus|null>(null),[busy,setBusy]=useState(false);
    const [error,setError]=useState<FoundersErrorCode|null>(null),[native,setNative]=useState(false);
    const [available,setAvailable]=useState(false);
    const operation=useRef<AbortController|null>(null),lock=useRef(locked);
    useLayoutEffect(()=>{lock.current=locked;if(locked){operation.current?.abort();operation.current=null;}},[locked]);
    useEffect(()=>{setNative(canRestorePlayRewards());},[]);
    useEffect(()=>{
        campaignStore.setFoundersAccess(false);setResult(null);setError(null);setBusy(false);setAvailable(false);
        // Revoke immediately on auth change, without waiting for a network response.
        const unsubscribe=circuitAccess.subscribe(()=>{operation.current?.abort();campaignStore.setFoundersAccess(false);});
        return()=>{unsubscribe();operation.current?.abort();operation.current=null;campaignStore.setFoundersAccess(false);};
    },[userId,revision]);
    const run=useCallback(async(claim=false)=>{
        if(!userId||lock.current||operation.current||circuitAccess.getSnapshot().userId!==userId||circuitAccess.getSnapshot().revision!==revision)return;
        const controller=new AbortController();operation.current=controller;setBusy(true);setError(null);
        const current=()=>!controller.signal.aborted&&circuitAccess.getSnapshot().userId===userId&&circuitAccess.getSnapshot().revision===revision&&!lock.current;
        try{
            const value=await (claim?restoreFounders:readFoundersStatus)(userId,controller.signal);
            if(!current())return;
            setResult(value);campaignStore.setFoundersAccess(value.owned);
            if(value.owned||!value.enabled)setAvailable(false);
            else if(!claim){
                // Discover the bonus for an in-app notice; association still requires
                // the explicit button naming the destination game account.
                try{const found=await foundersPurchaseAvailable(controller.signal);if(current())setAvailable(found);}
                catch{/* An unavailable Play Store must not invalidate server ownership. */}
            }
        }catch(cause){if(current())setError(cause instanceof FoundersClientError?cause.code:'UNAVAILABLE');}
        finally{if(operation.current===controller){operation.current=null;setBusy(false);}}
    },[userId,revision]);
    useEffect(()=>{
        if(locked){operation.current?.abort();operation.current=null;setBusy(false);return;}
        void run();
        const refresh=()=>{if(document.visibilityState==='visible')void run();};
        document.addEventListener('visibilitychange',refresh);window.addEventListener(RANKED_SESSION_EVENT,refresh);
        return()=>{document.removeEventListener('visibilitychange',refresh);window.removeEventListener(RANKED_SESSION_EVENT,refresh);operation.current?.abort();operation.current=null;};
    },[locked,run]);
    return {signedIn:!!userId,native,busy,error,available:!!userId&&available,status:result?.userId===userId?result:null,refresh:()=>run(),claim:()=>run(true)};
}
