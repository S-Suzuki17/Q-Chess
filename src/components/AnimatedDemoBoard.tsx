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
    promotedTo?: string;
}

interface AnimatedDemoBoardProps {
    pieces: DemoPiece[];
    sizeClass?: string;
    selectedPieceId?: string | null;
    validMoves?: { row: number, col: number }[];
    onPieceClick?: (id: string) => void;
    onSquareClick?: (row: number, col: number) => void;
}

export function AnimatedDemoBoard({ 
    pieces, 
    sizeClass = "w-full max-w-[400px]",
    selectedPieceId,
    validMoves = [],
    onPieceClick,
    onSquareClick
}: AnimatedDemoBoardProps) {
    return (
        <div className={`aspect-square relative bg-[#0b0c10] border-4 border-[#A89C86]/30 shadow-2xl mx-auto ${sizeClass}`}>
            {/* Draw 8x8 Board Grid */}
            <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">
                {Array.from({ length: 64 }).map((_, i) => {
                    const row = Math.floor(i / 8);
                    const col = i % 8;
                    const isDark = (row + col) % 2 === 1;
                    const isMoveCandidate = validMoves.some(m => m.row === row && m.col === col);
                    return (
                        <div 
                            key={i} 
                            onClick={() => onSquareClick?.(row, col)}
                            className={`w-full h-full relative cursor-pointer transition-colors ${isDark ? 'bg-[#11100E]' : 'bg-[#191714]'} ${isMoveCandidate ? 'hover:bg-[#B39A62]/10' : ''}`} 
                        >
                            {isMoveCandidate && (
                                <div className="absolute inset-0 border-4 border-[#B39A62]/60 shadow-[inset_0_0_15px_rgba(179,154,98,0.5)] pointer-events-none animate-pulse" />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Draw Animated Pieces */}
            {pieces.map(piece => {
                if (piece.isCaptured) return null; // Immediately remove captured pieces (no shrink animation)

                const isSelected = selectedPieceId === piece.id;

                let transformStyle = '';
                if (isSelected) {
                    transformStyle = 'translateY(-15px) scale(1.15)';
                } else {
                    transformStyle = 'scale(1)';
                }

                return (
                    <div 
                        key={piece.id}
                        className="absolute flex items-center justify-center cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            onPieceClick?.(piece.id);
                        }}
                        style={{
                            width: '12.5%',
                            height: '12.5%',
                            left: `${piece.col * 12.5}%`,
                            top: `${piece.row * 12.5}%`,
                            zIndex: isSelected ? 50 : 20,
                            // Ensure movement is smooth and transform transitions are distinct
                            transition: 'left 0.4s cubic-bezier(0.4, 0, 0.2, 1), top 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s ease',
                            transform: transformStyle,
                            filter: isSelected ? 'drop-shadow(0 20px 15px rgba(0,0,0,0.9))' : 'none',
                        }}
                    >
                        <div className="w-full h-full scale-[0.85] flex items-center justify-center pointer-events-none">
                            <QuantumPieceUI 
                                id={piece.id}
                                player={piece.player}
                                probabilities={piece.probabilities}
                                isSelected={false} // Selection is handled by the wrapper transform
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
