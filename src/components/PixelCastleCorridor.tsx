/** Original pixel masonry and perspective geometry. No reference-image background. */
import type {CSSProperties,ReactNode} from 'react';
import {castleRoomForStage} from '../config/castleRooms';
const C={void:'#080e1a',dark:'#111d2c',wall:'var(--castle-wall,#253444)',stone:'var(--castle-stone,#354858)',face:'var(--castle-face,#506575)',edge:'#6a7983',floor:'var(--castle-floor,#172530)',tile:'var(--castle-tile,#3a4a55)',gold:'#c79950',light:'#ffe5a4'};
const pixel=(n:number)=>Math.round(n/2)*2;
const arc=(cx:number,cy:number,rx:number,ry:number,a:number)=>[pixel(cx+Math.cos(a)*rx),pixel(cy-Math.sin(a)*ry)].join(',');
function Torch({x,y,scale=1}:{x:number;y:number;scale?:number}){
 return <g transform={'translate('+x+' '+y+') scale('+scale+')'}>
  {[{size:64,opacity:.025},{size:46,opacity:.035},{size:30,opacity:.07},{size:16,opacity:.12}].map(({size,opacity})=><rect key={size} x={-size/2} y={-size/2} width={size} height={size+16} fill={C.light} opacity={opacity}/>)}
  <path d="M-2 6V23H5V20H1V6" fill={C.dark}/><rect x="-7" y="5" width="14" height="4" fill={C.gold}/><path d="M-5 5V-4H-2V-11H1V-14H4V-3H6V5Z" fill="#cb813e"/><path d="M-2 5V-5H1V-9H3V5Z" fill={C.light}/><rect x="0" y="-2" width="2" height="7" fill="#fff4ce"/>
 </g>;
}
function Masonry({variant=0}:{variant?:number}){
 const columns=[0,27,49,67,82,95,106,115,122,128];
 return <g data-perspective-masonry>
  {[false,true].map(mirror=><g key={String(mirror)} transform={mirror?'translate(320 0) scale(-1 1)':undefined}>
   {columns.slice(0,-1).flatMap((x,col)=>Array.from({length:21},(_,row)=>{
    const end=columns[col+1],top=(n:number)=>10+n*1.72,bottom=(n:number)=>386-n*1.08;
    const a=pixel(top(x)+(bottom(x)-top(x))*row/21),b=pixel(top(end)+(bottom(end)-top(end))*row/21),c=pixel(top(end)+(bottom(end)-top(end))*(row+1)/21),d=pixel(top(x)+(bottom(x)-top(x))*(row+1)/21);
    return <g key={col+':'+row}><polygon points={[[x+1,a+1],[end-1,b+1],[end-1,c-1],[x+1,d-1]].map(p=>p.join(',')).join(' ')} fill={(col*3+row+variant)%5===0?C.stone:C.wall}/><path d={'M'+(x+2)+' '+(a+2)+'L'+(end-2)+' '+(b+2)} stroke={C.face} strokeWidth="1" opacity=".55"/>{(row+variant)%2===0&&col<4&&<path d={'M'+pixel((x+end)/2)+' '+(pixel((a+b)/2)+1)+'v'+Math.max(2,pixel((c+d-a-b)/4))} stroke={C.dark} strokeWidth="1"/>}</g>;
   }))}
  </g>)}
 </g>;
}
export function PixelCastleCorridor({stageId=1,children,foreground,viewport,asLayer=false}:{stageId?:number;children?:ReactNode;foreground?:ReactNode;viewport?:{width:number;height:number};asLayer?:boolean}){
 const stage=Number.isFinite(stageId)?Math.max(1,Math.min(100,Math.trunc(stageId))):1,room=Math.ceil(stage/10),king=stage===100;
 const design=castleRoomForStage(stage);
 const palette={'--castle-wall':design.wall,'--castle-stone':design.stone,'--castle-face':design.face,'--castle-floor':design.floor,'--castle-tile':design.tile} as CSSProperties;
 const rows=Array.from({length:15},(_,i)=>({y:pixel(247+193*(i/14)**2.1),w:9+255*(i/14)**2.1}));
 const size=viewport??{width:320,height:440},projection='scale('+size.width/320+' '+size.height/440+')';
 const Root=asLayer?'g':'svg';
 return <Root viewBox={asLayer?undefined:'0 0 '+size.width+' '+size.height} preserveAspectRatio={asLayer?undefined:'xMidYMid meet'} style={palette} shapeRendering="crispEdges" className={asLayer?'castle-room-layer':'pixel-castle-backdrop pixel-castle-corridor'} aria-hidden="true" focusable="false" data-pixel-castle-room={room} data-room-design={design.id} data-character-chamber={design.chamber} data-room-variant={design.variant} data-room-boss={design.boss} data-final-throne={king}>
  <g transform={projection}>
  <rect width="320" height="440" fill={C.void}/>
  <g data-castle-layer="far"><path d="M0 0H320L185 242H141Z" fill={C.dark}/><path d="M0 20 151 245V386H0Z" fill={C.wall}/><path d="M320 8 170 245V386H320Z" fill={C.wall}/><Masonry variant={design.variant}/>
   <g data-character-background={design.foe}>
    {design.foe==='pawn'&&<g><path d="M0 48H38V36H61V90H75V117H0ZM320 48H282V36H259V90H245V117H320Z" fill="#1a2f39"/><path d="M15 76H32V99H15ZM48 72H60V91H48ZM288 76H305V99H288ZM260 72H272V91H260Z" fill="#51676c"/><path d="M92 247V189H108V247M212 247V189H228V247" stroke="#405158" strokeWidth="7"/></g>}
    {design.foe==='knight'&&<g><path d="M4 57H53V173L30 187L4 173ZM267 57H316V173L290 187L267 173Z" fill="#364b65"/><path d="M13 65H44V165L29 174L13 164ZM277 65H307V164L291 174L277 165Z" fill="none" stroke="#a39665" strokeWidth="3"/><path d="M115 240V120H124V240M196 240V120H205V240" stroke="#4f6676" strokeWidth="6"/><path d="M124 126H196M125 155H195" stroke="#759294" strokeWidth="3"/></g>}
    {design.foe==='bishop'&&<g><path d="M0 123L27 77L54 125L41 173H14ZM266 123L293 77L320 125L307 173H280Z" fill="#716884" stroke="#a6a5b0" strokeWidth="2"/><path d="M11 122L28 96L43 124L29 153ZM277 122L294 96L309 124L295 153Z" fill="#a3a9a8"/><path d="M100 244H220L198 229H120Z" fill="#6d637b"/><rect x="116" y="220" width="18" height="9" fill="#b8a48c"/><rect x="186" y="220" width="18" height="9" fill="#b8a48c"/></g>}
    {design.foe==='rook'&&<g>{[18,57,245,285].map(x=><g key={x}><path d={`M${x} 72h19v166h-19Z`} fill="#56605a"/><path d={`M${x+4} 79v145m7-141v141`} stroke="#929789" strokeWidth="3"/><path d={`M${x-5} 66h29v8h-29Zm0 167h29v8h-29Z`} fill="#7a8374"/></g>)}<rect x="114" y="171" width="92" height="71" fill="#192a29"/><path d="M120 183H200M120 207H200M139 177V240M180 177V240" stroke="#566b5f" strokeWidth="3"/></g>}
    {design.foe==='queen'&&<g><path d="M0 45H61L49 91L57 176L24 211L0 199ZM259 45H320V199L296 211L263 176L271 91Z" fill="#654453"/><path d="M13 56H43L30 100L43 172L19 196ZM277 56H307V196L283 172L294 99Z" fill="#a17878"/>{[82,217].map(x=><g key={x}><rect x={x} y="112" width="21" height="107" fill="#76919a" stroke="#c8ad78" strokeWidth="3"/><path d={`M${x+4} 120l12 21m-12-6l12 21m-12 18l12 21`} stroke="#bfc6ba" strokeWidth="2"/></g>)}</g>}
    {design.foe==='king'&&<g><path d="M0 28H66V195L43 223L0 207ZM254 28H320V207L277 223L254 195Z" fill="#713b4f"/><path d="M14 38H52V183L36 203L14 190ZM268 38H306V190L284 203L268 183Z" fill="none" stroke="#c3a35e" strokeWidth="3"/><path d="M116 240V156H128V136H192V156H204V240Z" fill="#705866" stroke="#b79a61" strokeWidth="3"/><path d="M132 160H188V224H132Z" fill="#263b51"/><path d="M109 243H211L227 251H93Z" fill="#8f775e"/></g>}
   </g>
   {[false,true].map(mirror=><g key={String(mirror)} transform={mirror?'translate(320 0) scale(-1 1)':undefined}>
    {design.motif==='ivy'&&<path d="M18 65V184H28V210H37V241M28 128H39V144M13 159H25V175" fill="none" stroke="#5b795c" strokeWidth="4"/>}
    {design.motif==='windows'&&<g><path d={`M25 ${86+design.variant*3}V170H47V90L36 79Z`} fill="#0a1427"/><path d="M29 95V164M38 93V164M29 126H44" stroke="#6c7f93" strokeWidth="2"/></g>}
    {design.motif==='shelves'&&<g>{[93,118,143,168].map((y,i)=><g key={y}><rect x="21" y={y} width="31" height="5" fill="#866b57"/>{[0,1,2,3].map(n=><rect key={n} x={23+n*7} y={y-15+i%2*2} width="5" height="14" fill={n%2?'#697363':'#6d5369'}/>)}</g>)}</g>}
    {design.motif==='furnace'&&<g><rect x="20" y="126" width="30" height="40" fill="#17141a"/><rect x="24" y="145" width="22" height="16" fill="#ad6b3d"/><path d="M27 130V163M34 130V163M41 130V163" stroke="#574436" strokeWidth="3"/></g>}
    {(design.motif==='banners'||design.motif==='royal')&&<g><path d="M21 80H51V177L36 188L21 177Z" fill={design.final?'#793e51':'#465178'}/><path d="M27 84H45V170L36 177L27 170Z" fill="none" stroke={C.gold} strokeWidth="2"/><path d="M30 118L36 106L42 118L36 131Z" fill={C.gold}/></g>}
    {design.motif==='crystal'&&<path d="M21 140L28 107L34 132L43 99L49 143L37 151Z" fill="#7396ab" stroke="#aacdd4" strokeWidth="2"/>}
    {design.motif==='pillars'&&<g><rect x="24" y="110" width="25" height="112" fill={C.stone}/><path d="M29 115V216M38 115V216M46 115V216" stroke={C.face} strokeWidth="2"/><rect x="20" y="105" width="34" height="7" fill={C.edge}/></g>}
    {design.motif==='stars'&&<g>{[0,1,2,3,4].map(i=><path key={i} d={`M${21+i*6} ${89+i*11}h4m-2-2v4`} stroke="#c4bd8b" strokeWidth="1"/>)}</g>}
   </g>)}
   {design.boss&&<g data-castle-boss-door><path d="M105 246V157L118 143H202L215 157V246Z" fill="#182335" stroke={C.gold} strokeWidth="3"/><path d="M113 243V159L122 151H158V243ZM162 243V151H198L207 159V243Z" fill={king?'#674052':'#4b484c'} stroke="#8d7954" strokeWidth="2"/>{[165,192,221].map(y=><path key={y} d={`M117 ${y}H155M165 ${y}H203`} stroke="#b49760" strokeWidth="2"/>)}<rect x="153" y="197" width="3" height="8" fill={C.gold}/><rect x="165" y="197" width="3" height="8" fill={C.gold}/></g>}
   
   <Torch x={125} y={243} scale={.26}/><Torch x={195} y={243} scale={.26}/>
   {king&&<g><rect x="139" y="234" width="12" height="16" fill="#836839"/><rect x="142" y="237" width="6" height="10" fill="#253c3e"/><path d="M139 234V230H142V232H145V228H148V232H151V234Z" fill={C.gold}/></g>}
  </g>
  <g data-castle-layer="floor"><rect y="247" width="320" height="193" fill={C.floor}/>
   {rows.slice(0,-1).flatMap((row,i)=>Array.from({length:10},(_,col)=>{
    const next=rows[i+1],x=(w:number,n:number)=>pixel(160-w+n*w/5);
    return <polygon key={i+':'+col} points={[[x(row.w,col),row.y],[x(row.w,col+1),row.y],[x(next.w,col+1),next.y],[x(next.w,col),next.y]].map(p=>p.join(',')).join(' ')} fill={(i+col)%2?C.floor:C.tile} stroke={C.dark} strokeWidth=".5"/>;
   }))}
   <path d="M0 430 160 251 320 427V440H0Z" fill={C.void} opacity=".12"/>
   {design.boss&&<g><path d="M145 249H175L246 440H74Z" fill={king?'#743b50':'#454166'} opacity=".65"/><path d="M145 249L74 440M175 249L246 440" stroke={C.gold} strokeWidth="2" opacity=".6"/></g>}
  </g>
  <g data-castle-layer="middle"><Torch x={100} y={229} scale={.48}/><Torch x={220} y={229} scale={.48}/><Torch x={77} y={216} scale={.66}/><Torch x={243} y={216} scale={.66}/></g>
  </g>
  {children}
  <g transform={projection}>
  <g data-castle-layer="near"><path d="M0 0H9V440H0ZM311 0H320V440H311Z" fill={C.dark}/><path d="M9 0H15V382H9ZM305 0H311V382H305Z" fill={C.stone}/><Torch x={31} y={195} scale={design.boss?1.25:1}/><Torch x={289} y={195} scale={design.boss?1.25:1}/></g>
  <g opacity=".65">{Array.from({length:Math.min(10,room)},(_,i)=><rect key={i} x={130+i*3} y="248" width="2" height="2" fill={C.gold}/>)}</g>
  </g>
  {foreground}
 </Root>;
}
