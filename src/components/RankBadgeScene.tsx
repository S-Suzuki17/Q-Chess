'use client';
import { Component, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { createRoot, events, extend, useFrame, useThree, type ReconcilerRoot, type RenderProps } from '@react-three/fiber';
import * as THREE from 'three';
import { Group, OrthographicCamera, Shape, Vector2 } from 'three';
import type { BadgeDefinition } from '../config/profileBadges';
import { StudioReflections } from './StudioReflections';

extend({Group:THREE.Group,Mesh:THREE.Mesh,AmbientLight:THREE.AmbientLight,DirectionalLight:THREE.DirectionalLight,
    MeshStandardMaterial:THREE.MeshStandardMaterial,MeshPhysicalMaterial:THREE.MeshPhysicalMaterial,
    LatheGeometry:THREE.LatheGeometry,SphereGeometry:THREE.SphereGeometry,ExtrudeGeometry:THREE.ExtrudeGeometry,
    CylinderGeometry:THREE.CylinderGeometry,ConeGeometry:THREE.ConeGeometry,BoxGeometry:THREE.BoxGeometry,
    OctahedronGeometry:THREE.OctahedronGeometry,TorusGeometry:THREE.TorusGeometry});
const BADGE_CONFIG:RenderProps<HTMLCanvasElement>={
    orthographic:true,camera:{position:[0,.1,7],zoom:44,near:.1,far:30},dpr:[1,1.5],
    gl:{alpha:true,antialias:true,powerPreference:'low-power'},events,
    onCreated:state=>state.events.connect?.(state.gl.domElement),
};
class SceneBoundary extends Component<{children:ReactNode;onFailure:()=>void},{failed:boolean}> {
    state={failed:false};
    static getDerivedStateFromError(){return {failed:true};}
    componentDidCatch(){this.props.onFailure();}
    render(){return this.state.failed?null:this.props.children;}
}

/** Own the async configure promise: renderer startup failures cannot escape as an
 * unhandled rejection. A fresh canvas per effect also isolates StrictMode cleanup. */
function BadgeCanvas({children,animate,onFailure}:{children:ReactNode;animate:boolean;onFailure:()=>void}) {
    const container=useRef<HTMLDivElement>(null),root=useRef<ReconcilerRoot<HTMLCanvasElement>|null>(null);
    const latest=useRef({children,animate});
    useLayoutEffect(()=>{
        latest.current={children,animate};
        if(root.current){
            const current=root.current;
            void current.configure({...BADGE_CONFIG,frameloop:animate?'always':'demand'}).then(()=>{if(root.current===current)current.render(latest.current.children);}).catch(onFailure);
        }
    },[children,animate,onFailure]);
    useEffect(()=>{
        const host=container.current;
        if(!host)return;
        const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100%;height:100%';host.appendChild(canvas);
        const owned=createRoot(canvas);
        let cancelled=false,configured=false;
        const measure=()=>({width:host.clientWidth,height:host.clientHeight,top:0,left:0});
        const resize=new ResizeObserver(()=>{
            if(configured&&!cancelled)void owned.configure({...BADGE_CONFIG,size:measure(),frameloop:latest.current.animate?'always':'demand'}).catch(onFailure);
        });
        const start=async()=>{
            try{
                await owned.configure({...BADGE_CONFIG,size:measure(),frameloop:latest.current.animate?'always':'demand'});
                configured=true;
                if(cancelled){owned.unmount();return;}
                root.current=owned;owned.render(latest.current.children);resize.observe(host);
            }catch{owned.unmount();if(!cancelled)onFailure();}
        };
        void start();
        return()=>{cancelled=true;resize.disconnect();if(root.current===owned)root.current=null;if(configured)owned.unmount();canvas.remove();};
    },[onFailure]);
    return <div ref={container} style={{width:'100%',height:'100%'}}/>;
}

const stem = [[.44,0],[.49,.07],[.46,.15],[.31,.2],[.28,.3],[.19,.44],[.14,.84],[.23,.96],[.24,1.04],[.17,1.1]].map(([x,y])=>new Vector2(x,y));
const extrusion = {depth:.2,bevelEnabled:true,bevelSize:.055,bevelThickness:.05,bevelSegments:2,steps:1,curveSegments:16};

function plateShape(fortress:boolean) {
    const shape=new Shape();
    const points=fortress?[[-1,1],[-1,1.35],[-.6,1.35],[-.6,1.1],[-.2,1.1],[-.2,1.35],[.2,1.35],[.2,1.1],[.6,1.1],[.6,1.35],[1,1.35],[1,-.8],[0,-1.45],[-1,-.8]]
        :[[-1,1],[0,1.35],[1,1],[.88,-.7],[0,-1.4],[-.88,-.7]];
    points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();return shape;
}
function knightShape() {
    const shape=new Shape();
    [[-.2,1],[-.35,1.24],[-.72,1.16],[-.77,1.43],[-.35,1.83],[-.27,2.13],[.06,1.99],[.35,1.9],[.48,1.53],[.4,1.08]].forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));
    shape.closePath();return shape;
}
function ChessRelief({badge}:{badge:BadgeDefinition}) {
    const knight=useMemo(()=>knightShape(),[]);
    const material=<meshPhysicalMaterial color={badge.id==='queen'?badge.accent:badge.metal} metalness={badge.id==='queen'?.12:.86} roughness={badge.id==='queen'?.14:.24} clearcoat={.7}/>;
    return <group position={[0,-.86,.44]} scale={.91}>
        <mesh><latheGeometry args={[stem,32]}/>{material}</mesh>
        {badge.id==='pawn'&&<mesh position={[0,1.29,0]}><sphereGeometry args={[.3,24,16]}/>{material}</mesh>}
        {badge.id==='knight'&&<><mesh position={[0,0,-.15]}><extrudeGeometry args={[knight,{...extrusion,depth:.3}]}/>{material}</mesh><mesh position={[-.22,1.78,.24]}><sphereGeometry args={[.035,8,6]}/><meshStandardMaterial color={badge.inset}/></mesh></>}
        {badge.id==='bishop'&&<group position={[0,1.43,0]}>
            <mesh scale={[.65,1,.65]}><sphereGeometry args={[.43,24,20]}/>{material}</mesh>
            <mesh position={[0,.03,.265]} rotation={[0,0,-.45]}><boxGeometry args={[.045,.42,.035]}/><meshStandardMaterial color={badge.inset}/></mesh>
            <mesh position={[0,.47,0]}><sphereGeometry args={[.08,12,8]}/>{material}</mesh>
        </group>}
        {badge.id==='rook'&&<><mesh position={[0,1.19,0]}><cylinderGeometry args={[.38,.28,.42,8]}/>{material}</mesh>
            {Array.from({length:6},(_,i)=><mesh key={i} position={[Math.cos(i*Math.PI/3)*.28,1.49,Math.sin(i*Math.PI/3)*.28]} rotation={[0,-i*Math.PI/3,0]}><boxGeometry args={[.22,.23,.19]}/>{material}</mesh>)}
            <mesh position={[.06,.7,.21]} rotation={[0,0,-.4]}><boxGeometry args={[.025,.35,.025]}/><meshStandardMaterial color={badge.accent}/></mesh>
        </>}
        {badge.id==='queen'&&<><mesh position={[0,1.18,0]}><cylinderGeometry args={[.38,.21,.38,8]}/>{material}</mesh>
            {Array.from({length:5},(_,i)=><mesh key={i} position={[Math.cos(i*Math.PI*2/5)*.28,1.52,Math.sin(i*Math.PI*2/5)*.28]}><coneGeometry args={[.1,.4,4]}/>{material}</mesh>)}
            <mesh position={[0,1.6,0]}><octahedronGeometry args={[.18]}/>{material}</mesh>
        </>}
        {badge.id==='king'&&<><mesh position={[0,1.25,0]}><cylinderGeometry args={[.34,.19,.38,16]}/>{material}</mesh>
            <mesh position={[0,1.7,0]}><boxGeometry args={[.12,.51,.13]}/>{material}</mesh><mesh position={[0,1.78,0]}><boxGeometry args={[.42,.12,.13]}/>{material}</mesh>
            <mesh position={[0,1.15,.3]}><octahedronGeometry args={[.12]}/><meshPhysicalMaterial color={badge.accent} roughness={.05} metalness={.05} transmission={.8} thickness={.1}/></mesh>
        </>}
    </group>;
}
function Sculpture({badge,animate}:{badge:BadgeDefinition;animate:boolean}) {
    const group=useRef<Group>(null),rings=useRef<Group>(null);
    const shield=useMemo(()=>plateShape(badge.id==='rook'),[badge.id]);
    useFrame(({clock,pointer})=>{
        if(!group.current)return;
        group.current.rotation.set(animate?-.09+pointer.y*.1:-.09,animate?Math.sin(clock.elapsedTime*.5)*.12+pointer.x*.18:-.2,0);
        if(rings.current)rings.current.rotation.z=animate?clock.elapsedTime*.12:0;
    });
    const metal=<meshStandardMaterial color={badge.metal} metalness={.9} roughness={.27}/>;
    return <group ref={group} rotation={[-.09,-.2,0]}>
        {badge.id!=='queen'&&badge.id!=='king'&&badge.id!=='bishop'&&<>
            <mesh position={[0,0,-.24]}><extrudeGeometry args={[shield,extrusion]}/>{metal}</mesh>
            <mesh position={[0,0,.03]} scale={[.84,.84,.55]}><extrudeGeometry args={[shield,extrusion]}/><meshStandardMaterial color={badge.inset} metalness={.45} roughness={.42}/></mesh>
        </>}
        {badge.id==='knight'&&[-1,1].flatMap(side=>[0,1,2].map(i=><mesh key={`${side}:${i}`} position={[side*(1.04+i*.13),.35+i*.22,-.12]} rotation={[0,0,side*-.6]}><boxGeometry args={[.16,.75-i*.12,.15]}/>{metal}</mesh>))}
        {badge.id==='bishop'&&<mesh position={[0,0,-.1]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[1.22,1.22,.25,48]}/>{metal}</mesh>}
        {badge.id==='bishop'&&<mesh><torusGeometry args={[1.21,.1,8,48]}/>{metal}</mesh>}
        {badge.id==='queen'&&<group ref={rings}>
            {[.7,-.7].map((angle,i)=><mesh key={i} rotation={[.42,angle,i*.9]}><torusGeometry args={[1.36,.055,8,48]}/>{metal}</mesh>)}
        </group>}
        {badge.id==='king'&&<group position={[0,0,-.24]}>
            <mesh><torusGeometry args={[1.2,.045,8,48]}/>{metal}</mesh>
            {Array.from({length:12},(_,i)=>{const angle=i*Math.PI/6;return <mesh key={i} position={[Math.sin(angle)*1.4,Math.cos(angle)*1.4,0]} rotation={[0,0,-angle]}><coneGeometry args={[.055,.35,4]}/>{metal}</mesh>;})}
        </group>}
        <ChessRelief badge={badge}/>
        {badge.id==='bishop'&&<mesh position={[0,0,.58]} scale={[1,1,.34]}><sphereGeometry args={[1.08,32,24]}/><meshPhysicalMaterial color="#fff5da" metalness={0} roughness={.06} transmission={.93} ior={1.45} thickness={.14}/></mesh>}
    </group>;
}
function Lifecycle({onFailure,onReady}:{onFailure:()=>void;onReady:()=>void}) {
    const {gl,camera,size,invalidate}=useThree(),ready=useRef(false);
    useLayoutEffect(()=>{
        if(camera instanceof OrthographicCamera){camera.zoom=Math.min(size.width,size.height)/3.7;camera.updateProjectionMatrix();invalidate();}
    },[camera,size.width,size.height,invalidate]);
    useFrame(()=>{if(!ready.current){ready.current=true;onReady();}});
    useEffect(()=>{
        const canvas=gl.domElement;
        const lost=(event:Event)=>{event.preventDefault();onFailure();};
        canvas.addEventListener('webglcontextlost',lost);
        return()=>canvas.removeEventListener('webglcontextlost',lost);
    },[gl,onFailure]);
    return null;
}
export default function RankBadgeScene({badge,animate,onFailure,onReady}:{badge:BadgeDefinition;animate:boolean;onFailure:()=>void;onReady:()=>void}) {
    return <BadgeCanvas animate={animate} onFailure={onFailure}><SceneBoundary onFailure={onFailure}>
        <ambientLight intensity={.7}/><directionalLight position={[-3,4,6]} intensity={2.6}/><directionalLight position={[4,1,3]} intensity={1.2} color="#bed9ec"/>
        <StudioReflections/><Sculpture key={badge.id} badge={badge} animate={animate}/><Lifecycle onFailure={onFailure} onReady={onReady}/>
    </SceneBoundary></BadgeCanvas>;
}
