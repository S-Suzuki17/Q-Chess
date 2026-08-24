'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { IdentityPool } from '../lib/IdentityPool';
import { Token, calculateProbabilities } from '../lib/GameEngine';
import { QuantumPieceUI } from './QuantumPieceUI';
import { GameRecord } from '../lib/gameRecordService';
import { Language, dict } from '../locales/dict';

interface ReplayBoardProps {
    lang: Language;
    record: GameRecord;
    onHome: () => void;
}

export default function ReplayBoard({ lang, record, onHome }: ReplayBoardProps) {
    const t = dict[lang];
    const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
    const tokens = useMemo(() => {
        // Rebuild state from scratch up to currentMoveIndex
        const pool = new IdentityPool();
        let currentTokens: Token[] = [];
        let idCounter = 1;
        
        [0, 1, 6, 7].forEach(row => {
            const player = row <= 1 ? 'black' : 'white';
            for (let col = 0; col < 8; col++) {
                const id = `token_${idCounter++}`;
                pool.registerPiece(id);
                currentTokens.push({ 
                    id, player, row, col, 
                    isCaptured: false, hasMoved: false, 
                    probabilities: calculateProbabilities(pool, id)
                });
            }
        });

        for (let i = 0; i < currentMoveIndex; i++) {
            const move = record.moves[i];
            
            if (move.promotedTo) {
                pool.restrictIdentity(move.tokenId, ['Pawn']);
            } else {
                pool.restrictIdentity(move.tokenId, move.possibleTypes);
            }

            currentTokens = currentTokens.map(t => {
                if (move.capturedTokenId && t.id === move.capturedTokenId) {
                    const p = pool.piecePossibilities.get(t.id);
                    if (p) p.delete('King');
                    return { ...t, isCaptured: true, row: -1, col: -1 };
                }
                if (t.id === move.tokenId) {
                    return { ...t, row: move.to[0], col: move.to[1], hasMoved: true, promotedTo: move.promotedTo || t.promotedTo };
                }
                // Handle Castling
                if (move.possibleTypes.includes('King') && Math.abs(move.to[1] - move.from[1]) === 2) {
                    const rookCol = move.to[1] > move.from[1] ? 7 : 0;
                    const newRookCol = move.to[1] > move.from[1] ? move.to[1] - 1 : move.to[1] + 1;
                    if (t.player === move.player && t.row === move.from[0] && t.col === rookCol && !t.hasMoved) {
                        return { ...t, col: newRookCol, hasMoved: true };
                    }
                    pool.restrictIdentity(move.tokenId, ['King']);
                }
                return t;
            });
            pool.resolveGlobalConstraints(currentTokens);
        }

        return currentTokens.map(t => ({
            ...t,
            probabilities: calculateProbabilities(pool, t.id)
        }));
    }, [currentMoveIndex, record]);

    const handleNext = () => {
        if (currentMoveIndex < record.moves.length) {
            setCurrentMoveIndex(i => i + 1);
        }
    };

    const handlePrev = () => {
        if (currentMoveIndex > 0) {
            setCurrentMoveIndex(i => i - 1);
        }
    };

    const handlePlayAll = () => {
        setCurrentMoveIndex(record.moves.length);
    };
    const handleRewindAll = () => {
        setCurrentMoveIndex(0);
    };

    const grid = useMemo(() => {
        const board = Array(8).fill(null).map(() => Array(8).fill(null));
        tokens.forEach(t => {
            if (!t.isCaptured) {
                board[t.row][t.col] = t;
            }
        });
        return board;
    }, [tokens]);

    return (
        <div className="flex flex-col items-center justify-center w-full h-full max-w-lg mx-auto relative select-none">
            {/* Top Info */}
            <div className="w-full flex justify-between items-end mb-1 px-2">
                <div className="text-lg font-bold text-red-500 drop-shadow-[0_0_5px_currentColor]">
                    {record.black_player} 
                </div>
                <div className="text-xs font-mono text-gray-500 bg-black/30 px-2 py-1 rounded">
                    {t.turn}: {currentMoveIndex} / {record.moves.length}
                </div>
            </div>

            {/* Board */}
            <div className="w-full aspect-square border-4 border-gray-800 bg-[#0a0a0a] relative rounded shadow-2xl flex flex-col">
                {grid.map((row, r) => (
                    <div key={`row-${r}`} className="flex flex-1 w-full">
                        {row.map((cellToken, c) => {
                            const isDark = (r + c) % 2 === 1;
                            const isLastMoveTarget = currentMoveIndex > 0 && record.moves[currentMoveIndex - 1].to[0] === r && record.moves[currentMoveIndex - 1].to[1] === c;
                            return (
                                <div 
                                    key={`cell-${r}-${c}`} 
                                    className={`flex-1 relative flex items-center justify-center border border-white/5 transition-all
                                        ${isDark ? 'bg-white/5' : 'bg-transparent'}
                                        ${isLastMoveTarget ? 'bg-yellow-500/20 shadow-[inset_0_0_15px_rgba(234,179,8,0.3)]' : ''}
                                    `}
                                >
                                    {cellToken && (
                                        <div className="w-[85%] h-[85%]">
                                            <QuantumPieceUI 
                                                id={cellToken.id} 
                                                player={cellToken.player} 
                                                probabilities={cellToken.probabilities} 
                                                isSelected={false} 
                                                onClick={() => {}}
                                                promotedTo={cellToken.promotedTo}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            <div className="w-full flex justify-between items-center mt-1 px-2">
                <div className="text-lg font-bold text-gray-500">{record.white_player}</div>
            </div>

            {/* Controls */}
            <div className="mt-4 flex flex-col gap-3 bg-gray-900/50 p-3 rounded-lg border border-gray-700 w-full">
                <div className="flex justify-between items-center text-xs text-gray-400">
                    <span>{t.replay}: {record.winner === 'white_wins' ? t.whiteWon : record.winner === 'black_wins' ? t.blackWon : t.draw}</span>
                    <button onClick={onHome} className="px-4 py-1 bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-500/50 text-cyan-300 rounded font-bold">
                        🏠 {t.home}
                    </button>
                </div>
                <div className="flex justify-center gap-2">
                    <button onClick={handleRewindAll} disabled={currentMoveIndex === 0} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded text-lg">
                        ⏮️
                    </button>
                    <button onClick={handlePrev} disabled={currentMoveIndex === 0} className="px-4 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded text-sm font-bold flex-1 max-w-[100px]">
                        ◀ {t.prev}
                    </button>
                    <button onClick={handleNext} disabled={currentMoveIndex === record.moves.length} className="px-4 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded text-sm font-bold flex-1 max-w-[100px]">
                        {t.next} ▶
                    </button>
                    <button onClick={handlePlayAll} disabled={currentMoveIndex === record.moves.length} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded text-lg">
                        ⏭️
                    </button>
                </div>
            </div>
        </div>
    );
}
