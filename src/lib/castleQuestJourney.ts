import type {CampaignOutcome,CampaignProgress} from '../config/campaign';
import {stageUnlocked} from '../config/circuitStages';

/** Only the saved result prepares a next tile. Decorative completion never calls this. */
export function castleQuestNextStage(progress:CampaignProgress,stage:number,outcome:CampaignOutcome|null,saveError:boolean):number|null {
    if(!Number.isInteger(stage)||stage<1||stage>=100||!outcome?.won||outcome.draw||saveError)return null;
    if(!((progress.stageStars?.[stage-1]??0)>0)||!stageUnlocked(progress,stage+1))return null;
    return stage+1;
}
