import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CampaignMode} from '../../../../src/components/CampaignMode';
import {AccountAvatar} from '../../../../src/components/AccountAvatar';
import {VictoryCelebration} from '../../../../src/components/VictoryCelebration';
import {CampaignResult} from '../../../../src/components/CampaignResult';
import {QubeCompanion,type QubeState} from '../../../../src/components/QubeCompanion';
import {CHAMPIONSHIP_REWARDS} from '../../../../src/config/championshipRewards';
import {AVATAR_FRAMES} from '../../../../src/config/avatarFrames';
import type {Language} from '../../../../src/locales/dict';
import '../../../../src/app/globals.css';
const query=new URLSearchParams(location.search),view=query.get('view')??'circuit';
const user={id:'QA-PRESENTATION-ONLY',name:'Local preview',type:'registered' as const};
const effects=CHAMPIONSHIP_REWARDS.filter(r=>r.kind==='effect');
const qubeStates:QubeState[]=['idle','anticipation','victory','encouragement'];
function App(){
    const [open,setOpen]=useState(true),[run,setRun]=useState(0),[selected,setSelected]=useState(effects.find(r=>r.motif===(query.get('motif')??'corona'))!.id);
    const [qubeState,setQubeState]=useState<QubeState>(qubeStates.find(value=>value===query.get('state'))??'idle');
    if(view==='qube')return <main style={{minHeight:'100dvh',display:'grid',placeContent:'center',gap:20,textAlign:'center',background:'#12291f',color:'#f5e8c8'}}><p>Q-Gambit · local 2D companion presentation</p><div style={{display:'flex',justifyContent:'center'}}><QubeCompanion key={run} size={160} state={qubeState}/></div><div>{qubeStates.map(state=><button key={state} data-qube-select={state} onClick={()=>setQubeState(state)}>{state} </button>)}</div><button data-replay-qube onClick={()=>setRun(value=>value+1)}>Replay</button></main>;
    if(view==='result')return <main><p>Local synthetic result presentation. No match or reward grant.</p>{open?<CampaignResult lang={(query.get('lang')??'ja') as Language} stageId={Math.max(1,Math.min(100,Number(query.get('stage')??25)))} firstClear effect={selected} pieceFinish="standard" foeWhite={false} outcome={{won:true,draw:false,playerMoves:24,hintsUsed:0,initialSeconds:600,remainingSeconds:440,checkmate:true}} onBack={()=>setOpen(false)} onRetry={()=>setRun(value=>value+1)} onNext={Number(query.get('stage')??25)<100?()=>setOpen(false):undefined} saveError={false}/>:<button data-reopen onClick={()=>setOpen(true)}>Reopen</button>}</main>;
    if(view==='frames')return <main style={{padding:24,minHeight:'100dvh',background:'#111b18',color:'#eadfbe'}}><p>Q-Gambit · avatar frame art · local rendering</p><div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:24,maxWidth:1100,margin:'24px auto'}}>{AVATAR_FRAMES.map(frame=><figure key={`${frame.id}-${run}`} style={{margin:0,textAlign:'center'}}><AccountAvatar name="Q" url="/qube_icon.jpg" frame={frame.id} size={128} animateFrame/><figcaption>{frame.id}</figcaption></figure>)}</div><button data-replay-frames onClick={()=>setRun(r=>r+1)}>Replay frame glint</button></main>;
    if(view==='effect')return <main style={{height:'100dvh',position:'relative',background:'radial-gradient(ellipse at 50% 65%,#17302b,#070c12 70%)',color:'#f5e8c8'}}><div style={{position:'absolute',zIndex:10,left:20,top:16}}><label>Local effect preview <select aria-label="Effect" value={selected} onChange={e=>setSelected(e.target.value as typeof selected)}>{effects.map(effect=><option key={effect.id} value={effect.id}>{effect.id} · {effect.motif}</option>)}</select></label><button data-replay-effect onClick={()=>setRun(r=>r+1)}>Replay</button><button data-toggle-effect onClick={()=>setOpen(value=>!value)}>{open?'Close':'Reopen'}</button></div>{open&&<VictoryCelebration key={`${selected}-${run}`} effect={selected} preview contained/>}</main>;
    return open?<CampaignMode lang={(query.get('lang')??'ja') as Language} user={user} onBack={()=>setOpen(false)} onLogin={()=>{}}/>:<main style={{padding:32}}><p>Closed local presentation fixture</p><button data-reopen onClick={()=>setOpen(true)}>Reopen Circuit</button></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
