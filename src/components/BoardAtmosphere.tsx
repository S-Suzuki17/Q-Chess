import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { BOARD_HEIGHTS, type BoardTheme } from './boardPresentation';

const ignoreRaycast = () => {};
// Deterministic materials: the grain and veins never jump when the clock ticks.
function surfaceTexture(theme: BoardTheme) {
    const canvas=document.createElement('canvas'); canvas.width=canvas.height=512;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle=theme==='classic'?'#30271f':theme==='marble'?'#8c9aa3':'#11152a';
    ctx.fillRect(0,0,512,512);
    if (theme==='classic') {
        for (let i=0;i<130;i++) {
            const y=i*4;
            ctx.strokeStyle=i%3===0?'#594735':'#241e18'; ctx.lineWidth=i%7===0?1.4:.6;
            ctx.beginPath();ctx.moveTo(0,y);
            ctx.bezierCurveTo(140,y+Math.sin(i*.27)*8,280,y-Math.cos(i*.17)*6,512,y+Math.sin(i*.31)*4);ctx.stroke();
        }
        for (const y of [0,170,341,511]) {ctx.fillStyle='#181911';ctx.fillRect(0,y,512,2);}
    } else if (theme==='marble') {
        for (let i=0;i<22;i++) {
            const x=i*39-140;
            ctx.beginPath();ctx.moveTo(x,0);ctx.bezierCurveTo(x+120,120,x-65,320,x+180,512);
            ctx.strokeStyle=i%4===0?'#d8dfe1':'#667986';ctx.lineWidth=i%4===0?2.3:.75;ctx.stroke();
        }
    } else {
        ctx.strokeStyle='#283853';ctx.lineWidth=1;
        for (let i=0;i<=512;i+=64) {ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,512);ctx.moveTo(0,i);ctx.lineTo(512,i);ctx.stroke();}
        for (let i=0;i<12;i++) {
            const x=(i*79)%480,y=(i*113)%480;
            ctx.strokeStyle=i%2?'#35526b':'#49395e';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+24,y);ctx.lineTo(x+40,y+16);ctx.lineTo(x+40,y+48);ctx.stroke();
            ctx.fillStyle='#648899';ctx.fillRect(x-2,y-2,4,4);
        }
    }
    const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping; texture.repeat.set(4,4);texture.anisotropy=4;
    return texture;
}

function Frame({size,y,color,width=.025}: {size:number;y:number;color:string;width?:number}) {
    return <group position={[0,y,0]}>
        {[[-size/2,0,width,size],[size/2,0,width,size],[0,-size/2,size,width],[0,size/2,size,width]].map(([x,z,w,h],i)=><mesh key={i} position={[x,0,z]} rotation={[-Math.PI/2,0,0]} raycast={ignoreRaycast}>
            <planeGeometry args={[w,h]}/><meshBasicMaterial color={color}/>
        </mesh>)}
    </group>;
}

function Books() {
    return <group position={[-6.1,-.55,-1.5]} rotation={[0,.12,0]}>
        {['#24392e','#544032','#253744'].map((color,i)=><group key={color} position={[i*.08,i*.18,0]} rotation={[0,i*.07,0]}>
            <mesh castShadow raycast={ignoreRaycast}><boxGeometry args={[1.35,.16,1.9]}/><meshStandardMaterial color={color} roughness={.7}/></mesh>
            <mesh position={[.025,0,.02]} raycast={ignoreRaycast}><boxGeometry args={[1.29,.1,1.84]}/><meshStandardMaterial color="#bdb197" roughness={.9}/></mesh>
            <mesh position={[-.66,0,0]} raycast={ignoreRaycast}><boxGeometry args={[.07,.17,1.91]}/><meshStandardMaterial color={color}/></mesh>
            {[-.55,.55].map(z=><mesh key={z} position={[-.702,0,z]} raycast={ignoreRaycast}><boxGeometry args={[.01,.15,.035]}/><meshStandardMaterial color="#b79a60" metalness={.5} roughness={.4}/></mesh>)}
        </group>)}
    </group>;
}

function Sculpture({marble=false}: {marble?:boolean}) {
    return <group position={[6.15,-.35,1.35]}>
        <mesh position={[0,-.19,0]} castShadow raycast={ignoreRaycast}><cylinderGeometry args={[.72,.83,.16,48]}/><meshStandardMaterial color={marble?'#596e7e':'#24291e'} roughness={.65}/></mesh>
        <group position={[0,.4,0]} rotation={[.4,.3,.2]}>
            {[[0,0,0],[Math.PI/2,0,0],[0,Math.PI/2,0]].map((rotation,i)=><mesh key={i} rotation={rotation as [number,number,number]} castShadow raycast={ignoreRaycast}>
                <torusGeometry args={[.64,.025,8,64]}/><meshStandardMaterial color={marble?'#dae4e8':'#ad8e54'} metalness={.55} roughness={.3}/>
            </mesh>)}
            <mesh raycast={ignoreRaycast}><sphereGeometry args={[.14,24,16]}/><meshStandardMaterial color={marble?'#e5ecec':'#d2b06b'} metalness={.45} roughness={.35}/></mesh>
        </group>
    </group>;
}

export function BoardAtmosphere({theme}: {theme:BoardTheme}) {
    const texture=useMemo(()=>surfaceTexture(theme),[theme]);
    useEffect(()=>()=>texture.dispose(),[texture]);
    return <group>
        <mesh position={[0,BOARD_HEIGHTS.stage,0]} rotation={[-Math.PI/2,0,0]} receiveShadow raycast={ignoreRaycast}>
            <planeGeometry args={[28,28]}/><meshStandardMaterial map={texture} roughness={theme==='marble'?.65:.88} metalness={theme==='neon'?.15:.05}/>
        </mesh>
        <Frame size={9.5} y={-.63} color={theme==='classic'?'#786c46':theme==='marble'?'#c1cdd1':'#2e879d'}/>
        <Frame size={9.66} y={-.63} color={theme==='classic'?'#4e5237':theme==='marble'?'#607786':'#523879'} width={.015}/>
        {theme==='classic' ? <><Books/><Sculpture/>
            <mesh position={[-6.1,-.61,2.7]} rotation={[-Math.PI/2,0,-.13]} raycast={ignoreRaycast}><planeGeometry args={[1.4,1.8]}/><meshStandardMaterial color="#a79b7a" roughness={1}/></mesh>
        </> : theme==='marble' ? <>
            {/* Inlaid gallery plinth and grooves, all below the playable surface. */}
            <mesh position={[0,-.61,0]} receiveShadow raycast={ignoreRaycast}><boxGeometry args={[9.18,.06,9.18]}/><meshStandardMaterial color="#a8b6bf" roughness={.6}/></mesh>
            {[-6.15,6.15].map(x=><group key={x} position={[x,-.59,-1.8]}>{Array.from({length:7},(_,i)=><mesh key={i} position={[(i-3)*.14,0,0]} raycast={ignoreRaycast}><boxGeometry args={[.055,.04,2.8]}/><meshStandardMaterial color="#c5d1d6" roughness={.6}/></mesh>)}</group>)}
            <Sculpture marble/>
        </> : <>
            {[[-5.15,0],[5.15,0],[0,-5.15],[0,5.15]].map(([x,z],i)=><group key={i} position={[x,-.6,z]} rotation={[0,i>1?Math.PI/2:0,0]}>
                <mesh raycast={ignoreRaycast}><boxGeometry args={[.035,.02,6.4]}/><meshBasicMaterial color={i%2?'#975dcc':'#46bbc5'}/></mesh>
                {[-3.2,3.2].map(end=><mesh key={end} position={[0,0,end]} rotation={[-Math.PI/2,0,0]} raycast={ignoreRaycast}><ringGeometry args={[.09,.13,24]}/><meshBasicMaterial color="#77cfdb"/></mesh>)}
            </group>)}
            {[-6.25,6.25].map(x=><mesh key={x} position={[x,-.61,1.1]} rotation={[-Math.PI/2,0,.3]} raycast={ignoreRaycast}><ringGeometry args={[.7,.73,6]}/><meshBasicMaterial color={x>0?'#854ca5':'#337389'}/></mesh>)}
        </>}
    </group>;
}
