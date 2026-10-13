import type {CampaignProgress} from '../config/campaign';
export const challengeMapFrontier=(progress:CampaignProgress)=>Math.min(100,(progress.stageStars?.length??0)+1);
