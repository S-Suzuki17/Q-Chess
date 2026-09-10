import type { BoardTheme } from './boardPresentation';

const SIDES = [-1, 1] as const;
const brass = '#b89a56';
function Block({position, size, color, metal = 0, grain = false}: {position: [number,number,number]; size:[number,number,number];color:string;metal?:number;grain?:boolean}) {
    return <mesh position={position} receiveShadow castShadow>
        <boxGeometry args={size}/><meshStandardMaterial color={color} roughness={metal ? .36 : .78} metalness={metal}
            customProgramCacheKey={()=>grain?'qg-procedural-wood-v1':'qg-solid-v1'}
            onBeforeCompile={shader=>{
                if (!grain) return;
                shader.vertexShader = 'varying vec3 vWoodPosition;\n' + shader.vertexShader;
                shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWoodPosition = position;');
                shader.fragmentShader = 'varying vec3 vWoodPosition;\n' + shader.fragmentShader;
                shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
                    float wave = sin(vWoodPosition.z * 0.75 + sin(vWoodPosition.z * 1.7) * 0.35);
                    float grainLine = sin(vWoodPosition.x * 145.0 + wave * 7.0);
                    float fineGrain = sin(vWoodPosition.x * 530.0 + wave * 21.0);
                    diffuseColor.rgb *= 0.84 + 0.10 * grainLine + 0.04 * fineGrain;
                `);
            }}/>
    </mesh>;
}

/** Actual geometry, below or outside the playable 8.85-square board reserve. */
export function BoardEnvironment3D({theme}: {theme:BoardTheme}) {
    const classic = theme === 'classic', marble = theme === 'marble';
    const stone = marble ? '#b7bebd' : '#172739';
    return <group>
        <Block position={[0,-.91,0]} size={[32,.5,32]} color={classic?'#30251e':marble?'#6b7578':'#090f21'}/>
        {classic ? <>
            {Array.from({length:25},(_,i)=><Block grain key={i} position={[(i-12)*1.12,-.64,0]} size={[1.08,.045,32]} color={['#493527','#3d2c22','#513b2a','#443023'][i%4]}/>)}
            {SIDES.map(side=><group key={`inlay-${side}`}>
                <Block position={[side*4.95,-.607,0]} size={[.028,.012,22]} color={brass} metal={.7}/>
                <Block position={[side*5.04,-.607,0]} size={[.018,.012,22]} color={brass} metal={.7}/>
                <Block position={[0,-.607,side*4.95]} size={[22,.012,.028]} color={brass} metal={.7}/>
                {Array.from({length:13},(_,i)=><mesh key={i} position={[side*7.5,-.602,(i-6)*1.6]} rotation={[-Math.PI/2,0,Math.PI/4]}>
                    <ringGeometry args={[.23,.25,4]}/><meshStandardMaterial color={brass} metalness={.6} roughness={.35}/>
                </mesh>)}
            </group>)}
            {SIDES.flatMap(x=>SIDES.map(z=><group key={`${x}${z}`} position={[x*6.4,-.58,z*3.4]}>
                <Block position={[0,.08,0]} size={[2.1,.16,2.1]} color="#251e18"/>
                <Block position={[0,.18,0]} size={[2,.035,2]} color={brass} metal={.65}/>
                {[0,1,2].map(i=><group key={i} position={[0,.29+i*.15,0]} rotation={[0,(i-1)*.13,0]}>
                    <Block position={[0,0,0]} size={[1.65,.12,1.15]} color={['#35483e','#672f29','#313945'][i]}/>
                    <Block position={[.03,0,.025]} size={[1.53,.07,1.12]} color="#c0ad87"/>
                </group>)}
                <mesh position={[0,.85,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.53,.036,8,48]}/><meshStandardMaterial color={brass} metalness={.8} roughness={.3}/></mesh>
                <mesh position={[0,.85,0]} rotation={[.5,0,.4]}><torusGeometry args={[.53,.025,8,48]}/><meshStandardMaterial color={brass} metalness={.8} roughness={.3}/></mesh>
            </group>))}
            {SIDES.map(x=><group key={x} position={[x*5.5,-.6,0]}>
                <mesh position={[0,.09,0]}><cylinderGeometry args={[.45,.55,.18,32]}/><meshStandardMaterial color={brass} metalness={.7} roughness={.3}/></mesh>
                <mesh position={[0,.5,0]}><cylinderGeometry args={[.045,.09,.8,16]}/><meshStandardMaterial color={brass} metalness={.7}/></mesh>
                <mesh position={[0,1,0]}><coneGeometry args={[.52,.45,32,1,true]}/><meshStandardMaterial color="#315248" side={2} metalness={.3} roughness={.35}/></mesh>
                <mesh position={[0,.88,0]}><sphereGeometry args={[.14,16,12]}/><meshStandardMaterial color="#fff0bf" emissive="#ffcc71" emissiveIntensity={1.5}/></mesh>
            </group>)}
        </> : <>
            {Array.from({length:17},(_,i)=><group key={i}>
                <Block position={[(i-8)*1.5,-.642,0]} size={[.025,.012,26]} color={marble?'#c6cecc':'#256d83'} metal={.4}/>
                <Block position={[0,-.642,(i-8)*1.5]} size={[26,.012,.025]} color={marble?'#c6cecc':'#256d83'} metal={.4}/>
            </group>)}
            {SIDES.flatMap(x=>SIDES.map(z=><group key={`${x}${z}`} position={[x*6.2,-.64,z*3.4]}>
                {[0,1,2].map(i=><Block key={i} position={[0,.08+i*.13,0]} size={[2.3-i*.3,.14,2.3-i*.3]} color={stone} metal={marble?.08:.5}/>)}
                {marble ? <>
                    <mesh position={[0,1.05,0]} castShadow receiveShadow><cylinderGeometry args={[.4,.5,1.4,24]}/><meshStandardMaterial color="#d0d2c8" roughness={.65}/></mesh>
                    {Array.from({length:12},(_,i)=>{const angle=i*Math.PI/6;return <mesh key={i} position={[Math.cos(angle)*.44,1.05,Math.sin(angle)*.44]}><cylinderGeometry args={[.055,.055,1.28,8]}/><meshStandardMaterial color="#a4afa9" roughness={.8}/></mesh>;})}
                    <Block position={[0,1.79,0]} size={[1.15,.18,1.15]} color="#c7cbbc"/>
                    <mesh position={[0,2.03,0]}><sphereGeometry args={[.19,16,16]}/><meshStandardMaterial color={brass} metalness={.75} roughness={.3}/></mesh>
                </> : <>
                    <Block position={[0,.9,0]} size={[.92,1.05,.92]} color="#17213d" metal={.65}/>
                    {[0,1,2,3].map(i=><mesh key={i} position={[0,.5+i*.28,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.63,.022,6,4]}/><meshStandardMaterial color="#5bdbea" emissive="#20b8db" emissiveIntensity={1.2}/></mesh>)}
                    <mesh position={[0,1.65,0]}><octahedronGeometry args={[.43]}/><meshStandardMaterial color="#b183ee" metalness={.65} roughness={.25} emissive="#5a318e" emissiveIntensity={.65}/></mesh>
                </>}
            </group>))}
            {!marble && [5.2,6.1,7.5,9].map((r,i)=><mesh key={r} position={[0,-.625,0]} rotation={[-Math.PI/2,0,0]}>
                <ringGeometry args={[r,r+.025,96]}/><meshStandardMaterial color={i%2?'#a25fe2':'#3595bc'} emissive={i%2?'#70239e':'#146086'} emissiveIntensity={.55}/>
            </mesh>)}
        </>}
    </group>;
}
