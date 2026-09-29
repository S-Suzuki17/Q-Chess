import {unit, type shotAt} from './timeline';
import type {ResultStyle} from '../../config/victoryStyles';
import {victoryIntensity, type VictoryIntensity} from './intensity';
export type WordBox = {x:number;y:number;width:number;height:number};
type Point = [number,number];
type Paint = string | CanvasGradient;
export type AtmosphereParticle = {origin:number;row:number;direction:number;speed:number;size:number;aspect:number;delay:number;life:number;spin:number;twist:number;drift:number;corners:number[];depth:number;gravity:number;batch:number};
export const ATMOSPHERE_END=2.8;
export function atmosphereParticles(seed:number,compact=false,intensity:VictoryIntensity=victoryIntensity({requiredWins:1},compact)):AtmosphereParticle[]{
    let n=seed>>>0;
    const random=()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);
    return Array.from({length:intensity.ornamentCount},()=>{
        // Irregular follow-up eruptions, never evenly spaced rings or mirrored fans.
        const batch=Math.floor(random()**1.8*intensity.bursts);
        const depth=random()<intensity.foreground?1.5+random()*.8:.65+random()*.5;
        const delay=.246+batch*.19+random()*.13;
        return {
            origin:random(),row:random(),direction:random()*Math.PI*2,
            speed:(190+random()*560)*intensity.reach*depth,
            size:(4+random()*17)*intensity.scale*depth,aspect:.3+random()*1.6,
            delay,life:Math.min(ATMOSPHERE_END-delay, .72+random()*1.2+intensity.progress*.4),
            spin:(random()-.5)*12,twist:random()*Math.PI*2,drift:(random()-.5)*48,
            corners:Array.from({length:5},()=>.55+random()*.7),depth,gravity:35+random()*65,batch,
        };
    });
}
export function atmosphereAt(p:AtmosphereParticle,time:number){
    const age=time-p.delay,progress=unit(age/p.life);
    const distance=p.speed*(1-Math.exp(-Math.max(0,age)*2.4))/2.4;
    return {x:Math.cos(p.direction)*distance+Math.sin(age*3+p.twist)*p.drift*age,
        y:Math.sin(p.direction)*distance*.8+age*age*p.gravity,
        opacity:age<0||age>=p.life||time>=ATMOSPHERE_END?0:unit(age/.045)*(1-progress)**1.15,
        angle:p.twist+age*p.spin,fold:.18+Math.abs(Math.sin(p.twist+age*4))*.82};
}
function polygon(ctx:CanvasRenderingContext2D,points:Point[],fill:Paint,stroke?:string){
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}
}
function gradient(ctx:CanvasRenderingContext2D,from:Point,to:Point,stops:[number,string][]){const g=ctx.createLinearGradient(...from,...to);for(const[offset,color]of stops)g.addColorStop(offset,color);return g;}

/** Each material bursts irregularly from the lettering, then expires completely. */
export function renderAtmosphere(ctx:CanvasRenderingContext2D,width:number,height:number,f:ReturnType<typeof shotAt>,style:ResultStyle,reduced:boolean,words:WordBox[],particles:AtmosphereParticle[]){
    if(reduced||f.t<.246||f.t>=ATMOSPHERE_END||!words.length)return;
    const factor=Math.min(width/900,height/500),color=style.color,highlight=style.highlight;
    for(let i=0;i<particles.length;i++){
        const p=particles[i],a=atmosphereAt(p,f.t);if(a.opacity<=0)continue;
        const word=words[Math.min(words.length-1,Math.floor(p.row*words.length))];
        const x=word.x+p.origin*word.width+a.x*factor,y=word.y+word.height*(.3+p.row*.7)+a.y*factor;
        if(x<-60||x>width+60||y<-60||y>height+60)continue;
        ctx.save();ctx.translate(x,y);ctx.rotate(a.angle);ctx.scale(factor,factor);ctx.globalAlpha=a.opacity;ctx.lineWidth=.7;
        const s=p.size;
        if(style.decoration==='sparks'){
            ctx.rotate(-a.angle+p.direction);ctx.globalCompositeOperation='screen';const length=s*(2+p.aspect*2);
            ctx.fillStyle=gradient(ctx,[-length,0],[2,0],[[0,color+'00'],[.72,color+'ac'],[1,highlight]]);
            ctx.fillRect(-length,-.6-p.aspect*.4,length+2,1.2+p.aspect*.8);
            if(i%7===0){ctx.fillStyle=highlight;ctx.fillRect(-2,-2,4,4);}
        }else if(style.decoration==='curtain'){
            ctx.scale(1,a.fold);
            const g=gradient(ctx,[-s,0],[s,0],[[0,'#344a61'],[.38,'#a1b9d0'],[.48,'#f5fbff'],[.56,'#778fa8'],[1,'#d6edfa']]);
            polygon(ctx,[[-s*.35,-s*2],[s*.35,-s*1.6],[s*.5,s*1.7],[-s*.2,s*2]],g,highlight+'ad');
        }else if(style.decoration==='engraving'){
            ctx.scale(1,a.fold);
            const g=gradient(ctx,[-s,-s],[s,s],[[0,'#f7caa3'],[.44,'#ab623f'],[1,'#4d2e22']]);
            polygon(ctx,[[-s,-s*.6],[s*.7,-s],[s,s*.5],[-s*.6,s]],g,color);
            ctx.strokeStyle='#713b29';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-s*.65,-s*.1);ctx.lineTo(s*.5,-s*.4);ctx.moveTo(-s*.4,s*.4);ctx.lineTo(s*.65,s*.1);ctx.stroke();
        }else if(style.decoration==='fracture'){
            const g=gradient(ctx,[-s,-s],[s,s],[[0,'#74828b'],[.23,'#26343f'],[1,'#050b12']]);
            const corners=p.corners.map((r,j):Point=>[Math.cos(j*Math.PI*.4)*s*r,Math.sin(j*Math.PI*.4)*s*r]);
            polygon(ctx,corners,g,color+'db');ctx.strokeStyle='#aabdc27a';ctx.beginPath();ctx.moveTo(...corners[0]);ctx.lineTo(0,0);ctx.lineTo(...corners[3]);ctx.stroke();
        }else if(style.decoration==='ribbon'){
            const bend=Math.sin(a.angle*.4)*s*.8,edge=s*.23;
            ctx.fillStyle=gradient(ctx,[-s*.5,0],[s*.5,0],[[0,'#4d1020'],[.4,'#e88b80'],[.55,'#bc283e'],[1,'#591329']]);
            ctx.beginPath();ctx.moveTo(-edge,-s*2);ctx.bezierCurveTo(bend-s,-s*1.1,bend+s,s*.8,-edge,s*2);
            ctx.lineTo(edge,s*2);ctx.bezierCurveTo(bend+s*1.6,s*.8,bend-s*.4,-s*1.1,edge,-s*2);ctx.closePath();ctx.fill();
            ctx.strokeStyle='#ffc79488';ctx.beginPath();ctx.moveTo(-edge,-s*2);ctx.bezierCurveTo(bend-s,-s*1.1,bend+s,s*.8,-edge,s*2);ctx.stroke();
        }else if(style.decoration==='glass'){
            const g=gradient(ctx,[-s,-s],[s,s],[[0,'#e2fbff99'],[.45,'#609dc030'],[.49,'#edfdffec'],[.55,'#609dc055'],[1,'#a9eaff66']]);
            polygon(ctx,[[-s*p.corners[0],-s],[s*p.corners[1],-s*.5],[s*.3,s*p.corners[2]]],g,highlight+'e0');
        }else if(style.decoration==='ivory'){
            ctx.scale(1,a.fold);ctx.fillStyle=gradient(ctx,[-s,-s],[s,s],[[0,'#fff9e8'],[.5,'#d6cbb5'],[1,'#827462']]);
            ctx.beginPath();ctx.moveTo(-s,-s*.3);ctx.quadraticCurveTo(-s*.2,-s*1.2,s,s*.4);ctx.quadraticCurveTo(s*.3,s*1.1,-s,-s*.3);ctx.fill();
            ctx.strokeStyle='#fff5dc';ctx.beginPath();ctx.moveTo(-s,-s*.3);ctx.quadraticCurveTo(0,-s*.4,s,s*.4);ctx.stroke();
        }else if(style.decoration==='foil'){
            ctx.scale(1,a.fold);const g=gradient(ctx,[-s,0],[s,0],[[0,'#987026'],[.42,'#e2bd52'],[.47,'#fff8cb'],[.55,'#c3912c'],[1,'#f2dc8f']]);
            const corners=p.corners.map((r,j):Point=>[Math.cos(j*Math.PI*.4)*s*r*.7,Math.sin(j*Math.PI*.4)*s*r*p.aspect]);
            polygon(ctx,corners,g,'#f8e399aa');ctx.strokeStyle='#fff6c4a0';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(...corners[1]);ctx.lineTo(0,0);ctx.lineTo(...corners[4]);ctx.stroke();
        }
        ctx.restore();
    }
}
