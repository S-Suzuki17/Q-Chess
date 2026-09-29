import {unit} from './timeline';
import {ATMOSPHERE_END, type WordBox} from './atmosphere';
import type {VictoryIntensity} from './intensity';
import type {ResultStyle} from '../../config/victoryStyles';

export type BurstTrail = {origin:number;row:number;angle:number;length:number;width:number;bend:number;delay:number;life:number};
export function burstTrails(seed:number,intensity:VictoryIntensity):BurstTrail[] {
    let n=(seed^0x73ba981f)>>>0;
    const random=()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);
    return Array.from({length:intensity.trailCount},()=>({
        origin:random(),row:random(),angle:random()*Math.PI*2,
        length:(180+random()*460)*intensity.reach,width:1+random()*(3+intensity.progress*7),
        bend:(random()-.5)*170,delay:.246+random()**1.7*.75,
        life:.5+random()*.8+intensity.progress*.3,
    }));
}
export function trailAt(trail:BurstTrail,time:number) {
    const age=time-trail.delay,progress=unit(age/trail.life);
    return {progress,travel:1-(1-progress)**3,
        opacity:age<0||age>=trail.life||time>=ATMOSPHERE_END?0:unit(age/.065)*(1-progress)**1.6};
}
/** Tapered, asymmetric material streaks behind the word, not a second hero motif. */
export function renderBurstTrails(ctx:CanvasRenderingContext2D,width:number,height:number,time:number,style:ResultStyle,
    words:WordBox[],trails:BurstTrail[],intensity:VictoryIntensity,reduced:boolean) {
    if(reduced||!words.length||time<.246||time>=ATMOSPHERE_END)return;
    const factor=Math.min(width/900,height/500);
    ctx.save();ctx.globalCompositeOperation='screen';
    for(const trail of trails){
        const at=trailAt(trail,time);if(at.opacity<=0)continue;
        const word=words[Math.min(words.length-1,Math.floor(trail.row*words.length))];
        const x=word.x+word.width*trail.origin,y=word.y+word.height*(.4+trail.row*.45);
        const head=trail.length*at.travel,tail=Math.max(0,head-trail.length*(.2+.35*(1-at.progress)));
        const bend=trail.bend*at.travel,thickness=trail.width*(1-at.progress);
        ctx.save();ctx.translate(x,y);ctx.rotate(trail.angle);ctx.scale(factor,factor);
        const light=ctx.createLinearGradient(tail,0,head,0);
        light.addColorStop(0,style.color+'00');light.addColorStop(.65,style.color+'66');light.addColorStop(1,style.highlight+'dc');
        ctx.globalAlpha=at.opacity*.65;ctx.fillStyle=light;
        ctx.beginPath();ctx.moveTo(tail,bend*.25);
        ctx.quadraticCurveTo((head+tail)*.5,bend-thickness,head,bend);
        ctx.quadraticCurveTo((head+tail)*.5,bend+thickness,tail,bend*.25);ctx.fill();
        ctx.globalAlpha=at.opacity;ctx.strokeStyle=style.highlight+'cc';ctx.lineWidth=.8;
        ctx.beginPath();ctx.moveTo(tail+(head-tail)*.45,bend*.65);ctx.quadraticCurveTo(head*.92,bend,head,bend);ctx.stroke();
        ctx.restore();
    }
    // Local illumination for each eruption. No full-screen white flash or strobing.
    for(let batch=0;batch<intensity.bursts;batch++){
        const age=time-(.246+batch*.19);
        if(age<0||age>.65)continue;
        const word=words[batch%words.length],radius=word.width*(.35+intensity.progress*.45);
        const x=word.x+word.width*(.3+(batch*.273)% .4),y=word.y+word.height*.7;
        const light=ctx.createRadialGradient(x,y,0,x,y,radius);
        light.addColorStop(0,style.color+'66');light.addColorStop(.25,style.color+'22');light.addColorStop(1,style.color+'00');
        ctx.globalAlpha=intensity.light*unit(age/.045)*(1-age/.65)**2;
        ctx.fillStyle=light;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
    }
    ctx.restore();
}
