'use client';
import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { ANDROID_BUILD, platformFeatures } from '../config/appPlatform';

// The native bridge does not change platform while the document is alive.
const subscribe = () => () => {};
const snapshot = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const serverSnapshot = () => false;

export function useAppPlatform() {
    const nativeAndroid = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
    return platformFeatures(ANDROID_BUILD, nativeAndroid);
}
