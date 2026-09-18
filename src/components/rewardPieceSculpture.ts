import {Box3,BoxGeometry,BufferGeometry,CylinderGeometry,ExtrudeGeometry,LatheGeometry,Shape,SphereGeometry,Vector2,Vector3} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {PieceType} from '../config/gameConfig';
import type {PieceForm} from '../config/championshipRewards';
import {PIECE_HEIGHTS,PIECE_MAX_WIDTH} from './boardPresentation';

/** Lathe-turned bodies and separately authored heads. Shared once per type,
 * not remeshed per candidate. No textures, downloaded meshes or head distortion. */
export function rewardPieceSculpture(type:PieceType,form:PieceForm,compact=false):BufferGeometry {
    const parts:BufferGeometry[]=[];
    const add=(geometry:BufferGeometry,x=0,y=0,z=0)=>{geometry.translate(x,y,z);parts.push(geometry);};
    const lathe=(points:number[][])=>add(new LatheGeometry(points.map(([r,y])=>new Vector2(r,y)),form==='faceted'?12:form==='citadel'?8:compact?16:64));
    const ball=(r:number,x:number,y:number,z=0)=>add(new SphereGeometry(r,compact?12:24,compact?8:16),x,y,z);
    const base=.43;
    lathe([[0,0],[base*.86,0],[base,.025],[base,.075],[base*.95,.1],[base*.8,.12],[base*.78,.17],[base*.86,.19],[base*.85,.22],[base*.67,.245]]);
    const stemTop=type==='Pawn'?.72:.87;
    const profile=form==='spire'?[[.29,.23],[.22,.28],[.115,.4],[.072,.58],[.105,stemTop-.06],[.17,stemTop]]
        :form==='citadel'?[[.29,.23],[.25,.3],[.23,.4],[.19,stemTop-.1],[.23,stemTop]]
        :form==='crowned'?[[.29,.23],[.23,.29],[.17,.37],[.135,.5],[.145,.65],[.2,stemTop]]
        :[[.29,.23],[.24,.3],[.17,.43],[.13,.58],[.16,stemTop-.09],[.22,stemTop]];
    lathe([...profile,[.24,stemTop+.035],[.24,stemTop+.075],[.18,stemTop+.1]]);
    if(form==='crowned')for(const y of [.31,.39])lathe([[.235,y],[.25,y+.014],[.25,y+.038],[.22,y+.055]]);
    if(form==='fluted')for(let i=0;i<12;i++){
        const a=i*Math.PI/6;
        const flute=new CylinderGeometry(.014,.018,.29,5);add(flute,Math.cos(a)*.166,.53,Math.sin(a)*.166);
    }
    const h=stemTop+.1;
    if(type==='Pawn')ball(.225,0,h+.19);
    if(type==='Rook'){
        lathe([[.18,h],[.27,h+.08],[.27,h+.22],[.29,h+.25],[.29,h+.29],[.22,h+.29],[.22,h+.1],[.18,h]]);
        for(let i=0;i<6;i++){const a=i*Math.PI/3,block=new BoxGeometry(.135,.15,.115);block.rotateY(-a);add(block,Math.sin(a)*.23,h+.31,Math.cos(a)*.23);}
    }
    if(type==='Queen'){
        lathe([[.16,h],[.19,h+.06],[.16,h+.12],[.26,h+.33],[.25,h+.37],[.18,h+.34],[.12,h+.12]]);
        for(let i=0;i<7;i++){const a=i*Math.PI*2/7;ball(.035,Math.cos(a)*.24,h+.385,Math.sin(a)*.24);}
        ball(.063,0,h+.43);
    }
    if(type==='King'){
        lathe([[.15,h],[.22,h+.07],[.22,h+.12],[.12,h+.15],[.115,h+.24],[.15,h+.28],[.14,h+.32]]);
        add(new BoxGeometry(.065,.26,.065),0,h+.44);add(new BoxGeometry(.225,.065,.065),0,h+.465);
        ball(.035,0,h+.585);
    }
    if(type==='Bishop'){
        // A notched mitre keeps the identifying cut in the silhouette itself.
        const mitre=new Shape();mitre.moveTo(-.14,0);mitre.bezierCurveTo(-.25,.15,-.08,.36,0,.4);mitre.lineTo(.075,.28);mitre.lineTo(-.025,.135);mitre.lineTo(.015,.12);mitre.lineTo(.105,.235);mitre.bezierCurveTo(.2,.14,.18,.05,.12,0);mitre.closePath();
        const head=new ExtrudeGeometry(mitre,{depth:.12,bevelEnabled:true,bevelSegments:compact?1:3,steps:1,bevelSize:.012,bevelThickness:.025,curveSegments:compact?6:12});
        head.translate(0,h+.03,-.06);parts.push(head);ball(.04,0,h+.455);
    }
    if(type==='Knight'){
        const horse=new Shape();horse.moveTo(-.23,0);horse.bezierCurveTo(-.22,.21,-.24,.42,-.1,.61);horse.lineTo(-.08,.72);horse.lineTo(.01,.63);horse.lineTo(.1,.66);horse.lineTo(.09,.56);horse.bezierCurveTo(.16,.51,.21,.43,.32,.39);horse.lineTo(.29,.27);horse.lineTo(.14,.3);horse.lineTo(.035,.39);horse.bezierCurveTo(-.015,.22,.1,.12,.22,0);horse.closePath();
        const head=new ExtrudeGeometry(horse,{depth:.18,bevelEnabled:true,bevelSegments:compact?1:3,steps:1,bevelSize:.025,bevelThickness:.025,curveSegments:compact?6:12});
        add(head,0,h-.06,-.09);
        for(const side of [-1,1])ball(.024,.095,h+.44,side*.117);
        for(let i=0;i<6;i++)add(new BoxGeometry(.04,.055,.22),-.195+i*.009,h+.1+i*.07,0);
    }
    const converted=parts.map(part=>{const result=part.index?part.toNonIndexed():part.clone();part.dispose();return result;});
    const merged=mergeGeometries(converted);converted.forEach(part=>part.dispose());
    if(!merged)throw new Error('Unable to assemble reward sculpture');
    const bounds=new Box3().setFromBufferAttribute(merged.getAttribute('position') as import('three').BufferAttribute),size=bounds.getSize(new Vector3());
    const horizontal=Math.min(1,PIECE_MAX_WIDTH/Math.max(size.x,size.z));
    merged.scale(horizontal,PIECE_HEIGHTS[type]/size.y,horizontal);
    merged.computeBoundingBox();merged.computeBoundingSphere();return merged;
}
