'use client';
import {createElement,useEffect,useRef,useState} from 'react';
import {crownEnemyForStage} from '../config/crownEnemies';
import {crownToonLayers,TOON_PARTS} from './crownToonArt';
import {PixelCastleCorridor} from './PixelCastleCorridor';
import {QubeArtwork} from './qubeArtwork';
import {castleRoomForStage} from '../config/castleRooms';

/** One scene graph and floor coordinates. The first-person camera owns from/to layers. */
export function CastleQuestScene({stageId,victory=false,fromStage}:{stageId:number;victory?:boolean;fromStage?:number}){
 const frame=useRef<HTMLDivElement>(null),[viewport,setViewport]=useState({width:320,height:360});
 useEffect(()=>{
  const node=frame.current;if(!node)return;
  const observer=new ResizeObserver(entries=>{
   const rect=entries[0]?.contentRect;if(!rect||rect.width<1||rect.height<1)return;
   const width=Math.round(rect.width),height=Math.round(rect.height);
   setViewport(current=>current.width===width&&current.height===height?current:{width,height});
  });observer.observe(node);return()=>observer.disconnect();
 },[]);
 const center=viewport.width/2,ground=viewport.height*292/440;
 const qubeWidth=Math.min(88,viewport.width*.26),qubeHeight=qubeWidth*310/300;
 const enemyLayer=(id:number,defeated=false)=>{
  const enemy=crownEnemyForStage(id),design=castleRoomForStage(id);
  const bulk=(enemy.foe==='rook'?1.06:enemy.foe==='king'?1.12:enemy.foe==='bishop'?.98:1)*(design.boss?1.1:1);
  const scale=Math.min(Math.min(viewport.width*.46/256,viewport.height*.61/288)*bulk,(ground-8)/266),x=center-128*scale,y=ground-274*scale;
  return <g data-castle-layer="actors" shapeRendering="geometricPrecision">
   <g data-castle-contact-shadow="enemy"><ellipse cx={center} cy={ground+1} rx={30*scale/.41} ry="6" fill="#030b10" opacity=".8"/><path d={'M'+(center-27*scale)+' '+ground+'l53 15h-35l-33-14Z'} fill="#0a1620" opacity=".45"/></g>
   <g transform={'translate('+x+' '+y+') scale('+scale+')'}>
    <g className="castle-scene-enemy" data-castle-actor={enemy.id} data-crown-enemy-id={enemy.id} data-final-boss={enemy.finalBoss} data-old-defeated={defeated||undefined} stroke="#403926" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
     {crownToonLayers(enemy.foe).map((shapes,i)=><g key={TOON_PARTS[i]} data-character-part={TOON_PARTS[i]}>{shapes.map((shape,index)=>createElement(shape.tag,{key:index,...shape.props}))}</g>)}
     <path d="M65 88Q57 113 68 139M76 187L70 214M83 249L76 261" fill="none" stroke="#dfb76d" strokeWidth="3" opacity=".35"/>
     <path d="M182 79Q198 105 188 135M179 191L186 209" fill="none" stroke="#92a7c1" strokeWidth="2.5" opacity=".25"/>
    </g>
   </g>
  </g>;
 };
 return <div ref={frame} className="castle-scene-graph"><svg viewBox={'0 0 '+viewport.width+' '+viewport.height} preserveAspectRatio="xMidYMid meet" className="pixel-castle-backdrop pixel-castle-corridor" aria-hidden="true" focusable="false">
  {fromStage!==undefined&&<g data-castle-view="from" data-room-stage={fromStage}><PixelCastleCorridor asLayer stageId={fromStage} viewport={viewport}>{enemyLayer(fromStage,true)}</PixelCastleCorridor></g>}
  <g data-castle-view="to" data-room-stage={stageId}><PixelCastleCorridor asLayer stageId={stageId} viewport={viewport}>{enemyLayer(stageId)}</PixelCastleCorridor></g>
  {fromStage!==undefined&&<g data-castle-doorway fill="#243441" stroke="#718074" strokeWidth="2"><path d={'M0 0H'+viewport.width*.09+'V'+viewport.height+'H0ZM'+viewport.width*.91+' 0H'+viewport.width+'V'+viewport.height+'H'+viewport.width*.91+'Z'}/></g>}
  <g className="castle-scene-qube" data-castle-qube shapeRendering="geometricPrecision">
   <ellipse cx={qubeWidth*.47} cy={viewport.height-12} rx={qubeWidth*.38} ry="5" fill="#030b10" opacity=".58"/>
   <QubeArtwork x="2" y={viewport.height-qubeHeight-3} width={qubeWidth} height={qubeHeight} style={{width:qubeWidth,height:qubeHeight}} expression={victory?'joy':'neutral'} aria-hidden="true" focusable="false"/>
  </g>
 </svg></div>;
}
