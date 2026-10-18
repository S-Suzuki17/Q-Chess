import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { totalCircuitStars } from '../config/campaign';
import { campaignStore } from '../lib/campaignStore';
import { gameStatsAvailable, playGameStats } from '../lib/playGameStats';

/** Send the loaded progress on launch, actual progress changes and foreground resumes. */
export function usePlayGameStatsProgress() {
    useEffect(() => {
        if (!gameStatsAvailable()) return;
        let active = true;
        let last: string | null = null;
        const report = (force = false) => {
            const snapshot = campaignStore.getSnapshot();
            if (!active || !snapshot.loaded) return;
            const progress = totalCircuitStars(snapshot.progress);
            const identity = JSON.stringify([campaignStore.getOwner(), progress]);
            if (!force && last === identity) return;
            last = identity;
            void playGameStats.progress(progress).then(status => {
                if (active && last === identity && status !== 'buffered') last = null;
            });
        };
        const unsubscribe = campaignStore.subscribe(() => report());
        const listener = App.addListener('appStateChange', state => { if (state.isActive) report(true); }).catch(() => null);
        report();
        return () => { active = false; unsubscribe(); void listener.then(handle => handle?.remove()).catch(() => {}); };
    }, []);
}
