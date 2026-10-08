// Local UI fixture only. No provider proof, durable ledger or auth backend is simulated.
// Real Campaign entry behavior is exercised against controlled transport replies.
import React from 'react';
import {emptyCampaign} from '../../../../src/config/campaign';
import type {CampaignOutcome} from '../../../../src/config/campaign';
export {crownRankKey} from '../../../../src/config/crownAdmission';
declare global { interface Window {qaEnabled?:boolean;qaMembershipHold?:boolean;qaReleaseMembership?:()=>void;qaMembershipCalls?:number;} }
export const crownAdmissionEnabled=()=>window.qaEnabled===true;
export const useCampaignProgress=()=>({progress:{...emptyCampaign(),stageStars:[1,1,1]},loaded:true,storageError:false,update:()=>{}});
export const soundManager={playBGM:()=>{},stopBGM:()=>{}};
export const readStripeMembershipStatus=async()=>{
    window.qaMembershipCalls=(window.qaMembershipCalls??0)+1;
    if(window.qaMembershipHold)await new Promise<void>(resolve=>{window.qaReleaseMembership=resolve;});
    return {active:true};
};
export default function Board({campaignLabel,onHome,onComplete,resultPanel}:{campaignLabel:string;onHome:()=>void;onComplete:(o:CampaignOutcome)=>void;resultPanel:React.ReactNode}){
    return <div data-crown-board><p>{campaignLabel}</p><button data-leave onClick={onHome}>Leave</button>
        <button data-result onClick={()=>onComplete({won:false,draw:false,playerMoves:2,hintsUsed:0,initialSeconds:600,remainingSeconds:590})}>Finish</button>{resultPanel}</div>;
}
export const RewardPreview=()=>null;
export const ChampionshipCollection=()=>null;
export const RewardSigil=()=>null;
