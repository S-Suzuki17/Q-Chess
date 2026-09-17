import type { TimeControl } from '../types/game';
import type { CPUSearchProfile } from './cpuDifficulty';
import type { CampaignOutcome,CampaignProgress,CPUPersonality } from './campaign';

export const CIRCUIT_STAGE_COUNT=100;
export const CIRCUIT_STAGES=Array.from({length:CIRCUIT_STAGE_COUNT},(_,index)=>{
    const strength=Math.floor(index/3)+1;
    return {id:index+1,strength,timeControl:(['10m','3m','10s'] as TimeControl[])[index%3],
        opponent:(['NOX','EMBER','ORACLE','SOVEREIGN'] as const)[Math.floor(index/3)%4],
        personality:('balanced' as CPUPersonality),
        search:{timeLimitMs:500+(strength-1)*165,maxDepth:Math.min(8,1+Math.floor((strength-1)/5)),tieBreakSeed:strength} satisfies CPUSearchProfile};
});
export const stageUnlocked=(progress:CampaignProgress,id:number)=>Number.isInteger(id)&&id>=1&&id<=100&&id<=(progress.stageStars?.length??0)+1;
export function finishStage(progress:CampaignProgress,id:number,outcome:CampaignOutcome):CampaignProgress {
    if(!outcome.won||outcome.draw||!stageUnlocked(progress,id)) return progress;
    const stageStars=[...progress.stageStars??[]];
    const validTime=Number.isFinite(outcome.initialSeconds)&&outcome.initialSeconds>0&&Number.isFinite(outcome.remainingSeconds)&&outcome.remainingSeconds>=outcome.initialSeconds/2&&outcome.remainingSeconds<=outcome.initialSeconds;
    stageStars[id-1]=Math.max(stageStars[id-1]??0,1+Number(outcome.hintsUsed===0)+Number(validTime));
    return {...progress,stageStars};
}
export function parseStageStars(value:unknown):number[] {
    if(!Array.isArray(value)) return [];
    const stars:number[]=[];
    for(const entry of value.slice(0,100)) {
        if(!Number.isInteger(entry)||entry<1||entry>3) break;
        stars.push(entry);
    }
    return stars;
}
