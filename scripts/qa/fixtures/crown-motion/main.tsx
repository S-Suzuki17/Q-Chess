import React,{useState} from 'react';
import {ToonStyleReview} from './ToonStyleReview';
import {CastleSceneReview} from './CastleSceneReview';
import {QuestTransitionReview} from './QuestTransitionReview';
import {createRoot} from 'react-dom/client';
import {CampaignMode} from '../../../../src/components/CampaignMode';
import LocalGameBoard from '../../../../src/components/LocalGameBoard';
import {soundManager} from '../../../../src/lib/SoundService';
import {CROWN_ENEMIES,crownEnemyName} from '../../../../src/config/crownEnemies';
import {CrownEnemyPortrait} from '../../../../src/components/CrownEnemyPortrait';
import {QubeCompanion} from '../../../../src/components/QubeCompanion';
import type {Language} from '../../../../src/locales/dict';
import '../../../../src/app/globals.css';
import {PracticeLocaleReview} from './PracticeLocaleReview';
const query=new URLSearchParams(location.search),user={id:'QA-PRESENTATION-ONLY',name:'Local explorer',type:'registered' as const};
Object.assign(window,{qaSetSound:soundManager.updateConfig.bind(soundManager)});
function App(){const[open,setOpen]=useState(true);if(query.get('view')==='practice-locale')return <PracticeLocaleReview lang={(query.get('lang')??'ja') as Language}/>;if(query.get('view')==='transition-review')return <QuestTransitionReview/>;if(query.get('view')==='scene-review')return <CastleSceneReview/>;if(query.get('view')==='toon-review')return <ToonStyleReview/>;if(query.get('view')==='characters')return <main style={{minHeight:'100dvh',padding:24,background:'#13231e',color:'#eadfc3'}}><h1 style={{marginBottom:20,fontSize:18}}>Crown character study · original 2D artwork</h1><div style={{display:'flex',gap:24,flexWrap:'wrap',alignItems:'end'}}><figure style={{margin:0,width:104}}><figcaption style={{marginBottom:12}}>QUBE</figcaption><QubeCompanion size={80} reducedMotion/></figure>{CROWN_ENEMIES.filter(e=>!query.get('stages')||query.get('stages')!.split(',').includes(String(e.stageId))).map(enemy=><figure key={enemy.id} style={{margin:0,width:164}}><figcaption style={{marginBottom:12}}>{crownEnemyName('ja',enemy)}</figcaption><div style={{position:'relative',width:160,height:180}}><CrownEnemyPortrait stageId={enemy.stageId}/></div><div style={{height:56,marginTop:16}}><CrownEnemyPortrait stageId={enemy.stageId} compact/></div></figure>)}</div></main>;return open?query.get('view')==='practice'?<LocalGameBoard lang="ja" user={user} cpuLevel={1} onHome={()=>setOpen(false)}/>:<CampaignMode lang={(query.get('lang')??'ja') as Language} user={user} onBack={()=>setOpen(false)} onLogin={()=>{}}/>:<main><button data-reopen onClick={()=>setOpen(true)}>Reopen Circuit</button></main>;}
createRoot(document.getElementById('root')!).render(<App/>);
