'use client';
import { useCallback,useEffect, useSyncExternalStore } from 'react';
import type {CampaignProgress} from '../config/campaign';
import { campaignStore } from '../lib/campaignStore';

export function useCampaignProgress() {
    const snapshot = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot, campaignStore.getServerSnapshot);
    const owner=campaignStore.getOwner();
    const update=useCallback((change:(progress:CampaignProgress)=>CampaignProgress)=>campaignStore.update(change,owner),[owner]);
    useEffect(() => {
        campaignStore.load();
        const onStorage = (event: StorageEvent) => {
            if (event.key===null||event.key === campaignStore.getStorageKey()) campaignStore.refresh();
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);
    return { ...snapshot, update };
}
