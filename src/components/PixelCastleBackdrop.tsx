/** Original castle scenery drawn directly on a 320 × 180 pixel grid.
 * No bitmap plates, filters, gradients, remote resources or idle animation.
 * Stage only changes scenery; it never determines progression or difficulty. */
const P = {
 void:'#0a141d', shadow:'#101f29', wall:'#1a3038', stone:'#29444a', face:'#3b5960', edge:'#577176',
 floorDark:'#192d34', floorLight:'#355054', floorEdge:'#456367',
 goldDark:'#765537', gold:'#bb9458', light:'#ecd394', flame:'#ffe6ad',
 banner:'#245858', bannerShade:'#183b42', door:'#10232b',
} as const;
const floorRows=[{y:105,width:20},{y:109,width:33},{y:116,width:54},{y:126,width:82},{y:141,width:122},{y:162,width:180},{y:180,width:242}];

function Arch({x,y,width,height,step}:{x:number;y:number;width:number;height:number;step:number}) {
 const base=y+height;
 return <g>
  <path d={`M${x} ${base}V${y+step*3}h${step}v${-step}h${step}v${-step}h${step}v${-step}h${width-step*6}v${step}h${step}v${step}h${step}v${step}h${step}V${base}h${-step*2}V${y+step*4}h${-step}v${-step}h${-step}v${-step}H${x+step*4}v${step}h${-step}v${step}h${-step}V${base}Z`} fill={P.stone}/>
  <path d={`M${x} ${base}V${y+step*3}h${step}v${-step}h${step}v${-step}h${step}v${-step}h${width-step*6}`} fill="none" stroke={P.edge} strokeWidth="1"/>
  <rect x={x+step} y={y+step*4} width={step} height={height-step*4} fill={P.face}/>
  <rect x={x+width-step*2} y={y+step*4} width={step} height={height-step*4} fill={P.shadow}/>
  {[0,1,2].map(i=><g key={i}><rect x={x-1} y={base-i*step*3} width={step*2+2} height={step} fill={P.face}/><rect x={x+width-step*2-1} y={base-i*step*3} width={step*2+2} height={step} fill={P.face}/></g>)}
  <rect x={x+Math.floor(width/2)-step} y={y-1} width={step*2} height={step*3} fill={P.goldDark}/>
  <rect x={x+Math.floor(width/2)-step} y={y-1} width={step*2} height={step} fill={P.gold}/>
 </g>;
}
function Torch({x,y,small=false}:{x:number;y:number;small?:boolean}) {
 const unit=small?1:2;
 return <g transform={`translate(${x} ${y})`}>
  <rect x={-unit*4} y={-unit*4} width={unit*8} height={unit*9} fill={P.goldDark} opacity=".16"/>
  <rect x={-unit*2} y={unit*2} width={unit*4} height={unit*2} fill={P.gold}/>
  <rect x={-unit} y={unit*4} width={unit*2} height={unit*5} fill={P.shadow}/>
  <rect x={-unit*2} y={-unit} width={unit*4} height={unit*3} fill={P.gold}/>
  <rect x={-unit} y={-unit*3} width={unit*2} height={unit*5} fill={P.light}/>
  <rect x={0} y={-unit*4} width={unit} height={unit*5} fill={P.flame}/>
 </g>;
}
function Banner({x,y,mirror=false,room}:{x:number;y:number;mirror?:boolean;room:number}) {
 return <g transform={`translate(${x} ${y})${mirror?' scale(-1 1)':''}`}>
  <rect x={-3} y={0} width={25} height={2} fill={P.gold}/><rect x={-4} y={-1} width={3} height={4} fill={P.light}/>
  <path d="M0 3H18V38H15V41H12V44H9V41H6V38H3V35H0Z" fill={P.banner}/>
  <rect x={1} y={3} width={2} height={30} fill={P.bannerShade}/><rect x={15} y={3} width={2} height={32} fill={P.goldDark}/>
  <path d="M4 13H7V16H8V10H11V16H12V13H15V21H4ZM5 23H14V25H5Z" fill={P.gold}/>
  {Array.from({length:Math.min(5,room)},(_,i)=><rect key={i} x={5+i*2} y={29} width={1} height={2} fill={P.light}/>)}
 </g>;
}

export function PixelCastleBackdrop({stageId=1,className=''}:{stageId?:number;className?:string}) {
 const stage=Number.isFinite(stageId)?Math.min(100,Math.max(1,Math.trunc(stageId))):1;
 const room=Math.ceil(stage/10),finalBoss=stage===100;
 return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180" preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges" className={`pixel-castle-backdrop ${className}`} aria-hidden="true" focusable="false" data-pixel-castle-room={room} data-final-throne={finalBoss}>
  <title>Original pixel-art castle interior · background art only</title>
  <rect width="320" height="180" fill={P.void}/>
  <rect x="24" y="12" width="272" height="112" fill={P.wall}/>
  {/* Staggered masonry remains visible between the receding columns. */}
  {Array.from({length:9},(_,row)=>Array.from({length:14},(_,column)=>{
   const x=column*24-(row%2?12:0),y=15+row*11;
   return <g key={`${row}-${column}`}><rect x={x} y={y} width="23" height="10" fill={(row+column)%5===0?P.stone:P.wall}/><rect x={x+2} y={y+1} width={(row+column)%3===0?13:7} height="1" fill={P.face} opacity=".32"/></g>;
  }))}
  {/* Deep doorway, then successive archways: this is an interior journey. */}
  <path d="M106 106V47H114V36H127V28H193V36H206V47H214V106Z" fill={P.shadow}/>
  <path d="M135 105V67H141V58H148V53H172V58H179V67H185V105Z" fill={P.door}/>
  <path d="M147 104V75H151V69H169V75H173V104Z" fill={P.void}/>
  <rect x="154" y="76" width="5" height="28" fill={P.wall}/><rect x="161" y="76" width="5" height="28" fill={P.wall}/>
  <rect x="159" y="76" width="2" height="29" fill={P.goldDark}/>
  {[82,96].map(y=><g key={y}><rect x="153" y={y} width="6" height="2" fill={P.stone}/><rect x="161" y={y} width="6" height="2" fill={P.stone}/></g>)}
  <rect x="157" y="89" width="1" height="2" fill={P.gold}/><rect x="162" y="89" width="1" height="2" fill={P.gold}/>
  <Arch x={134} y={49} width={52} height={59} step={3}/>
  <Arch x={101} y={22} width={118} height={88} step={5}/>
  {/* A tiled aisle, rasterized into integer-height strips for hard pixel edges. */}
  <rect x="0" y="111" width="320" height="69" fill={P.floorDark}/>
  {floorRows.slice(0,-1).map((start,row)=>{
   const end=floorRows[row+1];
   return Array.from({length:end.y-start.y},(_,line)=>{
    const y=start.y+line,width=Math.round(start.width+(end.width-start.width)*line/(end.y-start.y));
    return Array.from({length:8},(_,column)=>{
     const x=Math.round(160-width+column*width/4),nextX=Math.round(160-width+(column+1)*width/4);
     return <rect key={`${row}-${line}-${column}`} x={x} y={y} width={nextX-x} height="1" fill={(row+column)%2?P.floorDark:P.floorLight}/>;
    });
   });
  })}
  {floorRows.slice(1).map(({y,width})=><rect key={y} x={160-width} y={y-1} width={width*2} height="1" fill={P.floorEdge}/>)}
  <rect x="141" y="105" width="38" height="2" fill={P.edge}/><rect x="135" y="108" width="50" height="2" fill={P.stone}/>
  {/* Tall near pillars crop at the sides rather than filling the enemy foreground. */}
  <Arch x={38} y={-14} width={244} height={143} step={8}/>
  {[8,296].map(x=><g key={x}><rect x={x} y="0" width="16" height="146" fill={P.shadow}/><rect x={x} y="0" width="5" height="144" fill={P.face}/><rect x={x+5} y="0" width="7" height="144" fill={P.stone}/><rect x={x-3} y="25" width="22" height="7" fill={P.face}/><rect x={x-3} y="83" width="22" height="5" fill={P.face}/><rect x={x-5} y="140" width="26" height="6" fill={P.edge}/><rect x={x-8} y="146" width="32" height="7" fill={P.stone}/></g>)}
  <Banner x={68} y={33} room={room}/><Banner x={252} y={33} mirror room={room}/>
  <Torch x={91} y={79}/><Torch x={229} y={79}/><Torch x={126} y={77} small/><Torch x={194} y={77} small/>
  {/* Small gold floor inlays guide the eye to the next room, never unlock markers. */}
  {[{x:103,y:143},{x:214,y:143},{x:120,y:128},{x:197,y:128},{x:135,y:117},{x:183,y:117}].map(({x,y})=><g key={x}><rect x={x} y={y} width="3" height="2" fill={P.goldDark}/><rect x={x+1} y={y} width="1" height="1" fill={P.gold}/></g>)}
  {finalBoss&&<g data-pixel-throne="true"><rect x="147" y="100" width="26" height="5" fill={P.goldDark}/><rect x="151" y="76" width="18" height="25" fill={P.goldDark}/><rect x="154" y="79" width="12" height="18" fill={P.banner}/><rect x="148" y="90" width="5" height="12" fill={P.gold}/><rect x="167" y="90" width="5" height="12" fill={P.gold}/><path d="M151 73V65H154V69H158V62H162V69H166V65H169V73Z" fill={P.light}/><rect x="152" y="74" width="16" height="2" fill={P.gold}/><rect x="155" y="97" width="10" height="3" fill={P.gold}/></g>}
  <rect width="320" height="4" fill={P.void}/><rect y="177" width="320" height="3" fill={P.void}/>
 </svg>;
}
