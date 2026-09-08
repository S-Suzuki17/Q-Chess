'use client';

import React, { useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Backdrop, OrbitControls, ContactShadows, useGLTF, Text, Float, Billboard, Environment, Html, Stars, Sky, Sparkles, Cloud } from '@react-three/drei';
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
                        let color = isLight ? '#d4c0a5' : '#5c3e29';
            let metalness = 0.1;
            let roughness = 0.4;
            let emissive = '#000000';
            let emissiveIntensity = 0;
            let clearcoat = 0.5;

            if (boardDesign === 'marble') {
                color = isLight ? '#f8fafc' : '#64748b';
                metalness = 0.1;
                roughness = 0.2;
                clearcoat = 0.8;
            } else if (boardDesign === 'neon') {
                color = isLight ? '#00e5ff' : '#d400ff';
                metalness = 0.2;
                roughness = 0.2;
                emissive = isLight ? '#00e5ff' : '#d400ff';
                emissiveIntensity = 0.6;
                clearcoat = 1.0;
            }
            

            
            
            
            const isHintTo = hintMove && hintMove.toRow === r && hintMove.toCol === c;
            const isHintFrom = hintMove && hintMove.fromRow === r && hintMove.fromCol === c;
            

            squares.push(
                <group key={`${r}-${c}`} position={[x, -0.05, z]} onClick={(e) => { e.stopPropagation(); onSquareClick(r, c); }}>
                    <mesh receiveShadow>
                        <boxGeometry args={[1, 0.1, 1]} />
                        <meshPhysicalMaterial color={color} roughness={roughness} metalness={metalness} emissive={emissive} emissiveIntensity={emissiveIntensity} clearcoat={clearcoat} clearcoatRoughness={0.1} />
                    </mesh>
                    {isMoveCandidate && (
                        <mesh position={[0, 0.051, 0]} rotation={[-Math.PI/2, 0, 0]}>
                            <planeGeometry args={[1, 1]} />
                            <meshBasicMaterial color={isEnemySelected ? "#ff4444" : "#4ade80"} transparent opacity={0.3} depthWrite={false} />
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
                <group>
                    <fog attach="fog" args={['#f8fafc', 20, 80]} />
                    <color attach="background" args={['#f8fafc']} />
                    
                    {/* Bright marble floor */}
                    <mesh position={[0, -2, 0]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
                        <planeGeometry args={[150, 150]} />
                        <meshStandardMaterial color="#e2e8f0" roughness={0.1} metalness={0.1} />
                    </mesh>
                    
                    {/* Museum Architectural Pillars */}
                    {Array.from({ length: 12 }).map((_, i) => (
                        <mesh key={i} position={[Math.sin(i * Math.PI / 6) * 30, 15, Math.cos(i * Math.PI / 6) * 30]} castShadow receiveShadow>
                            <cylinderGeometry args={[1.5, 1.5, 40, 32]} />
                            <meshStandardMaterial color="#ffffff" roughness={0.2} />
                        </mesh>
                    ))}
                    
                    {/* Architectural ceiling beams */}
                    {Array.from({ length: 8 }).map((_, i) => (
                        <mesh key={i} position={[0, 25, (i - 3.5) * 12]} castShadow>
                            <boxGeometry args={[80, 2, 4]} />
                            <meshStandardMaterial color="#f1f5f9" roughness={0.5} />
                        </mesh>
                    ))}
                    
                    {/* Display Pedestal */}
                    <mesh position={[0, -1, 0]} receiveShadow>
                        <boxGeometry args={[18, 2, 18]} />
                        <meshStandardMaterial color="#ffffff" roughness={0.1} metalness={0.1} />
                    </mesh>

                    {/* Lighting */}
                    <ambientLight intensity={1.2} />
                    <directionalLight position={[15, 30, 20]} intensity={1.8} color="#ffffff" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001} />
                    <directionalLight position={[-15, 20, -15]} intensity={0.6} color="#e0f2fe" />
                </group>
            );
        case 'neon':
            return (
                <group>
                    <fog attach="fog" args={['#050010', 10, 60]} />
                    <color attach="background" args={['#050010']} />
                    
                    {/* Endless reflective glassy floor */}
                    <mesh position={[0, -2, 0]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
                        <planeGeometry args={[200, 200]} />
                        <meshStandardMaterial color="#020005" roughness={0.05} metalness={0.9} />
                    </mesh>
                    
                    {/* Cyberpunk Grid */}
                    <gridHelper args={[200, 100, '#ff00ff', '#00ffff']} position={[0, -1.99, 0]} />
                    
                    {/* Giant glowing monoliths (Servers/Skyscrapers) */}
                    {Array.from({ length: 20 }).map((_, i) => {
                        const x = Math.sin(i * 2.1) * (35 + Math.random() * 25);
                        const z = Math.cos(i * 2.1) * (35 + Math.random() * 25);
                        const height = 15 + Math.random() * 40;
                        const isCyan = i % 2 === 0;
                        return (
                            <group key={i} position={[x, height/2 - 2, z]}>
                                <mesh castShadow receiveShadow>
                                    <boxGeometry args={[5, height, 5]} />
                                    <meshStandardMaterial color="#0a0014" roughness={0.2} metalness={0.8} />
                                </mesh>
                                {/* Glowing accent lines on monoliths */}
                                <mesh position={[0, 0, 2.51]}>
                                    <planeGeometry args={[0.2, height]} />
                                    <meshBasicMaterial color={isCyan ? '#00ffff' : '#ff00ff'} />
                                </mesh>
                            </group>
                        );
                    })}
                    
                    {/* Floating Data particles */}
                    <Sparkles count={500} scale={50} size={1.5} speed={0.4} opacity={0.8} color="#00ffff" />
                    
                    {/* Floating Neon Rings around the table */}
                    <mesh position={[0, -1, 0]} rotation={[-Math.PI/2, 0, 0]}>
                        <ringGeometry args={[14, 14.3, 64]} />
                        <meshBasicMaterial color="#ff00ff" transparent opacity={0.8} />
                    </mesh>
                    <mesh position={[0, -1.5, 0]} rotation={[-Math.PI/2, 0, 0]}>
                        <ringGeometry args={[16, 16.3, 64]} />
                        <meshBasicMaterial color="#00ffff" transparent opacity={0.8} />
                    </mesh>

                    {/* Central Pillar */}
                    <mesh position={[0, -2, 0]} receiveShadow>
                        <cylinderGeometry args={[10, 12, 4, 32]} />
                        <meshStandardMaterial color="#050010" roughness={0.1} metalness={0.9} />
                    </mesh>

                    {/* Lighting */}
                    <ambientLight intensity={1.5} />
                    <spotLight position={[0, 25, 0]} intensity={3.5} color="#ffffff" angle={0.7} penumbra={0.5} castShadow shadow-mapSize={[2048, 2048]} />
                    <pointLight position={[15, 10, 15]} intensity={5.0} color="#00ffff" distance={60} />
                    <pointLight position={[-15, 10, -15]} intensity={5.0} color="#ff00ff" distance={60} />
                </group>
            );
        case 'classic':
        default:
            return (
                <group>
                    <fog attach="fog" args={['#140b07', 15, 50]} />
                    <color attach="background" args={['#140b07']} />
                    
                    {/* Dark Wooden Floor */}
                    <mesh position={[0, -2, 0]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
                        <planeGeometry args={[150, 150]} />
                        <meshStandardMaterial color="#0a0502" roughness={0.7} metalness={0.1} />
                    </mesh>
                    
                    {/* Antique Library Wall Panels */}
                    {Array.from({ length: 16 }).map((_, i) => (
                        <mesh key={i} position={[Math.sin(i * Math.PI / 8) * 25, 8, Math.cos(i * Math.PI / 8) * 25]} castShadow receiveShadow rotation={[0, i * Math.PI / 8, 0]}>
                            <boxGeometry args={[8, 20, 1]} />
                            <meshStandardMaterial color="#1a0c06" roughness={0.8} />
                        </mesh>
                    ))}
                    
                    {/* Grandmaster Table */}
                    <mesh position={[0, -1, 0]} receiveShadow>
                        <cylinderGeometry args={[14, 12, 2, 64]} />
                        <meshStandardMaterial color="#2d160c" roughness={0.3} metalness={0.1} />
                    </mesh>
                    
                    {/* Atmosphere Dust Motes */}
                    <Sparkles count={300} scale={30} size={2} speed={0.2} opacity={0.15} color="#ffe8d6" />
                    
                    {/* Lighting */}
                    <ambientLight intensity={0.5} />
                    <spotLight position={[0, 25, 0]} intensity={3.5} color="#ffedd5" penumbra={0.8} angle={0.6} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001} />
                    <spotLight position={[15, 15, 15]} intensity={1.5} color="#d4a373" angle={0.8} penumbra={1} />
                </group>
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
                
                {/* Masterpiece Dynamic Board Base */}
                {props.boardDesign === 'neon' ? (
                    <group position={[0, -0.25, 0]}>
                        {/* Glowing Rim */}
                        <mesh position={[0, -0.1, 0]}>
                            <boxGeometry args={[8.6, 0.3, 8.6]} />
                            <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={0.8} />
                        </mesh>
                        {/* Glossy Dark Acrylic Top */}
                        <mesh position={[0, 0.1, 0]} receiveShadow>
                            <boxGeometry args={[8.4, 0.1, 8.4]} />
                            <meshPhysicalMaterial color="#050010" roughness={0.05} metalness={0.9} clearcoat={1} clearcoatRoughness={0.05} />
                        </mesh>
                    </group>
                ) : props.boardDesign === 'marble' ? (
                    <mesh position={[0, -0.25, 0]} receiveShadow>
                        <boxGeometry args={[8.6, 0.4, 8.6]} />
                        <meshPhysicalMaterial color="#f8fafc" roughness={0.15} metalness={0.05} transmission={0.6} thickness={2} clearcoat={1} clearcoatRoughness={0.1} />
                    </mesh>
                ) : (
                    <mesh position={[0, -0.25, 0]} receiveShadow>
                        <boxGeometry args={[8.6, 0.4, 8.6]} />
                        <meshPhysicalMaterial color="#1a0f0a" roughness={0.2} metalness={0.1} clearcoat={0.8} clearcoatRoughness={0.2} />
                    </mesh>
                )}
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
