'use client';
import {requestAccountProfile} from './accountProfile';
import {requireCurrentAccountTerms} from './currentAccountTerms';
import {DAILY_LOGIN_REWARD_CHANGED_EVENT} from './dailyLoginRewards';
import {parseLearningProgress,parseLearningReceipt,type LearningStatus,type LearningSubmission,type LearningReceipt as ServerLearningReceipt} from '../../server/src/learning/protocol';
import {learningWeek,type WeeklyProblemSet} from '../../server/src/learning/weeklyProblems';
export type {LearningStatus,LearningSubmission} from '../../server/src/learning/protocol';
export type LearningReceipt=ServerLearningReceipt&{submission:LearningSubmission};

const learningCache=new Map<string,{status:LearningStatus;at:number}>();
const learningInFlight=new Map<string,Promise<LearningStatus>>();
const LEARNING_CACHE_TTL_MS=60_000;

export function getCachedLearningStatus(userId?:string):LearningStatus|null {
    if(!userId)return null;
    const entry=learningCache.get(userId);
    if(!entry)return null;
    if(Date.now()-entry.at>LEARNING_CACHE_TTL_MS){learningCache.delete(userId);return null;}
    return entry.status;
}

export function prefetchLearning(userId?:string):void {
    if(!userId||/^(GUEST-|anon_)/i.test(userId)||getCachedLearningStatus(userId)||learningInFlight.has(userId))return;
    void readLearning(userId).catch(()=>{});
}

export async function readLearning(userId:string,signal?:AbortSignal):Promise<LearningStatus> {
    if(!signal){
        const existing=learningInFlight.get(userId);
        if(existing)return existing;
    }
    const load=(async()=>{
        const value=await requestAccountProfile('/learning',userId,undefined,signal);
        const weeklySet=value.weeklySet as WeeklyProblemSet|null;
        if(weeklySet!==null&&(!weeklySet||!Array.isArray(weeklySet.problems)||weeklySet.problems.length!==10
            ||!weeklySet.problems.every((p,i)=>p.id===String(i+1)&&Array.isArray(p.state?.pieces))
            ||!Number.isFinite(Date.parse(weeklySet.opensAt))||!Number.isFinite(Date.parse(weeklySet.closesAt))
            ||Date.parse(weeklySet.closesAt)-Date.parse(weeklySet.opensAt)!==7*86400000
            ||learningWeek(Date.parse(weeklySet.opensAt)).week!==weeklySet.week))throw new Error('LEARNING_UNAVAILABLE');
        const status:LearningStatus={...parseLearningProgress(value),userId,weeklySet};
        learningCache.set(userId,{status,at:Date.now()});
        return status;
    })();
    if(!signal){
        learningInFlight.set(userId,load);
        void load.finally(()=>{if(learningInFlight.get(userId)===load)learningInFlight.delete(userId);});
    }
    return load;
}
export async function completeLearning(userId:string,submission:LearningSubmission,signal?:AbortSignal) {
    await requireCurrentAccountTerms(userId,signal);
    const receipt=parseLearningReceipt(await requestAccountProfile('/learning/complete',userId,submission,signal),userId);
    signal?.throwIfAborted();
    const cached=learningCache.get(userId);
    if(cached){
        learningCache.set(userId,{status:{...cached.status,...receipt},at:Date.now()});
    }
    if(receipt.reward)window.dispatchEvent(new CustomEvent(DAILY_LOGIN_REWARD_CHANGED_EVENT,{detail:{userId}}));
    return {...receipt,submission};
}
