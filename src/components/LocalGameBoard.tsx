'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { matchText } from '../locales/matchText';
import { useBoardPreferences } from '../hooks/useBoardPreferences';
import { useMoveHint } from '../hooks/useMoveHint';
import { IdentityPool } from '../lib/IdentityPool';
import { Token, deduceMoveTypes, isPlayerInCheck } from '../lib/GameEngine';
import { QuantumPieceUI } from './QuantumPieceUI';
import { Board3D } from './Board3D';
import { MatchResultDialog } from './MatchResultDialog';
import { MatchIntro } from './MatchIntro';
import { MatchLayout } from './MatchLayout';
import { Board2D } from './Board2D';
import { Language, dict } from '../locales/dict';
import { User, TimeControl } from '../types/game';
import { PieceType } from '../config/gameConfig';
import { supabase } from '../lib/supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';
import { MoveRecord, saveGameRecord, GameRecord } from '../lib/gameRecordService';
import { cpuDifficulty } from '../config/cpuDifficulty';
import { requestCPUSearch } from '../lib/cpuClient';
import { legacyToQuantumState, quantumToLegacyMove } from '../quantum-engine/adapter';
import { getWinner } from '../quantum-engine/terminal';
import { isCheckmateFinish } from '../lib/checkmatePresentation';
import { createLocalPosition, applyLocalMove } from '../lib/localGame';
import { recordReplayMove } from '../lib/replayHistory';
import { replayText } from '../locales/replayText';
import { ReplaySaveSession } from '../lib/replaySave';
import { RankedLoginDialog } from './RankedLoginDialog';
import { soundManager } from '../lib/SoundService';
import type { CPUPersonality, CampaignOutcome } from '../config/campaign';
import type { CPUSearchProfile } from '../config/cpuDifficulty';

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
    cpuPersonality?: CPUPersonality;
    cpuSearchProfile?:CPUSearchProfile;
    opponentLabel?: string;
    campaignLabel?: string;
    onComplete?: (outcome:CampaignOutcome) => void;
    resultPanel?: React.ReactNode;
}

export default function GameBoard({ lang, user, cpuLevel, roomId, onlineRole, matchMode, opponentId, timeControl = '10m', onHome, cpuPersonality, cpuSearchProfile, opponentLabel, campaignLabel, onComplete, resultPanel }: GameBoardProps) {
    const playerSide = onlineRole === 'black' ? 'black' : 'white';
    const cpuSide = playerSide === 'white' ? 'black' : 'white';
    const t = { ...dict['en'], ...(dict[lang] || {}) } as any;
    const { is2DView, setIs2DView, boardDesign, boardFinish, pieceFinish, victoryEffect, avatarFrame } = useBoardPreferences();
    const hintsUsed=useRef(0);
    const [introDone,setIntroDone]=useState(!!roomId);
    const finishIntro=useCallback(()=>setIntroDone(true),[]);
    const perMoveTime=useRef({turns:0,remaining:0});
    const turnClock=useRef({start:0,base:timeControl==='10s'?10:timeControl==='3m'?180:600});
    const resultReported=useRef(false);
    const [showHomeConfirm, setShowHomeConfirm] = useState(false);
    const [showReplayLogin, setShowReplayLogin] = useState(false);
    const [viewResetKey, setViewResetKey] = useState(0);
    const [initialPosition] = useState(createLocalPosition);
    const [pool, setPool] = useState(initialPosition.pool);
    const poolRef = useRef<IdentityPool>(pool);
    useEffect(() => { poolRef.current = pool; }, [pool]);
    const [tokens, setTokens] = useState<Token[]>(initialPosition.tokens);
    const [movingPiece, setMovingPiece] = useState<{ id: string, fromRow: number, fromCol: number, toRow: number, toCol: number } | null>(null);
    useEffect(() => {
        if (!movingPiece) return;
        const timer = setTimeout(() => setMovingPiece(null), 400);
        return () => clearTimeout(timer);
    }, [movingPiece]);
    const tokensRef = useRef<Token[]>([]);
    const executeMoveRef = useRef<((token: Token, targetRow: number, targetCol: number, possibleTypesForMove: PieceType[], targetToken?: Token, isLocalMove?: boolean, promotedTo?: PieceType) => void) | null>(null);
    
    
    const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
    const [tutorialHint, setTutorialHint] = useState<string | null>(null);
    const [showRules, setShowRules] = useState(false);

    const [cpuRetry, setCpuRetry] = useState(0);
    const [cpuFailed, setCpuFailed] = useState(false);
    const [currentTurn, setCurrentTurn] = useState<'white' | 'black'>('white');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [fetchedOpponentName, setFetchedOpponentName] = useState<string | null>(null);
    const [myRating, setMyRating] = useState<number | null>(null);
    const [opponentRating, setOpponentRating] = useState<number | null>(null);

    // Fetch only public fields; missing ratings remain unavailable, never fabricated.
    useEffect(()=>{
        let cancelled=false;
        const ratingCol=timeControl==='10s'?'rating_10s':timeControl==='3m'?'rating_3m':'rating_10m';
        const fetchRating=async(id:string|undefined,own:boolean)=>{
            if(!id||id.startsWith('GUEST-'))return;
            const {data,error}=await supabase.from('profiles').select('name,'+ratingCol).eq('id',id).maybeSingle();
            if(cancelled||error||!data)return;
            const profile=data as unknown as Record<string,unknown>,rating=profile[ratingCol];
            if(typeof rating==='number'&&Number.isFinite(rating)&&rating>=0)(own?setMyRating:setOpponentRating)(rating);
            if(!own&&typeof profile.name==='string')setFetchedOpponentName(profile.name);
        };
        void fetchRating(user?.id,true);void fetchRating(opponentId,false);
        return()=>{cancelled=true;};
    },[user?.id,opponentId,timeControl]);
    const [isCheck, setIsCheck] = useState<boolean>(false);
    const [showMoveHints, setShowMoveHints] = useState<boolean>(true);
    const [showResignConfirm, setShowResignConfirm] = useState<boolean>(false);

    const handleResign = () => {
        setWinner(onlineRole === 'black' ? 'white_wins' : 'black_wins');
        setShowResignConfirm(false);
    };
    const [showCheckWarning, setShowCheckWarning] = useState<boolean>(false);
    const [winner, setWinner] = useState<'white_wins' | 'black_wins' | 'draw' | null>(null);
    const [showGameOver, setShowGameOver] = useState(false);

    useEffect(() => {
        let timer: NodeJS.Timeout | null = null;
        if (winner) {
            timer = setTimeout(() => setShowGameOver(true), 1500);
        } else {
            timer = setTimeout(() => setShowGameOver(false), 0);
        }
        return () => { if (timer) clearTimeout(timer); };
    }, [winner]);
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

    useEffect(()=>{
        if(winner||!introDone)return;
        const base=currentTurn==='white'?timeLeftWhite:timeLeftBlack;
        const start=performance.now();
        turnClock.current={start,base};
        const tick=()=>{
            const remaining=Math.max(0,base-(performance.now()-start)/1000);
            (currentTurn==='white'?setTimeLeftWhite:setTimeLeftBlack)(remaining);
            if(remaining===0)setWinner(currentTurn==='white'?'black_wins':'white_wins');
        };
        const timer=setInterval(tick,100);
        return()=>clearInterval(timer);
        // A turn has one fixed deadline; rerendering must not reset it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    },[currentTurn,winner,introDone]);

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
    const anyModalOpen = !introDone || showGameOver || showRules || showReplayLogin || promotionPending !== null || castlingPending !== null;
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('hide-settings', { detail: anyModalOpen }));
        return () => { window.dispatchEvent(new CustomEvent('hide-settings', { detail: false })); };
    }, [anyModalOpen]);

    const moveHistoryRef = useRef<MoveRecord[]>([]);
    const [turnCount, setTurnCount] = useState(0);
    const [savedRecordId, setSavedRecordId] = useState<string | null>(null);
    const [replaySave] = useState(() => new ReplaySaveSession());
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'failed'>('idle');
    const [saveAttempt, setSaveAttempt] = useState(0);

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
    const pickupSoundRef = useRef<HTMLAudioElement | null>(null);
    const landingSoundRef = useRef<HTMLAudioElement | null>(null);
    
    useEffect(() => {
        const audio1 = new Audio('/sounds/spo_ge_syogi04.mp3');
        audio1.preload = 'auto';
        pickupSoundRef.current = audio1;

        const audio2 = new Audio('/sounds/spo_ge_syogi04.mp3');
        audio2.preload = 'auto';
        landingSoundRef.current = audio2;
    }, []);

    const playPickupSound = useCallback(() => {
        if (pickupSoundRef.current) {
            pickupSoundRef.current.currentTime = 0; 
            pickupSoundRef.current.playbackRate = 1.8;
            pickupSoundRef.current.volume = 0.4;
            pickupSoundRef.current.play().catch(() => {});
        }
    }, []);

    const playLandingSound = useCallback(() => {
        if (landingSoundRef.current) {
            landingSoundRef.current.currentTime = 0; 
            landingSoundRef.current.playbackRate = 0.85 + Math.random() * 0.3;
            landingSoundRef.current.volume = 1.0;
            landingSoundRef.current.play().catch(() => {});
        }
    }, []);
    
    const playMoveSound = playLandingSound;

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

    // A worker keeps the board responsive; cancellation discards stale replies.
    useEffect(() => {
        if (!introDone || currentTurn !== cpuSide || winner || roomId || movingPiece || tokens.length === 0) return;
        const controller = new AbortController();
        setCpuFailed(false);
        const state = legacyToQuantumState(tokens, pool, cpuSide, moveHistory.length, moveHistory.at(-1) ?? null);
        requestCPUSearch(state, controller.signal, cpuLevel, cpuPersonality, cpuSearchProfile).then(stats => {
            if (controller.signal.aborted) return;
            if (!stats.move) {
                const result = getWinner(state);
                setWinner(result === 'draw' ? 'draw' : result ? `${result}_wins` : 'draw');
                return;
            }
            const move = quantumToLegacyMove(stats.move, state);
            const aiToken = tokens.find(token => token.id === move.tokenId);
            if (aiToken) executeMoveRef.current?.(aiToken, move.targetRow, move.targetCol,
                move.possibleTypes, tokens.find(token => !token.isCaptured && token.row === move.targetRow && token.col === move.targetCol),
                true, move.promotedTo);
        }).catch(error => {
            if (controller.signal.aborted) return;
            console.error('CPU search failed:', error);
            setCpuFailed(true);
        });
        return () => controller.abort();
    }, [currentTurn, winner, tokens, pool, roomId, moveHistory, cpuRetry, movingPiece, cpuLevel, cpuSide, cpuPersonality, cpuSearchProfile, introDone]);

    useEffect(() => {
        let timer1: NodeJS.Timeout | null = null;
        let timer2: NodeJS.Timeout | null = null;
        if (isCheck && !winner) {
            timer1 = setTimeout(() => setShowCheckWarning(true), 0);
            timer2 = setTimeout(() => setShowCheckWarning(false), 2500);
        } else {
            timer1 = setTimeout(() => setShowCheckWarning(false), 0);
        }
        return () => {
            if (timer1) clearTimeout(timer1);
            if (timer2) clearTimeout(timer2);
        };
    }, [isCheck, winner, moveHistory.length]);

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
        // Ranked/random history belongs to the server. Private peers save only their own copy.
        if (!winner || savedRecordId || onlineRole === 'spectator' || (roomId && matchMode !== 'private') ||
            matchMode === 'ranked' || matchMode === 'random' || !user?.id || /^(GUEST-|anon_)/i.test(user.id)) return;
        let active = true;
        setSaveState('saving');
        const record: GameRecord = {
            white_player: playerSide === 'white' ? user.name || 'Player' : roomId ? fetchedOpponentName || 'Opponent' : 'CPU',
            black_player: playerSide === 'black' ? user.name || 'Player' : roomId ? fetchedOpponentName || 'Opponent' : 'CPU',
            white_id: playerSide === 'white' ? user.id : undefined,
            black_id: playerSide === 'black' ? user.id : undefined,
            winner, mode: roomId ? 'private' : 'cpu', cpu_level: roomId ? undefined : cpuLevel, time_control: timeControl,
            moves: moveHistory, total_moves: moveHistory.length
        };
        const request = replaySave.save(record, user.id, saveGameRecord);
        void request.then(id => {
            if (!active) return;
            if (id) setSavedRecordId(id);
            else setSaveState('failed');
        });
        return () => { active = false; };
    }, [winner, moveHistory, user?.id, user?.name, roomId, cpuLevel, savedRecordId, playerSide, timeControl, saveAttempt, onlineRole, matchMode, fetchedOpponentName, replaySave]);

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
    }, [selectedTokenId, tokens, pool, winner, moveHistory]); // tokensが変わる（ターンが進む）か選択が切り替わったら再計算

    const executeMove = (token: Token, targetRow: number, targetCol: number, possibleTypesForMove: PieceType[], targetToken?: Token, isLocalMove: boolean = true, promotedTo?: PieceType) => {
        // Tutorial hint logic (VS CPU only)
        if (cpuLevel !== undefined && token.player === playerSide) {
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

        if (!introDone || winner || movingPiece) return;
        const remaining=Math.max(0,turnClock.current.base-(performance.now()-turnClock.current.start)/1000);
        if(remaining===0){setWinner(currentTurn==='white'?'black_wins':'white_wins');return;}
        let result;
        try {
            result = applyLocalMove(tokens, pool, {
                tokenId: token.id, targetRow, targetCol,
                possibleTypes: possibleTypesForMove, promotedTo
            }, currentTurn, moveHistory);
        } catch {
            setErrorMsg(t.errInvalidMove);
            return;
        }
        (currentTurn==='white'?setTimeLeftWhite:setTimeLeftBlack)(remaining);
        if(currentTurn===playerSide&&timeControl==='10s'){perMoveTime.current.turns++;perMoveTime.current.remaining+=remaining;}
        if (isLocalMove && channelRef.current) {
            channelRef.current.send({ type: 'broadcast', event: 'move',
                payload: { userId: user?.id, tokenId: token.id, targetRow, targetCol,
                    possibleTypes: possibleTypesForMove, promotedTo } });
        }
        const moveRecord = recordReplayMove({
            turn: turnCount + 1, player: currentTurn, tokenId: token.id,
            from: [token.row, token.col], to: [targetRow, targetCol],
            possibleTypes: possibleTypesForMove, capturedTokenId: result.capturedId, promotedTo
        }, { tokens, pool }, result);
        setTurnCount(turnCount + 1);
        setMoveHistory(prev => [...prev, moveRecord]);
        const nextTurn = result.state.sideToMove;
        // Replace both snapshots; never mutate React's current pool in place.
        setPool(result.pool);
        setTokens(result.tokens);
        setMovingPiece({ id: token.id, fromRow: token.row, fromCol: token.col, toRow: targetRow, toCol: targetCol });
        setTimeout(() => playMoveSound(), 400);
        setWinner(result.state.winner === 'draw' ? 'draw' : result.state.winner ? `${result.state.winner}_wins` : null);
        setIsCheck(isPlayerInCheck(nextTurn, result.tokens, result.pool));

        setSelectedTokenId(null);
        setCurrentTurn(nextTurn);

        if (timeControl === '10s') {
            if (nextTurn === 'white') setTimeLeftWhite(10);
            else setTimeLeftBlack(10);
        }
    };

    useEffect(() => {
        tokensRef.current = tokens;
        executeMoveRef.current = executeMove;
    }, [tokens, executeMove]);


    const handleSquareClick = (targetRow: number, targetCol: number) => {
        if (!introDone || winner || movingPiece || onlineRole === 'spectator') return;
        
        // Inspection is safe while the CPU thinks; only submitting a move is blocked.
        if (!roomId && currentTurn === cpuSide) {
            const inspected = tokens.find(token => !token.isCaptured && token.row === targetRow && token.col === targetCol);
            setSelectedTokenId(inspected && inspected.id !== selectedTokenId ? inspected.id : null);
            return;
        }

        setErrorMsg(null);
        
        if (selectedTokenId) {
            const tokenIndex = tokens.findIndex(t => t.id === selectedTokenId);
            const token = tokens[tokenIndex];

            if (token.row === targetRow && token.col === targetCol) {
                setSelectedTokenId(null);
                return;
            }

            if (token.player !== currentTurn || (roomId && currentTurn !== onlineRole)) {
                const clickedOtherPiece = tokens.find(t => t.row === targetRow && t.col === targetCol);
                setSelectedTokenId(clickedOtherPiece ? clickedOtherPiece.id : null);
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
                setSelectedTokenId(clickedToken.id);
            }
        }
    };

    const formatTime = (seconds: number) => {
        seconds=Math.ceil(Math.max(0,seconds));
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const playerName = user?.name || 'Player';
    const fallbackOpponent = (opponentId && opponentId.startsWith('GUEST-')) ? 'Guest' : 'Opponent';
    const opponentName = roomId ? (fetchedOpponentName || fallbackOpponent) : opponentLabel || `CPU (${matchText(lang,cpuDifficulty(cpuLevel).ja,cpuDifficulty(cpuLevel).en)})`;
    const myRole = onlineRole === 'spectator' ? 'white' : (onlineRole || 'white');
    const checkmate = useMemo(() => {
        if (!winner || winner === 'draw') return false;
        const state = legacyToQuantumState(tokens, pool, currentTurn, moveHistory.length, moveHistory.at(-1) ?? null);
        return isCheckmateFinish(winner, state);
    }, [winner, tokens, pool, currentTurn, moveHistory]);
    const hint = useMoveHint(`${currentTurn}:${moveHistory.length}:${winner ?? 'playing'}`);
    const { hintMove } = hint;
    const requestHint = () => {
        if (!introDone || winner || hint.pending || currentTurn !== myRole || !tokens.length || roomId) return;
        const state = legacyToQuantumState(tokens, pool, myRole, moveHistory.length, moveHistory.at(-1) ?? null);
        void hint.request(async signal => {
            const stats = await requestCPUSearch(state, signal, 5);
            if (!stats.move || signal.aborted) return null;
            const legacy = quantumToLegacyMove(stats.move, state);
            const fromToken = tokens.find(token => !token.isCaptured && token.id === legacy.tokenId);
            return fromToken ? {fromRow:fromToken.row, fromCol:fromToken.col, toRow:legacy.targetRow, toCol:legacy.targetCol} : null;
        },()=>{hintsUsed.current++;});
    };
    const whiteName = onlineRole === 'spectator' ? 'White Player' : (myRole === 'white' ? playerName : opponentName);
    const blackName = onlineRole === 'spectator' ? 'Black Player' : (myRole === 'black' ? playerName : opponentName);
    
    const whiteRatingToDisplay = onlineRole === 'spectator' ? null : (myRole === 'white' ? myRating : opponentRating);
    const blackRatingToDisplay = onlineRole === 'spectator' ? null : (myRole === 'black' ? myRating : opponentRating);
    useEffect(()=>{
        if (!winner || !onComplete || resultReported.current) return;
        resultReported.current=true;
        onComplete({won:winner===`${playerSide}_wins`,draw:winner==='draw',timeControl,
            playerMoves:moveHistory.filter(move=>move.player===playerSide).length,hintsUsed:hintsUsed.current,
            initialSeconds:timeControl==='10s'?perMoveTime.current.turns*10:initialTime,remainingSeconds:timeControl==='10s'?perMoveTime.current.remaining:playerSide==='white'?timeLeftWhite:timeLeftBlack});
    },[winner,onComplete,playerSide,moveHistory,initialTime,timeLeftWhite,timeLeftBlack,timeControl]);

    return (
        <MatchLayout
            victory={!campaignLabel && winner===`${playerSide}_wins`} victoryEffect={victoryEffect}
            lang={lang} mode={campaignLabel || (roomId ? (matchText(lang, 'オンライン対局', 'ONLINE MATCH')) : (matchText(lang, 'CPU 対局', 'CPU MATCH')))}
            white={{name:whiteName,clock:formatTime(timeLeftWhite),rating:whiteRatingToDisplay,avatar:myRole === 'white' ? user?.avatar_url : undefined,frame:myRole==='white'?avatarFrame:undefined,emote:activeEmotes.white ? EMOTES[activeEmotes.white].emoji : undefined}}
            black={{name:blackName,clock:formatTime(timeLeftBlack),rating:blackRatingToDisplay,avatar:myRole === 'black' ? user?.avatar_url : undefined,frame:myRole==='black'?avatarFrame:undefined,emote:activeEmotes.black ? EMOTES[activeEmotes.black].emoji : undefined}}
            bottomSide={myRole} currentTurn={currentTurn} spectator={onlineRole === 'spectator'} finished={!!winner} checkmate={checkmate} resultVisible={showGameOver}
            checkNotice={showCheckWarning&&!winner?t.check:undefined} checkEvent={moveHistory.length}
            tokens={tokens} selectedTokenId={selectedTokenId} candidatesMap={pool.piecePossibilities} history={moveHistory}
            validMoveCount={validMoves.length} onClearSelection={() => setSelectedTokenId(null)}
            onHint={!roomId ? requestHint : undefined} hintPending={hint.pending} hintMove={hintMove} hintFailed={hint.failed} onClearHint={hint.clear} feedback={tutorialHint}
            is2D={is2DView} onViewChange={setIs2DView}
            onResetView={() => setViewResetKey(key => key + 1)}
            onHome={() => setShowHomeConfirm(true)} onRules={() => setShowRules(true)} onResign={() => setShowResignConfirm(true)}
            showMoveHints={showMoveHints} onHintsChange={setShowMoveHints}
            notice={disconnectTimeLeft !== null ? (matchText(lang, '再接続を待っています… ', 'Waiting for reconnection… ')) + disconnectTimeLeft + 's' : errorMsg || undefined}
            board={is2DView ? (
                    <Board2D quietLayout boardDesign={boardDesign} boardFinish={boardFinish} hintMove={hintMove} autoRotate={false}
                    tokens={tokens}
                    onlineRole={onlineRole}
                    selectedTokenId={selectedTokenId}
                    validMoves={validMoves}
                    moveHistory={moveHistory}
                    showCheckWarning={showCheckWarning}
                    onSquareClick={handleSquareClick}
                    showMoveHints={showMoveHints}
                    currentTurn={currentTurn}
                    candidatesMap={pool.piecePossibilities}
                />
                ) : (
                    <Board3D lang={lang} quietLayout key={viewResetKey} boardDesign={boardDesign} boardFinish={boardFinish} pieceFinish={pieceFinish} hintMove={hintMove} autoRotate={false} checkmate={checkmate}
                    tokens={tokens}
                    onlineRole={onlineRole}
                    selectedTokenId={selectedTokenId}
                    validMoves={validMoves}
                    moveHistory={moveHistory}
                    showCheckWarning={showCheckWarning}
                    onSquareClick={handleSquareClick}
                    showMoveHints={showMoveHints}
                    currentTurn={currentTurn}
                    candidatesMap={pool.piecePossibilities}
                />
                )}
        >

            {!introDone&&<MatchIntro lang={lang} label={campaignLabel||t.vsCPU||'CPU'} onDone={finishIntro}
                white={{name:whiteName,rating:whiteRatingToDisplay,avatar:myRole==='white'?user?.avatar_url:undefined,frame:myRole==='white'?avatarFrame:undefined,detail:myRole==='black'?matchText(lang,cpuDifficulty(cpuLevel).ja,cpuDifficulty(cpuLevel).en):undefined}}
                black={{name:blackName,rating:blackRatingToDisplay,avatar:myRole==='black'?user?.avatar_url:undefined,frame:myRole==='black'?avatarFrame:undefined,detail:myRole==='white'?matchText(lang,cpuDifficulty(cpuLevel).ja,cpuDifficulty(cpuLevel).en):undefined}}/>}
            {winner && showGameOver && campaignLabel && resultPanel}
            {winner && showGameOver && !campaignLabel && (
                <MatchResultDialog lang={lang} winner={winner} side={onlineRole==='spectator'?'spectator':playerSide}>
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
                            
                        </div>
                        {savedRecordId && (
                            <div className="mt-2 text-xs text-[#A89C86] flex flex-col items-center gap-1 bg-black/30 p-3 rounded border border-[#A89C86]/10">
                                <span>{t.cloudRecordSaved}</span>
                                <span className="font-mono text-[10px] select-all text-[#B39A62] bg-black/50 px-2 py-1 rounded">{savedRecordId}</span>
                            </div>
                        )}
                        {!savedRecordId && saveState === 'saving' && <p role="status" className="mt-3 text-xs text-[#A89C86]">{t.loading}</p>}
                        {!savedRecordId && saveState === 'failed' && <div role="status" className="mt-3 text-xs text-[#E8E2D7]">
                            <p>{replayText(lang).saveFailed}</p>
                            <button onClick={() => setSaveAttempt(attempt => attempt + 1)} className="mt-2 min-h-11 rounded border border-[#B39A62]/40 px-4">{replayText(lang).retry}</button>
                            <button onClick={() => setShowReplayLogin(true)} className="ml-2 mt-2 min-h-11 rounded border border-[#B39A62]/40 px-4">{t.login}</button>
                        </div>}
                </MatchResultDialog>
            )}

            {showReplayLogin && user && <RankedLoginDialog lang={lang} userId={user.id} title={t.login} onCancel={() => setShowReplayLogin(false)}
                onVerified={() => { setShowReplayLogin(false); setSaveAttempt(attempt => attempt + 1); }} />}

            {cpuFailed && <button onClick={() => setCpuRetry(value => value + 1)} className="match-retry">
                {matchText(lang, 'CPUの思考を再試行', 'Retry CPU turn')}
            </button>}
            {/* Resign Confirmation Modal */}
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
