// Real campaign/result/journey components; synthetic account, storage transport and match outcome.
import React,{useState,type ReactNode} from 'react';
import {emptyCampaign,type CampaignOutcome,type CampaignProgress} from '../../../../src/config/campaign';
const query=new URLSearchParams(location.search),key='qa_castle_progress';
const qa={updates:0,admissions:0,revoked:false,saveError:query.has('saveError')};
Object.assign(window,{qaQuest:qa});
export const useCampaignProgress=()=>{
    const [progress,setProgress]=useState<CampaignProgress>(()=>localStorage.getItem(key)?JSON.parse(localStorage.getItem(key)!):({...emptyCampaign(),stageStars:Array.from({length:Number(query.get('cleared')??0)},()=>3)}));
    const [storageError,setError]=useState(false);
    return {progress,loaded:true,storageError,update:(change:(p:CampaignProgress)=>CampaignProgress)=>{
        qa.updates++;
        setProgress(value=>{const next=change(value);if(!qa.saveError)localStorage.setItem(key,JSON.stringify(next));return next;});setError(qa.saveError);
    }};
};
export const useCircuitAccess=()=>({allowed:true,revision:1});
export const circuitAccess={canPlay:()=>!qa.revoked,permit:()=>()=>!qa.revoked};
export const readStripeMembershipStatus=async()=>({active:true});
export const crownAdmissionEnabled=()=>false;
export const authorizeCrownStage=async()=>{throw new Error('No live admission in local QA');};
export const requestCircuitInterstitial=async()=>{};
export default function Board({onComplete,onHome,resultPanel,crownStageId}:{onComplete:(result:CampaignOutcome)=>void;onHome:()=>void;resultPanel:ReactNode;crownStageId:number}){
    const win:CampaignOutcome={won:true,draw:false,hintsUsed:0,remainingSeconds:500,initialSeconds:600,playerMoves:10};
    return <main data-qa-result-source={crownStageId} style={{padding:24,color:'#eee',background:'#11201e',minHeight:'100dvh'}}><p>Local QA · synthetic result · no account or payment</p><button data-qa-win onClick={()=>{onComplete(win);onComplete(win);}}>Win (duplicate callback)</button><button data-qa-draw onClick={()=>onComplete({...win,won:false,draw:true})}>Draw</button><button data-qa-loss onClick={()=>onComplete({...win,won:false})}>Loss</button><button data-qa-return onClick={onHome}>Back</button>{resultPanel}</main>;
}
