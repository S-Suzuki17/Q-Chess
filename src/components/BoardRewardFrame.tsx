import type { ChampionBoard } from '../config/championshipRewards';

/** All geometry stays inside the existing rim; never covers playable squares. */
export function BoardRewardFrame({preset}:{preset:ChampionBoard}) {
    const layers=1+Math.floor((preset.tier-1)/3);
    const corners=[[-1,-1],[-1,1],[1,-1],[1,1]];
    return <group>
        {Array.from({length:layers},(_,layer)=>[0,1,2,3].map(side=><group key={`${layer}-${side}`} rotation={[0,side*Math.PI/2,0]}>
            <mesh position={[0,-.022,4.27+layer*.035]}>
                <boxGeometry args={[7.9,.018,.014]}/><meshStandardMaterial color={layer%2?preset.accent:preset.rim} metalness={preset.metalness} roughness={preset.roughness}/>
            </mesh>
        </group>))}
        {corners.map(([x,z])=><group key={`${x}:${z}`} position={[x*4.25,.004,z*4.25]} rotation={[0,preset.tier*.08,0]}>
            <mesh rotation={preset.motif==='forge' ? [Math.PI/2,0,0] : [0,Math.PI/4,0]}>
                {preset.motif==='artisan' ? <boxGeometry args={[.18,.025,.18]}/>
                    : preset.motif==='stone' ? <cylinderGeometry args={[.1,.13,.06,4]}/>
                    : preset.motif==='forge' ? <torusGeometry args={[.085,.025,6,12]}/>
                    : preset.motif==='crystal' ? <octahedronGeometry args={[.115]}/>
                    : preset.motif==='obsidian' ? <coneGeometry args={[.12,.11,4]}/>
                    : <cylinderGeometry args={[.075,.135,.09,8]}/>}
                <meshStandardMaterial color={preset.rim} metalness={preset.metalness} roughness={preset.roughness}/>
            </mesh>
            {preset.tier>=4 && <mesh position={[0,.065,0]} rotation={[0,Math.PI/4,0]}>
                <octahedronGeometry args={[.038+preset.tier*.002]}/>
                <meshPhysicalMaterial color={preset.accent} metalness={.3} roughness={.18} clearcoat={1}/>
            </mesh>}
            {preset.tier>=7 && [0,1,2,3].map(index=><mesh key={index} position={[Math.cos(index*Math.PI/2)*.14,.017,Math.sin(index*Math.PI/2)*.14]} rotation={[0,index*Math.PI/2,0]}>
                <boxGeometry args={[.06,.026,.02]}/><meshStandardMaterial color={preset.accent} metalness={.85} roughness={.22}/>
            </mesh>)}
        </group>)}
    </group>;
}
