import { CAMPAIGN_STORAGE_KEY, emptyCampaign, mergeCampaignProgress, parseCampaign, type CampaignProgress } from '../config/campaign';
import {isFoundersItem} from '../config/founders';

type CampaignSnapshot = { progress: CampaignProgress; loaded: boolean; storageError: boolean };
const initialSnapshot: CampaignSnapshot = { progress: emptyCampaign(), loaded: false, storageError: false };
type ProgressStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** One page-wide store: equipment and unlocks survive mode changes, even without storage. */
export function createCampaignStore(getStorage: () => ProgressStorage) {
    let snapshot = initialSnapshot;
    let foundersOwned=false;
    const listeners = new Set<() => void>();
    const publish = (next: CampaignSnapshot) => {
        snapshot = next;
        listeners.forEach(listener => listener());
    };
    const readLatest = () => {
        const saved = parseCampaign(getStorage().getItem(CAMPAIGN_STORAGE_KEY),foundersOwned);
        // A failed save leaves the in-memory equipment newer than localStorage.
        return { ...mergeCampaignProgress(snapshot.progress,saved), ...(snapshot.storageError ? {
            board: snapshot.progress.board, piece: snapshot.progress.piece, effect:snapshot.progress.effect, music:snapshot.progress.music,avatar:snapshot.progress.avatar,
        } : {}) };
    };
    const load = () => {
        if (snapshot.loaded) return;
        try { publish({ progress: readLatest(), loaded: true, storageError: false }); }
        catch { publish({ ...snapshot, loaded: true, storageError: true }); }
    };
    return {
        resetAfterAccountDeletion:()=>{foundersOwned=false;publish({progress:emptyCampaign(),loaded:true,storageError:false});},
        setFoundersAccess:(owned:boolean)=>{
            if(foundersOwned===(owned===true))return;
            foundersOwned=owned===true;
            // Do not overwrite saved selections while authentication is restoring.
            try{
                const latest=readLatest(),saved=parseCampaign(getStorage().getItem(CAMPAIGN_STORAGE_KEY),foundersOwned);
                // A temporary revocation must not let a quota-error fallback mask a
                // previously saved founders selection when the same owner returns.
                if(foundersOwned){
                    if(isFoundersItem(saved.board))latest.board=saved.board;
                    if(isFoundersItem(saved.piece))latest.piece=saved.piece;
                    if(isFoundersItem(saved.avatar))latest.avatar=saved.avatar;
                }
                publish({...snapshot,progress:parseCampaign(JSON.stringify(latest),foundersOwned)});
            }
            catch{publish({...snapshot,progress:parseCampaign(JSON.stringify(snapshot.progress),foundersOwned)});}
        },
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
            const progress = {...change(latest)};
            delete progress.foundersOwned;
            if(foundersOwned)progress.foundersOwned=true;
            let storageError = false;
            try { getStorage().setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(progress,(key,value)=>key==='foundersOwned'?undefined:value)); }
            catch { storageError = true; }
            publish({ progress, loaded: true, storageError });
        },
    };
}

export const campaignStore = createCampaignStore(() => localStorage);
