import React,{useState} from 'react';
import {CrownMatchIntro} from '../../../../src/components/CrownEntryMotion';
const counters={done:0,cancel:0};Object.assign(window,{qaQuestTransitions:counters});
export function QuestTransitionReview(){const [open,setOpen]=useState(false);return <main style={{padding:20,color:'#e8d6b2',minHeight:'100dvh',background:'#12231d'}}><p>Local transition QA · no match admission or gameplay clock</p><button data-open-intro onClick={()=>setOpen(true)}>Open integrated stage entrance</button>{open&&<CrownMatchIntro stageId={1} side="white" lang="ja" label="ステージ 1 / 100" onDone={()=>{counters.done++;setOpen(false);}} onCancel={()=>{counters.cancel++;setOpen(false);}}/>}</main>;}
