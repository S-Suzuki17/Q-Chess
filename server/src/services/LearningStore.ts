import type {SupabaseClient} from '@supabase/supabase-js';
import type {DailyLoginStore} from './DailyLoginStore';
import {parseLearningProgress,parseLearningReceipt,type LearningProgress,type LearningReceipt,type LearningSubmission} from '../learning/protocol';
import type {WeeklyProblemSet} from '../learning/weeklyProblems';

export class LearningError extends Error {
    constructor(public readonly code:'INVALID_SOLUTION'|'WEEK_EXPIRED'|'COMPLETE_PREVIOUS_PROBLEM'|'LEARNING_UNAVAILABLE'){super(code);}
}
export interface LearningStore extends Pick<DailyLoginStore,'verifyUser'|'blocked'|'hasCurrentTerms'> {
    week(week:string):Promise<WeeklyProblemSet|null>;
    progress(userId:string,week:string):Promise<LearningProgress>;
    complete(userId:string,submission:LearningSubmission):Promise<LearningReceipt>;
    previousPositions():Promise<Set<string>>;
    publish(set:WeeklyProblemSet):Promise<void>;
}
export function createLearningStore(client:SupabaseClient,account:Pick<DailyLoginStore,'verifyUser'|'blocked'|'hasCurrentTerms'>):LearningStore {
    // Published boards are shared by all players. Only board data is cached; account
    // authorization, progress and reward writes always go through their live checks.
    const weeks=new Map<string,{expires:number;value:Promise<WeeklyProblemSet|null>}>();
    const rpc=async(name:string,args:Record<string,unknown>)=>{
        const {data,error}=await client.rpc(name,args).abortSignal(AbortSignal.timeout(5000));
        if(error){
            if(error.message==='WEEK_EXPIRED'||error.message==='COMPLETE_PREVIOUS_PROBLEM')throw new LearningError(error.message);
            throw new LearningError('LEARNING_UNAVAILABLE');
        }
        return data;
    };
    return {
        ...account,
        async week(week){
            const cached=weeks.get(week);
            if(cached&&cached.expires>Date.now())return cached.value;
            const value=(async()=>{
            const {data:header,error}=await client.from('learning_weeks').select('week,opens_at,closes_at').eq('week',week).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
            if(error)throw new LearningError('LEARNING_UNAVAILABLE');
            if(!header)return null;
            const {data:rows,error:problemError}=await client.from('learning_problems').select('ordinal,position_key,state').eq('week',week).order('ordinal').abortSignal(AbortSignal.timeout(5000));
            if(problemError||rows?.length!==10||!rows.every((row,i)=>row.ordinal===i+1&&row.state?.pieces))throw new LearningError('LEARNING_UNAVAILABLE');
            return {week:header.week,opensAt:header.opens_at,closesAt:header.closes_at,
                problems:rows.map(row=>({id:String(row.ordinal),positionKey:row.position_key,state:row.state}))};
            })();
            const entry={expires:Date.now()+60000,value};
            weeks.delete(week);
            if(weeks.size>=4)weeks.delete(weeks.keys().next().value!);
            weeks.set(week,entry);
            try{
                const result=await value;
                if(!result&&weeks.get(week)===entry)weeks.delete(week);
                return result;
            }catch(error){if(weeks.get(week)===entry)weeks.delete(week);throw error;}
        },
        async progress(userId,week){return parseLearningProgress(await rpc('learning_progress',{p_user_id:userId,p_week:week}));},
        async complete(userId,submission){
            return parseLearningReceipt(await rpc('complete_learning',{
                p_user_id:userId,p_kind:submission.kind,p_lesson_id:submission.kind==='tutorial'?submission.lessonId:null,
                p_week:submission.kind==='weekly'?submission.week:null,p_ordinal:submission.kind==='weekly'?submission.problemId:null,
            }),userId);
        },
        async previousPositions(){
            const keys=new Set<string>();
            for(let start=0;;start+=1000){
                const {data,error}=await client.from('learning_problems').select('position_key').order('week').order('ordinal').range(start,start+999).abortSignal(AbortSignal.timeout(5000));
                if(error||!data)throw new LearningError('LEARNING_UNAVAILABLE');
                data.forEach(row=>keys.add(row.position_key));
                if(data.length<1000)return keys;
            }
        },
        async publish(set){await rpc('publish_learning_week',{p_week:set.week,p_problems:set.problems});weeks.delete(set.week);},
    };
}
