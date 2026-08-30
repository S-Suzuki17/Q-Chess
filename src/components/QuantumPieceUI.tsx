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
    King: '♔', Queen: '♕', Rook: '♖', Bishop: '♗', Knight: '♘', Pawn: '♙'
};

const PIECE_SYMBOLS_BLACK: Record<PieceType, string> = {
    King: '♚', Queen: '♛', Rook: '♜', Bishop: '♝', Knight: '♞', Pawn: '♟'
};

export const QuantumPieceUI: React.FC<QuantumPieceProps> = ({ player, probabilities, isSelected, onClick, promotedTo }) => {
    const possibleTypes = (Object.keys(probabilities) as PieceType[]).filter(type => probabilities[type] > 0);
    
    const isPromoted = !!promotedTo;
    const confirmedType = promotedTo ? promotedTo : (possibleTypes.length === 1 ? possibleTypes[0] : null);

    const isWhite = player === 'white';
    
    // Physical materials: Ivory for White, Ebony/Charcoal for Black
    const baseBg = isWhite 
        ? 'bg-[#E8E2D7] border-[#D0C8B6] shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1),_0_2px_4px_rgba(0,0,0,0.3)]' 
        : 'bg-[#191714] border-[#2D2A26] shadow-[inset_0_-2px_4px_rgba(0,0,0,0.6),_0_2px_4px_rgba(0,0,0,0.5)]';
    
    const iconColor = isWhite ? 'text-[#191714]' : 'text-[#E8E2D7]';
    const highlightRing = isWhite ? 'ring-[#B39A62]' : 'ring-[#B39A62]';

    const symbols = isWhite ? PIECE_SYMBOLS : PIECE_SYMBOLS_BLACK;

    return (
        <>
            <style>{`
                @keyframes quantum-jitter {
                    0% { transform: translate(0px, 0px) rotate(0deg); opacity: 0.6; }
                    33% { transform: translate(0.5px, -0.5px) rotate(1deg); opacity: 0.8; }
                    66% { transform: translate(-0.5px, 0.5px) rotate(-1deg); opacity: 0.5; }
                    100% { transform: translate(0px, 0px) rotate(0deg); opacity: 0.6; }
                }
                .quantum-icon {
                    animation: quantum-jitter 2s infinite alternate ease-in-out;
                    display: inline-block;
                }
            `}</style>
            <div 
                onClick={onClick}
                className={`
                    relative w-12 h-12 cursor-pointer transition-transform duration-150
                    flex items-center justify-center border
                    ${confirmedType ? 'rounded' : 'rounded-full'}
                    ${isSelected ? `ring-2 ring-offset-2 ring-offset-[#11100E] ${highlightRing} scale-105 z-10` : 'hover:scale-105'}
                    ${isPromoted 
                        ? 'bg-[#191714] border-[#B39A62] text-[#B39A62]' 
                        : baseBg
                    }
                `}
            >
                {isPromoted && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#B39A62] rounded-full" />
                )}

                {confirmedType ? (
                    <span className={`text-3xl ${isPromoted ? 'text-[#B39A62]' : iconColor} opacity-90 drop-shadow-sm`}>
                        {symbols[confirmedType]}
                    </span>
                ) : (
                    // Superposition: Elegant engraved subtle icons with jitter
                    <div className="flex flex-wrap justify-center items-center content-center w-full h-full p-1">
                        {possibleTypes.map((type, index) => (
                            <span 
                                key={type} 
                                className={`quantum-icon text-[12px] leading-none m-[1px] ${iconColor}`}
                                style={{ animationDelay: `${(index * 0.3) % 1}s` }}
                            >
                                {symbols[type]}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
};
