'use client';

import React, { useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Text, Float, Billboard, Environment, Html, Stars, Sky, Sparkles, Cloud } from '@react-three/drei';
import * as THREE from 'three';
import { Token } from '../lib/GameEngine';
import { QuantumPieceUI } from './QuantumPieceUI';
import { PieceType } from '../config/gameConfig';

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

const FloatingMiniPiece = ({ type, isWhite, position }: { type: PieceType, isWhite: boolean, position: [number, number, number] }) => {
    const ref = React.useRef<THREE.Group>(null);
    useFrame((state, delta) => {
        if (ref.current) ref.current.rotation.y += delta * 0.8;
    });
    return (
        <group ref={ref} position={position} scale={0.35}>
            <RealisticPiece type={type} isWhite={isWhite} isHologram={false} />
        </group>
    );
};



const QuantumBlock = ({ isWhite, probabilities, candidates }: { isWhite: boolean, probabilities: any, candidates?: ReadonlySet<PieceType> }) => {
    const types: PieceType[] = ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'];
    const activeTypes = types.filter(t => candidates ? candidates.has(t) : probabilities[t as PieceType] > 0);
    const count = activeTypes.length;

    // Slowly rotate the entire planetary orbit
    const orbitRef = React.useRef<THREE.Group>(null);
    useFrame((state, delta) => {
        if (orbitRef.current) {
            orbitRef.current.rotation.y += delta * 0.4;
        }
    });

    return (
        <group>
            {/* Core Base */}
            <Float speed={2} rotationIntensity={0.05} floatIntensity={0.1}>
                <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
                    <cylinderGeometry args={[0.35, 0.4, 0.1, 32]} />
                    <meshStandardMaterial color={isWhite ? '#ffffff' : '#000000'} transparent opacity={0.5} roughness={0.5} />
                </mesh>
                <mesh position={[0, 0.105, 0]} rotation={[-Math.PI/2, 0, 0]}>
                     <ringGeometry args={[0.3, 0.35, 32]} />
                     <meshBasicMaterial color={isWhite ? '#00e5ff' : '#ff3366'} transparent opacity={0.8} />
                </mesh>
            </Float>
            
            {/* Flat Planetary Orbit Pieces */}
            <group ref={orbitRef} position={[0, 0.15, 0]}>
                {activeTypes.map((t, i) => {
                    const angle = (i / count) * Math.PI * 2;
                    const radius = count > 1 ? 0.35 : 0; 
                    const x = Math.cos(angle) * radius;
                    const z = Math.sin(angle) * radius;
                    
                    return (
                        <FloatingMiniPiece key={t} type={t} isWhite={isWhite} position={[x, 0, z]} />
                    );
                })}
            </group>
        </group>
    );
};

const RealisticPiece = ({ type, isWhite, isHologram = false }: { type: PieceType, isWhite: boolean, isHologram?: boolean }) => {
    const { scene } = useGLTF(MODEL_PATHS[type]);
    
    const clone = useMemo(() => {
        const c = scene.clone();
        c.updateMatrixWorld(true);
        
        const box = new THREE.Box3().setFromObject(c);
        const size = new THREE.Vector3();
        box.getSize(size);
        
        if (size.y === 0) return c; // safety
        
        const heights: Record<PieceType, number> = {
            King: 1.4, Queen: 1.3, Bishop: 1.15, Knight: 1.05, Rook: 1.0, Pawn: 0.8
        };
        const targetHeight = heights[type];
        
        let s = targetHeight / size.y;
        const maxXZ = Math.max(size.x, size.z) * s;
        if (maxXZ > 0.75) {
            s = s * (0.75 / maxXZ);
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
                } else {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    const mat = new THREE.MeshStandardMaterial({
                        color: isWhite ? '#f4eedb' : '#332924',
                        roughness: 0.2,
                        metalness: 0.1
                    });
                    child.material = mat;
                }
            }
        });
    }, [clone, isWhite, isHologram]);

    const rotY = isWhite ? 0 : Math.PI;
    return <primitive object={clone} position={[0, 0, 0]} rotation={[0, rotY, 0]} />;
};

const Piece3D = ({ token, isSelected, isOpponentSelected, candidates, onSquareClick, isDead = false, is2DView = false, isFlipped = false }: { token: Token, isSelected: boolean, isOpponentSelected?: boolean, candidates?: ReadonlySet<PieceType>, onSquareClick: (r:number, c:number) => void, isDead?: boolean, is2DView?: boolean, isFlipped?: boolean }) => {
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
            currentPos.current.y = 4 * 1.5 * t * (1 - t);
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
            const hover = isSelected ? Math.sin(state.clock.elapsedTime * 4) * 0.05 * liftProgress.current : 0;
            
            groupRef.current.position.y += liftProgress.current * 0.4 + hover;
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
                    <QuantumBlock isWhite={isWhite} probabilities={token.probabilities} candidates={candidates} />
                )}
                </>
            )}
        </group>
    );
};

const BoardSquares = ({ validMoves, moveHistory, onSquareClick, isEnemySelected, boardDesign, hintMove }: any) => {
    const squares = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const isLight = (r + c) % 2 === 0;
            const x = c - 3.5;
            const z = r - 3.5;
            
            const isMoveCandidate = validMoves.some((m: any) => m.r === r && m.c === c);
            const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
            const isLastMove = lastMove && ((lastMove.from[0] === r && lastMove.from[1] === c) || (lastMove.to[0] === r && lastMove.to[1] === c));

            let color = isLight ? '#d4c0a5' : '#5c3e29';
            let metalness = 0.1;
            let roughness = 0.8;
            let emissive = '#000000';
            let emissiveIntensity = 0;

            if (boardDesign === 'marble') {
                color = isLight ? '#c7cfd1' : '#54636e';
                metalness = 0.2;
                roughness = 0.3;
            } else if (boardDesign === 'neon') {
                color = isLight ? '#49316b' : '#221633';
                metalness = 0.5;
                roughness = 0.4;
            }
            
            if (isLastMove) {
                if (boardDesign === 'marble') color = isLight ? '#d2db9e' : '#7a8a66';
                else if (boardDesign === 'neon') {
                    color = isLight ? '#8a428a' : '#4d1f4d';
                    emissive = '#ff3366';
                    emissiveIntensity = 0.2;
                } else color = isLight ? '#e6d38e' : '#8f773b';
            }
            
            
            
            const isHintTo = hintMove && hintMove.toRow === r && hintMove.toCol === c;
            const isHintFrom = hintMove && hintMove.fromRow === r && hintMove.fromCol === c;
            

            squares.push(
                <group key={`${r}-${c}`} position={[x, -0.05, z]} onClick={(e) => { e.stopPropagation(); onSquareClick(r, c); }}>
                    <mesh receiveShadow>
                        <boxGeometry args={[1, 0.1, 1]} />
                        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} emissive={emissive} emissiveIntensity={emissiveIntensity} />
                    </mesh>
                    {isMoveCandidate && (
                        <mesh position={[0, 0.051, 0]} rotation={[-Math.PI/2, 0, 0]}>
                            <planeGeometry args={[1, 1]} />
                            <meshBasicMaterial color={isEnemySelected ? "#ff4444" : "#D4B872"} transparent opacity={0.4} depthWrite={false} />
                        </mesh>
                    )}
                    
                    {isHintFrom && (
                        <mesh position={[0, 0.07, 0]} rotation={[-Math.PI/2, 0, 0]}>
                            <ringGeometry args={[0.35, 0.45, 32]} />
                            <meshBasicMaterial color="#3b82f6" transparent opacity={0.8} />
                        </mesh>
                    )}
                    {isHintTo && (
                        <mesh position={[0, 0.07, 0]} rotation={[-Math.PI/2, 0, 0]}>
                            <ringGeometry args={[0.35, 0.45, 32]} />
                            <meshBasicMaterial color="#22c55e" transparent opacity={0.8} />
                        </mesh>
                    )}
                </group>
            );
        }
    }
    return <group>{squares}</group>;
};



const BackgroundEffects = ({ design }: { design: 'classic' | 'marble' | 'neon' }) => {
    switch (design) {
        case 'marble':
            return (
                <>
                    <Environment preset="dawn" background blur={0.2} />
                    <Sky distance={450000} sunPosition={[0, 1, 0]} inclination={0} azimuth={0.25} />
                    <ambientLight intensity={0.6} />
                    <directionalLight position={[10, 15, 10]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} />
                    <Cloud position={[0, -5, -10]} speed={0.2} opacity={0.3} scale={2} />
                    <Cloud position={[10, -5, 5]} speed={0.2} opacity={0.3} scale={2} />
                    <Cloud position={[-10, -5, 5]} speed={0.2} opacity={0.3} scale={2} />
                    <Sparkles count={100} scale={15} size={6} speed={0.2} opacity={0.8} color="#ffd700" position={[0, 2, 0]} />
                    
                    {/* Floating temple pillars */}
                    {[[-6, -4, -6], [6, -4, -6], [-6, -4, 6], [6, -4, 6]].map((pos, i) => (
                        <mesh key={i} position={pos as any} receiveShadow castShadow>
                            <cylinderGeometry args={[0.5, 0.5, 8, 16]} />
                            <meshStandardMaterial color="#f0f0f0" roughness={0.3} metalness={0.1} />
                        </mesh>
                    ))}
                </>
            );
        case 'neon':
            return (
                <>
                    <Environment preset="city" background blur={0.5} /> {/* Use city for brighter ambient reflections */}
                    <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
                    <ambientLight intensity={0.6} /> {/* Increase ambient drastically */}
                    <directionalLight position={[0, 10, 0]} intensity={1.0} color="#ffffff" />
                    
                    {/* Neon Rim Lights for piece contrast */}
                    <pointLight position={[-5, 5, 5]} color="#00e5ff" intensity={50} distance={30} />
                    <pointLight position={[5, 5, -5]} color="#ff3366" intensity={50} distance={30} />
                    
                    <Sparkles count={150} scale={20} size={5} speed={0.4} opacity={0.8} color="#00e5ff" position={[-2, -1, 0]} />
                    <Sparkles count={150} scale={20} size={5} speed={0.4} opacity={0.8} color="#ff3366" position={[2, 4, 0]} />
                    <gridHelper args={[100, 100, '#ff3366', '#00e5ff']} position={[0, -5, 0]} />
                    
                    <mesh position={[0, -1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <ringGeometry args={[7, 7.2, 64]} />
                        <meshBasicMaterial color="#ff3366" transparent opacity={0.8} />
                    </mesh>
                </>
            );
        case 'classic':
        default:
            return (
                <>
                    <Environment preset="studio" background blur={0.8} />
                    <ambientLight intensity={0.6} />
                    <directionalLight position={[5, 10, 5]} intensity={1.0} castShadow shadow-mapSize={[2048, 2048]} />
                    
                    {/* Authentic chic wooden table */}
                    <mesh position={[0, -0.4, 0]} receiveShadow>
                        <cylinderGeometry args={[14, 14, 0.2, 64]} />
                        <meshStandardMaterial color="#1a110a" roughness={0.7} metalness={0.1} />
                    </mesh>
                    <mesh position={[0, -10, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[200, 200]} />
                        <meshStandardMaterial color="#0d0805" roughness={0.9} />
                    </mesh>
                </>
            );
    }
};

const ResponsiveCamera = ({ isFlipped, is2DView }: { isFlipped: boolean, is2DView: boolean }) => {
    const { camera, size } = useThree();
    useFrame(() => {
        const aspect = size.width / size.height;
        let targetFov = 50; // Base FOV slightly increased for more margin
        if (aspect < 1) {
            // Use 58 degrees for the horizontal FOV to ensure the board and pieces fit with some margin on mobile
            const radHorizontal = THREE.MathUtils.degToRad(58);
            const tanHalfHorizontal = Math.tan(radHorizontal / 2);
            const newFovRad = 2 * Math.atan(tanHalfHorizontal / aspect);
            targetFov = THREE.MathUtils.radToDeg(newFovRad);
        }
        // Force the camera distance and FOV so it ALWAYS fits
        const pCam = camera as THREE.PerspectiveCamera;
        let needsUpdate = false;
        if (Math.abs(pCam.fov - targetFov) > 0.1) {
            pCam.fov = targetFov;
            needsUpdate = true;
        }

        // Handle 2D / 3D position transitions
        const targetPos = is2DView 
            ? new THREE.Vector3(0, 15, isFlipped ? -0.1 : 0.1) // 0.1 offset to define 'up' direction easily
            : new THREE.Vector3(0, 8, isFlipped ? -6 : 6);
            
        if (pCam.position.distanceTo(targetPos) > 0.1) {
            pCam.position.lerp(targetPos, 0.1);
            pCam.lookAt(0, 0, 0);
            needsUpdate = true;
        }

        if (needsUpdate) {
            pCam.updateProjectionMatrix();
        }
    });
    return null;
};

export interface Board3DProps {
    is2DView?: boolean;
    boardDesign?: 'classic' | 'marble' | 'neon';
    hintMove?: { fromRow: number, fromCol: number, toRow: number, toCol: number } | null;
    isFlipped?: boolean;
    tokens: Token[];
    onlineRole?: 'white' | 'black' | 'spectator';
    selectedTokenId: string | null;
    opponentSelectedTokenId?: string | null;
    validMoves: {r: number, c: number}[];
    moveHistory: any[];
    showCheckWarning?: boolean;
    onSquareClick: (row: number, col: number) => void;
    showMoveHints: boolean;
    currentTurn: 'white' | 'black';
    autoRotate?: boolean;
    candidatesMap?: Map<string, ReadonlySet<PieceType>>;
}

export const Board3D: React.FC<Board3DProps> = (props) => {
    const isFlipped = props.isFlipped ?? (props.onlineRole === 'black');
    
    const selectedToken = props.tokens.find(t => t.id === props.selectedTokenId);
    const isEnemySelected = selectedToken ? (props.onlineRole && props.onlineRole !== 'spectator' ? selectedToken.player !== props.onlineRole : selectedToken.player !== props.currentTurn) : false;

    // Track captured pieces for animation
    const [deadTokens, setDeadTokens] = React.useState<Token[]>([]);
    const prevTokensRef = React.useRef<Token[]>(props.tokens.filter(t => !t.isCaptured));

    React.useEffect(() => {
        const prev = prevTokensRef.current;
        const current = props.tokens.filter(t => !t.isCaptured);
        const dead = prev.filter(p => !current.some(t => t.id === p.id));
        if (dead.length > 0) {
            setDeadTokens(prevDead => [...prevDead, ...dead]);
            setTimeout(() => {
                setDeadTokens(prevDead => prevDead.filter(d => !dead.some(x => x.id === d.id)));
            }, 1000);
        }
        prevTokensRef.current = current;
    }, [props.tokens]);

    const activeTokens = props.tokens.filter(t => !t.isCaptured);
    const allTokensToRender = [...activeTokens, ...deadTokens];

    const controlsRef = React.useRef<any>(null);

    return (
        <div className="w-full h-full rounded-lg overflow-hidden border-2 sm:border-4 border-[#3a2518] shadow-2xl relative group" style={{ background: props.boardDesign === 'marble' ? 'radial-gradient(circle at 50% 50%, #e0e0e0 0%, #a0a0a0 100%)' : props.boardDesign === 'neon' ? 'radial-gradient(circle at 50% 50%, #1a0b2e 0%, #000000 100%)' : 'radial-gradient(circle at 50% 50%, #4a3424 0%, #1a100b 100%)', touchAction: 'none' }}>
            <Canvas shadows camera={{ position: isFlipped ? [0, 8, -6] : [0, 8, 6], fov: 45 }}>
                <ResponsiveCamera isFlipped={isFlipped} is2DView={!!props.is2DView} />
                
                <BackgroundEffects design={props.boardDesign || 'classic'} />
                
                {/* Dynamic Board Base */}
                <mesh position={[0, -0.2, 0]} receiveShadow castShadow>
                    <boxGeometry args={[8.4, 0.2, 8.4]} />
                    <meshStandardMaterial 
                        color={props.boardDesign === 'marble' ? '#d9d9d9' : (props.boardDesign === 'neon' ? '#140c21' : '#2c1e16')} 
                        roughness={props.boardDesign === 'marble' ? 0.3 : 0.9} 
                        metalness={props.boardDesign === 'neon' ? 0.5 : 0.1} 
                        emissive={props.boardDesign === 'neon' ? '#ff3366' : '#000000'}
                        emissiveIntensity={props.boardDesign === 'neon' ? 0.1 : 0}
                    />
                </mesh>
                <BoardSquares validMoves={props.showMoveHints ? props.validMoves : []} moveHistory={props.moveHistory} onSquareClick={props.onSquareClick} isEnemySelected={isEnemySelected} boardDesign={props.boardDesign} hintMove={props.hintMove} />
                {allTokensToRender.map(token => {
                    const isDead = deadTokens.some(d => d.id === token.id);
                    return <Piece3D key={token.id} token={token} isSelected={token.id === props.selectedTokenId} isOpponentSelected={token.id === props.opponentSelectedTokenId} candidates={props.candidatesMap?.get(token.id)} onSquareClick={props.onSquareClick} isDead={isDead} is2DView={!!props.is2DView} isFlipped={isFlipped} />;
                })}
                <OrbitControls ref={controlsRef} enablePan={false} minPolarAngle={0} maxPolarAngle={Math.PI / 2.5} minDistance={5} maxDistance={15} autoRotate={props.autoRotate} autoRotateSpeed={1.5} enableRotate={false} />
            </Canvas>
            <button 
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => controlsRef.current?.reset()} 
                className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 bg-black/60 hover:bg-black/80 text-gray-200 p-3 rounded-full opacity-80 transition-opacity active:bg-black/90 shadow-[0_0_15px_rgba(0,0,0,0.5)] z-10"
                title="Reset Camera"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="22" y1="12" x2="18" y2="12"></line>
                    <line x1="6" y1="12" x2="2" y2="12"></line>
                    <line x1="12" y1="6" x2="12" y2="2"></line>
                    <line x1="12" y1="22" x2="12" y2="18"></line>
                </svg>
            </button>
        </div>
    );
};
