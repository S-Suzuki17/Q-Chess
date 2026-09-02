'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSocket } from '../lib/SocketContext';
import { User, TimeControl } from '../types/game';
import { Language, dict } from '../locales/dict';
import { QuantumPieceUI } from './QuantumPieceUI';
import { AdBanner } from './AdBanner';
import { PieceType } from '../config/gameConfig';
import { v4 as uuidv4 } from 'uuid';
import { Token, deduceMoveTypes } from '../lib/GameEngine';
import { supabase } from '../lib/supabaseClient';

export type EmoteType = 'hello' | 'well_played' | 'wow' | 'thinking' | 'resign';
export const EMOTES: Record<EmoteType, { emoji: string; labelJa: string; labelEn: string }> = {
    hello: { emoji: '👋', labelJa: 'よろしく！', labelEn: 'Hello!' },
    well_played: { emoji: '👏', labelJa: 'ナイス！', labelEn: 'Well played' },
    wow: { emoji: '😮', labelJa: 'おお！', labelEn: 'Wow' },
    thinking: { emoji: '🤔', labelJa: 'うーん...', labelEn: 'Thinking...' },
    resign: { emoji: '🏳️', labelJa: '参りました', labelEn: 'Good game' }
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
    const t = { ...dict['en'], ...(dict[lang] || {}) } as any;
    const { socket, isConnected } = useSocket();

    const [gameState, setGameState] = useState<any>(null);
    const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
    const [showMoveHints, setShowMoveHints] = useState<boolean>(true);
    const [showResignConfirm, setShowResignConfirm] = useState<boolean>(false);
    const [promotionPending, setPromotionPending] = useState<{
        pieceId: number;
        targetRow: number;
        targetCol: number;
    } | null>(null);

    // Latency Measurement
    const [latency, setLatency] = useState<number | null>(null);

    useEffect(() => {
        if (!socket || !isConnected) return;
        
        const onPong = (data: { clientTime: number, serverTime: number }) => {
            const currentLatency = Date.now() - data.clientTime;
            setLatency(currentLatency);
        };
        
        socket.on('pong', onPong);
        
        const pingInterval = setInterval(() => {
            socket.emit('ping', { clientTime: Date.now() });
        }, 2000);

        return () => {
            socket.off('pong', onPong);
            clearInterval(pingInterval);
        };
    }, [socket, isConnected]);

    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [castlingPending, setCastlingPending] = useState<{
        pieceId: number;
        targetRow: number;
        targetCol: number;
        validTypes: string[];
    } | null>(null);

    const [timeLeftWhite, setTimeLeftWhite] = useState<number>(0);
    const [timeLeftBlack, setTimeLeftBlack] = useState<number>(0);

    const [fetchedOpponentName, setFetchedOpponentName] = useState<string | null>(null);

    const [disconnectTimeLeft, setDisconnectTimeLeft] = useState<number | null>(null);
    const disconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

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

    // Fetch opponent's display name from Supabase profiles
    useEffect(() => {
        let targetId = opponentId;
        if (!targetId && gameState?.players) {
            const myId = user?.id || '';
            const myClean = myId.replace('GUEST-', '');
            const hostClean = (gameState.players.host || '').replace('GUEST-', '');
            const joinerClean = (gameState.players.joiner || '').replace('GUEST-', '');
            targetId = myClean === hostClean ? joinerClean : hostClean;
        }

        if (!targetId) return;

        const isGuest = targetId.startsWith('GUEST-');
        if (isGuest) {
            setFetchedOpponentName(lang === 'ja' ? 'ゲスト' : 'Guest');
            return;
        }

        const fetchProfileName = async () => {
            try {
                const { data } = await supabase
                    .from('profiles')
                    .select('name')
                    .eq('id', targetId)
                    .single();
                if (data?.name) {
                    setFetchedOpponentName(data.name);
                } else {
                    setFetchedOpponentName(lang === 'ja' ? 'プレイヤー' : 'Player');
                }
            } catch (e) {
                setFetchedOpponentName(lang === 'ja' ? 'プレイヤー' : 'Player');
            }
        };

        fetchProfileName();
    }, [opponentId, gameState?.players, user?.id, lang]);

    // Connect & Sync on mount or reconnection
    useEffect(() => {
        if (!socket || !roomId) return;

        const syncMatch = () => {
            console.log('[OnlineGameBoard] Connecting/Syncing match:', roomId, 'User:', user?.name);
            socket.emit('connect_match', { matchId: roomId, userName: user?.name, avatarUrl: user?.avatar_url });
            socket.emit('request_sync', { matchId: roomId });
        };

        syncMatch();

        const onMatchStart = (state: any) => {
            console.log('[OnlineGameBoard] match_start received:', state);
            setGameState(state);
        };
        const onSyncState = (state: any) => {
            setGameState(state);
            playMoveSound();
            if (disconnectTimerRef.current) {
                clearInterval(disconnectTimerRef.current);
                disconnectTimerRef.current = null;
            }
            setDisconnectTimeLeft(null);
        };
        const onActionError = (err: any) => {
            setErrorMsg(err.message || 'Action error');
        };
        const onOpponentDisconnected = (data: any) => {
            console.log('[OnlineGameBoard] Opponent disconnected:', data);
            if (disconnectTimerRef.current) clearInterval(disconnectTimerRef.current);
            let timeLeft = data?.gracePeriodSeconds || 120;
            setDisconnectTimeLeft(timeLeft);
            disconnectTimerRef.current = setInterval(() => {
                timeLeft--;
                setDisconnectTimeLeft(timeLeft);
                if (timeLeft <= 0) {
                    if (disconnectTimerRef.current) clearInterval(disconnectTimerRef.current);
                    disconnectTimerRef.current = null;
                    setDisconnectTimeLeft(null);
                }
            }, 1000);
        };
        const onOpponentReconnected = () => {
            console.log('[OnlineGameBoard] Opponent reconnected!');
            if (disconnectTimerRef.current) {
                clearInterval(disconnectTimerRef.current);
                disconnectTimerRef.current = null;
            }
            setDisconnectTimeLeft(null);
        };
        const onMatchForfeited = (data: any) => {
            console.log('[OnlineGameBoard] Match forfeited:', data);
            if (disconnectTimerRef.current) {
                clearInterval(disconnectTimerRef.current);
                disconnectTimerRef.current = null;
            }
            setDisconnectTimeLeft(null);
        };

        const onEmote = (data: any) => {
            console.log('[OnlineGameBoard] Received emote:', data);
            if (data.player && data.emote) {
                triggerEmote(data.player, data.emote);
                playMoveSound();
            }
        };

        socket.on('match_start', onMatchStart);
        socket.on('sync_state', onSyncState);
        socket.on('action_error', onActionError);
        socket.on('opponent_disconnected', onOpponentDisconnected);
        socket.on('opponent_reconnected', onOpponentReconnected);
        socket.on('match_forfeited', onMatchForfeited);
        socket.on('emote', onEmote);

        return () => {
            socket.off('match_start', onMatchStart);
            socket.off('sync_state', onSyncState);
            socket.off('action_error', onActionError);
            socket.off('opponent_disconnected', onOpponentDisconnected);
            socket.off('opponent_reconnected', onOpponentReconnected);
            socket.off('match_forfeited', onMatchForfeited);
            socket.off('emote', onEmote);
            if (disconnectTimerRef.current) {
                clearInterval(disconnectTimerRef.current);
                disconnectTimerRef.current = null;
            }
        };
    }, [socket, roomId, isConnected, user?.name, playMoveSound, triggerEmote]);

    // Timer sync
    useEffect(() => {
        if (!gameState) return;
        
        if (gameState.gameOver) {
            setTimeLeftWhite(Math.max(0, Math.floor(gameState.clock.white / 1000)));
            setTimeLeftBlack(Math.max(0, Math.floor(gameState.clock.black / 1000)));
            if (typeof window !== 'undefined') {
                localStorage.removeItem('qg_active_online_match');
            }
            return;
        }

        const localStartTime = Date.now();
        const updateClocks = () => {
            const elapsed = Date.now() - localStartTime;
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
            
            // Check if clicking own another piece to switch selection
            const clickedOtherPiece = gameState.pieces.find((p: any) => !p.captured && p.y === targetRow && p.x === targetCol);
            const expectedTeam = onlineRole === 'white' ? 0 : 1;
            
            if (clickedOtherPiece && clickedOtherPiece.team === expectedTeam) {
                setSelectedTokenId(`token_${clickedOtherPiece.id}`);
                return;
            }

            // Client optimistic action (will be intercepted if ambiguous)
            const token = gameState.pieces.find((p: any) => p.id === numId);
            if (token && Math.abs(targetCol - token.x) === 2 && Math.abs(targetRow - token.y) === 0) {
                // Determine if it's ambiguous
                // Check if it CAN be King AND (Rook OR Queen)
                const canBeKing = token.possibilities.includes('K');
                const canBeRook = token.possibilities.includes('R');
                const canBeQueen = token.possibilities.includes('Q');
                if (canBeKing && (canBeRook || canBeQueen)) {
                    setCastlingPending({
                        pieceId: numId,
                        targetRow,
                        targetCol,
                        validTypes: token.possibilities
                    });
                    return;
                }
            }

            socket?.emit('player_action', {
                actionId: crypto.randomUUID(),
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
        setShowEmoteMenu(false);
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
                isCaptured: p.captured,
                probabilities,
                hasMoved: false
            } as Token;
        });
    }, [gameState]);

    const validMoves = useMemo(() => {
        if (!selectedTokenId || !gameState) return [];
        const token = tokens.find(t => t.id === selectedTokenId);
        if (!token) return [];
        
        const moves: {r: number, c: number}[] = [];
        const currentPossibilities = new Set(Object.keys(token.probabilities).filter(k => token.probabilities[k as PieceType] > 0));

        let lastMoveObj = undefined;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (r === token.row && c === token.col) continue;
                
                const targetToken = tokens.find(t => !t.isCaptured && t.row === r && t.col === c);
                if (targetToken && targetToken.player === token.player) continue;

                const possibleTypes = deduceMoveTypes(token, r, c, tokens, lastMoveObj);
                if (possibleTypes.some(type => currentPossibilities.has(type))) {
                    moves.push({r, c});
                }
            }
        }
        return moves;
    }, [selectedTokenId, tokens, gameState]);

    const currentTurn = gameState?.turn === 0 ? 'white' : 'black';
    const myRole = onlineRole || 'white';
    const isMyTurn = myRole === currentTurn;

    // Robust winner calculation
    const winner = useMemo(() => {
        if (!gameState?.gameOver) return null;
        const go = typeof gameState.gameOver === 'object' ? (gameState.gameOver as any).winner : gameState.gameOver;
        if (go === 'WHITE') return 'white_wins';
        if (go === 'BLACK') return 'black_wins';
        return 'draw';
    }, [gameState]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const hostServerName = gameState?.playerNames?.host;
    const joinerServerName = gameState?.playerNames?.joiner;
    const hostAvatarUrl = (gameState as any)?.playerAvatars?.host;
    const joinerAvatarUrl = (gameState as any)?.playerAvatars?.joiner;

    const guestLabel = lang === 'ja' ? 'ゲスト' : 'Guest';
    const playerLabel = lang === 'ja' ? 'プレイヤー' : 'Player';

    const getOpponentLabel = (id?: string, serverName?: string, fetchedName?: string | null) => {
        if (fetchedName) return fetchedName;
        if (serverName) return serverName;
        if (!id) return playerLabel;
        if (id.startsWith('GUEST-')) return guestLabel;
        return playerLabel;
    };

    const isHost = onlineRole === 'white';
    const opponentServerName = isHost ? joinerServerName : hostServerName;
    const resolvedOpponent = getOpponentLabel(opponentId, opponentServerName, fetchedOpponentName);

    const whiteName = isHost ? (user?.name || playerLabel) : resolvedOpponent;
    const blackName = !isHost ? (user?.name || playerLabel) : resolvedOpponent;
    const playerName = isHost ? whiteName : blackName;
    const opponentName = isHost ? blackName : whiteName;

    if (!gameState) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-black/60 border border-cyan-900/50 rounded-xl max-w-lg w-full">
                <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-cyan-400 font-mono tracking-widest text-sm animate-pulse">
                    {lang === 'ja' ? 'サーバーと対局データを同期中...' : 'CONNECTING TO GAME SERVER...'}
                </p>
                <button 
                    onClick={onHome || (() => window.location.reload())}
                    className="mt-6 px-4 py-2 bg-gray-900 border border-[#A89C86]/30 rounded text-xs text-gray-400 hover:text-[#E8E2D7] transition-colors"
                >
                    {t.home}
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center w-full h-full max-h-[100dvh] max-w-[800px] mx-auto relative select-none touch-none overflow-hidden pb-4">
            {/* Disconnection Banner */}
            {disconnectTimeLeft !== null && (
                <div className="w-full mb-3 p-3 bg-red-950/80 border border-red-500 rounded-lg flex flex-col items-center justify-center animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]">
                    <span className="text-[#E8E2D7] font-bold text-sm md:text-base">
                        {lang === 'ja' ? '⚠️ 相手の通信が切断されました。再接続を待っています...' : '⚠️ Opponent disconnected. Waiting for reconnection...'}
                    </span>
                    <span className="text-red-300 font-mono text-xl mt-1 font-black">
                        {Math.floor(disconnectTimeLeft / 60)}:{(disconnectTimeLeft % 60).toString().padStart(2, '0')}
                    </span>
                </div>
            )}

            <div className="flex justify-between w-full mb-4 px-4 items-center bg-[#191714]/80 py-3 border-b border-[#B39A62]/20 shadow-lg relative">
                {/* White Player Info */}
                <div className={`text-xl font-bold flex flex-col items-start gap-1 ${currentTurn === 'white' ? 'text-[#E8E2D7] drop-shadow-[0_0_8px_rgba(232,226,215,0.4)]' : 'text-[#A89C86]'} relative`}>
                    <div className="flex items-center gap-2">
                        {(() => {
                            const av = isHost ? (user?.avatar_url || hostAvatarUrl) : joinerAvatarUrl;
                            return av ? <img src={av} alt="" className="w-7 h-7 rounded-full object-cover border border-[#E8E2D7]/50" /> : <div className="w-7 h-7 rounded-full bg-[#191714] border border-[#E8E2D7]/50 flex items-center justify-center"><span className="text-xs">👤</span></div>;
                        })()}
                        {whiteName} {onlineRole === 'white' && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 font-normal">YOU</span>}
                    </div>
                    <span className="text-2xl font-mono">{formatTime(timeLeftWhite)}</span>
                    {activeEmotes.white && (
                        <div className="absolute top-10 left-0 bg-white border-2 border-blue-500 rounded-2xl rounded-tl-none px-3 py-1 shadow-lg z-50 animate-bounce">
                            <span className="text-2xl">{EMOTES[activeEmotes.white].emoji}</span>
                        </div>
                    )}
                </div>

                <div className="flex flex-col items-center justify-center gap-1">
                    {latency !== null && (
                        <div className={`text-[10px] font-mono px-2 py-0.5 rounded ${latency < 100 ? 'text-green-400 bg-green-900/20' : latency < 300 ? 'text-yellow-400 bg-yellow-900/20' : 'text-[#E8E2D7] bg-red-900/20'}`}>
                            {latency}ms
                        </div>
                    )}
                    <div className="text-sm font-bold text-red-900 min-h-[20px] mx-4 text-center">
                        {errorMsg}
                    </div>
                </div>

                {/* Black Player Info */}
                <div className={`text-xl font-bold flex flex-col items-end gap-1 ${currentTurn === 'black' ? 'text-red-900 drop-shadow-[0_0_5px_currentColor]' : 'text-[#A89C86]'} relative`}>
                    <div className="flex items-center gap-2">
                        {onlineRole === 'black' && <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 font-normal">YOU</span>} {blackName}
                        {(() => {
                            const av = !isHost ? (user?.avatar_url || joinerAvatarUrl) : hostAvatarUrl;
                            return av ? <img src={av} alt="" className="w-7 h-7 rounded-full object-cover border border-red-500/50" /> : <div className="w-7 h-7 rounded-full bg-[#191714] border border-red-500/50 flex items-center justify-center"><span className="text-xs">👤</span></div>;
                        })()}
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
                <div className="absolute inset-0 bg-[#11100E]/90 flex flex-col items-center justify-center z-50 backdrop-blur-sm rounded-lg border border-[#B39A62]/20">
                    <div className="flex flex-col items-center gap-6 px-6 max-w-full">
                        <div className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-[#E8E2D7] tracking-[0.2em] text-center animate-stamp">
                            {winner === 'draw' ? 'DRAW' : 'CHECKMATE'}
                        </div>
                        <div className="w-16 h-px bg-[#B39A62]/50"></div>
                        <div className={`text-base sm:text-lg md:text-xl font-serif tracking-widest text-center ${winner === 'draw' ? 'text-[#A89C86]' : (winner === 'white_wins' && onlineRole === 'white') || (winner === 'black_wins' && onlineRole === 'black') ? 'text-[#E8E2D7]' : 'text-[#A89C86]'}`}>
                            {winner === 'draw' 
                                ? 'Draw (Stalemate)' 
                                : (winner === 'white_wins' && onlineRole === 'white') || (winner === 'black_wins' && onlineRole === 'black')
                                    ? (lang === 'ja' ? '勝利 (YOU WIN)' : 'YOU WIN!')
                                    : (lang === 'ja' ? '敗北 (YOU LOSE)' : 'YOU LOSE...')}
                        </div>
                        <div className="flex flex-wrap gap-3 mt-4 justify-center">
                            <button 
                                onClick={() => window.location.reload()}
                                className="px-5 py-3 bg-[#191714] hover:bg-[#2A2621] border border-[#A89C86]/30 rounded text-sm font-serif tracking-widest transition-colors text-[#A89C86] hover:text-[#E8E2D7]"
                            >
                                {t.home || 'HOME'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Black's captured pieces (CPU/Opponent captured) */}
            <div className="w-full flex gap-2 min-h-[48px] mb-2 p-2 bg-black/40 border border-red-900/30 rounded-lg items-center overflow-x-auto shrink-0">
                <div className="flex items-center gap-2 min-w-[100px] shrink-0 opacity-70">
                        {onlineRole === 'white' && joinerAvatarUrl ? (
                            <img src={joinerAvatarUrl} alt="" className="w-6 h-6 rounded-full object-cover border border-red-900/50" />
                        ) : onlineRole === 'black' && hostAvatarUrl ? (
                            <img src={hostAvatarUrl} alt="" className="w-6 h-6 rounded-full object-cover border border-red-900/50" />
                        ) : (
                            <div className="w-6 h-6 rounded-full bg-red-950/30 flex items-center justify-center border border-red-900/50"><span className="text-[10px] opacity-50">👤</span></div>
                        )}
                        <span className="text-red-900 font-bold text-xs uppercase whitespace-nowrap">{opponentName} {t.captured}:</span>
                    </div>
                <div className="flex gap-1">
                    {tokens.filter(t => t.player === 'white' && t.isCaptured).map(token => (
                        <div key={token.id} className="scale-75 origin-left opacity-80">
                            <QuantumPieceUI id={token.id} player={token.player} probabilities={token.probabilities} isSelected={false} onClick={() => {}} />
                        </div>
                    ))}
                </div>
            </div>

            <div className="w-full flex-1 min-h-0 flex items-center justify-center">
                <div className={`
                    grid grid-cols-8 grid-rows-8 border-4 bg-[#0b0c10] shadow-2xl w-full max-w-[calc(100dvh-260px)] aspect-square relative transition-all duration-300
                    border-[#A89C86]/30 shadow-gray-900
                `}>
                {Array.from({ length: 64 }).map((_, index) => {
                    const isFlipped = onlineRole !== 'black';
                    const visualRow = Math.floor(index / 8);
                    const visualCol = index % 8;
                    const row = isFlipped ? 7 - visualRow : visualRow;
                    const col = isFlipped ? 7 - visualCol : visualCol;
                    const isDark = (row + col) % 2 === 1;
                    const tokenHere = tokens.find(t => !t.isCaptured && t.row === row && t.col === col);
                    const isSelected = tokenHere?.id === selectedTokenId;
                    const isMoveCandidate = showMoveHints && validMoves.some(m => m.r === row && m.c === col);

                    return (
                        <div 
                            key={index}
                            onClick={() => handleSquareClick(row, col)}
                            className={`
                                relative flex justify-center items-center cursor-pointer transition-colors
                                aspect-square w-full h-full
                                ${isDark ? 'bg-[#11100E]' : 'bg-[#191714]'}
                                ${isMoveCandidate ? 'hover:bg-[#B39A62]/20' : 'hover:bg-[#E8E2D7]/5'}
                            `}
                        >
                            {isMoveCandidate && !tokenHere && (
                                <div className="absolute w-4 h-4 rounded-full bg-[#B39A62]/40 pointer-events-none animate-pulse" />
                            )}
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
            </div>
            
            {/* White's captured pieces */}
            <div className="w-full flex gap-2 min-h-[48px] mt-2 p-2 bg-black/40 border border-blue-900/30 rounded-lg items-center overflow-x-auto shrink-0">
                <span className="text-blue-400/70 font-bold text-xs uppercase whitespace-nowrap min-w-[60px]">{playerName} {t.captured}:</span>
                <div className="flex gap-1">
                    {tokens.filter(t => t.player === 'black' && t.isCaptured).map(token => (
                        <div key={token.id} className="scale-75 origin-left opacity-80">
                            <QuantumPieceUI id={token.id} player={token.player} probabilities={token.probabilities} isSelected={false} onClick={() => {}} />
                        </div>
                    ))}
                </div>
            </div>
            
            {/* Control Bar: Move hints toggle & Resign button */}
            <div className="w-full flex justify-between items-center px-4 mt-4">
                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-gray-200 transition-colors select-none">
                    <input 
                        type="checkbox" 
                        checked={showMoveHints} 
                        onChange={(e) => setShowMoveHints(e.target.checked)} 
                        className="rounded border-[#A89C86]/30 bg-[#191714] text-cyan-500 focus:ring-cyan-500/50 w-4 h-4 cursor-pointer" 
                    />
                    {lang === 'ja' ? 'コマの移動範囲を表示' : 'Show movable range'}
                </label>

                {!winner && onlineRole !== 'spectator' && (
                    <button
                        onClick={() => setShowResignConfirm(true)}
                        className="px-3 py-1.5 bg-red-950/50 hover:bg-red-900/80 border border-red-800/80 hover:border-red-900/50 rounded text-xs text-[#E8E2D7] hover:text-red-200 font-bold transition-all flex items-center gap-1.5 shadow-sm"
                    >
                        <span>🏳️</span>
                        <span>{lang === 'ja' ? '投了' : 'Resign'}</span>
                    </button>
                )}
            </div>

            <div className="mt-4 text-[#00ff41] text-sm opacity-80 text-center px-4">
                {t.tips}
            </div>

            {/* Resign Confirmation Modal */}
            {/* Promotion Modal */}
            {promotionPending && (
                <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
                    <div className="bg-[#161513] border border-[#B39A62]/30 p-8 rounded-lg max-w-sm w-full text-center shadow-2xl">
                        <h3 className="text-xl tracking-[0.2em] font-serif text-[#E8E2D7] mb-2">{lang === 'ja' ? 'プロモーション' : 'Promotion'}</h3>
                        <p className="text-[#A89C86] text-xs tracking-widest mb-6 font-serif">{lang === 'ja' ? 'どの駒に昇格しますか？' : 'Choose a piece to promote to:'}</p>
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            {(['Queen', 'Rook', 'Bishop', 'Knight'] as const).map(pt => (
                                <button
                                    key={pt}
                                    onClick={() => {
                                        const pTo = pt === 'Queen' ? 'Q' : pt === 'Rook' ? 'R' : pt === 'Bishop' ? 'B' : 'N';
                                        socket?.emit('player_action', {
                                            actionId: crypto.randomUUID(),
                                            version: gameState.version,
                                            action: {
                                                type: 'MOVE',
                                                payload: { 
                                                    pieceId: promotionPending.pieceId, 
                                                    toX: promotionPending.targetCol, 
                                                    toY: promotionPending.targetRow,
                                                    promotedTo: pTo
                                                }
                                            }
                                        });
                                        setPromotionPending(null);
                                        setSelectedTokenId(null);
                                    }}
                                    className="p-4 bg-[#191714] border border-[#B39A62]/30 hover:bg-[#B39A62] hover:text-[#11100E] rounded text-[#E8E2D7] font-serif tracking-widest transition-all"
                                >
                                    {pt}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => {
                                setPromotionPending(null);
                                setSelectedTokenId(null);
                            }}
                            className="w-full p-3 bg-red-950/40 border border-red-500/30 hover:bg-[#2A2621] hover:border-red-400 rounded text-red-300 font-bold transition-all text-sm"
                        >
                            {lang === 'ja' ? 'キャンセル' : 'Cancel'}
                        </button>
                    </div>
                        <div className="w-full max-w-sm mt-12 bg-black/50 p-4 rounded-lg">
                            <p className="text-[#A89C86] text-[10px] tracking-widest text-center mb-2">Advertisement</p>
                            <AdBanner adClient="ca-pub-1116866075179199" adSlot="8798363654" />
                        </div>
                    </div>
                )}
            
            {showResignConfirm && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-[#161513] border border-[#B39A62]/30 rounded-xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center">
                        <span className="text-4xl mb-3">🏳️</span>
                        <h3 className="text-lg font-bold text-[#E8E2D7] mb-2">
                            {lang === 'ja' ? '投了しますか？' : 'Resign Match?'}
                        </h3>
                        <p className="text-sm text-gray-400 mb-6">
                            {lang === 'ja' ? '投了すると相手の勝利となります。本当に対局を終了しますか？' : 'Resigning will forfeit the match to your opponent. Are you sure?'}
                        </p>
                        <div className="flex gap-3 w-full">
                            <button
                                onClick={() => setShowResignConfirm(false)}
                                className="flex-1 py-2.5 bg-[#191714] hover:bg-gray-700 border border-gray-600 rounded-lg text-sm text-[#E8E2D7] font-bold transition-colors"
                            >
                                {lang === 'ja' ? 'キャンセル' : 'Cancel'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowResignConfirm(false);
                                    handleResign();
                                }}
                                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm text-[#E8E2D7] font-bold transition-colors shadow-lg shadow-red-600/30"
                            >
                                {lang === 'ja' ? '投了する' : 'Resign'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Emote Button & Menu */}
            {roomId && onlineRole && onlineRole !== 'spectator' && !winner && (
                <div className="fixed bottom-4 right-4 z-40">
                    <button
                        onClick={() => setShowEmoteMenu(prev => !prev)}
                        className="w-14 h-14 bg-[#191714] border-2 border-[#B39A62]/50 rounded-full flex items-center justify-center text-3xl shadow-[0_0_15px_rgba(179,154,98,0.3)] hover:scale-110 transition-transform"
                    >
                        💬
                    </button>
                    {showEmoteMenu && (
                        <div className="absolute bottom-16 right-0 bg-[#11100E] border border-[#B39A62]/30 rounded-xl p-2 flex flex-col gap-2 shadow-[0_0_20px_rgba(179,154,98,0.2)]">
                            <button
                                onClick={() => {
                                    setShowEmoteMenu(false);
                                    setShowResignConfirm(true);
                                }}
                                className="flex items-center gap-3 px-4 py-2 hover:bg-[#2A2621] rounded transition-colors whitespace-nowrap text-left border-b border-[#A89C86]/30 pb-2 mb-2"
                            >
                                <span className="text-2xl">🏳️</span>
                                <span className="text-[#E8E2D7] text-sm font-bold">{lang === 'ja' ? '投了' : 'Resign'}</span>
                            </button>
                            {(Object.keys(EMOTES) as EmoteType[]).map(key => (
                                <button
                                    key={key}
                                    onClick={() => sendEmote(key)}
                                    className="flex items-center gap-3 px-4 py-2 hover:bg-[#2A2621] rounded transition-colors whitespace-nowrap text-left"
                                >
                                    <span className="text-2xl">{EMOTES[key].emoji}</span>
                                    <span className="text-[#E8E2D7] text-sm font-bold">{lang === 'ja' ? EMOTES[key].labelJa : EMOTES[key].labelEn}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
