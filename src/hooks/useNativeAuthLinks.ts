'use client';
import { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { useAppPlatform } from './useAppPlatform';
import { listenForNativeLogin } from '../lib/nativeAuthLinks';
import { supabase } from '../lib/supabaseClient';

export function useNativeAuthLinks() {
    const { nativeServices } = useAppPlatform();
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        if (!nativeServices) return;
        return listenForNativeLogin({ app: App,
            exchangeCode: code => supabase.auth.exchangeCodeForSession(code),
            closeBrowser: () => Browser.close(), onError: () => setFailed(true) });
    }, [nativeServices]);
    useEffect(()=>{
        if(!nativeServices)return;
        let active=true;
        const update=(isActive:boolean)=>{if(active){if(isActive)supabase.auth.startAutoRefresh();else supabase.auth.stopAutoRefresh();}};
        const listener=App.addListener('appStateChange',state=>update(state.isActive));
        void App.getState().then(state=>update(state.isActive)).catch(()=>{});
        return()=>{active=false;supabase.auth.stopAutoRefresh();void listener.then(handle=>handle.remove());};
    },[nativeServices]);
    return { failed, dismiss: () => setFailed(false) };
}
