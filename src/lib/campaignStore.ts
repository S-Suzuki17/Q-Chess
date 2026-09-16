import { CAMPAIGN_STORAGE_KEY, emptyCampaign, mergeCampaignProgress, parseCampaign, type CampaignProgress } from '../config/campaign';

type CampaignSnapshot = { progress: CampaignProgress; loaded: boolean; storageError: boolean };
const initialSnapshot: CampaignSnapshot = { progress: emptyCampaign(), loaded: false, storageError: false };
type ProgressStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** One page-wide store: equipment and unlocks survive mode changes, even without storage. */
export function createCampaignStore(getStorage: () => ProgressStorage) {
    let snapshot = initialSnapshot;
    const listeners = new Set<() => void>();
    const publish = (next: CampaignSnapshot) => {
        snapshot = next;
        listeners.forEach(listener => listener());
    };
    const readLatest = () => {
        const saved = parseCampaign(getStorage().getItem(CAMPAIGN_STORAGE_KEY));
        // A failed save leaves the in-memory equipment newer than localStorage.
        return { ...mergeCampaignProgress(snapshot.progress,saved), ...(snapshot.storageError ? {
            board: snapshot.progress.board, piece: snapshot.progress.piece, effect:snapshot.progress.effect,
        } : {}) };
    };
    const load = () => {
        if (snapshot.loaded) return;
        try { publish({ progress: readLatest(), loaded: true, storageError: false }); }
        catch { publish({ ...snapshot, loaded: true, storageError: true }); }
    };
    return {
        load,
        getSnapshot: () => snapshot,
        getServerSnapshot: () => initialSnapshot,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        refresh: () => {
            try { publish({ ...snapshot, progress: readLatest(), loaded: true }); }
            catch { publish({ ...snapshot, storageError: true }); }
        },
        update: (change: (progress: CampaignProgress) => CampaignProgress) => {
            load();
            let latest = snapshot.progress;
            try { latest = readLatest(); } catch { /* Keep session progress. */ }
            const progress = change(latest);
            let storageError = false;
            try { getStorage().setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(progress)); }
            catch { storageError = true; }
            publish({ progress, loaded: true, storageError });
        },
    };
}

export const campaignStore = createCampaignStore(() => localStorage);
