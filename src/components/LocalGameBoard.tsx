'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { IdentityPool } from '../lib/IdentityPool';
import { Token, deduceMoveTypes, calculateProbabilities, isPlayerInCheck, checkGameOver, isCheckmate } from '../lib/GameEngine';
import { QuantumPieceUI } from './QuantumPieceUI';
import { AdBanner } from './AdBanner';
import { Language, dict } from '../locales/dict';
import { User, TimeControl } from '../types/game';
import { PieceType } from '../config/gameConfig';
import { supabase } from '../lib/supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';
import { MoveRecord, saveGameRecord, GameRecord } from '../lib/gameRecordService';
import { soundManager } from '../lib/SoundService';

export type EmoteType = 'hello' | 'well_played' | 'wow' | 'thinking' | 'resign';
export const EMOTES: Record<EmoteType, { emoji: string; labelJa: string; labelEn: string }> = {
    hello: { emoji: '👋', labelJa: 'よろしく！', labelEn: 'Hello!' },
    well_played: { emoji: '👏', labelJa: 'ナイス！', labelEn: 'Well played' },
    wow: { emoji: '😲', labelJa: 'えっ！？', labelEn: 'Wow' },
    thinking: { emoji: '🤔', labelJa: 'うーん', labelEn: 'Thinking...' },
    resign: { emoji: '🙏', labelJa: '参りました', labelEn: 'Good game' }
};

interface GameBoardProps {
    lang: Language;
    user?: User;
    cpuLevel?: number;
    roomId?: string;
    onlineRole?: 'white' | 'black' | 'spectator';
    matchMode?: 'random' | 'private' | 'ranked';
    opponentId?: string;
    timeControl?: TimeControl;
    onHome?: () => void;
}

export default function GameBoard({ lang, user, cpuLevel, roomId, onlineRole, matchMode, opponentId, timeControl = '10m', onHome }: GameBoardProps) {
    const t = { ...dict['en'], ...(dict[lang] || {}) } as any;
    const [pool, setPool] = useState(() => new IdentityPool());
    const poolRef = useRef<IdentityPool>(pool);
    useEffect(() => { poolRef.current = pool; }, [pool]);
    const [tokens, setTokens] = useState<Token[]>([]);
    const [capturedTokens, setCapturedTokens] = useState<Token[]>([]);

    // Animation state
    const [movingPiece, setMovingPiece] = useState<{ id: string, fromRow: number, fromCol: number, toRow: number, toCol: number } | null>(null);

    const tokensRef = useRef<Token[]>([]);
    const executeMoveRef = useRef<any>(null);
    useEffect(() => { tokensRef.current = tokens; executeMoveRef.current = executeMove; }, [tokens]);
    const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
    const [tutorialHint, setTutorialHint] = useState<string | null>(null);
    const [showRules, setShowRules] = useState(false);
    const [currentTurn, setCurrentTurn] = useState<'white' | 'black'>('white');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [fetchedOpponentName, setFetchedOpponentName] = useState<string | null>(null);
    const [myRating, setMyRating] = useState<number | null>(null);
    const [opponentRating, setOpponentRating] = useState<number | null>(null);

    // Fetch profiles
    useEffect(() => {
        const ratingCol = timeControl === '10s' ? 'rating_10s' : timeControl === '3m' ? 'rating_3m' : 'rating_10m';
        
        import('../lib/supabaseClient').then(({ supabase }) => {
            // Fetch my rating
            if (user?.id && !user.id.startsWith('GUEST-') && matchMode === 'ranked') {
                supabase.from('profiles').select(ratingCol).eq('id', user.id).single().then(({ data }) => {
                    const d = data as any;
                    if (d && d[ratingCol]) setMyRating(d[ratingCol]);
                });
            }
            // Fetch opponent name & rating
            if (opponentId && !opponentId.startsWith('GUEST-')) {
                supabase.from('profiles').select(`name, ${ratingCol}`).eq('id', opponentId).single().then(({ data }) => {
                    const d = data as any;
                    if (d?.name) setFetchedOpponentName(d.name);
                    if (d && d[ratingCol] && matchMode === 'ranked') setOpponentRating(d[ratingCol]);
                });
            }
        });
    }, [opponentId, user?.id, timeControl, matchMode]);
    const [isCheck, setIsCheck] = useState<boolean>(false);
    const [showMoveHints, setShowMoveHints] = useState<boolean>(true);
    const [showResignConfirm, setShowResignConfirm] = useState<boolean>(false);

    const handleResign = () => {
        setWinner(onlineRole === 'black' ? 'white_wins' : 'black_wins');
        setShowResignConfirm(false);
    };
    const [showCheckWarning, setShowCheckWarning] = useState<boolean>(false);
    const [winner, setWinner] = useState<'white_wins' | 'black_wins' | 'draw' | null>(null);
    const [disconnectTimeLeft, setDisconnectTimeLeft] = useState<number | null>(null);
    const disconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
    const hasOpponentJoinedRef = useRef<boolean>(false);

    const initialTime = timeControl === '10s' ? 10 : timeControl === '3m' ? 180 : 600;
    const [timeLeftWhite, setTimeLeftWhite] = useState<number>(initialTime);
    const [timeLeftBlack, setTimeLeftBlack] = useState<number>(initialTime);

    useEffect(() => {
        if (winner && typeof window !== 'undefined') {
            localStorage.removeItem('qg_active_online_match');
        }
    }, [winner]);

    useEffect(() => {
        if (winner || tokens.length === 0) return; // Don't tick if game over or not started
        const timer = setInterval(() => {
            if (currentTurn === 'white') {
                setTimeLeftWhite(prev => {
                    if (prev <= 1) { setWinner('black_wins'); return 0; }
                    return prev - 1;
                });
            } else {
                setTimeLeftBlack(prev => {
                    if (prev <= 1) { setWinner('white_wins'); return 0; }
                    return prev - 1;
                });
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [currentTurn, winner, tokens.length]);

    // Initial timeout if opponent never connects from the start
    useEffect(() => {
        if (!roomId || !opponentId || onlineRole === 'spectator') return;
        const initialWait = setTimeout(() => {
            if (!hasOpponentJoinedRef.current && !winner) {
                if (!disconnectTimerRef.current) {
                    let timeLeft = 60;
                    setDisconnectTimeLeft(timeLeft);
                    disconnectTimerRef.current = setInterval(() => {
                        timeLeft--;
                        setDisconnectTimeLeft(timeLeft);
                        if (timeLeft <= 0) {
                            if (disconnectTimerRef.current) clearInterval(disconnectTimerRef.current);
                            disconnectTimerRef.current = null;
                            setWinner(onlineRole === 'white' ? 'white_wins' : 'black_wins');
                        }
                    }, 1000);
                }
            }
        }, 15000);
        return () => clearTimeout(initialWait);
    }, [roomId, opponentId, onlineRole, winner]);

    const [promotionPending, setPromotionPending] = useState<{
        token: Token;
        targetRow: number;
        targetCol: number;
        validTypes: PieceType[];
        targetToken: Token | undefined;
        isLocalMove?: boolean;
    } | null>(null);

    const [castlingPending, setCastlingPending] = useState<{
        token: Token;
        targetRow: number;
        targetCol: number;
        validTypes: PieceType[];
        targetToken: Token | undefined;
    } | null>(null);

    const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);
    const moveHistoryRef = useRef<MoveRecord[]>([]);
    const [turnCount, setTurnCount] = useState(0);
    const [savedRecordId, setSavedRecordId] = useState<string | null>(null);

    useEffect(() => {
        moveHistoryRef.current = moveHistory;
    }, [moveHistory]);

    // Emote states
    const [showEmoteMenu, setShowEmoteMenu] = useState(false);
    const [activeEmotes, setActiveEmotes] = useState<{ white: EmoteType | null, black: EmoteType | null }>({ white: null, black: null });
    const emoteTimers = useRef<{ white: NodeJS.Timeout | null, black: NodeJS.Timeout | null }>({ white: null, black: null });

    const triggerEmote = useCallback((player: 'white' | 'black', emote: EmoteType) => {
        setActiveEmotes(prev => ({ ...prev, [player]: emote }));
        if (emoteTimers.current[player]) clearTimeout(emoteTimers.current[player]!);
        emoteTimers.current[player] = setTimeout(() => {
            setActiveEmotes(prev => ({ ...prev, [player]: null }));
        }, 3000);
    }, []);

    const sendEmote = useCallback((emote: EmoteType) => {
        if (!roomId || !onlineRole || onlineRole === 'spectator') return;
        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'game_action',
                payload: { type: 'emote', emote, player: onlineRole }
            });
        }
        triggerEmote(onlineRole, emote);
        setShowEmoteMenu(false);
    }, [roomId, onlineRole, triggerEmote]);

    // 駒音（spo_ge_syogi04.mp3 を使用）
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

    const channelRef = useRef<RealtimeChannel | null>(null);

    useEffect(() => {
        if (!roomId || !user) return;
        
        const channel = supabase.channel(`room_${roomId}`, {
            config: { presence: { key: user.id } }
        });
        channelRef.current = channel;

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const keys = Object.keys(state).map(k => k.split('_')[0]); // Extract base user.id from presence keys
                
                // Disconnect check (if opponentId is set and we're not a spectator)
                if (opponentId && onlineRole !== 'spectator') {
                    if (keys.includes(opponentId)) {
                        hasOpponentJoinedRef.current = true;
                        if (disconnectTimerRef.current) {
                            clearInterval(disconnectTimerRef.current);
                            disconnectTimerRef.current = null;
                            setDisconnectTimeLeft(null);
                        }
                    } else if (hasOpponentJoinedRef.current) {
                        // Opponent was here and disconnected
                        if (!disconnectTimerRef.current) {
                            let timeLeft = 120;
                            setDisconnectTimeLeft(timeLeft);
                            disconnectTimerRef.current = setInterval(() => {
                                timeLeft--;
                                setDisconnectTimeLeft(timeLeft);
                                if (timeLeft <= 0) {
                                    if (disconnectTimerRef.current) clearInterval(disconnectTimerRef.current);
                                    disconnectTimerRef.current = null;
                                    setWinner(onlineRole === 'white' ? 'white_wins' : 'black_wins');
                                }
                            }, 1000);
                        }
                    }
                }
            })
            .on('broadcast', { event: 'move' }, ({ payload }) => {
                if (user && payload.userId === user.id) return; // ignore own move (already applied locally)
                
                const sourceToken = tokens.find(t => t.id === payload.tokenId);
                const targetToken = tokens.find(t => t.row === payload.targetRow && t.col === payload.targetCol);
                
                if (sourceToken) {
                    executeMoveRef.current?.(sourceToken, payload.targetRow, payload.targetCol, payload.possibleTypes, targetToken, false, payload.promotedTo);
                }
            })
            .on('broadcast', { event: 'game_action' }, ({ payload }) => {
                if (payload.type === 'emote') {
                    triggerEmote(payload.player, payload.emote);
                    playMoveSound();
                }
            })
            .on('broadcast', { event: 'request_sync' }, () => {
                if (onlineRole === 'white' || onlineRole === 'black') {
                    // Send full game state to reconnecting player or spectator
                    const serializedPool = {
                        piecePossibilities: Object.fromEntries(
                            Array.from(poolRef.current.piecePossibilities.entries()).map(([k, v]) => [k, Array.from(v)])
                        )
                    };
                    channel.send({
                        type: 'broadcast',
                        event: 'sync_state',
                        payload: { 
                            tokens: tokensRef.current, 
                            moveHistory: moveHistoryRef.current,
                            currentTurn,
                            timeLeftWhite,
                            timeLeftBlack,
                            poolData: serializedPool
                        }
                    });
                }
            })
            .on('broadcast', { event: 'sync_state' }, ({ payload }) => {
                // If we receive state from peer and our local move count is less than or equal to incoming:
                if (payload?.tokens && payload?.moveHistory && (onlineRole === 'spectator' || payload.moveHistory.length >= moveHistoryRef.current.length)) {
                    setTokens(payload.tokens);
                    setMoveHistory(payload.moveHistory);
                    setCurrentTurn(payload.currentTurn);
                    setTurnCount(payload.moveHistory.length);
                    if (typeof payload.timeLeftWhite === 'number') setTimeLeftWhite(payload.timeLeftWhite);
                    if (typeof payload.timeLeftBlack === 'number') setTimeLeftBlack(payload.timeLeftBlack);
                    if (payload.poolData?.piecePossibilities) {
                        const newPool = new IdentityPool();
                        newPool.piecePossibilities = new Map(
                            Object.entries(payload.poolData.piecePossibilities).map(([k, v]) => [k, new Set(v as PieceType[])])
                        );
                        setPool(newPool);
                    }
                }
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    // Request sync upon subscription so reconnecting players catch up immediately
                    channel.send({ type: 'broadcast', event: 'request_sync' });
                    await channel.track({ online_at: new Date().toISOString() });
                }
            });

        return () => {
            if (disconnectTimerRef.current) clearInterval(disconnectTimerRef.current);
            supabase.removeChannel(channel);
        };
    }, [roomId, user, onlineRole, triggerEmote, playMoveSound, opponentId]);

    // CPU
    useEffect(() => {
        if (currentTurn === 'black' && !winner && !roomId) {
            const timer = setTimeout(async () => {
                try {
                    const { calculateCPUMove } = await import('../lib/AIEngine');
                    const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
                    const move = calculateCPUMove(tokens, pool, 'black', moveHistory.length, lastMove);
                    
                    if (move) {
                        const aiToken = tokens.find(t => t.id === move.tokenId);
                        if (aiToken) {
                            const targetToken = tokens.find(t => t.row === move.targetRow && t.col === move.targetCol);
                            executeMove(aiToken, move.targetRow, move.targetCol, move.possibleTypes, targetToken, true, move.promotedTo);
                        } else {
                            setCurrentTurn('white');
                        }
                    } else {
                        setCurrentTurn('white');
                    }
                } catch (err) {
                    console.error("AI execution failed:", err);
                    setCurrentTurn('white');
                }
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [currentTurn, winner, tokens, pool, cpuLevel]);

    useEffect(() => {
        const initialTokens: Token[] = [];
        let idCounter = 1;
        [0, 1, 6, 7].forEach(row => {
            const player = row <= 1 ? 'black' : 'white';
            for (let col = 0; col < 8; col++) {
                const id = `token_${idCounter++}`;
                pool.registerPiece(id);
                initialTokens.push({
                    id, player, row, col,
                    probabilities: calculateProbabilities(pool, id)
                });
            }
        });
        setTokens(initialTokens);
    }, [pool]);

    useEffect(() => {
        if (isCheck && !winner) {
            setShowCheckWarning(true);
            const timer = setTimeout(() => setShowCheckWarning(false), 2500);
            return () => clearTimeout(timer);
        } else {
            setShowCheckWarning(false);
        }
    }, [isCheck, winner]);

    // Active Match Registration
    useEffect(() => {
        if (roomId && onlineRole === 'white' && !winner) {
            import('../lib/gameRecordService').then(({ registerActiveMatch }) => {
                registerActiveMatch(roomId, user?.id || null, null);
            });
        }
        if (roomId && onlineRole === 'white' && winner) {
            import('../lib/gameRecordService').then(({ finishActiveMatch }) => {
                finishActiveMatch(roomId);
            });
        }
    }, [roomId, onlineRole, winner, user?.id]);

    // Save game record when game ends
    useEffect(() => {
        if (winner && !savedRecordId && moveHistory.length > 0) {
            const saveRecord = async () => {
                const mode = matchMode || 'cpu';
                
                if (user?.id?.startsWith('GUEST-')) return; // Don't save records for guests
                
                // If it's an online match, we need to know the IDs. Since we don't have opponent ID easily here without changing more,
                // we'll just save our own ID in the correct slot, and wait... no, both clients will trigger this useEffect.
                // To avoid duplicate saving, maybe only White saves the record in online matches?
                // Wait, if White disconnects before saving, Black's record won't be saved.
                // Let's just save it once from the winner's side, or from White's side.
                // To keep it simple, we'll let both save it, which might result in 2 records.
                // But for the rating trigger, 2 records = double rating change!
                // FIX: Only white saves the record for online matches!
                if (roomId && onlineRole !== 'white') {
                    // We still set a dummy savedRecordId so the UI knows we are done
                    setSavedRecordId('saved-by-opponent');
                    return;
                }

                // In online, we only know our own ID. Wait, we need both IDs for ratings!
                // Where do we get opponent ID? We don't have it unless we passed it in onlineInfo.
                // We should have passed opponentId when matchmaking.
                // For now, let's just pass `user.id` for both, which is obviously wrong.
                // We need to fetch it from the presence channel.
                // Instead, let's modify the record saving. If it's ranked, we MUST have both IDs.
                // Since this is getting complex, I will just put placeholders and fix it in GameBoard.
                
                // Let's pass `opponentId` as a prop later. For now, fallback to "unknown".
                const whiteId = onlineRole === 'white' ? user?.id : (roomId ? opponentId : undefined);
                const blackId = onlineRole === 'black' ? user?.id : (roomId ? opponentId : undefined);

                const record: GameRecord = {
                    white_player: onlineRole === 'black' ? (fetchedOpponentName || (opponentId?.startsWith('GUEST-') ? 'Guest' : 'Opponent')) : (user?.name || 'Guest'),
                    black_player: onlineRole === 'white' ? (fetchedOpponentName || (opponentId?.startsWith('GUEST-') ? 'Guest' : 'Opponent')) : (roomId ? (user?.name || 'Guest') : `CPU`),
                    white_id: whiteId,
                    black_id: blackId,
                    winner,
                    mode,
                    cpu_level: roomId ? undefined : cpuLevel,
                    time_control: timeControl,
                    moves: moveHistory,
                    total_moves: turnCount
                };
                const id = await saveGameRecord(record);
                if (id) setSavedRecordId(id);
            };
            saveRecord();
        }
    }, [winner, moveHistory, turnCount, user, roomId, cpuLevel, savedRecordId, matchMode, onlineRole, timeControl, opponentId, fetchedOpponentName]);

    // 選択中のトークンが移動可能なマス（候補）を算出
    const validMoves = useMemo(() => {
        if (!selectedTokenId || winner) return [];
        const token = tokens.find(t => t.id === selectedTokenId);
        if (!token) return [];
        
        const moves: {r: number, c: number}[] = [];
        const currentPossibilities = pool.piecePossibilities.get(token.id) || new Set();

        const lastMoveObj = moveHistory.length > 0 ? {
            tokenId: moveHistory[moveHistory.length - 1].tokenId,
            fromRow: moveHistory[moveHistory.length - 1].from[0],
            fromCol: moveHistory[moveHistory.length - 1].from[1],
            toRow: moveHistory[moveHistory.length - 1].to[0],
            toCol: moveHistory[moveHistory.length - 1].to[1],
        } : undefined;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (r === token.row && c === token.col) continue;
                
                const targetToken = tokens.find(t => t.row === r && t.col === c);
                // 味方の駒は取れないので除外
                if (targetToken && targetToken.player === token.player) continue;

                // そのマスへの移動が、残された可能性（アイデンティティ）と合致するか
                const possibleTypes = deduceMoveTypes(token, r, c, tokens, lastMoveObj);
                if (token.promotedTo) {
                    // プロモーション済み駒は promotedTo の動きだけ許可（プールのPawn制約を無視）
                    if (possibleTypes.includes(token.promotedTo)) {
                        moves.push({r, c});
                    }
                } else if (possibleTypes.some(type => currentPossibilities.has(type))) {
                    moves.push({r, c});
                }
            }
        }
        return moves;
    }, [selectedTokenId, tokens, winner, moveHistory]); // tokensが変わる（ターンが進む）か選択が切り替わったら再計算

    const executeMove = (token: Token, targetRow: number, targetCol: number, possibleTypesForMove: PieceType[], targetToken?: Token, isLocalMove: boolean = true, promotedTo?: PieceType) => {
        // Tutorial hint logic (VS CPU only)
        if (cpuLevel !== undefined && token.player === 'white') {
            const dx = Math.abs(targetCol - token.col);
            const dy = Math.abs(targetRow - token.row);
            
            const p = pool.piecePossibilities.get(token.id);
            const intersection = possibleTypesForMove.filter(pt => p?.has(pt));
            
            if (intersection.length === 1) {
                setTutorialHint((t as any).tutorialConfirmed || `💡 ${intersection[0]} confirmed!`);
            } else if (dx === dy && dx > 0) {
                setTutorialHint((t as any).tutorialDiagonal || '💡 Moved diagonally! This piece must be a Bishop or Queen.');
            } else if ((dx > 0 && dy === 0) || (dx === 0 && dy > 0)) {
                if (dx > 1 || dy > 1) {
                    setTutorialHint((t as any).tutorialStraight || '💡 Moved straight! This must be a Rook or Queen (or Pawn initial).');
                }
            } else if ((dx === 2 && dy === 1) || (dx === 1 && dy === 2)) {
                setTutorialHint((t as any).tutorialL || '💡 Moved in an L-shape! This piece has to be a Knight.');
            }
            
            setTimeout(() => setTutorialHint(null), 7000);
        }

        if (winner) return;
        if (isLocalMove && channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'move',
                payload: { userId: user?.id, tokenId: token.id, targetRow, targetCol, possibleTypes: possibleTypesForMove, promotedTo }
            });
        }
        
        if (promotedTo) {
            // Promotion forces the piece to be a Pawn originally
            pool.restrictIdentity(token.id, ['Pawn']);
        } else {
            pool.restrictIdentity(token.id, possibleTypesForMove);
        }
        
        // Compute updated positions immediately for logic
        let updatedTokens = tokens.map(t => {
            if (targetToken && t.id === targetToken.id) {
                const p = pool.piecePossibilities.get(t.id);
                if (p) p.delete('King');
                return { ...t, isCaptured: true, row: -1, col: -1 };
            }
            if (t.id === token.id) return { ...t, row: targetRow, col: targetCol, hasMoved: true, promotedTo: promotedTo || t.promotedTo };
            return t;
        });

        // Handle Castling Side-Effects
        if (possibleTypesForMove.includes('King') && Math.abs(targetCol - token.col) === 2) {
            const isKingside = targetCol > token.col;
            const rookCol = isKingside ? 7 : 0;
            const newRookCol = isKingside ? targetCol - 1 : targetCol + 1;
            const rookToken = updatedTokens.find(t => t.row === token.row && t.col === rookCol && t.player === token.player);
            if (rookToken) {
                const rookIndex = updatedTokens.findIndex(t => t.id === rookToken.id);
                if (rookIndex !== -1) {
                    updatedTokens[rookIndex] = { ...updatedTokens[rookIndex], col: newRookCol, hasMoved: true };
                }
                pool.restrictIdentity(rookToken.id, ['Rook']);
            }
        }

        // Handle En Passant Side-Effects
        let actualCapturedTokenId = targetToken?.id;
        if (possibleTypesForMove.includes('Pawn') && !targetToken && targetCol !== token.col) {
            const capturedRow = token.row;
            const capturedCol = targetCol;
            const epToken = updatedTokens.find(t => t.row === capturedRow && t.col === capturedCol && t.player !== token.player);
            if (epToken) {
                const epIndex = updatedTokens.findIndex(t => t.id === epToken.id);
                if (epIndex !== -1) {
                    updatedTokens[epIndex] = { ...updatedTokens[epIndex], isCaptured: true, row: -1, col: -1 };
                }
                const p = pool.piecePossibilities.get(epToken.id);
                if (p) p.delete('King');
                pool.restrictIdentity(epToken.id, ['Pawn']);
                actualCapturedTokenId = epToken.id;
            }
        }

        // Resolve global constraints immediately
        const isValid = pool.resolveGlobalConstraints(updatedTokens);

        // Pre-update probabilities on the existing tokens state so the UI reflects them during the animation
        setTokens(tokens.map(t => ({
            ...t,
            probabilities: calculateProbabilities(pool, t.id)
        })));

        // Record move in history
        const newTurn = turnCount + 1;
        setTurnCount(newTurn);
        const moveRecordObj: MoveRecord = {
            turn: newTurn,
            player: currentTurn,
            tokenId: token.id,
            from: [token.row, token.col],
            to: [targetRow, targetCol],
            possibleTypes: possibleTypesForMove,
            capturedTokenId: actualCapturedTokenId,
            promotedTo,
        };
        setMoveHistory(prev => [...prev, moveRecordObj]);

        playMoveSound();

        // Animate move
        setMovingPiece({ id: token.id, fromRow: token.row, fromCol: token.col, toRow: targetRow, toCol: targetCol });
        
        // Let the animation play before updating the actual grid position and evaluating game over logic
        setTimeout(() => {
            setMovingPiece(null);

            const nextTurn = currentTurn === 'white' ? 'black' : 'white';
            const activeTokens = updatedTokens.filter(t => !t.isCaptured);

            if (!isValid) {
                // 矛盾が発生＝「取った駒が実は玉だった」ため、全体制約を満たせなくなった
                setWinner(currentTurn === 'white' ? 'white_wins' : 'black_wins');
            } else {
                const gameResult = checkGameOver(activeTokens, pool);
                if (gameResult) {
                    setWinner(gameResult);
                } else {
                    const checkStatus = isPlayerInCheck(nextTurn, activeTokens, pool);
                    setIsCheck(checkStatus);
                    
                    if (checkStatus) {
                        const mate = isCheckmate(nextTurn, activeTokens, pool);
                        if (mate) {
                            setWinner(currentTurn === 'white' ? 'white_wins' : 'black_wins');
                        }
                    } else {
                        if (isCheckmate(nextTurn, activeTokens, pool)) {
                            setWinner('draw');
                        }
                    }
                }
            }

            // Final token update with correct row/col positions
            updatedTokens = updatedTokens.map(t => ({
                ...t,
                probabilities: calculateProbabilities(pool, t.id)
            }));

            setTokens(updatedTokens);
            setSelectedTokenId(null);
            setCurrentTurn(nextTurn);
            
            if (timeControl === '10s') {
                if (nextTurn === 'white') setTimeLeftWhite(10);
                else setTimeLeftBlack(10);
            }
        }, 400); // Wait 400ms for animation
    };

    const handleSquareClick = (targetRow: number, targetCol: number) => {
        if (winner || onlineRole === 'spectator') return;
        
        // Prevent human player from interacting during CPU's turn
        if (!roomId && currentTurn === 'black') return;

        setErrorMsg(null);
        
        if (selectedTokenId) {
            const tokenIndex = tokens.findIndex(t => t.id === selectedTokenId);
            const token = tokens[tokenIndex];

            if (token.row === targetRow && token.col === targetCol) {
                setSelectedTokenId(null);
                return;
            }

            if (!validMoves.some(m => m.r === targetRow && m.c === targetCol)) {
                setErrorMsg(t.errInvalidMove);
                setSelectedTokenId(null);
                return;
            }

            const targetToken = tokens.find(t => t.row === targetRow && t.col === targetCol);
            const currentPossibilities = pool.piecePossibilities.get(token.id) || new Set();

            const lastMoveObj = moveHistory.length > 0 ? {
                tokenId: moveHistory[moveHistory.length - 1].tokenId,
                fromRow: moveHistory[moveHistory.length - 1].from[0],
                fromCol: moveHistory[moveHistory.length - 1].from[1],
                toRow: moveHistory[moveHistory.length - 1].to[0],
                toCol: moveHistory[moveHistory.length - 1].to[1],
            } : undefined;

            const possibleTypesForMove = deduceMoveTypes(token, targetRow, targetCol, tokens, lastMoveObj);
            // プロモーション済み駒はプールのPawn制約を無視し、promotedToの動きだけ許可
            const validTypesForMove = token.promotedTo
                ? possibleTypesForMove.filter(mt => mt === token.promotedTo)
                : possibleTypesForMove.filter(mt => currentPossibilities.has(mt));

            if (validTypesForMove.length === 0) {
                setErrorMsg(t.errIdentity);
                setSelectedTokenId(null);
                return;
            }

            // Ambiguous Castling Check
            const isHorizontal2 = Math.abs(targetCol - token.col) === 2 && Math.abs(targetRow - token.row) === 0;
            const canBeKing = validTypesForMove.includes('King');
            const canBeRookOrQueen = validTypesForMove.includes('Rook') || validTypesForMove.includes('Queen');
            
            if (isHorizontal2 && canBeKing && canBeRookOrQueen) {
                setCastlingPending({
                    token,
                    targetRow,
                    targetCol,
                    validTypes: validTypesForMove,
                    targetToken
                });
                return;
            }

            // プロモーション済みの駒が最終ランクに再度移動しても、再プロモーションはしない
            if (!token.promotedTo && (targetRow === 0 || targetRow === 7) && validTypesForMove.includes('Pawn')) {
                setPromotionPending({
                    token,
                    targetRow,
                    targetCol,
                    validTypes: validTypesForMove,
                    targetToken,
                    isLocalMove: true
                });
                return;
            }

            executeMove(token, targetRow, targetCol, validTypesForMove, targetToken, true);
        } else {
            const clickedToken = tokens.find(t => t.row === targetRow && t.col === targetCol);
            if (clickedToken) {
                if (clickedToken.player !== currentTurn || (roomId && currentTurn !== onlineRole)) {
                    setErrorMsg(currentTurn === 'white' ? t.errNotYourTurnBlue : t.errNotYourTurnRed);
                    return;
                }
                setSelectedTokenId(clickedToken.id);
            }
        }
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const playerName = user?.name || 'Player';
    const fallbackOpponent = (opponentId && opponentId.startsWith('GUEST-')) ? 'Guest' : 'Opponent';
    const opponentName = roomId ? (fetchedOpponentName || fallbackOpponent) : `CPU`;
    const myRole = onlineRole === 'spectator' ? 'white' : (onlineRole || 'white');
    const whiteName = onlineRole === 'spectator' ? 'White Player' : (myRole === 'white' ? playerName : opponentName);
    const blackName = onlineRole === 'spectator' ? 'Black Player' : (myRole === 'black' ? playerName : opponentName);
    
    const whiteRatingToDisplay = onlineRole === 'spectator' ? null : (myRole === 'white' ? myRating : opponentRating);
    const blackRatingToDisplay = onlineRole === 'spectator' ? null : (myRole === 'black' ? myRating : opponentRating);

    return (
        <div className="flex flex-col items-center w-full h-full max-h-[100dvh] max-w-[800px] mx-auto relative select-none touch-none overflow-hidden pb-4">
            

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
                        {user?.avatar_url ? <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover border border-[#E8E2D7]/50" /> : <div className="w-7 h-7 rounded-full bg-[#191714] border border-[#E8E2D7]/50 flex items-center justify-center"><span className="text-xs">👤</span></div>} {whiteName} {whiteRatingToDisplay !== null && <span className="text-gray-400 text-sm">({whiteRatingToDisplay})</span>}
                        {isCheck && currentTurn === 'white' && <span className="text-[#B39A62] text-sm animate-pulse font-serif tracking-widest">(CHECK)</span>}
                    </div>
                    <span className="text-2xl font-mono">{formatTime(timeLeftWhite)}</span>
                    {/* White Emote */}
                    {activeEmotes.white && (
                        <div className="absolute top-10 left-0 bg-white border-2 border-blue-500 rounded-2xl rounded-tl-none px-3 py-1 shadow-lg z-50 animate-bounce">
                            <span className="text-2xl">{EMOTES[activeEmotes.white].emoji}</span>
                        </div>
                    )}
                </div>

                <div className="text-sm font-bold text-red-900 min-h-[20px] mx-4 text-center">
                    {errorMsg}
                </div>

                {/* Black Player Info */}
                <div className={`text-xl font-bold flex flex-col items-end gap-1 ${currentTurn === 'black' ? 'text-red-900 drop-shadow-[0_0_5px_currentColor]' : 'text-[#A89C86]'} relative`}>
                    <div className="flex items-center gap-2">
                        {isCheck && currentTurn === 'black' && <span className="text-[#B39A62] text-sm animate-pulse font-serif tracking-widest">(CHECK)</span>}
                        {blackRatingToDisplay !== null && <span className="text-gray-400 text-sm">({blackRatingToDisplay})</span>} {blackName} <div className="w-7 h-7 rounded-full bg-[#191714] border border-red-500/50 flex items-center justify-center"><span className="text-xs">🤖</span></div>
                    </div>
                    <span className="text-2xl font-mono">{formatTime(timeLeftBlack)}</span>
                    {/* Black Emote */}
                    {activeEmotes.black && (
                        <div className="absolute top-10 right-0 bg-white border-2 border-red-500 rounded-2xl rounded-tr-none px-3 py-1 shadow-lg z-50 animate-bounce">
                            <span className="text-2xl">{EMOTES[activeEmotes.black].emoji}</span>
                        </div>
                    )}
                </div>
            </div>
            
            {showCheckWarning && !winner && (
                <div className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center">
                    <div className="bg-black/60 backdrop-blur-sm px-8 py-3 border border-[#B39A62]/50 rounded animate-stamp">
                        <span className="text-xl md:text-2xl font-serif font-bold text-[#B39A62] tracking-[0.3em] uppercase">
                            {t.quantumCheck}
                        </span>
                    </div>
                </div>
            )}

            {winner && (
                <div className="absolute inset-0 bg-[#11100E]/90 flex flex-col items-center justify-center z-50 backdrop-blur-sm rounded-lg border border-[#B39A62]/20">
                    <div className="flex flex-col items-center gap-6 px-6 max-w-full">
                        <div className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-[#E8E2D7] tracking-[0.2em] text-center animate-stamp">
                            {winner === 'draw' ? 'DRAW' : 'CHECKMATE'}
                        </div>
                        <div className="w-16 h-px bg-[#B39A62]/50"></div>
                        <div className={`text-base sm:text-lg md:text-xl font-serif tracking-widest text-center ${winner === 'draw' ? 'text-[#A89C86]' : winner === 'white_wins' ? 'text-[#E8E2D7]' : 'text-[#A89C86]'}`}>
                            {winner === 'draw' 
                                ? 'Draw (Stalemate)' 
                                : onlineRole
                                    ? (winner === 'white_wins' && onlineRole === 'white') || (winner === 'black_wins' && onlineRole === 'black')
                                        ? `You Won! (${winner === 'white_wins' ? t.whiteWon : t.blackWon})`
                                        : `Opponent Won (${winner === 'white_wins' ? t.whiteWon : t.blackWon})`
                                    : winner === 'white_wins'
                                        ? `${whiteName} (${t.whiteWon})`
                                        : `${blackName} (${t.blackWon})`}
                        </div>
                        <div className="flex flex-wrap gap-3 mt-4 justify-center">
                            <button 
                                onClick={onHome || (() => window.location.reload())}
                                className="px-5 py-3 bg-[#191714] hover:bg-[#2A2621] border border-[#A89C86]/30 rounded text-sm font-serif tracking-widest transition-colors text-[#A89C86] hover:text-[#E8E2D7]"
                            >
                                {t.home}
                            </button>
                            <button 
                                onClick={() => window.location.reload()}
                                className="px-5 py-3 bg-[#B39A62] hover:bg-[#D0C8B6] text-[#11100E] rounded text-sm font-serif font-bold tracking-widest transition-colors"
                            >
                                {t.rematch}
                            </button>
                            <button 
                                onClick={() => {
                                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(moveHistory, null, 2));
                                    const downloadAnchorNode = document.createElement('a');
                                    downloadAnchorNode.setAttribute("href", dataStr);
                                    downloadAnchorNode.setAttribute("download", `quantum_chess_record_${Date.now()}.json`);
                                    document.body.appendChild(downloadAnchorNode);
                                    downloadAnchorNode.click();
                                    downloadAnchorNode.remove();
                                }}
                                className="px-5 py-3 bg-[#191714] hover:bg-[#2A2621] border border-[#A89C86]/30 rounded text-sm font-serif tracking-widest transition-colors text-[#A89C86] hover:text-[#E8E2D7]"
                            >
                                {t.downloadJson}
                            </button>
                        </div>
                        {savedRecordId && (
                            <div className="mt-2 text-xs text-[#A89C86] flex flex-col items-center gap-1 bg-black/30 p-3 rounded border border-[#A89C86]/10">
                                <span>{t.cloudRecordSaved}</span>
                                <span className="font-mono text-[10px] select-all text-[#B39A62] bg-black/50 px-2 py-1 rounded">{savedRecordId}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* CPU側の取得駒（取られた味方駒） */}
            <div className="w-full flex gap-2 min-h-[48px] mb-2 p-2 bg-black/40 border border-red-900/30 rounded-lg items-center overflow-x-auto shrink-0">
                <div className="flex items-center gap-2 min-w-[100px] shrink-0 opacity-70">
                    <div className="w-6 h-6 rounded-full bg-red-950/30 flex items-center justify-center border border-red-900/50"><span className="text-[10px] opacity-50">🤖</span></div>
                    <span className="text-red-900 font-bold text-xs uppercase whitespace-nowrap">{opponentName} {t.captured}:</span>
                </div>
                <div className="flex gap-1">
                    {tokens.filter(t => t.player === 'white' && t.isCaptured).map(token => (
                        <div key={token.id} className="scale-75 origin-left opacity-80">
                            <QuantumPieceUI id={token.id} player={token.player} probabilities={token.probabilities} isSelected={false} onClick={() => {}} promotedTo={token.promotedTo} />
                        </div>
                    ))}
                </div>
            </div>

            <div className="w-full flex-1 min-h-0 flex items-center justify-center">
                <div className={`
                    grid grid-cols-8 grid-rows-8 border-4 bg-[#0b0c10] shadow-2xl w-full max-w-[min(100%,_calc(100dvh-320px))] aspect-square relative transition-all duration-300
                    ${showCheckWarning ? 'border-[#B39A62]/70 shadow-[#B39A62]/20' : 'border-[#A89C86]/30 shadow-gray-900'}
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
                    
                    // このマスが、選択中の駒の移動可能マスかどうかを判定
                    const isMoveCandidate = showMoveHints && validMoves.some(m => m.r === row && m.c === col);
                    const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
                    const isLastMoveSquare = lastMove && ((lastMove.from[0] === row && lastMove.from[1] === col) || (lastMove.to[0] === row && lastMove.to[1] === col));
                    const isCapturable = isMoveCandidate && tokenHere && tokenHere.player !== currentTurn;

                    return (
                        <div 
                            key={index}
                            onClick={() => handleSquareClick(row, col)}
                            className={`
                                relative flex justify-center items-center cursor-pointer transition-colors
                                aspect-square w-full h-full
                                ${isDark ? 'bg-[#11100E]' : 'bg-[#191714]'}
                                ${isLastMoveSquare ? (isDark ? 'bg-[#B39A62]/20' : 'bg-[#B39A62]/30') : ''}
                                ${isMoveCandidate ? (isCapturable ? 'hover:bg-red-900/30' : 'hover:bg-[#B39A62]/20') : 'hover:bg-[#E8E2D7]/5'}
                            `}
                        >
                            {/* 移動先候補のハイライト描画 */}
                            {isMoveCandidate && !tokenHere && (
                                <div className="absolute inset-0 border-4 border-[#B39A62]/60 shadow-[inset_0_0_15px_rgba(179,154,98,0.5)] pointer-events-none animate-pulse" />
                            )}
                            {isMoveCandidate && tokenHere && (
                                <div className={`absolute inset-1 border-4 ${isCapturable ? 'border-red-600/60' : 'border-[#B39A62]/60'} rounded pointer-events-none animate-pulse`} />
                            )}
                        </div>
                    );
                })}
                
                {/* Draw Animated Pieces */}
                {tokens.filter(t => !t.isCaptured).map(token => {
                    const isFlipped = onlineRole === 'black';
                    const visualRow = isFlipped ? 7 - token.row : token.row;
                    const visualCol = isFlipped ? 7 - token.col : token.col;
                    const isSelected = token.id === selectedTokenId;
                    const isMoving = movingPiece?.id === token.id;
                    
                    let transformStyle = '';
                    if (isSelected) {
                        transformStyle = 'translateY(-15px) scale(1.15)';
                    } else if (isMoving) {
                        transformStyle = 'translateY(-10px) scale(1.1)';
                    } else {
                        transformStyle = 'scale(1)';
                    }

                    // During animation, use the target coordinates
                    let renderRow = visualRow;
                    let renderCol = visualCol;
                    if (isMoving && movingPiece) {
                        renderRow = isFlipped ? 7 - movingPiece.toRow : movingPiece.toRow;
                        renderCol = isFlipped ? 7 - movingPiece.toCol : movingPiece.toCol;
                    }

                    return (
                        <div 
                            key={token.id}
                            className="absolute flex items-center justify-center pointer-events-none"
                            style={{
                                width: '12.5%',
                                height: '12.5%',
                                left: `${renderCol * 12.5}%`,
                                top: `${renderRow * 12.5}%`,
                                zIndex: isSelected || isMoving ? 50 : 20,
                                transition: 'left 0.4s cubic-bezier(0.4, 0, 0.2, 1), top 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s ease',
                                transform: transformStyle,
                                filter: isSelected || isMoving ? 'drop-shadow(0 20px 15px rgba(0,0,0,0.9))' : 'none',
                            }}
                        >
                            <div className="w-full h-full scale-[0.85] flex items-center justify-center pointer-events-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); handleSquareClick(token.row, token.col); }}>
                                <QuantumPieceUI 
                                    id={token.id}
                                    player={token.player}
                                    probabilities={token.probabilities}
                                    isSelected={false} // lifting animation is handled by wrapper
                                    onClick={() => {}} 
                                    promotedTo={token.promotedTo}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
            </div>
            
            {/* プレイヤー側の取得駒（取った敵駒） */}
            <div className="w-full flex gap-2 min-h-[48px] mt-2 p-2 bg-black/40 border border-blue-900/30 rounded-lg items-center overflow-x-auto shrink-0">
                <div className="flex items-center gap-2 min-w-[100px] shrink-0">
                    {user?.avatar_url ? (
                        <img src={user.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover border border-[#4A4238]" />
                    ) : (
                        <div className="w-6 h-6 rounded-full bg-[#191714] flex items-center justify-center border border-[#4A4238]"><span className="text-[10px]">👤</span></div>
                    )}
                    <span className="text-[#E8E5DF] font-bold text-sm uppercase whitespace-nowrap">{playerName} {t.captured}:</span>
                </div>
                <div className="flex gap-1">
                    {tokens.filter(t => t.player === 'black' && t.isCaptured).map(token => (
                        <div key={token.id} className="scale-75 origin-left opacity-80">
                            <QuantumPieceUI id={token.id} player={token.player} probabilities={token.probabilities} isSelected={false} onClick={() => {}} promotedTo={token.promotedTo} />
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

                <div className="flex gap-2">
                    <button
                        onClick={() => setShowRules(true)}
                        className="px-3 py-1.5 bg-[#191714] hover:bg-[#2A2621] border border-[#B39A62]/50 rounded text-xs text-[#E8E2D7] font-bold transition-all flex items-center gap-1.5 shadow-sm"
                    >
                        <span>❓</span>
                        <span>{lang === 'ja' ? 'ルール' : 'Rules'}</span>
                    </button>
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
            </div>

            <div className="mt-4 text-[#00ff41] text-sm opacity-80 text-center px-4">
                {t.tips}
            </div>

            {/* Resign Confirmation Modal */}
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

            {/* Rules Modal */}
            {showRules && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-[#161513] border border-[#B39A62]/30 rounded-xl p-8 max-w-md w-full shadow-2xl flex flex-col gap-4 text-center">
                        <h3 className="text-xl font-bold text-[#E8E2D7] tracking-widest uppercase">
                            {lang === 'ja' ? '遊び方' : 'How to Play'}
                        </h3>
                        <div className="text-sm text-gray-400 text-left space-y-3">
                            <p>• <strong>{lang === 'ja' ? '勝利条件:' : 'Victory:'}</strong> {lang === 'ja' ? '相手のキングを取るか、チェックメイトすると勝利です。' : 'Capture the enemy King or Checkmate them.'}</p>
                            <p>• <strong>{lang === 'ja' ? '重ね合わせ:' : 'Superposition:'}</strong> {lang === 'ja' ? '駒は初期状態では複数の正体（可能性）を持っています。駒を動かすことで、その動き方に基づいて可能性が絞り込まれていきます。' : 'All pieces start with multiple possible identities. Moving a piece collapses its possibilities based on how it moved.'}</p>
                            <p>• <strong>{lang === 'ja' ? '正体の確定:' : 'Discovery:'}</strong> {lang === 'ja' ? '正体が確定していない敵の駒は、実はキングかもしれません。慎重に攻めましょう！' : 'Be careful! Any unknown enemy piece could turn out to be their King when revealed.'}</p>
                        </div>
                        <div className="flex gap-3 w-full mt-4">
                            <button
                                onClick={() => setShowRules(false)}
                                className="flex-1 py-2.5 bg-[#191714] hover:bg-gray-700 border border-gray-600 rounded-lg text-sm text-[#E8E2D7] font-bold transition-colors"
                            >
                                {lang === 'ja' ? '閉じる' : 'Close'}
                            </button>
                            <a
                                href="/rules"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 py-2.5 bg-[#B39A62] hover:bg-[#D0C8B6] rounded-lg text-sm text-[#11100E] font-bold transition-colors shadow-lg shadow-[#B39A62]/30 block text-center"
                            >
                                {lang === 'ja' ? '詳しいルール' : 'Full Rules Guide'}
                            </a>
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

            {castlingPending && (
                <div className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-6">
                    <div className="bg-[#2A2621] border-2 border-[#D4B872]/30 rounded-xl p-8 max-w-md w-full text-center relative shadow-2xl">
                        <h2 className="text-[#B39A62] text-2xl font-serif font-bold mb-6">
                            {t.castlingConfirmTitle || 'Castling or Normal Move?'}
                        </h2>
                        <p className="text-[#E8E2D7]/80 mb-8 font-serif">
                            {t.castlingConfirmDesc || 'This move can be interpreted as Castling or a normal Rook/Queen move. Please select your intention.'}
                        </p>
                        <div className="flex flex-col gap-4">
                            <button
                                className="px-6 py-4 bg-[#D4B872] hover:bg-[#F2D794] text-[#1A1814] font-serif font-bold rounded-lg transition-colors"
                                onClick={() => {
                                    const newValidTypes = ['King'] as PieceType[];
                                    executeMove(
                                        castlingPending.token,
                                        castlingPending.targetRow,
                                        castlingPending.targetCol,
                                        newValidTypes,
                                        castlingPending.targetToken,
                                        true
                                    );
                                    setCastlingPending(null);
                                }}
                            >
                                {t.castlingOption || 'Castling (King)'}
                            </button>
                            <button
                                className="px-6 py-4 border-2 border-[#D4B872] hover:bg-[#D4B872]/10 text-[#B39A62] font-serif font-bold rounded-lg transition-colors"
                                onClick={() => {
                                    const newValidTypes = castlingPending.validTypes.filter(type => type !== 'King');
                                    executeMove(
                                        castlingPending.token,
                                        castlingPending.targetRow,
                                        castlingPending.targetCol,
                                        newValidTypes,
                                        castlingPending.targetToken,
                                        true
                                    );
                                    setCastlingPending(null);
                                }}
                            >
                                {t.normalMoveOption || 'Normal Move (Rook/Queen)'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {promotionPending && (
                <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
                    <div className="bg-[#161513] border border-[#B39A62]/30 p-8 rounded-lg max-w-sm w-full text-center shadow-2xl">
                        <h3 className="text-xl tracking-[0.2em] font-serif text-[#E8E2D7] mb-2">{t.promotionTitle}</h3>
                        <p className="text-[#A89C86] text-xs tracking-widest mb-6 font-serif">{t.promotionDesc}</p>
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            {(['Queen', 'Rook', 'Bishop', 'Knight'] as PieceType[]).map(pt => (
                                <button
                                    key={pt}
                                    onClick={() => {
                                        executeMove(
                                            promotionPending.token,
                                            promotionPending.targetRow,
                                            promotionPending.targetCol,
                                            promotionPending.validTypes,
                                            promotionPending.targetToken,
                                            promotionPending.isLocalMove,
                                            pt
                                        );
                                        setPromotionPending(null);
                                    }}
                                    className="p-4 bg-[#191714] border border-[#B39A62]/30 hover:bg-[#B39A62] hover:text-[#11100E] rounded text-[#E8E2D7] font-serif tracking-widest transition-all"
                                >
                                    {pt}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => {
                                const newValidTypes = promotionPending.validTypes.filter(type => type !== 'Pawn');
                                if (newValidTypes.length === 0) {
                                    setErrorMsg(t.errIdentity);
                                } else {
                                    executeMove(
                                        promotionPending.token,
                                        promotionPending.targetRow,
                                        promotionPending.targetCol,
                                        newValidTypes,
                                        promotionPending.targetToken,
                                        promotionPending.isLocalMove
                                    );
                                }
                                setPromotionPending(null);
                            }}
                            className="w-full p-3 bg-red-950/40 border border-red-500/30 hover:bg-[#2A2621] hover:border-red-400 rounded text-red-300 font-bold transition-all text-sm"
                        >
                            {t.promotionCancel}
                        </button>
                    </div>
                        <div className="w-full max-w-sm mt-12 bg-black/50 p-4 rounded-lg">
                            <p className="text-[#A89C86] text-[10px] tracking-widest text-center mb-2">Advertisement</p>
                            <AdBanner adClient="ca-pub-1116866075179199" adSlot="8798363654" />
                        </div>
                    </div>
                )}
        </div>
    );
}
