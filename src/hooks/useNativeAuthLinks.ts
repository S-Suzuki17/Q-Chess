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
    return { failed, dismiss: () => setFailed(false) };
}
