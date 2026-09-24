'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { matchText } from '../locales/matchText';
import { useBoardPreferences } from '../hooks/useBoardPreferences';
import { useSocket } from '../lib/SocketContext';
import { User, TimeControl } from '../types/game';
import { Language, dict } from '../locales/dict';
import { QuantumPieceUI } from './QuantumPieceUI';
import { Board3D } from './Board3D';
import { MatchResultDialog } from './MatchResultDialog';
import { MatchIntro } from './MatchIntro';
import { MatchLayout } from './MatchLayout';
import { Board2D } from './Board2D';
import { PieceType } from '../config/gameConfig';
import { v4 as uuidv4 } from 'uuid';
import { Token } from '../lib/GameEngine';
import { filterPossibilities, onlineKingInCheck } from '../lib/onlineMovement';
import { supabase } from '../lib/supabaseClient';
import { isRatedPlayer, openingRating } from '../lib/onlineRatings';
import { cpuOpponent, ratingSettlement, type RatingSettlement } from '../lib/rankedProtocol';
import { RankedSettlement } from './RankedSettlement';
import { rankedText, cancelledRankedText } from '../locales/rankedText';
import { RankedLoginDialog } from './RankedLoginDialog';
import { soundManager } from '../lib/SoundService';
import { acceptsOnlineSnapshot, isNewOnlineMove } from '../lib/onlineSnapshot';

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

export default function OnlineGameBoard({ lang, user, roomId, onlineRole: initialOnlineRole, matchMode, opponentId, timeControl = '10m', onHome }: OnlineGameBoardProps) {
    const t = { ...dict['en'], ...(dict[lang] || {}) } as any;
    const { socket, isConnected, connectionError } = useSocket();

    const [gameState, setGameState] = useState<any>(null);
    const [settledRating,setSettledRating]=useState<RatingSettlement|null>(null);
    const [showRankedLogin,setShowRankedLogin]=useState(false);
    const [cancelledMatch,setCancelledMatch]=useState<string|null>(null);
    const cpu=cpuOpponent(gameState?.cpu);
    useEffect(()=>{
        if(!socket)return;
        const settled=(data:unknown)=>{const receipt=ratingSettlement(data,roomId,user?.id);if(receipt)setSettledRating(receipt);};
        socket.on('rating_settled',settled);
        return()=>{socket.off('rating_settled',settled);};
    },[socket,roomId,user?.id]);
    useEffect(()=>{
        if(!socket)return;
        const cancelled=(data:{matchId?:string})=>{
            if(data?.matchId!==roomId)return;
            setCancelledMatch(roomId??null);
            localStorage.removeItem('qg_active_online_match');
        };
        socket.on('match_cancelled',cancelled);
        return()=>{socket.off('match_cancelled',cancelled);};
    },[socket,roomId]);
    const [latency, setLatency] = useState<number | null>(null);
    const [introDuration,setIntroDuration]=useState(0);
    const [matchReady,setMatchReady]=useState(true);
    const introSeen=useRef<string|null>(null);
    const introCompleted=useRef(false);
    const [ratings,setRatings]=useState<Record<string,number>>({});
    const [ratingLookupKey,setRatingLookupKey]=useState('');
    const hostId=gameState?.players?.host as string|undefined,joinerId=gameState?.players?.joiner as string|undefined;
    const ratingKey=JSON.stringify([roomId,timeControl,hostId,joinerId]);
    const ratingsReady=gameState?.playerRatings!==undefined||ratingLookupKey===ratingKey||![hostId,joinerId].some(isRatedPlayer);
    const whiteRating=cpu?.side==='host'?null:openingRating(hostId,gameState?.playerRatings?.host,ratingLookupKey===ratingKey?ratings[hostId??'']:undefined);
    const blackRating=cpu?.side==='joiner'?null:openingRating(joinerId,gameState?.playerRatings?.joiner,ratingLookupKey===ratingKey?ratings[joinerId??'']:undefined);
    const serverOffset=useRef(0);
    const finishIntro=()=>{
        introCompleted.current=true;
        setIntroDuration(0);
        socket?.emit('intro_ready',{matchId:roomId});
    };
    useEffect(()=>{
        if(!gameState)return;
        if(gameState.introPending){
            setMatchReady(false);
            // Legacy servers lack the opening snapshot. Bound the profile wait before
            // starting the intro timer, while the authoritative clock is still paused.
            if(!ratingsReady)return;
            if(introSeen.current!==roomId&&initialOnlineRole!=='spectator'){
                introSeen.current=roomId??null;introCompleted.current=false;setIntroDuration(3200);
            }else if(introCompleted.current)socket?.emit('intro_ready',{matchId:roomId});
            return;
        }
        const assumedDelivery = latency ? latency / 2 : 150;
        const timeSinceReceipt = performance.now() - (gameState.receivedAt ?? performance.now());
        const estimatedServerTime = (gameState.serverNow ?? Date.now()) + assumedDelivery + timeSinceReceipt;
        const wait = Number.isFinite(gameState.startsAt) ? Math.max(0, gameState.startsAt - estimatedServerTime) : 0;
        setMatchReady(wait===0);
        const timer=setTimeout(()=>setMatchReady(true),wait);
        return()=>clearTimeout(timer);
    },[gameState,roomId,initialOnlineRole,socket,introDuration,latency,ratingsReady]);
    // Recover the authoritative side, including matches restored with a stale role.
    const onlineRole = initialOnlineRole === 'spectator' ? 'spectator'
        : user?.id && gameState?.players?.host === user.id ? 'white'
        : user?.id && gameState?.players?.joiner === user.id ? 'black'
        : initialOnlineRole;
    const prevGameStateRef = useRef<any>(null);
    const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
    const [opponentSelectedId, setOpponentSelectedId] = useState<string | null>(null);

    // Emit selection when it changes
    useEffect(() => {
        if (!socket || !roomId) return;
        socket.emit('piece_selection', { matchId: roomId, pieceId: selectedTokenId });
    }, [selectedTokenId, socket, roomId]);

    // Listen for opponent selection
    useEffect(() => {
        if (!socket) return;
        const handler = (data: { pieceId: string | null }) => {
            setOpponentSelectedId(data.pieceId);
        };
        socket.on('opponent_selection', handler);
        return () => { socket.off('opponent_selection', handler); };
    }, [socket]);
    const [showMoveHints, setShowMoveHints] = useState<boolean>(true);
    const [showRules, setShowRules] = useState(false);
    const { is2DView, setIs2DView, boardDesign, boardFinish, pieceFinish, victoryEffect, avatarFrame } = useBoardPreferences();
    const [showHomeConfirm, setShowHomeConfirm] = useState(false);
    const [viewResetKey, setViewResetKey] = useState(0);
    const [showResignConfirm, setShowResignConfirm] = useState<boolean>(false);
    const [promotionPending, setPromotionPending] = useState<{
        pieceId: number;
        targetRow: number;
        targetCol: number;
    } | null>(null);

    // Latency Measurement

    useEffect(() => {
        if (!socket || !isConnected) return;
        
        const onPong = (data: { clientTime: number, serverTime: number }) => {
            const currentLatency = Date.now() - data.clientTime;
            setLatency(currentLatency);
            if(Number.isFinite(data.serverTime))serverOffset.current=data.serverTime-(data.clientTime+Date.now())/2;
        };
        
        socket.on('pong', onPong);
        
        socket.emit('ping',{clientTime:Date.now()});
        const pingInterval = setInterval(() => {
            socket.emit('ping', { clientTime: Date.now() });
        }, 2000);

        return () => {
            socket.off('pong', onPong);
            clearInterval(pingInterval);
        };
    }, [socket, isConnected]);

    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showGameOver, setShowGameOver] = useState(false);

    useEffect(() => {
        if (gameState?.gameOver) {
            const timer = setTimeout(() => setShowGameOver(true), 1500);
            return () => clearTimeout(timer);
        } else {
            setShowGameOver(false);
        }
    }, [gameState?.gameOver]);

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

    const stopMoveSound = useRef<() => void>(() => {});
    const playMoveSound = useCallback(() => {
        stopMoveSound.current();
        stopMoveSound.current = soundManager.playSE('/sounds/spo_ge_syogi04.mp3');
    }, []);
    useEffect(() => () => stopMoveSound.current(), []);

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

    // The current time-control rating is public profile data, never a guessed value.
    useEffect(()=>{
        let cancelled=false;
        const ids=[hostId,joinerId].filter(isRatedPlayer);
        if(!ids.length)return;
        const column=timeControl==='10s'?'rating_10s':timeControl==='3m'?'rating_3m':'rating_10m';
        const controller=new AbortController();
        const timeout=setTimeout(()=>controller.abort(),2500);
        void (async()=>{
            try {
                const {data,error}=await supabase.from('profiles').select('id,name,'+column).in('id',ids).abortSignal(controller.signal);
                if(cancelled)return;
                const next:Record<string,number>={};
                for(const row of error?[]:data??[]){
                    const profile=row as unknown as Record<string,unknown>,rating=profile[column];
                    if(typeof rating==='number'&&Number.isFinite(rating)&&rating>=0)next[String(profile.id)]=rating;
                    if(profile.id!==user?.id&&typeof profile.name==='string')setFetchedOpponentName(profile.name);
                }
                setRatings(next);
            } catch { if(!cancelled)setRatings({}); }
            finally {
                clearTimeout(timeout);
                if(!cancelled)setRatingLookupKey(ratingKey);
            }
        })();
        return()=>{cancelled=true;clearTimeout(timeout);controller.abort();};
    },[hostId,joinerId,user?.id,timeControl,ratingKey]);

    // Connect & Sync on mount or reconnection
    useEffect(() => {
        if (!socket || !roomId) return;

        const syncMatch = () => {
            console.log('[OnlineGameBoard] Connecting/Syncing match:', roomId, 'User:', user?.name);
            socket.emit('connect_match', { matchId: roomId, userName: user?.name, avatarUrl: user?.avatar_url,avatarFrame,introVersion:1 });
            socket.emit('request_sync', { matchId: roomId });
        };

        const onSyncState = (state: any) => {
            if (!acceptsOnlineSnapshot(roomId, prevGameStateRef.current, state)) return;
            if (isNewOnlineMove(prevGameStateRef.current, state)) playMoveSound();
            // Update synchronously: duplicate events can arrive before React renders.
            prevGameStateRef.current = state;
            setGameState({...state, receivedAt: performance.now()});
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

        socket.on('match_start', onSyncState);
        socket.on('sync_state', onSyncState);
        socket.on('action_error', onActionError);
        socket.on('opponent_disconnected', onOpponentDisconnected);
        socket.on('opponent_reconnected', onOpponentReconnected);
        socket.on('match_forfeited', onMatchForfeited);
        socket.on('emote', onEmote);
        // Register all listeners before requesting a snapshot, including on reconnect.
        if (isConnected) syncMatch();

        return () => {
            socket.off('match_start', onSyncState);
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
    }, [socket, roomId, isConnected, user?.name, user?.avatar_url, avatarFrame, playMoveSound, triggerEmote]);

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

        const localStartTime = gameState.receivedAt??performance.now();
        const startDelay=Number.isFinite(gameState.startsAt)&&Number.isFinite(gameState.serverNow)?Math.max(0,gameState.startsAt-gameState.serverNow):0;
        const updateClocks = () => {
            const assumedDelivery = latency ? latency / 2 : 150;
            const timeSinceReceipt = performance.now() - localStartTime;
            const estimatedServerTime = (gameState.serverNow ?? Date.now()) + assumedDelivery + timeSinceReceipt;
            const elapsed = gameState.introPending ? 0 : Number.isFinite(gameState.serverNow) ? Math.max(0, estimatedServerTime - Math.max(gameState.serverNow, gameState.startsAt ?? 0)) : Math.max(0, timeSinceReceipt - startDelay);
            let w = gameState.clock.white;
            let b = gameState.clock.black;
            if (gameState.turn === 0) w -= elapsed;
            else b -= elapsed;
            
            setTimeLeftWhite(Math.max(0, Math.floor(w / 1000)));
            setTimeLeftBlack(Math.max(0, Math.floor(b / 1000)));
        };
        
        updateClocks();
        const interval = setInterval(updateClocks, 100);
        return () => clearInterval(interval);
    }, [gameState, latency]);

    const handleSquareClick = (targetRow: number, targetCol: number) => {
        if (!matchReady || !gameState || gameState.gameOver || onlineRole === 'spectator') return;

        setErrorMsg(null);

        if (!socket || !isConnected) {
            setErrorMsg(matchText(lang, '再接続中です。接続が戻ってから操作してください。', 'Reconnecting. Please wait before moving.'));
            return;
        }

        if (selectedTokenId) {
            const numId = parseInt(selectedTokenId.split('_')[1], 10);
            
            // Check if clicking own another piece to switch selection
            const clickedOtherPiece = gameState.pieces.find((p: any) => !p.captured && p.y === targetRow && p.x === targetCol);
            const expectedTeam = onlineRole === 'white' ? 0 : 1;
            
            if (clickedOtherPiece && clickedOtherPiece.team === expectedTeam) {
                setSelectedTokenId(selectedTokenId === `token_${clickedOtherPiece.id}` ? null : `token_${clickedOtherPiece.id}`);
                return;
            }

            // Enemy pieces can be inspected without ever submitting an action.
            const selectedPiece = gameState.pieces.find((p: any) => p.id === numId && !p.captured);
            if (!selectedPiece || selectedPiece.team !== expectedTeam) {
                setSelectedTokenId(clickedOtherPiece ? `token_${clickedOtherPiece.id}` : null);
                return;
            }
            if (selectedPiece.x === targetCol && selectedPiece.y === targetRow) {
                setSelectedTokenId(null);
                return;
            }

            // Client optimistic action (will be intercepted if ambiguous)
            const token = gameState.pieces.find((p: any) => p.id === numId);
            if (!token || token.team !== expectedTeam || gameState.turn !== expectedTeam) {
                setErrorMsg(matchText(lang, '自分の手番に自分の駒を動かしてください。', 'Move your own piece on your turn.'));
                return;
            }
            const moveTypes = filterPossibilities(token, targetCol, targetRow, gameState.board, !!clickedOtherPiece, gameState.pieces);
            if (!moveTypes.length) {
                setErrorMsg(t.errInvalidMove);
                return;
            }
            if (token && Math.abs(targetCol - token.x) === 2 && Math.abs(targetRow - token.y) === 0) {
                // Determine if it's ambiguous
                // Check if it CAN be King AND (Rook OR Queen)
                const canBeKing = moveTypes.includes('K');
                const canBeRook = moveTypes.includes('R');
                const canBeQueen = moveTypes.includes('Q');
                if (canBeKing && (canBeRook || canBeQueen)) {
                    setCastlingPending({
                        pieceId: numId,
                        targetRow,
                        targetCol,
                        validTypes: moveTypes
                    });
                    return;
                }
            }

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
                hasMoved: !!p.hasMoved
            } as Token;
        });
    }, [gameState]);

    const validMoves = useMemo(() => {
        if (!selectedTokenId || !gameState) return [];
        const piece = gameState.pieces.find((p: any) => `token_${p.id}` === selectedTokenId && !p.captured);
        if (!piece) return [];
        const moves: {r: number, c: number}[] = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const target = gameState.pieces.find((p: any) => !p.captured && p.y === r && p.x === c);
                if (target?.team === piece.team) continue;
                // Match server movement geometry, including moved flags.
                if (filterPossibilities(piece, c, r, gameState.board, !!target, gameState.pieces).length) {
                    moves.push({r, c});
                }
            }
        }
        return moves;
    }, [selectedTokenId, gameState]);

    const currentTurn = gameState?.turn === 0 ? 'white' : 'black';
    const myRole = onlineRole || 'white';
    const isMyTurn = myRole === currentTurn;
    const bottomPlayer = myRole === 'black' ? 'black' : 'white';
    // Server team 0 (White) starts at y=0-1, unlike the local CPU board.
    // Share one orientation for squares, clicks, highlights and animated pieces.
    const isFlipped = bottomPlayer === 'white';

    // Robust winner calculation
    const winner = useMemo(() => {
        if (!gameState?.gameOver) return null;
        const go = typeof gameState.gameOver === 'object' ? (gameState.gameOver as any).winner : gameState.gameOver;
        if (go === 'WHITE') return 'white_wins';
        if (go === 'BLACK') return 'black_wins';
        return 'draw';
    }, [gameState]);

    const isCheck=useMemo(()=>!!gameState && !winner && onlineKingInCheck(gameState.board,gameState.pieces,gameState.turn),[gameState,winner]);
    const [showCheckWarning,setShowCheckWarning]=useState(false);
    // Clock/socket updates must not restart the animation; a new move must.
    const checkEvent=tokens.map(token=>`${token.id}:${token.row},${token.col}:${token.isCaptured}`).join('|');
    useEffect(()=>{
        setShowCheckWarning(isCheck);
        if (!isCheck) return;
        const timer=setTimeout(()=>setShowCheckWarning(false),2500);
        return ()=>clearTimeout(timer);
    },[isCheck,checkEvent]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const hostServerName = gameState?.playerNames?.host;
    const joinerServerName = gameState?.playerNames?.joiner;
    const hostAvatarUrl = (gameState as any)?.playerAvatars?.host;
    const joinerAvatarUrl = (gameState as any)?.playerAvatars?.joiner;

    const guestLabel = matchText(lang, 'ゲスト', 'Guest');
    const playerLabel = matchText(lang, 'プレイヤー', 'Player');

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

    const whiteName = cpu?.side==='host'?'CPU':onlineRole==='spectator'?(hostServerName||playerLabel):isHost ? (user?.name || playerLabel) : resolvedOpponent;
    const blackName = cpu?.side==='joiner'?'CPU':onlineRole==='spectator'?(joinerServerName||playerLabel):!isHost ? (user?.name || playerLabel) : resolvedOpponent;
    const playerName = isHost ? whiteName : blackName;
    const opponentName = isHost ? blackName : whiteName;
    const loginPrompt=['AUTH_REQUIRED','SESSION_REPLACED'].includes(connectionError??'')&&user&&!user.id.startsWith('GUEST-')?<div className="p-3 text-center">
        <p role="alert" className="text-sm text-[#D4B872]">{rankedText(lang,'help')}</p>
        <button className="min-h-11 p-3 underline" onClick={()=>setShowRankedLogin(true)}>{t.login}</button>
        {showRankedLogin&&<RankedLoginDialog lang={lang} userId={user.id} onCancel={()=>setShowRankedLogin(false)} onVerified={()=>setShowRankedLogin(false)}/>}
    </div>:null;

    if (cancelledMatch===roomId) return <div role="alert" className="m-auto max-w-md rounded-xl border border-[#B39A62]/30 bg-[#161513] p-6 text-center text-[#E8E2D7]">
        <p>{cancelledRankedText(lang)}</p>
        <button className="mt-4 min-h-11 border border-[#B39A62]/40 px-6" onClick={onHome||(()=>window.location.reload())}>{t.home}</button>
    </div>;
    if (!gameState) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-black/60 border border-cyan-900/50 rounded-xl max-w-lg w-full">
                <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-cyan-400 font-mono tracking-widest text-sm animate-pulse">
                    {matchText(lang, 'サーバーと対局データを同期中...', 'CONNECTING TO GAME SERVER...')}
                </p>
                {loginPrompt}
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
        <MatchLayout
            victory={onlineRole!=='spectator' && winner===`${onlineRole}_wins`} victoryEffect={victoryEffect}
            lang={lang} mode={gameState.mode==='ranked'||matchMode==='ranked'?`${t.ranked}${cpu?' · CPU':''}`:matchText(lang, 'オンライン対局', 'ONLINE MATCH')}
            white={{name:whiteName,clock:formatTime(timeLeftWhite),rating:whiteRating,frame:isHost?avatarFrame:gameState.playerFrames?.host,avatar:isHost ? (user?.avatar_url || hostAvatarUrl) : hostAvatarUrl,emote:activeEmotes.white ? EMOTES[activeEmotes.white].emoji : undefined}}
            black={{name:blackName,clock:formatTime(timeLeftBlack),rating:blackRating,frame:onlineRole==='black'?avatarFrame:gameState.playerFrames?.joiner,avatar:onlineRole==='black' ? (user?.avatar_url || joinerAvatarUrl) : joinerAvatarUrl,emote:activeEmotes.black ? EMOTES[activeEmotes.black].emoji : undefined}}
            bottomSide={bottomPlayer} currentTurn={currentTurn} spectator={onlineRole === 'spectator'} finished={!!winner} resultVisible={showGameOver} checkNotice={showCheckWarning&&!winner?t.check:undefined} checkEvent={checkEvent} checkmate={!!winner && gameState.gameOverReason === 'checkmate'}
            tokens={tokens} selectedTokenId={selectedTokenId} 
            validMoveCount={validMoves.length} onClearSelection={() => setSelectedTokenId(null)}
            is2D={is2DView} onViewChange={setIs2DView}
            onResetView={() => setViewResetKey(key => key + 1)}
            onHome={() => setShowHomeConfirm(true)} onRules={() => setShowRules(true)} onResign={() => setShowResignConfirm(true)}
            showMoveHints={showMoveHints} onHintsChange={setShowMoveHints}
            notice={!matchReady ? t.adCloudTitle : disconnectTimeLeft !== null ? (matchText(lang, '再接続を待っています… ', 'Waiting for reconnection… ')) + disconnectTimeLeft + 's' : errorMsg || undefined}
            board={is2DView ? (
                    <Board2D quietLayout boardDesign={boardDesign} boardFinish={boardFinish}
                    tokens={tokens}
                    isFlipped={isFlipped}
                    onlineRole={onlineRole}
                    selectedTokenId={selectedTokenId}
                    opponentSelectedTokenId={opponentSelectedId}
                    validMoves={validMoves}
                    moveHistory={[]} 
                    showCheckWarning={showCheckWarning}
                    onSquareClick={handleSquareClick}
                    showMoveHints={showMoveHints}
                    currentTurn={currentTurn}
                />
                ) : (
                    <Board3D lang={lang} quietLayout key={viewResetKey} boardDesign={boardDesign} boardFinish={boardFinish} pieceFinish={pieceFinish} checkmate={!!winner && gameState.gameOverReason === 'checkmate'}
                    tokens={tokens}
                    isFlipped={isFlipped}
                    onlineRole={onlineRole}
                    selectedTokenId={selectedTokenId}
                    opponentSelectedTokenId={opponentSelectedId}
                    validMoves={validMoves}
                    moveHistory={[]} 
                    showCheckWarning={showCheckWarning}
                    onSquareClick={handleSquareClick}
                    showMoveHints={showMoveHints}
                    currentTurn={currentTurn}
                />
                )}
        >
            {loginPrompt}
            {introDuration>0&&<MatchIntro lang={lang} label={timeControl==='10s'?t.tc10s:timeControl==='3m'?t.tc3m:t.tc10m} duration={introDuration} onDone={finishIntro}
                white={{name:whiteName,avatar:isHost?user?.avatar_url||hostAvatarUrl:hostAvatarUrl,frame:isHost?avatarFrame:gameState.playerFrames?.host,rating:whiteRating,detail:cpu?.side==='host'?`${rankedText(lang,'cpu')} · ${Math.floor(cpu.rating)}`:undefined}}
                black={{name:blackName,avatar:onlineRole==='black'?user?.avatar_url||joinerAvatarUrl:joinerAvatarUrl,frame:onlineRole==='black'?avatarFrame:gameState.playerFrames?.joiner,rating:blackRating,detail:cpu?.side==='joiner'?`${rankedText(lang,'cpu')} · ${Math.floor(cpu.rating)}`:undefined}}/>}
            {winner && showGameOver && (
                <MatchResultDialog lang={lang} winner={winner} side={onlineRole??'spectator'}>
                        {(gameState.mode==='ranked'||matchMode==='ranked')&&onlineRole!=='spectator'&&<RankedSettlement lang={lang} settlement={settledRating?.matchId===roomId?settledRating:null}/>}
                        <div className="flex flex-wrap gap-3 mt-4 justify-center">
                            <button 
                                onClick={() => window.location.reload()}
                                className="px-5 py-3 bg-[#191714] hover:bg-[#2A2621] border border-[#A89C86]/30 rounded text-sm font-serif tracking-widest transition-colors text-[#A89C86] hover:text-[#E8E2D7]"
                            >
                                {t.home || 'HOME'}
                            </button>
                        </div>
                </MatchResultDialog>
            )}

            {/* Resign Confirmation Modal */}
            {castlingPending && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                    <div role="dialog" aria-modal="true" aria-label={matchText(lang, '移動方法を選択', 'Choose move type')} className="bg-[#161513] border border-[#B39A62]/30 p-6 rounded-lg max-w-sm w-full text-center">
                        <p className="text-[#E8E2D7] mb-4">{matchText(lang, '通常移動かキャスリングを選んでください。', 'Choose a normal move or castling.')}</p>
                        {(['normal', 'castle'] as const).map(intention => (
                            <button key={intention} className="p-3 m-1 border border-[#B39A62]/30 rounded text-[#E8E2D7]" onClick={() => {
                                if (!socket || !isConnected) return;
                                socket.emit('player_action', {
                                    actionId: uuidv4(),
                                    version: gameState.version,
                                    action: { type: 'MOVE', payload: {
                                        pieceId: castlingPending.pieceId,
                                        toX: castlingPending.targetCol,
                                        toY: castlingPending.targetRow,
                                        intention
                                    } }
                                });
                                setCastlingPending(null);
                                setSelectedTokenId(null);
                            }}>
                                {intention === 'normal' ? (matchText(lang, '通常移動', 'Normal move')) : (matchText(lang, 'キャスリング', 'Castling'))}
                            </button>
                        ))}
                        <button className="block w-full mt-3 p-2 text-gray-400" onClick={() => setCastlingPending(null)}>{matchText(lang, 'キャンセル', 'Cancel')}</button>
                    </div>
                </div>
            )}
            {/* Promotion Modal */}
            {promotionPending && (
                <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
                    <div className="bg-[#161513] border border-[#B39A62]/30 p-8 rounded-lg max-w-sm w-full text-center shadow-2xl">
                        <h3 className="text-xl tracking-[0.2em] font-serif text-[#E8E2D7] mb-2">{matchText(lang, 'プロモーション', 'Promotion')}</h3>
                        <p className="text-[#A89C86] text-xs tracking-widest mb-6 font-serif">{matchText(lang, 'どの駒に昇格しますか？', 'Choose a piece to promote to:')}</p>
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            {(['Queen', 'Rook', 'Bishop', 'Knight'] as const).map(pt => (
                                <button
                                    key={pt}
                                    onClick={() => {
                                        const pTo = pt === 'Queen' ? 'Q' : pt === 'Rook' ? 'R' : pt === 'Bishop' ? 'B' : 'N';
                                        socket?.emit('player_action', {
                                            actionId: uuidv4(),
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
                            {matchText(lang, 'キャンセル', 'Cancel')}
                        </button>
                    </div>
                    </div>
                )}
            
            {showResignConfirm && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-[#161513] border border-[#B39A62]/30 rounded-xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center">
                        <span className="text-4xl mb-3">🏳️</span>
                        <h3 className="text-lg font-bold text-[#E8E2D7] mb-2">
                            {matchText(lang, 'リザインしますか？', 'Resign Match?')}
                        </h3>
                        <p className="text-sm text-gray-400 mb-6">
                            {matchText(lang, 'リザインすると相手の勝利となります。本当に対局を終了しますか？', 'Resigning will forfeit the match to your opponent. Are you sure?')}
                        </p>
                        <div className="flex gap-3 w-full">
                            <button
                                onClick={() => setShowResignConfirm(false)}
                                className="flex-1 py-2.5 bg-[#191714] hover:bg-gray-700 border border-gray-600 rounded-lg text-sm text-[#E8E2D7] font-bold transition-colors"
                            >
                                {matchText(lang, 'キャンセル', 'Cancel')}
                            </button>
                            <button
                                onClick={() => {
                                    setShowResignConfirm(false);
                                    handleResign();
                                }}
                                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm text-[#E8E2D7] font-bold transition-colors shadow-lg shadow-red-600/30"
                            >
                                {matchText(lang, 'リザインする', 'Resign')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rules Modal */}
            {showRules && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-[#161513] border border-[#B39A62]/30 rounded-xl p-8 max-w-md w-full shadow-2xl flex flex-col gap-4 text-center">
                        <h3 className="text-xl font-bold text-[#E8E2D7] tracking-widest uppercase">
                            {matchText(lang, '遊び方', 'How to Play')}
                        </h3>
                        <div className="text-sm text-gray-400 text-left space-y-3">
                            <p>• <strong>{matchText(lang, '勝利条件:', 'Victory:')}</strong> {matchText(lang, '相手のキングを取るか、チェックメイトすると勝利です。', 'Capture the enemy King or Checkmate them.')}</p>
                            <p>• <strong>{matchText(lang, '重ね合わせ:', 'Superposition:')}</strong> {matchText(lang, '駒は初期状態では複数の正体（可能性）を持っています。駒を動かすことで、その動き方に基づいて可能性が絞り込まれていきます。', 'All pieces start with multiple possible identities. Moving a piece collapses its possibilities based on how it moved.')}</p>
                            <p>• <strong>{matchText(lang, '正体の確定:', 'Discovery:')}</strong> {matchText(lang, '正体が確定していない敵の駒は、実はキングかもしれません。慎重に攻めましょう！', 'Be careful! Any unknown enemy piece could turn out to be their King when revealed.')}</p>
                        </div>
                        <div className="flex gap-3 w-full mt-4">
                            <button
                                onClick={() => setShowRules(false)}
                                className="flex-1 py-2.5 bg-[#191714] hover:bg-gray-700 border border-gray-600 rounded-lg text-sm text-[#E8E2D7] font-bold transition-colors"
                            >
                                {matchText(lang, '閉じる', 'Close')}
                            </button>
                            <a
                                href="/rules"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 py-2.5 bg-[#B39A62] hover:bg-[#D0C8B6] rounded-lg text-sm text-[#11100E] font-bold transition-colors shadow-lg shadow-[#B39A62]/30 block text-center"
                            >
                                {matchText(lang, '詳しいルール', 'Full Rules Guide')}
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* Emote Button & Menu */}
            {roomId && onlineRole && onlineRole !== 'spectator' && !winner && (
                <div className="match-emote-control">
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
                                <span className="text-[#E8E2D7] text-sm font-bold">{matchText(lang, 'リザイン', 'Resign')}</span>
                            </button>
                            {(Object.keys(EMOTES) as EmoteType[]).map(key => (
                                <button
                                    key={key}
                                    onClick={() => sendEmote(key)}
                                    className="flex items-center gap-3 px-4 py-2 hover:bg-[#2A2621] rounded transition-colors whitespace-nowrap text-left"
                                >
                                    <span className="text-2xl">{EMOTES[key].emoji}</span>
                                    <span className="text-[#E8E2D7] text-sm font-bold">{matchText(lang, EMOTES[key].labelJa, EMOTES[key].labelEn)}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        
            {showHomeConfirm && (
                <div className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-6">
                    <div className="bg-[#2A2621] border-2 border-[#D4B872]/30 rounded-xl p-8 max-w-md w-full text-center relative shadow-2xl animate-stamp">
                        <h2 className="text-[#B39A62] text-xl font-bold mb-4">
                            {matchText(lang, 'ホームに戻りますか？', 'Return to Home?')}
                        </h2>
                        <p className="text-[#E8E2D7]/80 mb-8 text-sm">
                            {matchText(lang, '進行中のゲームデータは失われる可能性があります。', 'Any unsaved progress may be lost.')}
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowHomeConfirm(false)}
                                className="flex-1 px-4 py-3 bg-[#11100E] hover:bg-[#191714] border border-[#D4B872]/50 text-[#E8E2D7] font-bold rounded-lg transition-colors"
                            >
                                {matchText(lang, 'キャンセル', 'Cancel')}
                            </button>
                            <button
                                onClick={onHome}
                                className="flex-1 px-4 py-3 bg-red-900/60 hover:bg-red-800/80 border border-red-500/50 text-white font-bold rounded-lg transition-colors"
                            >
                                {matchText(lang, '戻る', 'Exit')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </MatchLayout>
    );
}
