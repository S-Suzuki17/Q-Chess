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
import { BOARD_HEIGHTS, BOARD_THEMES, quantumCandidateSize, boardCamera, hintArrowPoints, squareName, type HintMove } from './boardPresentation';
import { createPieceModelLibrary } from './pieceModelLibrary';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { rewardBoard, type BoardFinish, type PieceFinish } from '../config/campaign';
import { championshipReward } from '../config/championshipRewards';
import { BoardRewardFrame, RewardBoardPlinth } from './BoardRewardFrame';
import { createRewardMaterials } from './rewardMaterials';
import { StudioReflections } from './StudioReflections';
import './board-3d.css';
import { matchText } from '../locales/matchText';
import { dict, type Language } from '../locales/dict';
const ignoreRaycast = () => {};
const PieceModelsContext = React.createContext<ReturnType<typeof createPieceModelLibrary> | null>(null);

function PieceModels({children,finish}: {children: React.ReactNode;finish:PieceFinish|'boxwood'}) {
    const library = useMemo(()=>createPieceModelLibrary(finish), [finish]);
    useEffect(() => () => library.dispose(), [library]);
    return <PieceModelsContext.Provider value={library}>{children}</PieceModelsContext.Provider>;
}

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
    const glass=React.useContext(PieceModelsContext)?.glass??false;
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
            <meshStandardMaterial color={glass?(isWhite?'#b8cbd3':'#21192e'):(isWhite ? '#ebdfc5' : '#202c3d')} roughness={.55}/>
        </mesh>
        <mesh position={[0,.173,0]} rotation={[-Math.PI/2,0,0]}>
            <circleGeometry args={[.415,32]}/><meshStandardMaterial color={glass?(isWhite?'#5c8293':'#382041'):(isWhite ? '#56625b' : '#acb8c3')} roughness={glass ? .72 : .8}/>
        </mesh>
        <mesh position={[0,.177,0]} rotation={[-Math.PI/2,0,0]}>
            <ringGeometry args={[.424,.451,32]}/>{glass?<meshStandardMaterial color={isWhite?'#e3edf1':'#bd91d0'} roughness={.3} metalness={.4}/>:<meshBasicMaterial color="#d4b872"/>}
        </mesh>
        <group ref={orbit}>{active.map((type,i) => {
            const angle=i/active.length*Math.PI*2;
            return <group key={type} position={[Math.cos(angle)*candidateSize.radius,.20,Math.sin(angle)*candidateSize.radius]} scale={candidateSize.scale}>
                <RealisticPiece type={type} isWhite={isWhite} candidate/>
            </group>;
        })}</group>
    </group>;
};

const RealisticPiece = ({ type, isWhite,candidate=false }: { type: PieceType; isWhite: boolean;candidate?:boolean }) => {
    const { scene } = useGLTF(MODEL_PATHS[type]);
    const library = React.useContext(PieceModelsContext);
    const clone = useMemo(() => {
        if (!library) throw new Error('PieceModels provider is required');
        return library.instantiate(scene, type, isWhite,candidate);
    }, [library, scene, type, isWhite,candidate]);

    const rotY = isWhite ? 0 : Math.PI;
    return <primitive object={clone} position={[0, 0, 0]} rotation={[0, rotY, 0]} dispose={null} />;
};

const Piece3D = ({ token, isSelected, isOpponentSelected, candidates, onSquareClick, isDead = false, is2DView = false, quiet = false, motion = false, reducedMotion = false }: { token: Token, isSelected: boolean, isOpponentSelected?: boolean, candidates?: ReadonlySet<PieceType>, onSquareClick: (r:number, c:number) => void, isDead?: boolean, is2DView?: boolean, isFlipped?: boolean, quiet?: boolean, motion?: boolean, reducedMotion?: boolean }) => {
    const invalidate = useThree(state => state.invalidate);
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
            invalidate();
        }
    }, [targetX, targetZ, invalidate]);

    useFrame((state, delta) => {
        if (!groupRef.current) return;

        if (reducedMotion) {
            moveProgress.current = 1;
            currentPos.current.copy(animTarget.current);
            groupRef.current.position.copy(currentPos.current);
            groupRef.current.scale.setScalar(isDead ? 0 : 1);
            groupRef.current.rotation.y = 0;
            return;
        }

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
                liftProgress.current = THREE.MathUtils.damp(liftProgress.current, 1.0, 10, delta);
            } else {
                liftProgress.current = THREE.MathUtils.damp(liftProgress.current, 0.0, 10, delta);
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
                    <RealisticPiece type={confirmedType} isWhite={isWhite} />
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

function BoardSquares({ props, enemySelected, materials }: { props: Board3DProps; enemySelected: boolean; materials:ReturnType<typeof createRewardMaterials>|null }) {
    const last = props.moveHistory.at(-1), theme = rewardBoard(props.boardFinish??'standard') ?? BOARD_THEMES[props.boardDesign ?? 'classic'];
    return <group>{Array.from({length:64},(_,i)=> {
        const row=Math.floor(i/8), col=i%8;
        const token = props.tokens.find(t=>!t.isCaptured && t.row===row && t.col===col);
        const selected = token && (token.id===props.selectedTokenId || token.id===props.opponentSelectedTokenId);
        const valid = props.showMoveHints && props.validMoves.some(move=>move.r===row && move.c===col);
        const lastSquare = last && ((last.from[0]===row && last.from[1]===col) || (last.to[0]===row && last.to[1]===col));
        return <group key={i} position={[col-3.5,0,row-3.5]} onClick={event=>{event.stopPropagation();props.onSquareClick(row,col);}}>
            <mesh position={[0,-.05,0]} receiveShadow material={materials?((row+col)%2===0?materials.light:materials.dark):undefined}>
                <boxGeometry args={[.994,.1,.994]}/>
                {!materials && <meshStandardMaterial color={(row+col)%2===0 ? theme.light : theme.dark} roughness={.76} metalness={.03}/>}
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

function SceneCamera({ flipped, flat, checkmate = false, reducedMotion }: { flipped: boolean; flat: boolean; checkmate?: boolean; reducedMotion: boolean }) {
    const {size}=useThree();
    const view=boardCamera(size.width,size.height,flipped,flat);
    const cameraRef = React.useRef<THREE.OrthographicCamera>(null);
    useFrame((_, delta) => {
        const camera = cameraRef.current;
        if (!camera) return;
        const targetZoom = view.zoom * (checkmate && !reducedMotion ? 1.22 : 1);
        if (Math.abs(camera.zoom - targetZoom) < .001) return;
        camera.zoom = reducedMotion ? targetZoom : THREE.MathUtils.damp(camera.zoom, targetZoom, 2.5, delta);
        camera.updateProjectionMatrix();
    });
    return <>
        <OrthographicCamera ref={cameraRef} makeDefault position={view.position} zoom={view.zoom} near={.1} far={100} onUpdate={camera=>{camera.lookAt(0,0,0);camera.updateProjectionMatrix();}}/>
    </>;
}

export interface Board3DProps {
    boardFinish?:BoardFinish;
    pieceFinish?:PieceFinish;
    lang?: Language;
    checkmate?: boolean;
    quietLayout?: boolean; is2DView?: boolean; boardDesign?: 'classic'|'marble'|'neon'; hintMove?: HintMove | null; isFlipped?: boolean;
    tokens: Token[]; onlineRole?: 'white'|'black'|'spectator'; selectedTokenId: string | null; opponentSelectedTokenId?: string | null;
    validMoves: {r:number;c:number}[]; moveHistory: MoveRecord[]; showCheckWarning?: boolean;
    onSquareClick: (row:number,col:number)=>void; showMoveHints: boolean; currentTurn:'white'|'black';
    autoRotate?: boolean; candidatesMap?: Map<string,ReadonlySet<PieceType>>;
}

export const Board3D: React.FC<Board3DProps> = props => {
    const reducedMotion = useReducedMotion();
    const lang = props.lang ?? 'en';
    const flipped=props.isFlipped ?? (props.onlineRole==='black');
    const design=props.boardDesign ?? 'classic';
    const theme=rewardBoard(props.boardFinish??'standard') ?? BOARD_THEMES[design];
    const frameReward=championshipReward(props.boardFinish??'standard');
    const materials=useMemo(()=>frameReward?.kind==='board'?createRewardMaterials(frameReward):null,[frameReward]);
    useEffect(()=>()=>materials?.dispose(),[materials]);
    const selected=props.tokens.find(token=>token.id===props.selectedTokenId);
    const enemySelected=!!selected && selected.player!==(props.onlineRole && props.onlineRole!=='spectator' ? props.onlineRole : props.currentTurn);
    const [deadTokens,setDeadTokens]=React.useState<Token[]>([]);
    const previous=React.useRef(props.tokens.filter(token=>!token.isCaptured));
    useEffect(()=>{
        const current=props.tokens.filter(token=>!token.isCaptured);
        const dead=previous.current.filter(token=>!current.some(other=>other.id===token.id));
        previous.current=current;
        if (dead.length && !reducedMotion) setDeadTokens(old=>[...old,...dead]);
    },[props.tokens,reducedMotion]);
    useEffect(()=>{
        if (!deadTokens.length) return;
        const timer=setTimeout(()=>setDeadTokens([]),1000);
        return ()=>clearTimeout(timer);
    },[deadTokens]);
    const [motionEnabled,setMotionEnabled]=React.useState(true);
    useEffect(()=>{
        try { setMotionEnabled(localStorage.getItem('qchess_pieceMotion')!=='false'); } catch { /* Storage may be blocked. */ }
    },[]);
    const motion = motionEnabled && !reducedMotion;
    const active=props.tokens.filter(token=>!token.isCaptured);
    return <div className="board-3d" data-board-theme={design} data-board-finish={props.boardFinish ?? 'standard'} data-piece-finish={props.pieceFinish ?? 'standard'} data-camera="fixed" data-piece-motion={motion ? 'on' : 'off'} data-reduced-motion={reducedMotion} style={{touchAction:'pan-y'}}>
        <div className="board-scene-tools">
            <button aria-pressed={motion} disabled={reducedMotion} onClick={()=>{
                setMotionEnabled(!motionEnabled);
                try { localStorage.setItem('qchess_pieceMotion',String(!motionEnabled)); } catch { /* Keep the session usable. */ }
            }}>◌ {matchText(lang,'駒のゆらぎ','Piece motion')} {motion?dict[lang].on:dict[lang].muted}</button>
        </div>
        <div className="board-scene-canvas">
        <ResilientBoardCanvas lang={lang} reducedMotion={reducedMotion} fallback={<Board2D {...props} isFlipped={flipped}/>} onRetry={() => Object.values(MODEL_PATHS).forEach(path => useGLTF.clear(path))}>
            <PieceModels key={props.pieceFinish ?? 'boxwood'} finish={props.pieceFinish ?? 'boxwood'}>
            <StudioReflections/>
            <SceneCamera key={`${flipped}`} flipped={flipped} flat={!!props.is2DView} checkmate={props.checkmate} reducedMotion={reducedMotion}/>
            {props.checkmate && motion && <Sparkles count={80} scale={[9,3,9]} position={[0,1.5,0]} speed={.6} size={5} color="#ffe5a0"/>}
            <ambientLight intensity={.35}/>
            <hemisphereLight args={['#f7edda','#45546c',.45]}/>
            <directionalLight position={[-4,10,6]} intensity={1.55} color="#fff3df" castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-normalBias={.025} shadow-bias={-.0003}/>
            <directionalLight position={[5,6,-5]} intensity={.65} color="#d5e6ff"/>
            {materials&&frameReward?.kind==='board'?<RewardBoardPlinth materials={materials} preset={frameReward}/>:<group>
                <mesh position={[0,-.3,0]} castShadow receiveShadow><boxGeometry args={[8.85,.38,8.85]}/><meshStandardMaterial color={('frameColor' in theme) ? theme.frameColor : theme.frame} roughness={.58}/></mesh>
                <mesh position={[0,-.12,0]}><boxGeometry args={[8.78,.04,8.78]}/><meshStandardMaterial color={theme.rim} roughness={.45} metalness={.3} emissive={design==='neon'&&!rewardBoard(props.boardFinish??'standard')?theme.rim:'#000000'} emissiveIntensity={.35}/></mesh>
                <mesh position={[0,-.07,0]} receiveShadow><boxGeometry args={[8.7,.08,8.7]}/><meshStandardMaterial color={('frameColor' in theme) ? theme.frameColor : theme.frame} roughness={.72}/></mesh>
            </group>}
            {frameReward?.kind==='board' && materials && <BoardRewardFrame preset={frameReward} materials={materials}/>}
            <BoardSquares props={props} enemySelected={enemySelected} materials={materials}/>
            {props.boardFinish==='champion-board-reference-neon'&&<group>{Array.from({length:9},(_,i)=><group key={i}>
                <mesh position={[i-4,.008,0]} raycast={ignoreRaycast}><boxGeometry args={[.012,.008,8]}/><meshBasicMaterial color={i<4?'#4fc7d5':'#c64dbe'} toneMapped={false}/></mesh>
                <mesh position={[0,.008,i-4]} raycast={ignoreRaycast}><boxGeometry args={[8,.008,.012]}/><meshBasicMaterial color={i<4?'#c64dbe':'#4fc7d5'} toneMapped={false}/></mesh>
            </group>)}</group>}
            <BoardCoordinates color={theme.label}/>
            {[...active,...deadTokens].map(token=><Piece3D key={token.id} token={token} candidates={props.candidatesMap?.get(token.id)} isSelected={props.selectedTokenId===token.id}
                isOpponentSelected={props.opponentSelectedTokenId===token.id} isDead={deadTokens.some(dead=>dead.id===token.id)} onSquareClick={props.onSquareClick} is2DView={!!props.is2DView} motion={motion} reducedMotion={reducedMotion} quiet/>)}
            {props.hintMove && <Hint3D move={props.hintMove}/>}
            </PieceModels>
        </ResilientBoardCanvas>
        </div>
    </div>;
};
