import { CAMPAIGN_STORAGE_KEY, emptyCampaign, parseCampaign, type CampaignProgress } from '../config/campaign';
import {campaignStore} from './campaignStore';

export type MatchAppearance = Readonly<Pick<CampaignProgress,'board'|'piece'|'effect'|'avatar'|'music'>>;

/** Copy only primitive appearance values. Progress changes cannot alter a live match. */
export function captureMatchAppearance(progress:CampaignProgress):MatchAppearance {
    const {board,piece,effect,avatar,music}=progress;
    return Object.freeze({board,piece,effect,avatar,music});
}

export function initialMatchAppearance(snapshot:{loaded:boolean;progress:CampaignProgress},readStorage:()=>Pick<Storage,'getItem'>):MatchAppearance {
    if(snapshot.loaded)return captureMatchAppearance(snapshot.progress);
    try { return captureMatchAppearance(parseCampaign(readStorage().getItem(campaignStore.getStorageKey()))); }
    catch { return captureMatchAppearance(emptyCampaign()); }
}
