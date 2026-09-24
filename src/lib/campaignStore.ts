import { CAMPAIGN_STORAGE_KEY, emptyCampaign, mergeCampaignProgress, parseCampaign, type CampaignProgress } from '../config/campaign';
import {isFoundersItem} from '../config/founders';
import {circuitAccess} from './circuitAccess';

type CampaignSnapshot = { progress: CampaignProgress; loaded: boolean; storageError: boolean };
const initialSnapshot: CampaignSnapshot = { progress: emptyCampaign(), loaded: false, storageError: false };
type ProgressStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** One page-wide store: equipment and unlocks survive mode changes, even without storage. */
export const campaignOwnerKey=(owner:string|null)=>`qg_campaign_v2:${owner===null?'guest':encodeURIComponent(owner)}`;
export function createCampaignStore(getStorage: () => ProgressStorage,initialOwner?:string|null) {
    let snapshot = initialSnapshot;
    let foundersOwned=false;
    let owner=initialOwner,changes=0;
    const memory=new Map<string,CampaignSnapshot>();
    const pendingOwners=new Set<string>();
    const key=()=>owner===undefined?CAMPAIGN_STORAGE_KEY:campaignOwnerKey(owner);
    const listeners = new Set<() => void>();
    const publish = (next: CampaignSnapshot) => {
        snapshot = next;
        listeners.forEach(listener => listener());
    };
    const readLatest = () => {
        const saved = parseCampaign(getStorage().getItem(key()),foundersOwned);
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
    const write=(progress:CampaignProgress)=>{
        let storageError=false;
        try{getStorage().setItem(key(),JSON.stringify(progress,(name,value)=>name==='foundersOwned'?undefined:value));}catch{storageError=true;}
        publish({progress,loaded:true,storageError});
    };
    return {
        getOwner:()=>owner,
        getStorageKey:key,
        getChanges:()=>changes,
        hasPending:()=>{try{return pendingOwners.has(key())||getStorage().getItem(`${key()}:dirty`)==='1';}catch{return true;}},
        acknowledge:()=>{pendingOwners.delete(key());try{getStorage().setItem(`${key()}:dirty`,'0');}catch{/* Retry merge next time. */}},
        selectOwner:(next:string|null)=>{
            if(owner===next)return;
            memory.set(key(),snapshot);owner=next;foundersOwned=false;changes++;
            const saved=memory.get(key());
            snapshot=saved?{...saved,progress:parseCampaign(JSON.stringify(saved.progress)),loaded:false}:initialSnapshot;
            load();
        },
        hasLegacyProgress:()=>{try{const storage=getStorage(),claimed=storage.getItem('qg_campaign_legacy_owner');return !!owner&&(!claimed||claimed===owner)&&storage.getItem('qg_campaign_legacy_complete')!==owner&&!!storage.getItem(CAMPAIGN_STORAGE_KEY);}catch{return false;}},
        importLegacy:()=>{
            if(!owner)return false;
            try{
                const storage=getStorage(),claimed=storage.getItem('qg_campaign_legacy_owner');if((claimed&&claimed!==owner)||storage.getItem('qg_campaign_legacy_complete')===owner)return false;
                const raw=storage.getItem(CAMPAIGN_STORAGE_KEY);if(!raw)return false;
                // Claim first: a failed subsequent save cannot attribute it to another account.
                storage.setItem('qg_campaign_legacy_owner',owner);
                changes++;pendingOwners.add(key());try{storage.setItem(`${key()}:dirty`,'1');}catch{/* Keep imported progress in memory even if a quota is reached. */}write(mergeCampaignProgress(snapshot.progress,parseCampaign(raw,foundersOwned)));
                // If storage filled up after the claim, the same owner can retry after reload.
                if(!snapshot.storageError)try{storage.setItem('qg_campaign_legacy_complete',owner);}catch{/* A repeated merge is safe. */}
                return true;
            }catch{return false;}
        },
        mergeCloud:(remote:CampaignProgress,preferLocal:boolean)=>{
            load();write(parseCampaign(JSON.stringify(preferLocal?mergeCampaignProgress(remote,snapshot.progress):mergeCampaignProgress(snapshot.progress,remote)),foundersOwned));
        },
        resetAfterAccountDeletion:(deletedOwner=owner)=>{const deletedKey=deletedOwner===undefined?CAMPAIGN_STORAGE_KEY:campaignOwnerKey(deletedOwner);memory.delete(deletedKey);pendingOwners.delete(deletedKey);if(owner!==deletedOwner)return;foundersOwned=false;publish({progress:emptyCampaign(),loaded:true,storageError:false});},
        setFoundersAccess:(owned:boolean)=>{
            if(foundersOwned===(owned===true))return;
            foundersOwned=owned===true;
            // Do not overwrite saved selections while authentication is restoring.
            try{
                const latest=readLatest(),saved=parseCampaign(getStorage().getItem(key()),foundersOwned);
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
        update: (change: (progress: CampaignProgress) => CampaignProgress,expectedOwner=owner) => {
            if(expectedOwner!==owner)return;
            load();
            let latest = snapshot.progress;
            try { latest = readLatest(); } catch { /* Keep session progress. */ }
            const progress = {...change(latest)};
            delete progress.foundersOwned;
            if(foundersOwned)progress.foundersOwned=true;
            changes++;pendingOwners.add(key());try{getStorage().setItem(`${key()}:dirty`,'1');}catch{/* Memory state records pending edits. */}write(progress);
        },
    };
}

export const campaignStore = createCampaignStore(() => localStorage,null);
// Only verified authentication changes ownership, never a cached profile label.
circuitAccess.subscribe(()=>campaignStore.selectOwner(circuitAccess.getSnapshot().userId));
