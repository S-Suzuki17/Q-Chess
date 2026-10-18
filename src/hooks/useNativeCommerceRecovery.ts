'use client';
import {useEffect} from 'react';
import {App} from '@capacitor/app';
import type {User} from '../types/game';
import {useCircuitAccess} from './useCircuitAccess';
import {circuitAccess} from '../lib/circuitAccess';
import {nativeCommerceEnabled,readNativeCommerce,restoreNativeCommerce} from '../lib/nativeCommerce';
import {startNativeCommerceRecovery} from '../lib/nativeCommerceRecovery';

export function useNativeCommerceRecovery(user:User|null){
 const {allowed,revision}=useCircuitAccess(user);
 useEffect(()=>{
  if(!user||!allowed||!nativeCommerceEnabled())return;
  const permit=circuitAccess.permit(user);let active=true;
  const current=()=>active&&permit();
  const recovery=startNativeCommerceRecovery({app:App,current,reconcile:async()=>{
   const status=await readNativeCommerce(user.id);
   // Pausing new sales must not prevent recovery of an existing purchase.
   if(current()&&status.ready)await restoreNativeCommerce(user.id,current);
  }});
  window.addEventListener('online',recovery.refresh);
  return()=>{active=false;recovery.dispose();window.removeEventListener('online',recovery.refresh);};
 },[user?.id,allowed,revision]);
}
