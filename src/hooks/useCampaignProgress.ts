'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { CAMPAIGN_STORAGE_KEY } from '../config/campaign';
import { campaignStore } from '../lib/campaignStore';

export function useCampaignProgress() {
    const snapshot = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot, campaignStore.getServerSnapshot);
    useEffect(() => {
        campaignStore.load();
        const onStorage = (event: StorageEvent) => {
            if (event.key === CAMPAIGN_STORAGE_KEY) campaignStore.refresh();
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);
    return { ...snapshot, update: campaignStore.update };
}
