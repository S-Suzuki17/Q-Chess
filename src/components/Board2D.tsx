import React from 'react';
import { QuantumPieceUI } from './QuantumPieceUI';
import { Token } from '../lib/GameEngine';
import { PieceType } from '../config/gameConfig';

export interface Board2DProps {
    autoRotate?: boolean;
    onlineRole?: 'white' | 'black' | 'spectator';
    showCheckWarning?: boolean;
    currentTurn?: 'white' | 'black';
    isFlipped?: boolean;
    tokens: Token[];
    selectedTokenId: string | null;
    validMoves: {r: number, c: number}[];
    moveHistory: any[];
    onSquareClick: (row: number, col: number) => void;
    showMoveHints: boolean;
    candidatesMap?: Map<string, ReadonlySet<PieceType>>;
    boardDesign?: 'classic' | 'marble' | 'neon';
    hintMove?: { fromRow: number, fromCol: number, toRow: number, toCol: number } | null;
}

export function Board2D({ 
    isFlipped: flipped,
    onlineRole,
    currentTurn,
    tokens,
    selectedTokenId,
    validMoves,
    moveHistory,
    onSquareClick,
    showMoveHints,
    candidatesMap,
    boardDesign = 'classic',
    hintMove
}: Board2DProps) {
    const isFlipped = flipped ?? (onlineRole === 'black');
    const selectedToken = tokens.find(t => !t.isCaptured && t.id === selectedTokenId);
    const isEnemySelected = selectedToken ? selectedToken.player !== (onlineRole && onlineRole !== 'spectator' ? onlineRole : currentTurn) : false;
    const renderMoves = showMoveHints ? validMoves : [];
    const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;

    return (
        <div className="w-full h-full flex items-center justify-center" style={{ containerType: 'size' }}>
        <div
            className="aspect-square w-full max-w-[500px] relative shadow-2xl mx-auto rounded-md overflow-hidden border-4 border-[#B39A62]/30"
            style={{ 
                width: 'min(100cqw, 100cqh, 500px)',
                flexShrink: 0,
                background: boardDesign === 'marble' ? '#a0a0a0' : boardDesign === 'neon' ? '#1a0b2e' : '#11100E',
                transform: isFlipped ? 'rotate(180deg)' : 'none'
            }}
        >
            {/* 8x8 Grid */}
            <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">
                {Array.from({ length: 64 }).map((_, i) => {
                    const row = Math.floor(i / 8);
                    const col = i % 8;
                    const isDark = (row + col) % 2 === 1;
                    const isMoveCandidate = renderMoves.some(m => m.r === row && m.c === col);
                    const isLastMove = lastMove && ((lastMove.from[0] === row && lastMove.from[1] === col) || (lastMove.to[0] === row && lastMove.to[1] === col));
                    
                    const isHintTo = hintMove && hintMove.toRow === row && hintMove.toCol === col;
                    const isHintFrom = hintMove && hintMove.fromRow === row && hintMove.fromCol === col;

                    let bgClass = isDark ? 'bg-[#5c3e29]' : 'bg-[#d4c0a5]';
                    if (boardDesign === 'marble') bgClass = isDark ? 'bg-[#708090]' : 'bg-[#f2f2f2]';
                    if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#0a0a10]' : 'bg-[#2a2a35]';

                    if (isLastMove) {
                        if (boardDesign === 'marble') bgClass = isDark ? 'bg-[#8d9c5b]' : 'bg-[#e8f0b1]';
                        else if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#2b0b20]' : 'bg-[#401530]';
                        else bgClass = isDark ? 'bg-[#8f773b]' : 'bg-[#e6d38e]';
                    }

                    return (
                        <div 
                            key={i} 
                            onClick={() => onSquareClick(row, col)}
                            className={`w-full h-full relative cursor-pointer transition-colors ${bgClass} ${isMoveCandidate ? 'hover:brightness-110' : ''}`} 
                        >
                            {isMoveCandidate && (
                                <div className={`absolute inset-0 m-auto w-1/3 h-1/3 rounded-full ${isEnemySelected ? 'bg-red-500/70' : 'bg-[#B39A62]/60'} pointer-events-none animate-pulse`} />
                            )}
                            {isHintFrom && (
                                <div className="absolute inset-0 border-4 border-blue-500 shadow-[inset_0_0_15px_rgba(59,130,246,0.5)] pointer-events-none animate-pulse" />
                            )}
                            {isHintTo && (
                                <div className="absolute inset-0 border-4 border-green-500 shadow-[inset_0_0_15px_rgba(34,197,94,0.5)] pointer-events-none animate-pulse" />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Pieces */}
            {tokens.filter(token => !token.isCaptured).map(token => {
                const isSelected = selectedTokenId === token.id;
                const candidates = candidatesMap?.get(token.id);
                
                return (
                    <div 
                        key={token.id}
                        className="absolute flex items-center justify-center cursor-pointer pointer-events-none"
                        style={{
                            width: '12.5%',
                            height: '12.5%',
                            left: `${token.col * 12.5}%`,
                            top: `${token.row * 12.5}%`,
                            zIndex: isSelected ? 50 : 20,
                            transition: 'left 0.3s ease, top 0.3s ease, transform 0.2s ease',
                            transform: isSelected ? 'translateY(-5px) scale(1.1)' : 'scale(1)'
                        }}
                    >
                        <div 
                            className="w-full h-full scale-[0.85] flex items-center justify-center pointer-events-auto"
                            onClick={(e) => { e.stopPropagation(); onSquareClick(token.row, token.col); }}
                            style={{ transform: isFlipped ? 'rotate(180deg)' : 'none' }}
                        >
                            <QuantumPieceUI 
                                id={token.id}
                                player={token.player}
                                probabilities={token.probabilities}
                                candidates={candidates}
                                isSelected={isSelected}
                                responsive
                                onClick={() => {}}
                                promotedTo={token.promotedTo}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
        </div>
    );
}
