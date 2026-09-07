'use client';

import React, { useMemo, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Text, Float, Billboard } from '@react-three/drei';
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

const PIECE_SYMBOLS: Record<PieceType, string> = {
    King: '♚', Queen: '♛', Rook: '♜', Bishop: '♝', Knight: '♞', Pawn: '♟'
};

const QuantumBlock = ({ isWhite, probabilities, candidates }: { isWhite: boolean, probabilities: any, candidates?: ReadonlySet<PieceType> }) => {
    const types: PieceType[] = ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'];
    return (
        <Float speed={2} rotationIntensity={0.1} floatIntensity={0.5}>
            <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
                <cylinderGeometry args={[0.4, 0.4, 0.2, 8]} />
                <meshStandardMaterial color={isWhite ? '#d4b872' : '#3B342C'} roughness={0.7} metalness={0.2} />
            </mesh>
            <group position={[0, 0.7, 0]}>
                <Billboard>
                    <group>
                        {types.map((t, i) => {
                            const isActive = candidates ? candidates.has(t) : probabilities[t] > 0;
                            if (!isActive) return null;
                            const x = (i % 3) * 0.3 - 0.3;
                            const y = Math.floor(i / 3) * -0.3 + 0.15;
                            return (
                                <Text key={t} position={[x, y, 0]} fontSize={0.2} color={isWhite ? '#ffffff' : '#D4B872'} anchorX="center" anchorY="middle">
                                    {PIECE_SYMBOLS[t]}
                                </Text>
                            );
                        })}
                    </group>
                </Billboard>
            </group>
        </Float>
    );
};

const RealisticPiece = ({ type, isWhite }: { type: PieceType, isWhite: boolean }) => {
    const { scene } = useGLTF(MODEL_PATHS[type]);
    const clone = useMemo(() => scene.clone(), [scene]);
    
    useEffect(() => {
        clone.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                const mat = new THREE.MeshStandardMaterial({
                    color: isWhite ? '#E8E2D7' : '#191714',
                    roughness: isWhite ? 0.4 : 0.6,
                    metalness: isWhite ? 0.1 : 0.2
                });
                child.material = mat;
            }
        });
    }, [clone, isWhite]);

    const rotY = isWhite ? 0 : Math.PI;
    return <primitive object={clone} scale={1.0} position={[0, 0, 0]} rotation={[0, rotY, 0]} />;
};

const Piece3D = ({ token, isSelected }: { token: Token, isSelected: boolean }) => {
    const possibleTypes = (Object.keys(token.probabilities) as PieceType[]).filter(t => token.candidates ? token.candidates.has(t) : token.probabilities[t] > 0);
    const confirmedType = token.promotedTo ? token.promotedTo : (possibleTypes.length === 1 ? possibleTypes[0] : null);
    const isWhite = token.player === 'white';
    const x = token.col - 3.5;
    const z = token.row - 3.5;

    return (
        <group position={[x, 0, z]} onClick={(e) => { e.stopPropagation(); onSquareClick(token.row, token.col); }}>
            {isSelected && (
                <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.3, 0.45, 32]} />
                    <meshBasicMaterial color="#D4B872" transparent opacity={0.8} />
                </mesh>
            )}
            
            {confirmedType ? (
                <RealisticPiece type={confirmedType} isWhite={isWhite} />
            ) : (
                <QuantumBlock isWhite={isWhite} probabilities={token.probabilities} candidates={token.candidates} />
            )}
        </group>
    );
};

const BoardSquares = ({ validMoves, moveHistory, onSquareClick }: any) => {
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
                <group key={\-\} position={[x, -0.05, z]} onClick={(e) => { e.stopPropagation(); onSquareClick(r, c); }}>
                    <mesh receiveShadow>
                        <boxGeometry args={[1, 0.1, 1]} />
                        <meshStandardMaterial color={color} roughness={0.8} />
                    </mesh>
                    {isMoveCandidate && (
                        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI/2, 0, 0]}>
                            <circleGeometry args={[0.3, 32]} />
                            <meshBasicMaterial color="#D4B872" transparent opacity={0.5} />
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
    onlineRole: 'white' | 'black' | 'spectator';
    selectedTokenId: string | null;
    validMoves: {r: number, c: number}[];
    moveHistory: any[];
    showCheckWarning: boolean;
    onSquareClick: (row: number, col: number) => void;
    showMoveHints: boolean;
    currentTurn: 'white' | 'black';
}

export const Board3D: React.FC<Board3DProps> = (props) => {
    const isFlipped = props.onlineRole === 'black';

    return (
        <div className="w-full h-full min-h-[400px] rounded-lg overflow-hidden border-4 border-[#3a2518] shadow-2xl relative" style={{ background: 'radial-gradient(circle at 50% 50%, #4a3424 0%, #1a100b 100%)' }}>
            <Canvas shadows camera={{ position: isFlipped ? [0, 6, -8] : [0, 6, 8], fov: 45 }}>
                <ambientLight intensity={0.5} />
                <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
                <mesh position={[0, -0.2, 0]} receiveShadow>
                    <boxGeometry args={[8.4, 0.2, 8.4]} />
                    <meshStandardMaterial color="#2c1e16" roughness={0.9} />
                </mesh>
                <BoardSquares validMoves={props.showMoveHints ? props.validMoves : []} moveHistory={props.moveHistory} onSquareClick={props.onSquareClick} />
                {props.tokens.map(token => {
                    if (token.isCaptured) return null;
                    return <Piece3D key={token.id} token={token} isSelected={token.id === props.selectedTokenId} />;
                })}
                <OrbitControls enablePan={false} minPolarAngle={Math.PI / 6} maxPolarAngle={Math.PI / 3} minDistance={5} maxDistance={15} />
            </Canvas>
        </div>
    );
};
