import type {Move} from '../quantum-engine/types';
import type {WeeklyProblemSet} from './weeklyProblems';

export type LearningProgress = {
    tutorial:string[];
    weekly:number[];
    weeklyRewarded:boolean;
    tickets:{ranked:number;hint:number};
};
export type LearningStatus = LearningProgress & {userId:string;weeklySet:WeeklyProblemSet|null};
export type LearningReceipt = LearningProgress & {
    userId:string;firstClear:boolean;reward:'ranked'|'hint'|null;adCheckpoint:0|5|10;
};
export function parseLearningProgress(value:unknown):LearningProgress {
    const p=value as LearningProgress|null;
    if(!p||!Array.isArray(p.tutorial)||!p.tutorial.every(id=>typeof id==='string')||p.tutorial.length>25
        ||new Set(p.tutorial).size!==p.tutorial.length||!Array.isArray(p.weekly)||p.weekly.length>10
        ||!p.weekly.every((n,i)=>n===i+1)||typeof p.weeklyRewarded!=='boolean'
        ||p.weeklyRewarded!==(p.weekly.length===10)||!p.tickets
        ||![p.tickets.ranked,p.tickets.hint].every(n=>Number.isSafeInteger(n)&&n>=0))throw new Error('LEARNING_UNAVAILABLE');
    return {tutorial:p.tutorial,weekly:p.weekly,weeklyRewarded:p.weeklyRewarded,tickets:p.tickets};
}
export function parseLearningReceipt(value:unknown,userId:string):LearningReceipt {
    const p=value as LearningReceipt;
    const progress=parseLearningProgress(value);
    if(typeof p.firstClear!=='boolean'||![null,'ranked','hint'].includes(p.reward)||![0,5,10].includes(p.adCheckpoint)
        ||(!p.firstClear&&(p.reward!==null||p.adCheckpoint!==0)))throw new Error('LEARNING_UNAVAILABLE');
    return {...progress,userId,firstClear:p.firstClear,reward:p.reward,adCheckpoint:p.adCheckpoint};
}
/** The public protocol cannot provide states, balances, identities, reward amounts or clocks. */
export type LearningSubmission =
    | {kind:'tutorial';lessonId:string;moves:Move[]}
    | {kind:'weekly';week:string;problemId:number;moves:Move[]};
export function parseLearningSubmission(value:unknown):LearningSubmission|null {
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const row=value as Record<string,unknown>;
    const keys=Object.keys(row).sort().join(',');
    if(row.kind==='tutorial'){
        if(keys!=='kind,lessonId,moves'||typeof row.lessonId!=='string'||!/^[a-z-]{1,48}$/.test(row.lessonId))return null;
    }else if(row.kind==='weekly'){
        if(keys!=='kind,moves,problemId,week'||typeof row.week!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.week)
            ||!Number.isInteger(row.problemId)||Number(row.problemId)<1||Number(row.problemId)>10)return null;
        const day=new Date(`${row.week}T05:00:00Z`);
        if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==row.week||day.getUTCDay()!==2)return null;
    }else return null;
    if(!Array.isArray(row.moves)||!row.moves.length||row.moves.length>8||(row.kind==='weekly'&&row.moves.length!==1))return null;
    for(const move of row.moves){
        if(!move||typeof move!=='object'||Array.isArray(move)||Object.keys(move).some(k=>!['pieceId','target','chosenType','promotionTarget'].includes(k))
            ||typeof move.pieceId!=='string'||move.pieceId.length>64||!move.target||typeof move.target!=='object'
            ||Object.keys(move.target).sort().join(',')!=='col,row'
            ||![move.target.row,move.target.col].every(n=>Number.isInteger(n)&&n>=0&&n<8)
            ||!Number.isInteger(move.chosenType)||move.chosenType<1||move.chosenType>63
            ||(move.promotionTarget!==undefined&&![2,4,8,16].includes(move.promotionTarget)))return null;
    }
    return value as LearningSubmission;
}
