'use client';

import React from 'react';
import { PieceType } from '../config/gameConfig';

interface QuantumPieceProps {
    id: string;
    player: 'white' | 'black';
    probabilities: Record<PieceType, number>;
    isSelected: boolean;
    onClick: () => void;
    promotedTo?: PieceType;
}

const PIECE_SYMBOLS: Record<PieceType, string> = {
    King: '♚', Queen: '♛', Rook: '♜', Bishop: '♝', Knight: '♞', Pawn: '♟'
};

export const QuantumPieceUI: React.FC<QuantumPieceProps> = ({ id, player, probabilities, isSelected, onClick, promotedTo }) => {
    const possibleTypes = (Object.keys(probabilities) as PieceType[]).filter(type => probabilities[type] > 0);
    
    const isPromoted = !!promotedTo;
    const confirmedType = promotedTo ? promotedTo : (possibleTypes.length === 1 ? possibleTypes[0] : null);

    const isWhite = player === 'white';
    
    // Traditional White and Black Styling
    const baseBg = isWhite 
        ? 'bg-gradient-to-b from-white via-slate-100 to-slate-300 border-slate-300 text-slate-900 shadow-[0_2px_8px_rgba(0,0,0,0.25)]' 
        : 'bg-gradient-to-b from-gray-800 via-gray-900 to-zinc-950 border-gray-600 text-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.7)]';
    
    const iconColor = isWhite ? 'text-slate-900' : 'text-slate-100';
    const barColor = isWhite ? 'bg-slate-700' : 'bg-slate-300';

    return (
        <>
            {/* Quantum jitter & Promotion animation CSS */}
            <style>{`
                @keyframes quantum-jitter {
                    0% { transform: translate(0px, 0px) scale(1) rotate(0deg); opacity: 0.85; }
                    33% { transform: translate(1px, -1px) scale(1.08) rotate(2deg); opacity: 1; }
                    66% { transform: translate(-1px, 1px) scale(0.92) rotate(-2deg); opacity: 0.9; }
                    100% { transform: translate(0px, 0px) scale(1) rotate(0deg); opacity: 0.85; }
                }
                .quantum-icon {
                    animation: quantum-jitter 1.2s infinite alternate ease-in-out;
                    display: inline-block;
                }
                @keyframes gold-pulse {
                    0%, 100% { box-shadow: 0 0 8px rgba(245, 158, 11, 0.6), inset 0 0 6px rgba(245, 158, 11, 0.2); }
                    50% { box-shadow: 0 0 16px rgba(245, 158, 11, 0.9), inset 0 0 10px rgba(245, 158, 11, 0.4); }
                }
                .promoted-glow {
                    animation: gold-pulse 2s infinite ease-in-out;
                }
            `}</style>

            <div 
                onClick={onClick}
                className={`
                    relative w-12 h-12 cursor-pointer transition-all duration-300
                    flex items-center justify-center overflow-hidden border-2
                    ${confirmedType ? 'rounded-lg' : 'rounded-full'}
                    ${isSelected ? 'ring-4 ring-cyan-400 scale-110 z-10 shadow-[0_0_15px_rgba(34,211,238,0.8)]' : 'hover:scale-105 hover:ring-2 hover:ring-cyan-400/50'}
                    ${isPromoted 
                        ? 'bg-gradient-to-b from-amber-950/80 via-black to-[#120a02] border-2 border-amber-400 promoted-glow text-amber-300' 
                        : baseBg
                    }
                `}
            >
                {/* Promotion badge */}
                {isPromoted && (
                    <>
                        <div 
                            className="absolute top-0.5 left-0.5 flex items-center justify-center bg-amber-500 text-black text-[8px] font-black rounded px-1 leading-none shadow border border-amber-300 z-10 select-none"
                            title="Promoted from Pawn"
                        >
                            <span>成</span>
                        </div>

                        <div className="absolute top-0.5 right-0.5 text-amber-300 text-[8px] font-bold z-10 select-none animate-pulse">
                            ★
                        </div>

                        <div className="absolute bottom-0 w-full flex justify-center items-center py-[1px] bg-amber-500/30 border-t border-amber-400/50 select-none">
                            <span className="text-[7px] font-black tracking-tighter text-amber-300 uppercase leading-none">
                                👑{confirmedType ? PIECE_SYMBOLS[confirmedType] : ''}
                            </span>
                        </div>
                    </>
                )}

                {confirmedType ? (
                    <span className={`text-3xl ${isPromoted ? 'text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.9)]' : iconColor} transition-transform duration-500 scale-110 ${isPromoted ? 'pb-1' : ''}`}>
                        {PIECE_SYMBOLS[confirmedType]}
                    </span>
                ) : (
                    // Superposition: render icons
                    <div className="flex flex-wrap justify-center items-center content-center p-0.5 w-full h-full">
                        {possibleTypes.map((type, index) => (
                            <span 
                                key={type} 
                                title={type} 
                                className={`quantum-icon text-[13px] leading-none m-[1px] font-bold ${iconColor}`}
                                style={{ animationDelay: `${(index * 0.17) % 1}s` }}
                            >
                                {PIECE_SYMBOLS[type]}
                            </span>
                        ))}
                    </div>
                )}

                {!confirmedType && (
                    <div className="absolute bottom-0 w-full flex justify-center opacity-60">
                        {possibleTypes.map(type => (
                            <div 
                                key={type} 
                                className={`h-[2px] ${barColor}`}
                                style={{ width: `${Math.max(probabilities[type] * 100, 10)}%` }}
                            />
                        ))}
                    </div>
                )}
            </div>
        </>
    );
};
