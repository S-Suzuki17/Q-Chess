import React from 'react';
import { QuantumPieceUI } from './QuantumPieceUI';

import { PieceType } from '../config/gameConfig';

type PlayerColor = 'white' | 'black';
type PieceProbabilities = Record<PieceType, number>;

export interface DemoPiece {
    id: string;
    player: PlayerColor;
    row: number;
    col: number;
    probabilities: PieceProbabilities;
    isCaptured?: boolean;
    isMoving?: boolean;
    promotedTo?: string;
}

interface AnimatedDemoBoardProps {
    pieces: DemoPiece[];
    sizeClass?: string;
}

export function AnimatedDemoBoard({ pieces, sizeClass = "w-full max-w-[400px]" }: AnimatedDemoBoardProps) {
    return (
        <div className={`aspect-square relative bg-[#0b0c10] border-4 border-[#A89C86]/30 shadow-2xl mx-auto overflow-hidden ${sizeClass}`}>
            {/* Draw 8x8 Board Grid */}
            <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">
                {Array.from({ length: 64 }).map((_, i) => {
                    const row = Math.floor(i / 8);
                    const col = i % 8;
                    const isDark = (row + col) % 2 === 1;
                    return (
                        <div key={i} className={`w-full h-full ${isDark ? 'bg-[#11100E]' : 'bg-[#191714]'}`} />
                    );
                })}
            </div>

            {/* Draw Animated Pieces */}
            {pieces.map(piece => {
                // If captured, we want it to shrink and fade out over the transition time, 
                // but keep it in its last position
                const isCaptured = piece.isCaptured;
                const isMoving = piece.isMoving;

                let transformStyle = '';
                if (isCaptured) {
                    transformStyle = 'scale(0) opacity-0';
                } else if (isMoving) {
                    transformStyle = 'translateY(-10px) scale(1.15)';
                } else {
                    transformStyle = 'scale(1) opacity-100';
                }

                return (
                    <div 
                        key={piece.id}
                        className="absolute flex items-center justify-center pointer-events-none"
                        style={{
                            width: '12.5%',
                            height: '12.5%',
                            left: `${piece.col * 12.5}%`,
                            top: `${piece.row * 12.5}%`,
                            zIndex: isMoving ? 50 : isCaptured ? 10 : 20,
                            // Ensure movement is smooth and transform transitions are distinct
                            transition: 'left 0.6s cubic-bezier(0.4, 0, 0.2, 1), top 0.6s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s ease, opacity 0.3s ease',
                            transform: transformStyle,
                            filter: isMoving ? 'drop-shadow(0 15px 10px rgba(0,0,0,0.8))' : 'none',
                        }}
                    >
                        <div className="w-full h-full scale-[0.85] flex items-center justify-center">
                            <QuantumPieceUI 
                                id={piece.id}
                                player={piece.player}
                                probabilities={piece.probabilities}
                                isSelected={false}
                                onClick={() => {}}
                                promotedTo={piece.promotedTo as any}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
