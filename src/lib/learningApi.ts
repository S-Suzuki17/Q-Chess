'use client';
import {requestAccountProfile} from './accountProfile';
import {requireCurrentAccountTerms} from './currentAccountTerms';
import {DAILY_LOGIN_REWARD_CHANGED_EVENT} from './dailyLoginRewards';
import {parseLearningProgress,parseLearningReceipt,type LearningStatus,type LearningSubmission,type LearningReceipt as ServerLearningReceipt} from '../../server/src/learning/protocol';
import {learningWeek,type WeeklyProblemSet} from '../../server/src/learning/weeklyProblems';
export type {LearningStatus,LearningSubmission} from '../../server/src/learning/protocol';
export type LearningReceipt=ServerLearningReceipt&{submission:LearningSubmission};

export async function readLearning(userId:string,signal?:AbortSignal):Promise<LearningStatus> {
    const value=await requestAccountProfile('/learning',userId,undefined,signal);
    const weeklySet=value.weeklySet as WeeklyProblemSet|null;
    if(weeklySet!==null&&(!weeklySet||!Array.isArray(weeklySet.problems)||weeklySet.problems.length!==10
        ||!weeklySet.problems.every((p,i)=>p.id===String(i+1)&&Array.isArray(p.state?.pieces))
        ||!Number.isFinite(Date.parse(weeklySet.opensAt))||!Number.isFinite(Date.parse(weeklySet.closesAt))
        ||Date.parse(weeklySet.closesAt)-Date.parse(weeklySet.opensAt)!==7*86400000
        ||learningWeek(Date.parse(weeklySet.opensAt)).week!==weeklySet.week))throw new Error('LEARNING_UNAVAILABLE');
    return {...parseLearningProgress(value),userId,weeklySet};
}
export async function completeLearning(userId:string,submission:LearningSubmission,signal?:AbortSignal) {
    await requireCurrentAccountTerms(userId,signal);
    const receipt=parseLearningReceipt(await requestAccountProfile('/learning/complete',userId,submission,signal),userId);
    signal?.throwIfAborted();
    window.dispatchEvent(new CustomEvent(DAILY_LOGIN_REWARD_CHANGED_EVENT,{detail:{userId}}));
    return {...receipt,submission};
}
