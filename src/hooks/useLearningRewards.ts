'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {completeLearning,readLearning,type LearningStatus,type LearningReceipt,type LearningSubmission} from '../lib/learningApi';
import {parseLearningSubmission} from '../../server/src/learning/protocol';
const key=(userId:string)=>`qg_learning_pending_v1:${userId}`;
function saved(userId:string):LearningSubmission[] {
    try{
        const value=JSON.parse(localStorage.getItem(key(userId))??'[]');
        return (Array.isArray(value)?value:[value]).slice(0,40).map(parseLearningSubmission).filter((p):p is LearningSubmission=>!!p);
    }catch{return [];}
}
const submissionKey=(p:LearningSubmission)=>p.kind==='tutorial'?`tutorial:${p.lessonId}`:`weekly:${p.week}:${p.problemId}`;
/** Pending proof survives a lost response/closed dialog. The server is always the reward authority. */
export function useLearningRewards(userId?:string) {
    const [status,setStatus]=useState<LearningStatus|null>(null);
    const [receipt,setReceipt]=useState<LearningReceipt|null>(null);
    const [pending,setPending]=useState<LearningSubmission|null>(null);
    const [busy,setBusy]=useState(false),[error,setError]=useState(false);
    const [loading,setLoading]=useState(!!userId);
    const identity=useRef(userId);identity.current=userId;
    const lifetime=useRef<AbortController|null>(null),inFlight=useRef<AbortSignal|null>(null);
    const queue=useRef<LearningSubmission[]>([]);
    const mutationRevision=useRef(0);
    const persist=useCallback((proofs:LearningSubmission[])=>{
        queue.current=proofs;setPending(proofs[0]??null);
        if(userId)try{
            if(proofs.length)localStorage.setItem(key(userId),JSON.stringify(proofs));
            else localStorage.removeItem(key(userId));
        }catch{/* Memory retains the pending proof if storage is blocked. */}
    },[userId]);
    const submit=useCallback(async(submission:LearningSubmission)=>{
        if(!userId||(inFlight.current&&!inFlight.current.aborted))return null;
        const signal=lifetime.current?.signal;
        if(!signal||signal.aborted)return null;
        mutationRevision.current++;
        inFlight.current=signal;setBusy(true);setError(false);setReceipt(null);
        persist([...queue.current.filter(p=>submissionKey(p)!==submissionKey(submission)),submission]);
        try{
            const result=await completeLearning(userId,submission,signal);
            if(identity.current!==userId||signal?.aborted)return null;
            persist(queue.current.filter(p=>submissionKey(p)!==submissionKey(submission)));
            setReceipt(result);
            setStatus(current=>current?.userId===userId?{...current,...result}:{...result,weeklySet:null});
            return result;
        }catch{if(identity.current===userId&&!signal?.aborted)setError(true);return null;}
        finally{if(inFlight.current===signal)inFlight.current=null;if(identity.current===userId&&!signal.aborted)setBusy(false);}
    },[userId,persist]);
    const refresh=useCallback(async()=>{
        if(!userId)return;
        const signal=lifetime.current?.signal;
        const revision=mutationRevision.current;
        setLoading(true);setError(false);
        try{
            const result=await readLearning(userId,signal);
            if(identity.current===userId&&!signal?.aborted&&revision===mutationRevision.current){
                setStatus(result);
                // An expired week cannot earn new clears. A committed lost response is reflected in this wallet read.
                if(result.weeklySet)persist(queue.current.filter(p=>p.kind!=='weekly'||p.week>=result.weeklySet!.week));
            }
        }catch{if(identity.current===userId&&!signal?.aborted)setError(true);}
        finally{if(identity.current===userId&&!signal?.aborted)setLoading(false);}
    },[userId,persist]);
    useEffect(()=>{
        const controller=new AbortController();lifetime.current=controller;
        setStatus(null);setReceipt(null);setError(false);setBusy(false);
        persist(userId?saved(userId):[]);
        if(userId){
            void refresh().then(async()=>{
                for(const proof of [...queue.current]){
                    if(controller.signal.aborted)break;
                    if(!await submit(proof))break;
                }
            });
        }else setLoading(false);
        return()=>controller.abort();
    },[userId,refresh,submit,persist]);
    return {status:status?.userId===userId?status:null,receipt:receipt?.userId===userId?receipt:null,pending,busy,error,loading,
        submit,refresh,retry:()=>pending?submit(pending):refresh(),clearReceipt:()=>setReceipt(null)};
}
