import {renderCoronation, type CoronationGeometry} from './coronation';
import {fragmentAt,type Fragment,type shotAt} from './timeline';
import type {ResultStyle} from '../../config/victoryStyles';
import { atmosphereParticles, renderAtmosphere,type WordBox,type AtmosphereParticle } from './atmosphere';
import {victoryIntensity,type VictoryIntensity} from './intensity';
import {renderBurstTrails,type BurstTrail} from './trails';
function glow(ctx:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,power:number,style:ResultStyle){
    if(power<=0||rx<=0)return;
    ctx.save();ctx.translate(x,y);ctx.scale(1,ry/rx);ctx.globalAlpha=power;
    const gradient=ctx.createRadialGradient(0,0,0,0,0,rx);
    gradient.addColorStop(0,style.color+'4a');gradient.addColorStop(.4,style.color+'20');gradient.addColorStop(1,style.color+'00');
    ctx.fillStyle=gradient;ctx.fillRect(-rx,-rx,rx*2,rx*2);ctx.restore();
}
/** A quiet perspective chess stage anchors the ceremonial geometry. */
export function renderBoard(ctx:CanvasRenderingContext2D,width:number,height:number,f:ReturnType<typeof shotAt>,style:ResultStyle){
    const cx=width/2,backY=height*.79,depth=height*.17,half=Math.min(width*.46,470);
    const point=(file:number,rank:number):[number,number]=>{const p=rank/8,spread=.46+p*.54;return[cx+(file/8-.5)*half*2*spread,backY+depth*p*p];};
    ctx.save();ctx.globalAlpha=f.reveal;
    const backLeft=point(0,0),backRight=point(8,0),frontRight=point(8,8),frontLeft=point(0,8);
    ctx.fillStyle='#130f0b';ctx.beginPath();ctx.moveTo(...backLeft);ctx.lineTo(...backRight);ctx.lineTo(...frontRight);ctx.lineTo(...frontLeft);ctx.closePath();ctx.fill();
    for(let rank=0;rank<8;rank++)for(let file=0;file<8;file++){
        const corners=[point(file,rank),point(file+1,rank),point(file+1,rank+1),point(file,rank+1)];
        const fill=ctx.createLinearGradient(0,corners[0][1],0,corners[2][1]);
        if((rank+file)%2){fill.addColorStop(0,style.boardDark);fill.addColorStop(1,'#07090e');}
        else {fill.addColorStop(0,style.boardLight);fill.addColorStop(1,style.boardShade);}
        ctx.globalAlpha=f.reveal*(.74-.42*rank/8);
        ctx.fillStyle=fill;ctx.beginPath();corners.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();
        ctx.globalAlpha=f.reveal*.12;ctx.strokeStyle=style.highlight;ctx.lineWidth=.5;ctx.stroke();
    }
    ctx.globalAlpha=f.reveal*.7;ctx.lineWidth=1;
    ctx.strokeStyle=style.edge;ctx.beginPath();ctx.moveTo(...backLeft);ctx.lineTo(...frontLeft);ctx.lineTo(...frontRight);ctx.lineTo(...backRight);ctx.stroke();
    // Reflected light advances along a rank after the word locks in.
    if(f.boardSweep>0&&f.boardSweep<1){
        const rank=f.boardSweep*8,a=point(0,rank),b=point(8,rank);
        ctx.globalAlpha=Math.sin(f.boardSweep*Math.PI)*.8;ctx.strokeStyle=style.highlight;ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
    }
    ctx.restore();
}
export function renderSpectacle(ctx:CanvasRenderingContext2D,points:Fragment[],f:ReturnType<typeof shotAt>,width:number,height:number,reduced:boolean,words:WordBox[],style:ResultStyle,ornaments:AtmosphereParticle[]=atmosphereParticles(1,width<600),trails:BurstTrail[]=[],intensity:VictoryIntensity=victoryIntensity({requiredWins:1},width<600),coronation?:CoronationGeometry){
    ctx.clearRect(0,0,width,height);
    const centerY=height*.45,cx=width/2;
    const backdrop=ctx.createRadialGradient(cx,centerY,0,cx,centerY,Math.max(width,height)*.75);
    backdrop.addColorStop(0,'#18382d');backdrop.addColorStop(.46,'#0b1c17');backdrop.addColorStop(1,'#030907');
    ctx.fillStyle=backdrop;ctx.fillRect(0,0,width,height);
    const origin=[{x:width*.43,y:height*.25,width:width*.14,height:height*.13}];
    renderBurstTrails(ctx,width,height,f.t,style,origin,trails,intensity,reduced);
    renderAtmosphere(ctx,width,height,f,style,reduced,origin,ornaments);
    glow(ctx,cx,centerY,width*.47,height*.32,f.reveal*.65,style);
    renderBoard(ctx,width,height,f,style);
    if(coronation)renderCoronation(ctx,coronation,width,height,f.t,reduced);
    // All transient light is attached to the word's landing, not a separate hero.
    for(const word of words){
        const baseline=word.y+word.height;
        glow(ctx,word.x+word.width/2,baseline,word.width*.7,30,f.impact*.9,style);
        if(f.impact>.01){
            const strip=ctx.createLinearGradient(word.x-30,0,word.x+word.width+30,0);
            strip.addColorStop(0,style.color+'00');strip.addColorStop(.4,style.color+'66');strip.addColorStop(.5,style.highlight);strip.addColorStop(.6,style.color+'66');strip.addColorStop(1,style.color+'00');
            ctx.save();ctx.globalAlpha=f.impact*.6;ctx.fillStyle=strip;ctx.fillRect(word.x-30,baseline+5,word.width+60,1);ctx.restore();
        }
    }
    if(!reduced&&words.length){
        for(let i=0;i<points.length;i++){
            const p=points[i],at=fragmentAt(p,f.t),word=words[i%words.length];if(at.opacity<=0)continue;
            const sx=word.x+p.origin*word.width,sy=word.y+word.height;
            ctx.save();ctx.translate(sx+at.x,sy+at.y);ctx.rotate(at.rotation);ctx.globalAlpha=at.opacity*.75;
            ctx.fillStyle=i%3?style.color:style.highlight;ctx.fillRect(-p.size,-p.size*.25,p.size*(i%3?2:5),p.size*.5);ctx.restore();
        }
    }
    glow(ctx,cx,height*.68,width*.35,26,.18*f.reveal,style);
    const vignette=ctx.createLinearGradient(0,height*.82,0,height);
    vignette.addColorStop(0,'#03060800');vignette.addColorStop(1,'#030608ee');ctx.fillStyle=vignette;ctx.fillRect(0,height*.82,width,height*.18);
}
