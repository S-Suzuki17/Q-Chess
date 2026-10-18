'use client';
import {useEffect,useRef} from 'react';
import {App} from '@capacitor/app';
import {useAppPlatform} from './useAppPlatform';
import {androidBackHandlers,cancelTopAndroidDialog,installAndroidBack} from '../lib/androidBack';

export function useAndroidBackNavigation(){
 const {nativeServices}=useAppPlatform();
 useEffect(()=>{
  if(!nativeServices)return;
  return installAndroidBack({app:App,dialogs:()=>cancelTopAndroidDialog(document),
   handle:()=>androidBackHandlers.handle(),historyBack:()=>window.history.back()});
 },[nativeServices]);
}

/** Higher priority handles nested in-screen panels before their containing screen. */
export function useAndroidBackHandler(handler:()=>boolean,priority=0){
 const latest=useRef(handler);
 useEffect(()=>{latest.current=handler;});
 useEffect(()=>androidBackHandlers.register(()=>latest.current(),priority),[priority]);
}
