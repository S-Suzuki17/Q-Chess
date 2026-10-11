// Isolated presentation fixture. No production account, backend, ledger or gameplay.
import React, {useState} from 'react';
import {emptyCampaign, type CampaignProgress} from '../../../../src/config/campaign';
const query=new URLSearchParams(location.search);
const cleared=Math.max(0,Math.min(100,Number(query.get('cleared')??24)));
export const useCampaignProgress=()=>{
    const [progress,setProgress]=useState<CampaignProgress>(()=>({...emptyCampaign(),stageStars:Array.from({length:cleared},()=>3),effect:'champion-effect-019',avatar:'avatar-frame-03'}));
    return {progress,loaded:true,storageError:false,update:setProgress};
};
export const useCircuitAccess=()=>({allowed:true,revision:1});
export const circuitAccess={canPlay:()=>true,permit:()=>()=>true};
export const readStripeMembershipStatus=async()=>({active:true});
export const crownAdmissionEnabled=()=>false;
export const authorizeCrownStage=async()=>{throw new Error('QA fixture does not authorize live stages');};
export const requestCircuitInterstitial=async()=>{};
export default function Board({onHome}:{onHome:()=>void}){return <main data-qa-board-stub><h1>Local presentation fixture</h1><p>The chess match is outside this visual fixture.</p><button onClick={onHome}>Return to Circuit</button></main>;}
export function Board3D(){return <div data-qa-board-art-stub style={{display:'grid',placeItems:'center',height:'100%'}}>Board preview is not part of this isolated effects fixture.</div>;}
