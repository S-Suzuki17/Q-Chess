import {generateWeeklyProblems,learningWeek} from '../learning/weeklyProblems';
import type {LearningStore} from './LearningStore';

export const learningEnabled=()=>process.env.LEARNING_REWARDS_ENABLED==='true';
/** Runs on startup and during Tuesday maintenance; database publication is atomic across replicas.
 * A restart after maintenance catches up. Failures leave the previous publication intact. */
export function createLearningMaintenance(store:Pick<LearningStore,'week'|'previousPositions'|'publish'>,now=Date.now,
    generate=generateWeeklyProblems) {
    let readyWeek:string|null=null,busy=false;
    return async()=>{
        const timestamp=now(),week=learningWeek(timestamp,true).week;
        if(busy||readyWeek===week)return;
        busy=true;
        try{
            if(!await store.week(week)){
                const set=await generate(timestamp,await store.previousPositions());
                await store.publish(set);
            }
            readyWeek=week;
        }finally{busy=false;}
    };
}
