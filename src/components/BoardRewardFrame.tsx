import { useEffect, useMemo } from 'react';
import { BoxGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ChampionBoard } from '../config/championshipRewards';
import type { createRewardMaterials } from './rewardMaterials';
import { rewardFrameParts } from './rewardCraft';

/** Chamfered substrate, inset metal reveal and a smooth playing-surface surround. */
export function RewardBoardPlinth({materials,preset}:{materials:ReturnType<typeof createRewardMaterials>;preset:ChampionBoard}) {
    const profiles=useMemo(()=>{
        const profile=preset.profile??'inlaid';
        const layers=profile==='floating'?[
            {geometry:new RoundedBoxGeometry(8.85,.12,8.85,2,.03),y:-.43,finish:'frame' as const},
            {geometry:new RoundedBoxGeometry(8.3,.2,8.3,2,.04),y:-.27,finish:'accent' as const},
            {geometry:new RoundedBoxGeometry(8.8,.13,8.8,2,.035),y:-.095,finish:'frame' as const},
        ]:profile==='stepped'?[
            {geometry:new RoundedBoxGeometry(8.85,.13,8.85,2,.035),y:-.41,finish:'frame' as const},
            {geometry:new RoundedBoxGeometry(8.65,.1,8.65,2,.025),y:-.30,finish:'rim' as const},
            {geometry:new RoundedBoxGeometry(8.8,.2,8.8,2,.035),y:-.15,finish:'frame' as const},
        ]:profile==='gallery'?[
            {geometry:new RoundedBoxGeometry(8.85,.12,8.85,2,.03),y:-.42,finish:'rim' as const},
            {geometry:new RoundedBoxGeometry(8.6,.25,8.6,2,.07),y:-.25,finish:'frame' as const},
            {geometry:new RoundedBoxGeometry(8.85,.1,8.85,2,.018),y:-.09,finish:'rim' as const},
        ]:[
        {geometry:new RoundedBoxGeometry(8.85,.38,8.85,2,.045),y:-.3,finish:'frame' as const},
        {geometry:new RoundedBoxGeometry(8.78,.04,8.78,1,.012),y:-.12,finish:'rim' as const},
        {geometry:new RoundedBoxGeometry(8.7,.08,8.7,2,.024),y:-.07,finish:'frame' as const},
        ];
        return layers;
    },[preset.profile]);
    useEffect(()=>()=>profiles.forEach(profile=>profile.geometry.dispose()),[profiles]);
    return <group dispose={null}>{profiles.map((profile,i)=><mesh key={i} position={[0,profile.y,0]} geometry={profile.geometry} material={materials[profile.finish]} receiveShadow castShadow={i===0}/>)}
        {preset.profile==='armored'&&[-1,1].flatMap(x=>[-1,1].map(z=><mesh key={x+':'+z} position={[x*4.22,-.24,z*4.22]} material={materials.rim}><boxGeometry args={[.38,.44,.38]}/></mesh>))}
    </group>;
}

/** Inlay is merged into two draw calls even at grade X. No square is covered. */
export function BoardRewardFrame({preset,materials}:{preset:ChampionBoard;materials:ReturnType<typeof createRewardMaterials>}) {
    const geometry=useMemo(()=>{
        const parts=rewardFrameParts(preset);
        return (['rim','accent'] as const).map(finish=>{
            const pieces=parts.filter(part=>part.finish===finish).map(part=>{
                const box=new BoxGeometry(...part.size);
                box.rotateY(part.rotation);box.translate(...part.position);return box;
            });
            const merged=pieces.length?mergeGeometries(pieces):null;
            pieces.forEach(piece=>piece.dispose());
            return {finish,merged};
        });
    },[preset]);
    useEffect(()=>()=>geometry.forEach(item=>item.merged?.dispose()),[geometry]);
    return <group dispose={null}>{geometry.map(({finish,merged})=>merged?<mesh key={finish} geometry={merged} material={materials[finish]}/>:null)}</group>;
}
