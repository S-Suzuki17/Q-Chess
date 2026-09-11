'use client';

import React, { useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ResilientBoardCanvas } from './ResilientBoardCanvas';
import { Board2D } from './Board2D';
import { OrthographicCamera, useGLTF, Billboard, Html, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { Token } from '../lib/GameEngine';
import { QuantumPieceUI } from './QuantumPieceUI';
import { PieceType } from '../config/gameConfig';
import type { MoveRecord } from '../lib/gameRecordService';
import { BOARD_HEIGHTS, BOARD_THEMES, PIECE_HEIGHTS, PIECE_MAX_WIDTH, quantumCandidateSize, boardCamera, hintArrowPoints, squareName, type HintMove } from './boardPresentation';
import './board-3d.css';
import { matchText } from '../locales/matchText';
import { dict, type Language } from '../locales/dict';
const ignoreRaycast = () => {};

const MODEL_PATHS: Record<PieceType, string> = {
    Pawn: '/models/pawn.glb',
    Knight: '/models/knight.glb',
    Bishop: '/models/bishop.glb',
    Rook: '/models/rook.glb',
    Queen: '/models/queen.glb',
    King: '/models/king.glb',
};

if (typeof window !== 'undefined') {
    Object.values(MODEL_PATHS).forEach(path => useGLTF.preload(path));
}

const QuantumBlock = ({ isWhite, probabilities, candidates, motion = false, phase = 0 }: { isWhite: boolean; probabilities: Token['probabilities']; candidates?: ReadonlySet<PieceType>; quiet?: boolean; motion?: boolean; phase?: number }) => {
    const types: PieceType[] = ['King','Queen','Rook','Bishop','Knight','Pawn'];
    const active = types.filter(type => candidates?.has(type) ?? probabilities[type] > 0);
    const floating = React.useRef<THREE.Group>(null);
    const orbit = React.useRef<THREE.Group>(null);
    const candidateSize = quantumCandidateSize(active.length);
    useFrame(({clock}) => {
        const time = clock.elapsedTime + phase;
        if (floating.current) {
            floating.current.position.y = motion ? .025 + Math.sin(time*1.4)*.02 : 0;
            floating.current.rotation.x = motion ? Math.sin(time*.7)*.018 : 0;
            floating.current.rotation.z = motion ? Math.cos(time*.8)*.018 : 0;
        }
        if (orbit.current) {
            orbit.current.position.y = motion ? Math.sin(time * 1.1) * .035 : 0;
            orbit.current.rotation.y = motion ? time * .18 : 0;
        }
    });
    return <group ref={floating}>
        <mesh castShadow receiveShadow position={[0,.085,0]}>
            <cylinderGeometry args={[.43,.46,.17,32]}/>
            <meshStandardMaterial color={isWhite ? '#ebdfc5' : '#202c3d'} roughness={.55}/>
        </mesh>
        <mesh position={[0,.173,0]} rotation={[-Math.PI/2,0,0]}>
            <circleGeometry args={[.415,32]}/><meshStandardMaterial color={isWhite ? '#56625b' : '#acb8c3'} roughness={.8}/>
        </mesh>
        <mesh position={[0,.177,0]} rotation={[-Math.PI/2,0,0]}>
            <ringGeometry args={[.424,.451,32]}/><meshBasicMaterial color="#d4b872"/>
        </mesh>
        <group ref={orbit}>{active.map((type,i) => {
            const angle=i/active.length*Math.PI*2;
            return <group key={type} position={[Math.cos(angle)*candidateSize.radius,.20,Math.sin(angle)*candidateSize.radius]} scale={candidateSize.scale}>
                <RealisticPiece type={type} isWhite={isWhite}/>
            </group>;
        })}</group>
    </group>;
};

const RealisticPiece = ({ type, isWhite, isHologram = false, quiet = false }: { type: PieceType, isWhite: boolean, isHologram?: boolean, quiet?: boolean }) => {
    const { scene } = useGLTF(MODEL_PATHS[type]);
    
    const clone = useMemo(() => {
        const c = scene.clone();
        c.updateMatrixWorld(true);
        
        const box = new THREE.Box3().setFromObject(c);
        const size = new THREE.Vector3();
        box.getSize(size);
        
        if (size.y === 0) return c; // safety
        
        const targetHeight = PIECE_HEIGHTS[type];
        
        let s = targetHeight / size.y;
        const maxXZ = Math.max(size.x, size.z) * s;
        if (maxXZ > PIECE_MAX_WIDTH) {
            s = s * (PIECE_MAX_WIDTH / maxXZ);
        }
        
        c.scale.setScalar(s);
        c.updateMatrixWorld(true);
        
        const scaledBox = new THREE.Box3().setFromObject(c);
        const center = new THREE.Vector3();
        scaledBox.getCenter(center);
        
        const wrapper = new THREE.Group();
        c.position.set(-center.x, -scaledBox.min.y, -center.z);
        wrapper.add(c);
        return wrapper;
    }, [scene, type]);
    
    useEffect(() => {
        const materials: THREE.Material[] = [];
        clone.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                if (isHologram) {
                    child.castShadow = false;
                    child.receiveShadow = false;
                    const mat = new THREE.MeshPhysicalMaterial({
                        color: isWhite ? '#88ccff' : '#ff88aa',
                        transparent: true,
                        opacity: 0.8,
                        roughness: 0.1,
                        transmission: 0.9,
                        thickness: 0.5,
                        emissive: isWhite ? '#00e5ff' : '#ff3366',
                        emissiveIntensity: 0.4
                    });
                    child.material = mat;
                    materials.push(mat);
                } else {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    const mat = new THREE.MeshPhysicalMaterial({
                        color: isWhite ? '#f4e9d5' : '#26374b',
                        roughness: 0.30,
                        metalness: 0.16,
                        clearcoat: 0.55,
                        clearcoatRoughness: 0.24
                    });
                    child.material = mat;
                    materials.push(mat);
                }
            }
        });
        return () => materials.forEach(material => material.dispose());
    }, [clone, isWhite, isHologram, quiet]);

    const rotY = isWhite ? 0 : Math.PI;
    return <primitive object={clone} position={[0, 0, 0]} rotation={[0, rotY, 0]} dispose={null} />;
};

const Piece3D = ({ token, isSelected, isOpponentSelected, candidates, onSquareClick, isDead = false, is2DView = false, quiet = false, motion = false }: { token: Token, isSelected: boolean, isOpponentSelected?: boolean, candidates?: ReadonlySet<PieceType>, onSquareClick: (r:number, c:number) => void, isDead?: boolean, is2DView?: boolean, isFlipped?: boolean, quiet?: boolean, motion?: boolean }) => {
    const possibleTypes = (Object.keys(token.probabilities) as PieceType[]).filter(t => candidates ? candidates.has(t) : token.probabilities[t as PieceType] > 0);
    const confirmedType = token.promotedTo ? token.promotedTo : (possibleTypes.length === 1 ? possibleTypes[0] : null);
    const isWhite = token.player === 'white';
    
    const targetX = token.col - 3.5;
    const targetZ = token.row - 3.5;

    const groupRef = React.useRef<THREE.Group>(null);
    
    // Animation states
    const currentPos = React.useRef(new THREE.Vector3(targetX, 0, targetZ));
    const startPos = React.useRef(new THREE.Vector3(targetX, 0, targetZ));
    const animTarget = React.useRef(new THREE.Vector3(targetX, 0, targetZ));
    const moveProgress = React.useRef(1.0);
    const deathProgress = React.useRef(0.0);
    const liftProgress = React.useRef(0.0);

    React.useEffect(() => {
        if (targetX !== animTarget.current.x || targetZ !== animTarget.current.z) {
            startPos.current.copy(currentPos.current);
            animTarget.current.set(targetX, 0, targetZ);
            moveProgress.current = 0.0;
        }
    }, [targetX, targetZ]);

    useFrame((state, delta) => {
        if (!groupRef.current) return;

        // Move Animation (Parabola)
        if (moveProgress.current < 1.0) {
            moveProgress.current += delta * 2.5; 
            if (moveProgress.current > 1.0) moveProgress.current = 1.0;
            
            const t = moveProgress.current;
            const easeT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            
            currentPos.current.x = THREE.MathUtils.lerp(startPos.current.x, animTarget.current.x, easeT);
            currentPos.current.z = THREE.MathUtils.lerp(startPos.current.z, animTarget.current.z, easeT);
            
            // Peak height is 1.5
            currentPos.current.y = 4 * 0.6 * t * (1 - t);
        } else {
            currentPos.current.copy(animTarget.current);
        }

        groupRef.current.position.copy(currentPos.current);

        // Death Animation
        if (isDead) {
            deathProgress.current += delta * 1.5;
            if (deathProgress.current > 1.0) deathProgress.current = 1.0;
            
            const dt = deathProgress.current;
            const scale = 1.0 - dt;
            groupRef.current.scale.setScalar(scale);
            groupRef.current.rotation.y = dt * Math.PI * 4;
            groupRef.current.position.y += dt * 1.5;
        } else {
            // Selection Lift Animation
            if (isSelected) {
                liftProgress.current = THREE.MathUtils.lerp(liftProgress.current, 1.0, delta * 10.0);
            } else {
                liftProgress.current = THREE.MathUtils.lerp(liftProgress.current, 0.0, delta * 10.0);
            }
            // Add a slight hover effect using state.clock.elapsedTime when fully lifted
            const hover = 0;
            
            groupRef.current.position.y += liftProgress.current * 0.12 + hover;
            groupRef.current.scale.setScalar(1.0);
            groupRef.current.rotation.y = 0;
        }
    });

    return (
        <group ref={groupRef} onClick={(e) => { e.stopPropagation(); onSquareClick(token.row, token.col); }}>
            {isSelected && !isDead && (
                <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.3, 0.45, 32]} />
                    <meshBasicMaterial color="#D4B872" transparent opacity={0.8} />
                </mesh>
            )}
            {isOpponentSelected && !isDead && !isSelected && (
                <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.3, 0.45, 32]} />
                    <meshBasicMaterial color="#EF4444" transparent opacity={0.8} />
                </mesh>
            )}
            
            {is2DView ? (
                <Billboard follow={true} lockX={false} lockY={false} lockZ={false} position={[0, 0.1, 0]}>
                    <group scale={[0.02, 0.02, 0.02]}>
                        <Html transform zIndexRange={[100, 0]} pointerEvents="none" center>
                            <div style={{ pointerEvents: 'none', transform: 'none' }}>
                                <QuantumPieceUI 
                                    id={token.id} 
                                    player={token.player} 
                                    probabilities={token.probabilities} 
                                    candidates={candidates} 
                                    isSelected={false} 
                                    onClick={() => {}} 
                                    promotedTo={token.promotedTo} 
                                />
                            </div>
                        </Html>
                    </group>
                </Billboard>
            ) : (
                <>
                {confirmedType ? (
                    <RealisticPiece type={confirmedType} isWhite={isWhite} quiet={quiet} />
                ) : (
                    <QuantumBlock isWhite={isWhite} probabilities={token.probabilities} candidates={candidates} quiet={quiet} motion={motion && !isSelected} phase={token.row*.7+token.col*.4} />
                )}
                </>
            )}
        </group>
    );
};

function SquareOutline({ color, overlay = false }: { color: string; overlay?: boolean }) {
    return <group position={[0,BOARD_HEIGHTS.overlay,0]}>
        {([[-.465,0,.04,.97],[.465,0,.04,.97],[0,-.465,.97,.04],[0,.465,.97,.04]] as const).map(([x,z,w,h],i)=><mesh key={i} raycast={ignoreRaycast} position={[x,0,z]} rotation={[-Math.PI/2,0,0]} renderOrder={overlay ? 1001 : 1}>
            <planeGeometry args={[w,h]}/><meshBasicMaterial color={color} depthTest={!overlay} depthWrite={false} toneMapped={false}/>
        </mesh>)}
    </group>;
}

function BoardSquares({ props, enemySelected }: { props: Board3DProps; enemySelected: boolean }) {
    const last = props.moveHistory.at(-1), theme = BOARD_THEMES[props.boardDesign ?? 'classic'];
    return <group>{Array.from({length:64},(_,i)=> {
        const row=Math.floor(i/8), col=i%8;
        const token = props.tokens.find(t=>!t.isCaptured && t.row===row && t.col===col);
        const selected = token && (token.id===props.selectedTokenId || token.id===props.opponentSelectedTokenId);
        const valid = props.showMoveHints && props.validMoves.some(move=>move.r===row && move.c===col);
        const lastSquare = last && ((last.from[0]===row && last.from[1]===col) || (last.to[0]===row && last.to[1]===col));
        return <group key={i} position={[col-3.5,0,row-3.5]} onClick={event=>{event.stopPropagation();props.onSquareClick(row,col);}}>
            <mesh position={[0,-.05,0]} receiveShadow>
                <boxGeometry args={[.994,.1,.994]}/>
                <meshStandardMaterial color={(row+col)%2===0 ? theme.light : theme.dark} roughness={.76} metalness={.03}/>
            </mesh>
            {lastSquare && <mesh position={[0,.012,0]} rotation={[-Math.PI/2,0,0]} raycast={ignoreRaycast}>
                <planeGeometry args={[.98,.98]}/><meshBasicMaterial color="#efcd7a" transparent opacity={.26} depthWrite={false}/>
            </mesh>}
            {selected && <SquareOutline color={token?.id===props.opponentSelectedTokenId ? '#f0a390' : '#ffe0a1'}/>}
            {valid && <mesh position={[0,.018,0]} rotation={[-Math.PI/2,0,0]} raycast={ignoreRaycast}>
                {token ? <ringGeometry args={[.425,.477,32]}/> : <circleGeometry args={[.115,24]}/>}
                <meshBasicMaterial color={enemySelected ? '#ffb69a' : '#ffe3a0'} depthWrite={false} toneMapped={false}/>
            </mesh>}
        </group>;
    })}</group>;
}

function BoardCoordinates({ color }: { color: string }) {
    return <group>{Array.from({length:8},(_,i)=><React.Fragment key={i}>
        {[-4.19,4.19].map(edge=><React.Fragment key={edge}>
            <Html center position={[i-3.5,.015,edge]} style={{pointerEvents:'none'}} zIndexRange={[2,0]}><span className="board-coordinate" style={{color}}>{String.fromCharCode(97+i)}</span></Html>
            <Html center position={[edge,.015,i-3.5]} style={{pointerEvents:'none'}} zIndexRange={[2,0]}><span className="board-coordinate" style={{color}}>{8-i}</span></Html>
        </React.Fragment>)}
    </React.Fragment>)}</group>;
}

function Hint3D({ move }: { move: HintMove }) {
    const shape = useMemo(()=> {
        const points = hintArrowPoints(move).map(([x,z])=>new THREE.Vector2(x-4,4-z));
        return points.length ? new THREE.Shape(points) : new THREE.Shape();
    },[move]);
    return <group>
        <mesh position={[0,.06,0]} rotation={[-Math.PI/2,0,0]} renderOrder={1000} raycast={ignoreRaycast}>
            <shapeGeometry args={[shape]}/><meshBasicMaterial color="#ffe3a0" depthTest={false} depthWrite={false} toneMapped={false} side={THREE.DoubleSide}/>
        </mesh>
        {(['from','to'] as const).map(kind=>{
            const row=kind==='from'?move.fromRow:move.toRow, col=kind==='from'?move.fromCol:move.toCol;
            return <group key={kind} position={[col-3.5,0,row-3.5]}>
                <SquareOutline color={kind==='from'?'#9ed8ff':'#ffe3a0'} overlay/>
                <Html center position={[0,.12,.42]} zIndexRange={[5,3]} style={{pointerEvents:'none'}}>
                    <span className={`board-hint-label ${kind}`} data-hint-endpoint={kind} data-square-name={squareName(row,col)}>{squareName(row,col)}</span>
                </Html>
            </group>;
        })}
    </group>;
}

function SceneCamera({ flipped, flat, checkmate = false }: { flipped: boolean; flat: boolean; checkmate?: boolean }) {
    const {size}=useThree();
    const view=boardCamera(size.width,size.height,flipped,flat);
    const cameraRef = React.useRef<THREE.OrthographicCamera>(null);
    const reducedMotion = React.useRef(false);
    useEffect(() => {
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => { reducedMotion.current = media.matches; };
        update();
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);
    useFrame((_, delta) => {
        const camera = cameraRef.current;
        if (!camera) return;
        const targetZoom = view.zoom * (checkmate && !reducedMotion.current ? 1.22 : 1);
        if (Math.abs(camera.zoom - targetZoom) < .001) return;
        camera.zoom = THREE.MathUtils.damp(camera.zoom, targetZoom, 2.5, delta);
        camera.updateProjectionMatrix();
    });
    return <>
        <OrthographicCamera ref={cameraRef} makeDefault position={view.position} zoom={view.zoom} near={.1} far={100} onUpdate={camera=>{camera.lookAt(0,0,0);camera.updateProjectionMatrix();}}/>
    </>;
}

export interface Board3DProps {
    lang?: Language;
    checkmate?: boolean;
    quietLayout?: boolean; is2DView?: boolean; boardDesign?: 'classic'|'marble'|'neon'; hintMove?: HintMove | null; isFlipped?: boolean;
    tokens: Token[]; onlineRole?: 'white'|'black'|'spectator'; selectedTokenId: string | null; opponentSelectedTokenId?: string | null;
    validMoves: {r:number;c:number}[]; moveHistory: MoveRecord[]; showCheckWarning?: boolean;
    onSquareClick: (row:number,col:number)=>void; showMoveHints: boolean; currentTurn:'white'|'black';
    autoRotate?: boolean; candidatesMap?: Map<string,ReadonlySet<PieceType>>;
}

export const Board3D: React.FC<Board3DProps> = props => {
    const lang = props.lang ?? 'en';
    const flipped=props.isFlipped ?? (props.onlineRole==='black');
    const design=props.boardDesign ?? 'classic', theme=BOARD_THEMES[design];
    const selected=props.tokens.find(token=>token.id===props.selectedTokenId);
    const enemySelected=!!selected && selected.player!==(props.onlineRole && props.onlineRole!=='spectator' ? props.onlineRole : props.currentTurn);
    const [deadTokens,setDeadTokens]=React.useState<Token[]>([]);
    const previous=React.useRef(props.tokens.filter(token=>!token.isCaptured));
    useEffect(()=>{
        const current=props.tokens.filter(token=>!token.isCaptured);
        const dead=previous.current.filter(token=>!current.some(other=>other.id===token.id));
        previous.current=current;
        if (dead.length) setDeadTokens(old=>[...old,...dead]);
    },[props.tokens]);
    useEffect(()=>{
        if (!deadTokens.length) return;
        const timer=setTimeout(()=>setDeadTokens([]),1000);
        return ()=>clearTimeout(timer);
    },[deadTokens]);
    const [motion,setMotion]=React.useState(false);
    useEffect(()=>{
        const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
        const read=()=>setMotion(!reduced.matches && localStorage.getItem('qchess_pieceMotion')!=='false');
        read(); reduced.addEventListener('change',read);
        return ()=>reduced.removeEventListener('change',read);
    },[]);
    const active=props.tokens.filter(token=>!token.isCaptured);
    return <div className="board-3d" data-board-theme={design} data-camera="fixed" style={{touchAction:'pan-y'}}>
        <div className="board-scene-tools">
            <button aria-pressed={motion} onClick={()=>{setMotion(!motion);localStorage.setItem('qchess_pieceMotion',String(!motion));}}>◌ {matchText(lang,'駒のゆらぎ','Piece motion')} {motion?dict[lang].on:dict[lang].muted}</button>
        </div>
        <div className="board-scene-canvas">
        <ResilientBoardCanvas lang={lang} fallback={<Board2D {...props} isFlipped={flipped}/>} onRetry={() => Object.values(MODEL_PATHS).forEach(path => useGLTF.clear(path))}>
            <SceneCamera key={`${flipped}`} flipped={flipped} flat={!!props.is2DView} checkmate={props.checkmate}/>
            {props.checkmate && motion && <Sparkles count={80} scale={[9,3,9]} position={[0,1.5,0]} speed={.6} size={5} color="#ffe5a0"/>}
            <ambientLight intensity={.8}/>
            <hemisphereLight args={['#f7edda','#45546c',.8]}/>
            <directionalLight position={[-4,10,6]} intensity={2.1} color="#fff3df" castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-normalBias={.025} shadow-bias={-.0003}/>
            <directionalLight position={[5,6,-5]} intensity={1.5} color="#d5e6ff"/>
            <group>
                <mesh position={[0,-.3,0]} castShadow receiveShadow><boxGeometry args={[8.85,.38,8.85]}/><meshStandardMaterial color={theme.frame} roughness={.58}/></mesh>
                <mesh position={[0,-.12,0]}><boxGeometry args={[8.78,.04,8.78]}/><meshStandardMaterial color={theme.rim} roughness={.45} metalness={.3} emissive={design==='neon'?theme.rim:'#000000'} emissiveIntensity={.35}/></mesh>
                <mesh position={[0,-.07,0]} receiveShadow><boxGeometry args={[8.7,.08,8.7]}/><meshStandardMaterial color={theme.frame} roughness={.72}/></mesh>
            </group>
            <BoardSquares props={props} enemySelected={enemySelected}/>
            <BoardCoordinates color={theme.label}/>
            {[...active,...deadTokens].map(token=><Piece3D key={token.id} token={token} candidates={props.candidatesMap?.get(token.id)} isSelected={props.selectedTokenId===token.id}
                isOpponentSelected={props.opponentSelectedTokenId===token.id} isDead={deadTokens.some(dead=>dead.id===token.id)} onSquareClick={props.onSquareClick} is2DView={!!props.is2DView} motion={motion} quiet/>)}
            {props.hintMove && <Hint3D move={props.hintMove}/>}
        </ResilientBoardCanvas>
        </div>
    </div>;
};
