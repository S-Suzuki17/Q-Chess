'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSocket } from '../lib/SocketContext';
import { User, TimeControl } from '../types/game';
import { Language, dict } from '../locales/dict';
import { QuantumPieceUI } from './QuantumPieceUI';
import { PieceType } from '../config/gameConfig';
import { v4 as uuidv4 } from 'uuid';
import { Token } from '../lib/GameEngine';

export type EmoteType = 'hello' | 'well_played' | 'wow' | 'thinking' | 'resign';
export const EMOTES: Record<EmoteType, { emoji: string; labelJa: string; labelEn: string }> = {
    hello: { emoji: '👋', labelJa: 'よろしく！', labelEn: 'Hello!' },
    well_played: { emoji: '👏', labelJa: 'ナイス！', labelEn: 'Well played' },
    wow: { emoji: '😲', labelJa: 'えっ！？', labelEn: 'Wow' },
    thinking: { emoji: '🤔', labelJa: 'うーん', labelEn: 'Thinking...' },
    resign: { emoji: '🙏', labelJa: '参りました', labelEn: 'Good game' }
};

interface OnlineGameBoardProps {
    lang: Language;
    user?: User;
    roomId?: string;
    onlineRole?: 'white' | 'black' | 'spectator';
    matchMode?: 'random' | 'private' | 'ranked';
    opponentId?: string;
    timeControl?: TimeControl;
    onHome?: () => void;
}

const mapPossibility = (p: string): PieceType => {
    switch (p) {
        case 'P': return 'Pawn';
        case 'N': return 'Knight';
        case 'B': return 'Bishop';
        case 'R': return 'Rook';
        case 'Q': return 'Queen';
        case 'K': return 'King';
        default: return 'Pawn';
    }
};

export default function OnlineGameBoard({ lang, user, roomId, onlineRole, matchMode, opponentId, timeControl = '10m', onHome }: OnlineGameBoardProps) {
    const t = dict[lang];
    const { socket, isConnected } = useSocket();

    const [gameState, setGameState] = useState<any>(null);
    const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [timeLeftWhite, setTimeLeftWhite] = useState<number>(0);
    const [timeLeftBlack, setTimeLeftBlack] = useState<number>(0);

    const [showEmoteMenu, setShowEmoteMenu] = useState(false);
    const [activeEmotes, setActiveEmotes] = useState<{ white: EmoteType | null, black: EmoteType | null }>({ white: null, black: null });
    const emoteTimers = useRef<{ white: NodeJS.Timeout | null, black: NodeJS.Timeout | null }>({ white: null, black: null });

    const moveSoundRef = useRef<HTMLAudioElement | null>(null);
    useEffect(() => {
        const audio = new Audio('/sounds/spo_ge_syogi04.mp3');
        audio.preload = 'auto';
        moveSoundRef.current = audio;
    }, []);

    const playMoveSound = useCallback(() => {
        if (moveSoundRef.current) {
            moveSoundRef.current.currentTime = 0;
            moveSoundRef.current.playbackRate = 0.85 + Math.random() * 0.3;
            moveSoundRef.current.play().catch(() => {});
        }
    }, []);

    const triggerEmote = useCallback((player: 'white' | 'black', emote: EmoteType) => {
        setActiveEmotes(prev => ({ ...prev, [player]: emote }));
        if (emoteTimers.current[player]) clearTimeout(emoteTimers.current[player]!);
        emoteTimers.current[player] = setTimeout(() => {
            setActiveEmotes(prev => ({ ...prev, [player]: null }));
        }, 3000);
    }, []);

    const sendEmote = useCallback((emote: EmoteType) => {
        if (!roomId || !onlineRole || onlineRole === 'spectator') return;
        if (socket) {
            socket.emit('emote', { roomId, emote, player: onlineRole });
        }
        triggerEmote(onlineRole, emote);
        setShowEmoteMenu(false);
    }, [roomId, onlineRole, triggerEmote, socket]);

    
    useEffect(() => {
        if (isConnected && socket && roomId && gameState) {
            console.log('[OnlineGameBoard] Reconnected, requesting sync_state');
            socket.emit('request_sync', { matchId: roomId });
        }
    }, [isConnected, socket, roomId]);

    useEffect(() => {
        if (!socket || !roomId) return;
        
        socket.emit('connect_match', { matchId: roomId });

        const onMatchStart = (state: any) => {
            setGameState(state);
        };
        const onSyncState = (state: any) => {
            setGameState(state);
            playMoveSound();
        };
        const onActionError = (err: any) => {
            setErrorMsg(err.message || 'Action error');
        };
        const onOpponentDisconnected = () => {
            // Can be handled if server emits it, currently server removes socket.id
        };

        socket.on('match_start', onMatchStart);
        socket.on('sync_state', onSyncState);
        socket.on('action_error', onActionError);
        socket.on('opponent_disconnected', onOpponentDisconnected);

        // Also handle emote broadcasts if we implement it on server, else custom
        socket.on('emote', (data: any) => {
            if (data.player && data.emote) {
                triggerEmote(data.player, data.emote);
                playMoveSound();
            }
        });

        return () => {
            socket.off('match_start', onMatchStart);
            socket.off('sync_state', onSyncState);
            socket.off('action_error', onActionError);
            socket.off('opponent_disconnected', onOpponentDisconnected);
            socket.off('emote');
        };
    }, [socket, roomId, playMoveSound, triggerEmote]);

    // Timer sync
    useEffect(() => {
        if (!gameState || gameState.gameOver) return;
        
        const updateClocks = () => {
            const now = Date.now();
            const elapsed = now - gameState.clock.lastMoveAt;
            let w = gameState.clock.white;
            let b = gameState.clock.black;
            if (gameState.turn === 0) w -= elapsed;
            else b -= elapsed;
            
            setTimeLeftWhite(Math.max(0, Math.floor(w / 1000)));
            setTimeLeftBlack(Math.max(0, Math.floor(b / 1000)));
        };
        
        updateClocks();
        const interval = setInterval(updateClocks, 1000);
        return () => clearInterval(interval);
    }, [gameState]);

    const handleSquareClick = (targetRow: number, targetCol: number) => {
        if (!gameState || gameState.gameOver || onlineRole === 'spectator') return;

        setErrorMsg(null);

        if (selectedTokenId) {
            const numId = parseInt(selectedTokenId.split('_')[1], 10);
            const token = gameState.pieces.find((p: any) => p.id === numId);

            if (token && token.y === targetRow && token.x === targetCol) {
                setSelectedTokenId(null);
                return;
            }

            // Client optimistic action
            socket?.emit('player_action', {
                actionId: uuidv4(),
                version: gameState.version,
                action: {
                    type: 'MOVE',
                    payload: { pieceId: numId, toX: targetCol, toY: targetRow }
                }
            });
            setSelectedTokenId(null);
        } else {
            const clickedPiece = gameState.pieces.find((p: any) => !p.captured && p.y === targetRow && p.x === targetCol);
            if (clickedPiece) {
                const expectedTeam = onlineRole === 'white' ? 0 : 1;
                if (clickedPiece.team !== expectedTeam) {
                    setErrorMsg(expectedTeam === 0 ? t.errNotYourTurnBlue : t.errNotYourTurnRed);
                    return;
                }
                setSelectedTokenId(`token_${clickedPiece.id}`);
            }
        }
    };

    const handleResign = () => {
        if (!gameState || gameState.gameOver || onlineRole === 'spectator') return;
        socket?.emit('player_action', {
            actionId: uuidv4(),
            version: gameState.version,
            action: { type: 'RESIGN', payload: {} }
        });
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // Derived states
    const tokens: Token[] = useMemo(() => {
        if (!gameState) return [];
        return gameState.pieces.map((p: any) => {
            const probabilities: Record<PieceType, number> = { King: 0, Queen: 0, Rook: 0, Bishop: 0, Knight: 0, Pawn: 0 };
            if (p.possibilities && p.possibilities.length > 0) {
                const weight = 1.0 / p.possibilities.length;
                p.possibilities.forEach((pos: string) => {
                    probabilities[mapPossibility(pos)] = weight;
                });
            }
            return {
                id: `token_${p.id}`,
                player: p.team === 0 ? 'white' : 'black',
                row: p.y,
                col: p.x,
                probabilities,
                isCaptured: p.captured
            } as Token;
        });
    }, [gameState]);

    const playerName = user?.name || 'Player';
    const fallbackOpponent = opponentId?.startsWith('GUEST-') ? 'Guest' : 'Opponent';
    const opponentName = fallbackOpponent;
    const myRole = onlineRole === 'spectator' ? 'white' : (onlineRole || 'white');
    const whiteName = onlineRole === 'spectator' ? 'White Player' : (myRole === 'white' ? playerName : opponentName);
    const blackName = onlineRole === 'spectator' ? 'Black Player' : (myRole === 'black' ? playerName : opponentName);

    const currentTurn = gameState ? (gameState.turn === 0 ? 'white' : 'black') : 'white';
    const winnerState = gameState?.gameOver; // 'WHITE' | 'BLACK' | 'DRAW' | null
    const winner = winnerState === 'WHITE' ? 'white_wins' : winnerState === 'BLACK' ? 'black_wins' : winnerState === 'DRAW' ? 'draw' : null;

    if (!gameState) {
        return (
            <div className="flex flex-col items-center w-full max-w-[800px] relative justify-center h-96">
                <div className="text-white text-2xl animate-pulse">Connecting to match...</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center w-full max-w-[800px] relative">
            {roomId && (
                <div className="w-full mb-3 p-3 bg-cyan-950/60 border border-cyan-500/50 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-cyan-400 text-sm font-bold uppercase tracking-wider">ROOM ID:</span>
                        <span className="text-2xl font-black text-cyan-300 tracking-[0.3em] font-mono select-all cursor-pointer"
                              onClick={() => { navigator.clipboard.writeText(roomId); }}
                              title="Click to copy">
                            {roomId}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded font-bold ${onlineRole === 'spectator' ? 'bg-gray-800 text-gray-300 border border-gray-500' : (myRole === 'white' ? 'bg-blue-900 text-blue-300 border border-blue-500/50' : 'bg-red-900 text-red-300 border border-red-500/50')}`}>
                            {onlineRole === 'spectator' ? '👁 SPECTATING' : (myRole === 'white' ? 'YOU: 🟦 WHITE' : 'YOU: 🟥 BLACK')}
                        </span>
                    </div>
                </div>
            )}

            <div className="flex justify-between w-full mb-4 px-4 items-center bg-gray-900/40 py-2 border-b border-cyan-900/50 relative">
                {/* White Player Info */}
                <div className={`text-xl font-bold flex flex-col items-start gap-1 ${currentTurn === 'white' ? 'text-blue-400 drop-shadow-[0_0_5px_currentColor]' : 'text-gray-500'} relative`}>
                    <div className="flex items-center gap-2">
                        🟦 {whiteName}
                    </div>
                    <span className="text-2xl font-mono">{formatTime(timeLeftWhite)}</span>
                    {activeEmotes.white && (
                        <div className="absolute top-10 left-0 bg-white border-2 border-blue-500 rounded-2xl rounded-tl-none px-3 py-1 shadow-lg z-50 animate-bounce">
                            <span className="text-2xl">{EMOTES[activeEmotes.white].emoji}</span>
                        </div>
                    )}
                </div>

                <div className="text-sm font-bold text-red-500 min-h-[20px] mx-4 text-center">
                    {errorMsg}
                </div>

                {/* Black Player Info */}
                <div className={`text-xl font-bold flex flex-col items-end gap-1 ${currentTurn === 'black' ? 'text-red-500 drop-shadow-[0_0_5px_currentColor]' : 'text-gray-500'} relative`}>
                    <div className="flex items-center gap-2">
                        {blackName} 🟥
                    </div>
                    <span className="text-2xl font-mono">{formatTime(timeLeftBlack)}</span>
                    {activeEmotes.black && (
                        <div className="absolute top-10 right-0 bg-white border-2 border-red-500 rounded-2xl rounded-tr-none px-3 py-1 shadow-lg z-50 animate-bounce">
                            <span className="text-2xl">{EMOTES[activeEmotes.black].emoji}</span>
                        </div>
                    )}
                </div>
            </div>

            {winner && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 backdrop-blur-sm rounded-lg border border-gray-800">
                    <div className="text-6xl font-black text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.8)] mb-8 tracking-widest">
                        {winner === 'draw' ? 'DRAW' : 'CHECKMATE'}
                    </div>
                    <div className={`text-4xl font-bold mb-12 ${winner === 'draw' ? 'text-gray-400 drop-shadow-[0_0_15px_rgba(156,163,175,0.8)]' : winner === 'white_wins' ? 'text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.8)]' : 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]'}`}>
                        {winner === 'draw' 
                            ? 'Draw (Stalemate)' 
                            : winner === 'white_wins' 
                                ? `${whiteName} (${t.whiteWon})` 
                                : `${blackName} (${t.blackWon})`}
                    </div>
                    <div className="flex gap-4 mt-8">
                        <button 
                            onClick={onHome || (() => window.location.reload())}
                            className="px-6 py-4 bg-gray-900/50 hover:bg-gray-800/80 border border-gray-500/50 rounded-lg text-lg font-bold tracking-wider transition-all text-gray-300"
                        >
                            🏠 {t.home}
                        </button>
                    </div>
                </div>
            )}

            {/* Black's captured pieces (CPU/Opponent captured) */}
            <div className="w-full flex gap-2 min-h-[48px] mb-2 p-2 bg-black/40 border border-red-900/30 rounded-lg items-center overflow-x-auto">
                <span className="text-red-500/70 font-bold text-xs uppercase whitespace-nowrap min-w-[60px]">{opponentName} {t.captured}:</span>
                <div className="flex gap-1">
                    {tokens.filter(t => t.player === 'white' && t.isCaptured).map(token => (
                        <div key={token.id} className="scale-75 origin-left opacity-80">
                            <QuantumPieceUI id={token.id} player={token.player} probabilities={token.probabilities} isSelected={false} onClick={() => {}} />
                        </div>
                    ))}
                </div>
            </div>

            <div className={`
                grid grid-cols-8 grid-rows-8 border-4 bg-[#0b0c10] shadow-2xl w-full aspect-square relative transition-all duration-300
                border-gray-700 shadow-gray-900
            `}>
                {Array.from({ length: 64 }).map((_, index) => {
                    const isFlipped = onlineRole === 'black';
                    const visualRow = Math.floor(index / 8);
                    const visualCol = index % 8;
                    const row = isFlipped ? 7 - visualRow : visualRow;
                    const col = isFlipped ? 7 - visualCol : visualCol;
                    const isDark = (row + col) % 2 === 1;
                    const tokenHere = tokens.find(t => !t.isCaptured && t.row === row && t.col === col);
                    const isSelected = tokenHere?.id === selectedTokenId;

                    return (
                        <div 
                            key={index}
                            onClick={() => handleSquareClick(row, col)}
                            className={`
                                relative flex justify-center items-center cursor-pointer transition-colors
                                aspect-square w-full h-full
                                ${isDark ? 'bg-[#1a202c]' : 'bg-[#2d3748]'}
                                hover:bg-white/10
                            `}
                        >
                            {tokens.filter(t => !t.isCaptured && t.row === row && t.col === col).map(token => (
                                <QuantumPieceUI 
                                    key={token.id}
                                    id={token.id}
                                    player={token.player}
                                    probabilities={token.probabilities}
                                    isSelected={token.id === selectedTokenId}
                                    onClick={() => {}} 
                                />
                            ))}
                        </div>
                    );
                })}
            </div>
            
            {/* White's captured pieces */}
            <div className="w-full flex gap-2 min-h-[48px] mt-2 p-2 bg-black/40 border border-blue-900/30 rounded-lg items-center overflow-x-auto">
                <span className="text-blue-400/70 font-bold text-xs uppercase whitespace-nowrap min-w-[60px]">{playerName} {t.captured}:</span>
                <div className="flex gap-1">
                    {tokens.filter(t => t.player === 'black' && t.isCaptured).map(token => (
                        <div key={token.id} className="scale-75 origin-left opacity-80">
                            <QuantumPieceUI id={token.id} player={token.player} probabilities={token.probabilities} isSelected={false} onClick={() => {}} />
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="mt-4 text-[#00ff41] text-sm opacity-80 text-center px-4">
                {t.tips}
            </div>

            {/* Emote Button & Menu */}
            {roomId && onlineRole && onlineRole !== 'spectator' && !winner && (
                <div className="fixed bottom-4 right-4 z-40">
                    <button
                        onClick={() => setShowEmoteMenu(prev => !prev)}
                        className="w-14 h-14 bg-indigo-900 border-2 border-indigo-500 rounded-full flex items-center justify-center text-3xl shadow-[0_0_15px_rgba(99,102,241,0.5)] hover:scale-110 transition-transform"
                    >
                        💬
                    </button>
                    {showEmoteMenu && (
                        <div className="absolute bottom-16 right-0 bg-gray-900 border border-indigo-500 rounded-xl p-2 flex flex-col gap-2 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                            <button
                                onClick={handleResign}
                                className="flex items-center gap-3 px-4 py-2 hover:bg-red-900/50 rounded transition-colors whitespace-nowrap text-left border-b border-gray-700 pb-2 mb-2"
                            >
                                <span className="text-2xl">🏳️</span>
                                <span className="text-red-400 text-sm font-bold">Resign</span>
                            </button>
                            {(Object.keys(EMOTES) as EmoteType[]).map(key => (
                                <button
                                    key={key}
                                    onClick={() => sendEmote(key)}
                                    className="flex items-center gap-3 px-4 py-2 hover:bg-indigo-900/50 rounded transition-colors whitespace-nowrap text-left"
                                >
                                    <span className="text-2xl">{EMOTES[key].emoji}</span>
                                    <span className="text-gray-300 text-sm font-bold">{lang === 'ja' ? EMOTES[key].labelJa : EMOTES[key].labelEn}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
