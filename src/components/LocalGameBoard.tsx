'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { IdentityPool } from '../lib/IdentityPool';
import { Token, deduceMoveTypes, calculateProbabilities, isPlayerInCheck, checkGameOver, isCheckmate } from '../lib/GameEngine';
import { QuantumPieceUI } from './QuantumPieceUI';
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
    const t = dict[lang];
    const [pool, setPool] = useState(() => new IdentityPool());
    const poolRef = useRef<IdentityPool>(pool);
    useEffect(() => { poolRef.current = pool; }, [pool]);
    const [tokens, setTokens] = useState<Token[]>([]);
    const tokensRef = useRef<Token[]>([]);
    const executeMoveRef = useRef<any>(null);
    useEffect(() => { tokensRef.current = tokens; executeMoveRef.current = executeMove; }, [tokens]);
    const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
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

    // CPUターンの処理
    useEffect(() => {
        if (currentTurn === 'black' && !winner && !roomId) {
            const timer = setTimeout(async () => {
                if (cpuLevel && cpuLevel >= 4) {
                    // Level 4, 5: サーバーレスAI（深い読み）
                    try {
                        const poolData = {
                            piecePossibilities: Object.fromEntries(
                                Array.from(pool.piecePossibilities.entries()).map(([k, v]) => [k, Array.from(v)])
                            )
                        };
                        const res = await fetch('/api/ai-move', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                level: cpuLevel,
                                tokens,
                                poolData,
                                cpuPlayer: 'black',
                                timeControl
                            })
                        });
                        const data = await res.json();
                        if (data.move) {
                            const aiToken = tokens.find(t => t.id === data.move.tokenId);
                            if (!aiToken) return;
                            executeMove(
                                aiToken,
                                data.move.targetRow,
                                data.move.targetCol,
                                data.move.possibleTypes,
                                tokens.find(t => t.row === data.move.targetRow && t.col === data.move.targetCol),
                                true,
                                data.move.promotedTo
                            );
                        } else {
                            // If CPU has no valid moves, it passes (e.g. stalemate)
                            setCurrentTurn('white');
                        }
                    } catch (err) {
                        console.error("AI fetch failed:", err);
                        // Fallback to human turn if AI crashes
                        setCurrentTurn('white');
                    }
                } else {
                    // Level 1~3: ブラウザローカルAI
                    const { calculateCPUMove } = await import('../lib/AIEngine');
                    const move = calculateCPUMove(cpuLevel || 1, tokens, pool, 'black');
                    if (move) {
                        const aiToken = tokens.find(t => t.id === move.tokenId);
                        if (!aiToken) return;
                        const targetToken = tokens.find(t => t.row === move.targetRow && t.col === move.targetCol);
                        executeMove(aiToken, move.targetRow, move.targetCol, move.possibleTypes, targetToken, true, move.promotedTo);
                    } else {
                        setCurrentTurn('white');
                    }
                }
            }, 500); // サーバーレス呼び出しの場合はレスポンス時間が追加されるので少し短めに
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
        
        // Record move in history
        const newTurn = turnCount + 1;
        setTurnCount(newTurn);
        const moveRecord: MoveRecord = {
            turn: newTurn,
            player: currentTurn,
            tokenId: token.id,
            from: [token.row, token.col],
            to: [targetRow, targetCol],
            possibleTypes: possibleTypesForMove,
            capturedTokenId: targetToken?.id,
            promotedTo,
        };
        setMoveHistory(prev => [...prev, moveRecord]);

        playMoveSound();

        let updatedTokens = tokens.map(t => {
            if (targetToken && t.id === targetToken.id) {
                // 取られた駒からは「キングの可能性」を明示的に除外する
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
        if (possibleTypesForMove.includes('Pawn') && !targetToken && targetCol !== token.col) {
            // Diagonal move without targetToken = En Passant
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
                moveRecord.capturedTokenId = epToken.id;
            }
        }

        // 全体プールで矛盾（取った駒が絶対に玉だった、などの矛盾）が発生したかチェック
        const isValid = pool.resolveGlobalConstraints(updatedTokens);

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
                
                // チェックされていて、逃げ道がないならチェックメイト
                if (checkStatus) {
                    const mate = isCheckmate(nextTurn, activeTokens, pool);
                    if (mate) {
                        setWinner(currentTurn === 'white' ? 'white_wins' : 'black_wins');
                    }
                } else {
                    // Stalemate detection
                    if (isCheckmate(nextTurn, activeTokens, pool)) {
                        setWinner('draw');
                    }
                }
            }
        }

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
        <div className="flex flex-col items-center w-full max-w-[800px] relative">
            

            {disconnectTimeLeft !== null && (
                <div className="w-full mb-3 p-3 bg-red-950/80 border border-red-500 rounded-lg flex flex-col items-center justify-center animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]">
                    <span className="text-red-400 font-bold text-sm md:text-base">
                        {lang === 'ja' ? '⚠️ 相手の通信が切断されました。再接続を待っています...' : '⚠️ Opponent disconnected. Waiting for reconnection...'}
                    </span>
                    <span className="text-red-300 font-mono text-xl mt-1 font-black">
                        {Math.floor(disconnectTimeLeft / 60)}:{(disconnectTimeLeft % 60).toString().padStart(2, '0')}
                    </span>
                </div>
            )}

            <div className="flex justify-between w-full mb-4 px-4 items-center bg-gray-900/40 py-2 border-b border-cyan-900/50 relative">
                {/* White Player Info */}
                <div className={`text-xl font-bold flex flex-col items-start gap-1 ${currentTurn === 'white' ? 'text-blue-400 drop-shadow-[0_0_5px_currentColor]' : 'text-gray-500'} relative`}>
                    <div className="flex items-center gap-2">
                        🟦 {whiteName} {whiteRatingToDisplay !== null && <span className="text-gray-400 text-sm">({whiteRatingToDisplay})</span>}
                        {isCheck && currentTurn === 'white' && <span className="text-red-500 text-sm animate-pulse">(CHECK)</span>}
                    </div>
                    <span className="text-2xl font-mono">{formatTime(timeLeftWhite)}</span>
                    {/* White Emote */}
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
                        {isCheck && currentTurn === 'black' && <span className="text-red-500 text-sm animate-pulse">(CHECK)</span>}
                        {blackRatingToDisplay !== null && <span className="text-gray-400 text-sm">({blackRatingToDisplay})</span>} {blackName} 🟥
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
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
                    <div className="text-6xl font-black text-red-600 animate-ping opacity-70 whitespace-nowrap">{t.quantumCheck}</div>
                    <div className="text-6xl font-black text-red-500 absolute inset-0 whitespace-nowrap">{t.quantumCheck}</div>
                </div>
            )}

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
                        <button 
                            onClick={() => window.location.reload()}
                            className="px-8 py-4 bg-white/10 hover:bg-white/20 border-2 border-white/50 rounded-lg text-2xl font-bold tracking-wider transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                        >
                            {t.rematch}
                        </button>
                        <button 
                            onClick={() => {
                                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(moveHistory, null, 2));
                                const downloadAnchorNode = document.createElement('a');
                                downloadAnchorNode.setAttribute("href", dataStr);
                                downloadAnchorNode.setAttribute("download", `quantum_chess_record_${Date.now()}.json`);
                                document.body.appendChild(downloadAnchorNode); // required for firefox
                                downloadAnchorNode.click();
                                downloadAnchorNode.remove();
                            }}
                            className="px-6 py-4 bg-cyan-900/30 hover:bg-cyan-800/50 border border-cyan-500/50 rounded-lg text-lg font-bold tracking-wider transition-all text-cyan-300 flex flex-col items-center justify-center"
                        >
                            <span className="text-sm opacity-70">{t.saveReplay}</span>
                            {t.downloadJson}
                        </button>
                    </div>
                    {savedRecordId && (
                        <div className="mt-8 text-sm text-gray-400 flex flex-col items-center gap-2 bg-black/40 p-4 rounded-lg border border-gray-700">
                            <span>{t.cloudRecordSaved}</span>
                            <span className="font-mono text-xs select-all text-cyan-500 bg-black p-2 rounded">{savedRecordId}</span>
                        </div>
                    )}
                </div>
            )}

            {/* CPU側の取得駒（取られた味方駒） */}
            <div className="w-full flex gap-2 min-h-[48px] mb-2 p-2 bg-black/40 border border-red-900/30 rounded-lg items-center overflow-x-auto">
                <span className="text-red-500/70 font-bold text-xs uppercase whitespace-nowrap min-w-[60px]">{opponentName} {t.captured}:</span>
                <div className="flex gap-1">
                    {tokens.filter(t => t.player === 'white' && t.isCaptured).map(token => (
                        <div key={token.id} className="scale-75 origin-left opacity-80">
                            <QuantumPieceUI id={token.id} player={token.player} probabilities={token.probabilities} isSelected={false} onClick={() => {}} promotedTo={token.promotedTo} />
                        </div>
                    ))}
                </div>
            </div>

            <div className={`
                grid grid-cols-8 grid-rows-8 border-4 bg-[#0b0c10] shadow-2xl w-full aspect-square relative transition-all duration-300
                ${showCheckWarning ? 'border-red-600 shadow-red-900/50' : 'border-gray-700 shadow-gray-900'}
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

                    return (
                        <div 
                            key={index}
                            onClick={() => handleSquareClick(row, col)}
                            className={`
                                relative flex justify-center items-center cursor-pointer transition-colors
                                aspect-square w-full h-full
                                ${isDark ? 'bg-[#1a202c]' : 'bg-[#2d3748]'}
                                ${isMoveCandidate ? 'hover:bg-[#00ff41]/20' : 'hover:bg-white/10'}
                            `}
                        >
                            {/* 移動先候補のハイライト描画 */}
                            {isMoveCandidate && !tokenHere && (
                                <div className="absolute w-4 h-4 rounded-full bg-[#00ff41]/50 pointer-events-none animate-pulse" />
                            )}
                            {isMoveCandidate && tokenHere && (
                                <div className="absolute inset-1 border-4 border-red-500/60 rounded pointer-events-none animate-pulse" />
                            )}

                            {tokens.filter(t => !t.isCaptured && t.row === row && t.col === col).map(token => (
                                <QuantumPieceUI 
                                    key={token.id}
                                    id={token.id}
                                    player={token.player}
                                    probabilities={token.probabilities}
                                    isSelected={token.id === selectedTokenId}
                                    onClick={() => {}} 
                                    promotedTo={token.promotedTo}
                                />
                            ))}
                        </div>
                    );
                })}
            </div>
            
            {/* プレイヤー側の取得駒（取った敵駒） */}
            <div className="w-full flex gap-2 min-h-[48px] mt-2 p-2 bg-black/40 border border-blue-900/30 rounded-lg items-center overflow-x-auto">
                <span className="text-blue-400/70 font-bold text-xs uppercase whitespace-nowrap min-w-[60px]">{playerName} {t.captured}:</span>
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
                        className="rounded border-gray-700 bg-gray-800 text-cyan-500 focus:ring-cyan-500/50 w-4 h-4 cursor-pointer" 
                    />
                    {lang === 'ja' ? 'コマの移動範囲を表示' : 'Show movable range'}
                </label>

                {!winner && onlineRole !== 'spectator' && (
                    <button
                        onClick={() => setShowResignConfirm(true)}
                        className="px-3 py-1.5 bg-red-950/50 hover:bg-red-900/80 border border-red-800/80 hover:border-red-600 rounded text-xs text-red-400 hover:text-red-200 font-bold transition-all flex items-center gap-1.5 shadow-sm"
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
            {showResignConfirm && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-gray-900 border border-red-500/50 rounded-xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center">
                        <span className="text-4xl mb-3">🏳️</span>
                        <h3 className="text-lg font-bold text-white mb-2">
                            {lang === 'ja' ? '投了しますか？' : 'Resign Match?'}
                        </h3>
                        <p className="text-sm text-gray-400 mb-6">
                            {lang === 'ja' ? '投了すると相手の勝利となります。本当に対局を終了しますか？' : 'Resigning will forfeit the match to your opponent. Are you sure?'}
                        </p>
                        <div className="flex gap-3 w-full">
                            <button
                                onClick={() => setShowResignConfirm(false)}
                                className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-300 font-bold transition-colors"
                            >
                                {lang === 'ja' ? 'キャンセル' : 'Cancel'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowResignConfirm(false);
                                    handleResign();
                                }}
                                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm text-white font-bold transition-colors shadow-lg shadow-red-600/30"
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
                        className="w-14 h-14 bg-indigo-900 border-2 border-indigo-500 rounded-full flex items-center justify-center text-3xl shadow-[0_0_15px_rgba(99,102,241,0.5)] hover:scale-110 transition-transform"
                    >
                        💬
                    </button>
                    {showEmoteMenu && (
                        <div className="absolute bottom-16 right-0 bg-gray-900 border border-indigo-500 rounded-xl p-2 flex flex-col gap-2 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
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

            {castlingPending && (
                <div className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-6">
                    <div className="bg-[#2A2621] border-2 border-[#D4B872]/30 rounded-xl p-8 max-w-md w-full text-center relative shadow-2xl">
                        <h2 className="text-[#D4B872] text-2xl font-serif font-bold mb-6">
                            {t.castlingConfirmTitle || 'Castling or Normal Move?'}
                        </h2>
                        <p className="text-white/80 mb-8 font-serif">
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
                                className="px-6 py-4 border-2 border-[#D4B872] hover:bg-[#D4B872]/10 text-[#D4B872] font-serif font-bold rounded-lg transition-colors"
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
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border-2 border-cyan-500/50 p-6 rounded-lg max-w-sm w-full text-center">
                        <h3 className="text-xl font-bold text-cyan-300 mb-2">{t.promotionTitle}</h3>
                        <p className="text-cyan-500/70 text-sm mb-6">{t.promotionDesc}</p>
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
                                    className="p-3 bg-cyan-950/40 border border-cyan-500/30 hover:bg-cyan-800/50 hover:border-cyan-400 rounded text-cyan-300 font-bold transition-all"
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
                            className="w-full p-3 bg-red-950/40 border border-red-500/30 hover:bg-red-900/50 hover:border-red-400 rounded text-red-300 font-bold transition-all text-sm"
                        >
                            {t.promotionCancel}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
