'use client';

import React, { useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Text, Float, Billboard, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { Token } from '../lib/GameEngine';
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
        <group ref={ref} position={position} scale={0.45}>
            <RealisticPiece type={type} isWhite={isWhite} isHologram={false} />
        </group>
    );
};



const QuantumBlock = ({ isWhite, probabilities, candidates }: { isWhite: boolean, probabilities: any, candidates?: ReadonlySet<PieceType> }) => {
    const types: PieceType[] = ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'];
    const activeTypes = types.filter(t => candidates ? candidates.has(t) : probabilities[t as PieceType] > 0);
    const count = activeTypes.length;

    // Slowly rotate the entire spiral orbit
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
            
            {/* Spiral Orbit Pieces */}
            <group ref={orbitRef} position={[0, 0.2, 0]}>
                {activeTypes.map((t, i) => {
                    // Spiral logic: stagger height and angle!
                    // This keeps them within the square (radius 0.35) but prevents vertical/horizontal overlap
                    const angle = (i / count) * Math.PI * 2;
                    const radius = count > 1 ? 0.35 : 0; 
                    const x = Math.cos(angle) * radius;
                    const z = Math.sin(angle) * radius;
                    // stagger height from 0.0 to 1.5
                    const y = count > 1 ? (i * 0.3) : 0.0;
                    
                    return (
                        <FloatingMiniPiece key={t} type={t} isWhite={isWhite} position={[x, y, z]} />
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

const Piece3D = ({ token, isSelected, candidates, onSquareClick, isDead = false }: { token: Token, isSelected: boolean, candidates?: ReadonlySet<PieceType>, onSquareClick: (r:number, c:number) => void, isDead?: boolean }) => {
    const possibleTypes = (Object.keys(token.probabilities) as PieceType[]).filter(t => candidates ? candidates.has(t) : token.probabilities[t as PieceType] > 0);
    const confirmedType = token.promotedTo ? token.promotedTo : (possibleTypes.length === 1 ? possibleTypes[0] : null);
    const isWhite = token.player === 'white';
    
    const targetX = token.col - 3.5;
    const targetZ = token.row - 3.5;

    const groupRef = React.useRef<THREE.Group>(null);
    
    // Animation states
    const currentPos = React.useRef(new THREE.Vector3(targetX, 0, targetZ));
    const startPos = React.useRef(new THREE.Vector3(targetX, 0, targetZ));
    const moveProgress = React.useRef(1.0);
    const deathProgress = React.useRef(0.0);

    React.useEffect(() => {
        if (Math.abs(targetX - currentPos.current.x) > 0.01 || Math.abs(targetZ - currentPos.current.z) > 0.01) {
            startPos.current.copy(currentPos.current);
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
            
            currentPos.current.x = THREE.MathUtils.lerp(startPos.current.x, targetX, easeT);
            currentPos.current.z = THREE.MathUtils.lerp(startPos.current.z, targetZ, easeT);
            
            // Peak height is 1.5
            currentPos.current.y = 4 * 1.5 * t * (1 - t);
        } else {
            currentPos.current.set(targetX, 0, targetZ);
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
            
            {confirmedType ? (
                <RealisticPiece type={confirmedType} isWhite={isWhite} />
            ) : (
                <QuantumBlock isWhite={isWhite} probabilities={token.probabilities} candidates={candidates} />
            )}
        </group>
    );
};

const BoardSquares = ({ validMoves, moveHistory, onSquareClick, isEnemySelected }: any) => {
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
            if (isLastMove) color = isLight ? '#e6d38e' : '#8f773b';

            squares.push(
                <group key={`${r}-${c}`} position={[x, -0.05, z]} onClick={(e) => { e.stopPropagation(); onSquareClick(r, c); }}>
                    <mesh receiveShadow>
                        <boxGeometry args={[1, 0.1, 1]} />
                        <meshStandardMaterial color={color} roughness={0.8} />
                    </mesh>
                    {isMoveCandidate && (
                        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI/2, 0, 0]}>
                            <circleGeometry args={[0.3, 32]} />
                            <meshBasicMaterial color={isEnemySelected ? "#ff4444" : "#D4B872"} transparent opacity={isEnemySelected ? 0.7 : 0.5} />
                        </mesh>
                    )}
                </group>
            );
        }
    }
    return <group>{squares}</group>;
};

export interface Board3DProps {
    tokens: Token[];
    onlineRole?: 'white' | 'black' | 'spectator';
    selectedTokenId: string | null;
    validMoves: {r: number, c: number}[];
    moveHistory: any[];
    showCheckWarning?: boolean;
    onSquareClick: (row: number, col: number) => void;
    showMoveHints: boolean;
    currentTurn: 'white' | 'black';
    candidatesMap?: Map<string, ReadonlySet<PieceType>>;
}

export const Board3D: React.FC<Board3DProps> = (props) => {
    const isFlipped = props.onlineRole === 'black';
    
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

    return (
        <div className="w-full h-full min-h-[400px] rounded-lg overflow-hidden border-4 border-[#3a2518] shadow-2xl relative" style={{ background: 'radial-gradient(circle at 50% 50%, #4a3424 0%, #1a100b 100%)' }}>
            <Canvas shadows camera={{ position: isFlipped ? [0, 8, -6] : [0, 8, 6], fov: 45 }}>
                <ambientLight intensity={0.5} />
                <Environment preset="sunset" />
                <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
                <mesh position={[0, -0.2, 0]} receiveShadow>
                    <boxGeometry args={[8.4, 0.2, 8.4]} />
                    <meshStandardMaterial color="#2c1e16" roughness={0.9} />
                </mesh>
                <BoardSquares validMoves={props.showMoveHints ? props.validMoves : []} moveHistory={props.moveHistory} onSquareClick={props.onSquareClick} isEnemySelected={isEnemySelected} />
                {allTokensToRender.map(token => {
                    const isDead = deadTokens.some(d => d.id === token.id);
                    return <Piece3D key={token.id} token={token} isSelected={token.id === props.selectedTokenId} candidates={props.candidatesMap?.get(token.id)} onSquareClick={props.onSquareClick} isDead={isDead} />;
                })}
                <OrbitControls enablePan={false} minPolarAngle={0} maxPolarAngle={Math.PI / 2.5} minDistance={5} maxDistance={15} />
            </Canvas>
        </div>
    );
};
