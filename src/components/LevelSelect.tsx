'use client';
import { useMatchmaking } from '../hooks/useMatchmaking';

import React from 'react';
import { dict, Language } from '../locales/dict';
import { User, TimeControl } from '../types/game';
import { supabase } from '../lib/supabaseClient';
import { GameRecord, getGameRecords, Profile, getTopProfiles, UserStats } from '../lib/gameRecordService';
import { soundManager } from '../lib/SoundService';
import { getTitleFromRating } from '../lib/rankSystem';
import { FriendsMenu } from './FriendsMenu';
import { LiveMatchesMenu } from './LiveMatchesMenu';

interface LevelSelectProps {
    lang: Language;
    user: User;
    onSelect: (level: number, tc: TimeControl) => void;
    onOnlineMatch?: (roomId: string, role: 'white' | 'black' | 'spectator', matchMode: 'random' | 'private' | 'ranked', tc: TimeControl, opponentId?: string) => void;
    onReplay?: (record: GameRecord) => void;
    onBack: () => void;
}

export function LevelSelect({ lang, user, onSelect, onOnlineMatch, onReplay, onBack }: LevelSelectProps) {
    const t = dict[lang];
    const [showAdModal, setShowAdModal] = React.useState(false);
    const [adProgress, setAdProgress] = React.useState(0);
    const [showOnlineMenu, setShowOnlineMenu] = React.useState(false);
    const [joinRoomId, setJoinRoomId] = React.useState('');
    const [isSearching, setIsSearching] = React.useState(false);
    const [matchFound, setMatchFound] = React.useState(false);
    const { isSearching: hookSearching, matchedRoom, startMatchmaking, cancelMatchmaking: hookCancel } = useMatchmaking(user);
    const [showReplays, setShowReplays] = React.useState(false);
    const [replays, setReplays] = React.useState<GameRecord[]>([]);
    const [loadingReplays, setLoadingReplays] = React.useState(false);
    const [replayCategory, setReplayCategory] = React.useState<'global' | 'mine'>('global');
    const [showLeaderboard, setShowLeaderboard] = React.useState(false);
    const [leaderboard, setLeaderboard] = React.useState<Profile[]>([]);
    const [loadingLeaderboard, setLoadingLeaderboard] = React.useState(false);
    const [leaderboardCategory, setLeaderboardCategory] = React.useState<TimeControl>('10m');
    const [pendingAction, setPendingAction] = React.useState<{ type: 'cpu' | 'ranked' | 'random' | 'host' | 'join'; level?: number; roomId?: string } | null>(null);
    const [userProfile, setUserProfile] = React.useState<Profile | null>(null);
    const [userStats, setUserStats] = React.useState<UserStats | null>(null);
    const [showAccount, setShowAccount] = React.useState(false);
    const [showFriends, setShowFriends] = React.useState(false);
    const [showLiveMatches, setShowLiveMatches] = React.useState(false);
    const [onlineCount, setOnlineCount] = React.useState(1);
    const [onlineUsers, setOnlineUsers] = React.useState<Set<string>>(new Set());
    const channelRef = React.useRef<ReturnType<typeof supabase.channel> | null>(null);
    const globalChannelRef = React.useRef<ReturnType<typeof supabase.channel> | null>(null);
    const adIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

    React.useEffect(() => {
        const channel = supabase.channel('global_lobby', {
            config: { presence: { key: user.id } }
        });
        globalChannelRef.current = channel;

        channel.on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            setOnlineCount(Object.keys(state).length);
            setOnlineUsers(new Set(Object.keys(state)));
        });

        channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({ online_at: new Date().toISOString() });
            }
        });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user.id]);
    React.useEffect(() => {
        import('../lib/gameRecordService').then(({ ensureProfile }) => {
            ensureProfile(user.id, user.name).then(profile => {
                if (profile) setUserProfile(profile);
            });
        });
    }, [user.id, user.name]);

    React.useEffect(() => {
        if (showAccount && !userStats) {
            import('../lib/gameRecordService').then(({ getUserStats }) => {
                getUserStats(user.id).then(stats => setUserStats(stats));
            });
        }
    }, [showAccount, user.id, userStats]);

    React.useEffect(() => {
        if (isSearching) {
            soundManager.playBGM('/audio/bgm_waiting.mp3');
        } else {
            soundManager.playBGM('/audio/bgm_title.mp3');
        }
    }, [isSearching]);

    const loadLeaderboard = async (category: TimeControl = leaderboardCategory) => {
        setLoadingLeaderboard(true);
        const data = await getTopProfiles(category);
        setLeaderboard(data);
        setLoadingLeaderboard(false);
    };

    const handleCategoryChange = (category: TimeControl) => {
        setLeaderboardCategory(category);
        loadLeaderboard(category);
    };

    const loadReplays = async (category: 'global' | 'mine') => {
        setLoadingReplays(true);
        const data = await getGameRecords(10, category === 'mine' ? user.id : undefined);
        setReplays(data);
        setLoadingReplays(false);
    };

    const handleReplayCategoryChange = (category: 'global' | 'mine') => {
        setReplayCategory(category);
        loadReplays(category);
    };

    const handleVsCpuClick = () => {
        setShowAdModal(true);
        setAdProgress(0);
        
        if (adIntervalRef.current) clearInterval(adIntervalRef.current);
        adIntervalRef.current = setInterval(() => {
            setAdProgress(prev => {
                if (prev >= 100) {
                    if (adIntervalRef.current) clearInterval(adIntervalRef.current);
                    return 100;
                }
                return prev + 2;
            });
        }, 50);
    };

    const handleAdFinish = () => {
        setPendingAction({ type: 'cpu', level: 5 });
        setShowAdModal(false);
        if (adIntervalRef.current) clearInterval(adIntervalRef.current);
    };

    const handleAdCancel = () => {
        setShowAdModal(false);
        if (adIntervalRef.current) clearInterval(adIntervalRef.current);
    };

    
    React.useEffect(() => {
        if (matchedRoom) {
            setMatchFound(true);
            setIsSearching(false);
            setTimeout(() => {
                const tcStr = matchedRoom.timeControl === 180 ? '3m' : matchedRoom.timeControl === 600 ? '10m' : '10m';
                onOnlineMatch?.(matchedRoom.id, matchedRoom.myColor, 'random', tcStr, matchedRoom.myColor === 'white' ? matchedRoom.joinerId : matchedRoom.hostId);
                setMatchFound(false);
            }, 1500);
        }
    }, [matchedRoom, onOnlineMatch]);

    const cancelSearch = React.useCallback(() => {
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }
        setIsSearching(false);
        hookCancel();
    }, [hookCancel]);

    const startRandomMatch = React.useCallback((mode: 'random' | 'ranked', tc: TimeControl) => {
        setIsSearching(true);
        const tcSeconds = tc === '3m' ? 180 : tc === '10m' ? 600 : 900;
        startMatchmaking(tcSeconds);
    }, [startMatchmaking]);

    const handleTimeControlConfirm = (tc: TimeControl) => {
        if (!pendingAction) return;
        const action = pendingAction;
        setPendingAction(null);

        if (action.type === 'cpu') {
            onSelect(action.level || 5, tc);
        } else if (action.type === 'ranked') {
            startRandomMatch('ranked', tc);
        } else if (action.type === 'random') {
            startRandomMatch('random', tc);
        } else if (action.type === 'host' && action.roomId) {
            onOnlineMatch?.(action.roomId, 'white', 'private', tc);
        }
    };

    // Cleanup on unmount
    React.useEffect(() => {
        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
            if (adIntervalRef.current) {
                clearInterval(adIntervalRef.current);
            }
        };
    }, []);

    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] w-full text-cyan-400">
            {/* Time Control selection modal */}
            {pendingAction && (
                <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
                    <div className="bg-gray-900 border border-cyan-500/30 p-8 rounded-lg max-w-md w-full text-center shadow-[0_0_50px_rgba(6,182,212,0.2)]">
                        <h3 className="text-2xl font-bold text-cyan-300 mb-2">⏱ {t.selectTimeLimit}</h3>
                        <p className="text-gray-400 text-sm mb-6">{t.timeLimit}</p>
                        <div className="flex flex-col gap-3">
                            {(['10s', '3m', '10m'] as TimeControl[]).map(tc => (
                                <button
                                    key={tc}
                                    onClick={() => handleTimeControlConfirm(tc)}
                                    className="w-full py-4 bg-cyan-950/50 border border-cyan-500 hover:bg-cyan-900 transition-all text-cyan-300 font-bold tracking-widest text-lg hover:shadow-[0_0_15px_rgba(34,211,238,0.5)] rounded flex justify-between px-6 items-center"
                                >
                                    <span>{tc === '10s' ? t.tc10s : tc === '3m' ? t.tc3m : t.tc10m}</span>
                                    <span className="text-sm font-mono text-cyan-500">▶</span>
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setPendingAction(null)}
                            className="mt-6 text-gray-500 hover:text-gray-300 text-sm"
                        >
                            {t.cancel}
                        </button>
                    </div>
                </div>
            )}

            {/* Ad overlay */}
            {showAdModal && (
                <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
                    <div className="bg-gray-900 border border-cyan-500/30 p-8 rounded-lg max-w-md w-full text-center shadow-[0_0_50px_rgba(6,182,212,0.2)]">
                        <h3 className="text-xl font-bold text-cyan-300 mb-4 flex items-center justify-center gap-2">
                            <span className="text-yellow-400">⚡</span> {t.adCloudTitle}
                        </h3>
                        <p className="text-gray-400 text-sm mb-6">
                            {t.adCloudDesc}
                        </p>
                        
                        <div className="w-full h-4 bg-gray-800 rounded-full overflow-hidden mb-6 border border-gray-700">
                            <div 
                                className="h-full bg-cyan-500 transition-all duration-75"
                                style={{ width: `${adProgress}%` }}
                            />
                        </div>

                        {adProgress < 100 ? (
                            <div className="flex flex-col gap-4 w-full">
                                <p className="text-cyan-500 animate-pulse text-sm font-mono">Simulating Ad... {adProgress}%</p>
                                <button 
                                    onClick={handleAdCancel}
                                    className="w-full py-3 bg-red-900/50 hover:bg-red-800/50 border border-red-500/50 text-red-300 font-bold rounded transition-colors"
                                >
                                    {t.cancel}
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={handleAdFinish}
                                className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded transition-colors"
                            >
                                {t.adPlayButton}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Random Match searching overlay */}
            {isSearching && (
                <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
                    <div className="bg-gray-900 border border-cyan-500/30 p-8 rounded-lg max-w-md w-full text-center shadow-[0_0_50px_rgba(6,182,212,0.2)]">
                        {matchFound ? (
                            <>
                                <div className="text-4xl mb-6 inline-block">⚔️</div>
                                <h3 className="text-2xl font-bold text-cyan-300 mb-4 animate-pulse">
                                    {lang === 'ja' ? 'マッチング成功！' : 'Match Found!'}
                                </h3>
                                <p className="text-gray-400 text-sm mb-6">
                                    {lang === 'ja' ? '対戦の準備をしています...' : 'Preparing the match...'}
                                </p>
                            </>
                        ) : (
                            <>
                                <div className="text-4xl mb-6 animate-spin inline-block">🔍</div>
                                <h3 className="text-2xl font-bold text-cyan-300 mb-4">
                                    {t.searchingOpponent}
                                </h3>
                                <p className="text-gray-400 text-sm mb-6">
                                    Waiting for another player to join the queue.
                                </p>
                                <div className="flex justify-center mb-6">
                                    <div className="flex gap-1">
                                        <div className="w-3 h-3 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <div className="w-3 h-3 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <div className="w-3 h-3 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                                <button onClick={cancelSearch} className="px-8 py-3 bg-red-950/50 border border-red-500/50 hover:bg-red-900 text-red-300 font-bold rounded transition-all">
                                    {t.cancel}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className="text-center mb-12">
                <button
                    onClick={() => setShowAccount(true)}
                    className="flex flex-col items-center justify-center gap-1 text-cyan-500 mb-6 hover:text-cyan-300 transition-colors group"
                >
                    <span className="text-lg font-bold">👤 {user.name}</span>
                    <span className="text-xs border border-cyan-800 px-2 py-1 rounded bg-cyan-950/30 group-hover:bg-cyan-900/50">View Account</span>
                    <span className="text-[10px] text-green-400 mt-1 animate-pulse">● {onlineCount} Player(s) Online</span>
                </button>
                <h2 className="text-4xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
                    {t.selectMode}
                </h2>
            </div>

            {/* Account Modal */}
            {showAccount && (
                <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
                    <div className="bg-gray-900 border border-cyan-500/30 p-8 rounded-lg max-w-sm w-full text-center shadow-[0_0_50px_rgba(6,182,212,0.2)]">
                        <h3 className="text-2xl font-bold text-cyan-300 mb-6">👤 ACCOUNT</h3>
                        
                        <div className="flex flex-col gap-4 text-left mb-8">
                            <div>
                                <p className="text-xs text-cyan-600 font-bold mb-1">NAME</p>
                                <div className="flex items-center gap-2">
                                    <p className="text-lg text-white font-bold">{user.name}</p>
                                    {userProfile && (() => {
                                        const title = getTitleFromRating(userProfile.rating_10m || 1200);
                                        return (
                                            <span className={`text-xs px-2 py-0.5 rounded border border-current ${title.color} bg-black`}>
                                                {title.icon} {title.name}
                                            </span>
                                        );
                                    })()}
                                </div>
                            </div>
                            <div>
                                <p className="text-xs text-cyan-600 font-bold mb-1">ID (Keep Secret)</p>
                                <p className="text-sm text-gray-300 font-mono bg-black p-2 rounded border border-gray-800 break-all select-all">{user.id}</p>
                            </div>
                            <div>
                                <p className="text-xs text-cyan-600 font-bold mb-1">RATINGS</p>
                                <div className="bg-black border border-cyan-900/50 rounded p-3 flex justify-between">
                                    
                                    <div className="flex flex-col items-center">
                                        <span className="text-[10px] text-gray-500 mb-1">10 MIN</span>
                                        <span className="font-mono text-cyan-400 font-bold">{userProfile ? Math.floor(userProfile.rating_10m) : '---'}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div>
                                <p className="text-xs text-cyan-600 font-bold mb-1">STATISTICS (BETA)</p>
                                <div className="bg-black border border-cyan-900/50 rounded p-3 text-xs text-gray-300">
                                    {!userStats ? (
                                        <div className="text-center text-gray-600 animate-pulse">Loading stats...</div>
                                    ) : userStats.totalGames === 0 ? (
                                        <div className="text-center text-gray-600">No games played yet.</div>
                                    ) : (
                                        <div className="flex flex-col gap-3">
                                            <div className="flex justify-between items-end">
                                                <span>Total Games: <strong className="text-white">{userStats.totalGames}</strong></span>
                                                <span className="text-cyan-400 font-bold text-sm">
                                                    WIN RATE: {Math.round((userStats.wins / userStats.totalGames) * 100)}%
                                                </span>
                                            </div>
                                            
                                            {/* Win/Loss/Draw Bar */}
                                            <div className="w-full h-2 rounded-full overflow-hidden flex bg-gray-800">
                                                <div style={{ width: `${(userStats.wins / userStats.totalGames) * 100}%` }} className="bg-cyan-500 h-full" />
                                                <div style={{ width: `${(userStats.draws / userStats.totalGames) * 100}%` }} className="bg-gray-500 h-full" />
                                                <div style={{ width: `${(userStats.losses / userStats.totalGames) * 100}%` }} className="bg-red-500 h-full" />
                                            </div>
                                            <div className="flex justify-between text-[10px] text-gray-500">
                                                <span className="text-cyan-500">{userStats.wins} W</span>
                                                <span className="text-gray-500">{userStats.draws} D</span>
                                                <span className="text-red-500">{userStats.losses} L</span>
                                            </div>
                                            
                                            {/* White vs Black stats */}
                                            <div className="flex justify-between mt-2 pt-2 border-t border-gray-800">
                                                <div className="flex flex-col items-center w-1/2 border-r border-gray-800">
                                                    <span className="text-[10px] text-gray-500 mb-1">AS WHITE (W/L)</span>
                                                    <span>
                                                        <strong className="text-blue-300">{userStats.whiteWins}</strong> - {userStats.whiteGames - userStats.whiteWins}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col items-center w-1/2">
                                                    <span className="text-[10px] text-gray-500 mb-1">AS BLACK (W/L)</span>
                                                    <span>
                                                        <strong className="text-red-300">{userStats.blackWins}</strong> - {userStats.blackGames - userStats.blackWins}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={onBack}
                                className="flex-1 py-2 bg-red-900/30 border border-red-500/50 hover:bg-red-800/50 rounded text-red-400 font-bold transition-colors"
                            >
                                {t.logout}
                            </button>
                            <button
                                onClick={() => setShowAccount(false)}
                                className="flex-1 py-2 bg-cyan-900/30 border border-cyan-500/50 hover:bg-cyan-800/50 rounded text-cyan-400 font-bold transition-colors"
                            >
                                CLOSE
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="w-full max-w-md flex flex-col gap-4 mt-8">
                {/* VS CPU */}
                <button 
                    onClick={handleVsCpuClick}
                    className="group relative w-full p-4 bg-black/40 border border-red-500/50 hover:bg-red-950/30 transition-all rounded text-left overflow-hidden hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]">
                    <div className="absolute inset-0 w-1 bg-red-500 group-hover:w-full transition-all duration-300 opacity-10" />
                    <div className="relative z-10 flex flex-col">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xl font-bold text-red-400 tracking-wider">🤖 {t.vsCpu}</span>
                        </div>
                        <span className="text-xs text-red-500/70">{t.vsCpuDesc}</span>
                    </div>
                </button>

                {/* ── Online Multiplayer ── */}
                <div className="flex items-center justify-center gap-2 my-2 opacity-50">
                    <div className="h-px w-full bg-cyan-900" />
                    <span className="text-xs uppercase tracking-widest text-cyan-600 whitespace-nowrap">{t.onlineMultiplayer}</span>
                    <div className="h-px w-full bg-cyan-900" />
                </div>

                {/* Ranked Match */}
                <button 
                    onClick={() => {
                        if (user.type === 'guest') {
                            alert(lang === 'ja' ? 'ランクマッチをプレイするにはアカウント登録（IDの入力）が必要です。タイトル画面に戻ってIDを入力してください。' : 'Please register an account (by typing an ID) to play Ranked Matches.');
                            return;
                        }
                        startRandomMatch('ranked', '10m');
                    }}
                    className={`group relative w-full p-4 border transition-all rounded text-left overflow-hidden ${
                        user.type === 'guest'
                            ? 'bg-gray-900/40 border-gray-600/50 cursor-not-allowed'
                            : 'bg-fuchsia-950/40 border-fuchsia-500/50 hover:bg-fuchsia-900/30 hover:shadow-[0_0_20px_rgba(217,70,239,0.3)]'
                    }`}>
                    <div className={`absolute inset-0 w-1 ${user.type === 'guest' ? 'bg-gray-600' : 'bg-fuchsia-500 group-hover:w-full'} transition-all duration-300 opacity-10`} />
                    <div className="relative z-10 flex justify-between items-center">
                        <div className="flex flex-col">
                            <span className={`text-xl font-bold tracking-wider flex items-baseline gap-2 ${user.type === 'guest' ? 'text-gray-500' : 'text-fuchsia-400'}`}>
                                🏆 {t.rankedMatch}
                                <span className="text-sm font-mono opacity-80">(10 MIN)</span>
                            </span>
                            {user.type === 'guest' && <span className="text-xs text-red-500 mt-1">※ {lang === 'ja' ? '登録必須' : 'Account Required'}</span>}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded border ${user.type === 'guest' ? 'text-gray-500 border-gray-500/50' : 'text-fuchsia-500 border-fuchsia-500/50'}`}>{t.rated}</span>
                    </div>
                </button>

                {/* Random Match */}


                {!showOnlineMenu ? (
                    <button 
                        onClick={() => setShowOnlineMenu(true)}
                        className="group relative w-full p-4 bg-blue-900/40 border border-blue-500/50 hover:bg-blue-800/50 transition-all rounded text-left overflow-hidden hover:shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                        <div className="absolute inset-0 w-1 bg-blue-500 group-hover:w-full transition-all duration-300 opacity-10" />
                        <div className="relative z-10 flex justify-between items-center">
                            <span className="text-xl font-bold text-blue-300 tracking-wider">🔒 {t.privateMatch}</span>
                        </div>
                    </button>
                ) : (
                    <div className="p-4 bg-black/60 border border-cyan-500/50 rounded flex flex-col gap-4">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-cyan-400 font-bold text-sm">🔒 {t.privateMatch}</span>
                        </div>
                        <button 
                            onClick={() => {
                                const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
                                setPendingAction({ type: 'host', roomId: newRoomId });
                            }}
                            className="w-full p-3 bg-blue-900/50 hover:bg-blue-800/50 border border-blue-400 rounded text-blue-300 font-bold transition-colors"
                        >
                            {t.hostMatch}
                        </button>
                        
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder={t.roomId}
                                value={joinRoomId}
                                onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                                className="flex-1 bg-black/50 border border-cyan-800 rounded px-3 py-2 text-cyan-300 focus:outline-none focus:border-cyan-400"
                            />
                            <button 
                                onClick={() => {
                                    if(joinRoomId.trim()) onOnlineMatch?.(joinRoomId.trim(), 'black', 'private', '10m');
                                }}
                                className="px-4 py-2 bg-red-900/50 hover:bg-red-800/50 border border-red-400 rounded text-red-300 font-bold transition-colors"
                            >
                                {t.joinMatch}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Social ── */}
                <div className="flex items-center justify-center gap-2 my-2 opacity-50 mt-8">
                    <div className="h-px w-full bg-cyan-900" />
                    <span className="text-xs uppercase tracking-widest text-cyan-600 whitespace-nowrap">Social & Live</span>
                    <div className="h-px w-full bg-cyan-900" />
                </div>

                <div className="flex gap-2">
                    <button 
                        onClick={() => setShowFriends(true)}
                        className="group relative w-1/2 p-3 bg-purple-900/40 border border-purple-500/50 hover:bg-purple-800/50 transition-all rounded text-center overflow-hidden hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]">
                        <div className="relative z-10 flex flex-col justify-center items-center gap-1">
                            <span className="text-lg font-bold text-purple-300 tracking-wider">👥 Friends</span>
                        </div>
                    </button>
                    <button 
                        onClick={() => setShowLiveMatches(true)}
                        className="group relative w-1/2 p-3 bg-red-900/40 border border-red-500/50 hover:bg-red-800/50 transition-all rounded text-center overflow-hidden hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]">
                        <div className="relative z-10 flex flex-col justify-center items-center gap-1">
                            <span className="text-lg font-bold text-red-300 tracking-wider">🔴 Live Matches</span>
                        </div>
                    </button>
                </div>

                {/* ── Replays ── */}
                <div className="flex items-center justify-center gap-2 my-2 opacity-50 mt-8">
                    <div className="h-px w-full bg-cyan-900" />
                    <span className="text-xs uppercase tracking-widest text-cyan-600 whitespace-nowrap">{t.gameReplays}</span>
                    <div className="h-px w-full bg-cyan-900" />
                </div>

                {!showReplays ? (
                    <button 
                        onClick={() => {
                            setShowReplays(true);
                            loadReplays(replayCategory);
                        }}
                        className="group relative w-full p-4 bg-gray-900/40 border border-gray-500/50 hover:bg-gray-800/50 transition-all rounded text-left overflow-hidden hover:shadow-[0_0_20px_rgba(156,163,175,0.3)]">
                        <div className="absolute inset-0 w-1 bg-gray-500 group-hover:w-full transition-all duration-300 opacity-10" />
                        <div className="relative z-10 flex justify-between items-center">
                            <span className="text-xl font-bold text-gray-300 tracking-wider">📺 {t.watchReplays}</span>
                        </div>
                    </button>
                ) : (
                    <div className="p-4 bg-black/60 border border-gray-500/50 rounded flex flex-col gap-4">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-gray-400 font-bold text-sm">📺 {t.watchReplays}</span>
                            <button onClick={() => setShowReplays(false)} className="text-gray-500 hover:text-white">✕</button>
                        </div>
                        
                        <div className="flex gap-1 p-1 bg-black/40 border border-gray-700/50 rounded">
                            <button
                                onClick={() => handleReplayCategoryChange('global')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${
                                    replayCategory === 'global'
                                        ? 'bg-gray-700 text-white shadow-[0_0_10px_rgba(156,163,175,0.5)]'
                                        : 'text-gray-500 hover:text-gray-300'
                                }`}
                            >
                                🌏 Global
                            </button>
                            <button
                                onClick={() => handleReplayCategoryChange('mine')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${
                                    replayCategory === 'mine'
                                        ? 'bg-gray-700 text-white shadow-[0_0_10px_rgba(156,163,175,0.5)]'
                                        : 'text-gray-500 hover:text-gray-300'
                                }`}
                            >
                                👤 My Games
                            </button>
                        </div>

                        {loadingReplays ? (
                            <div className="text-center text-gray-500 py-4 animate-pulse">{t.loading}</div>
                        ) : replays.length === 0 ? (
                            <div className="text-center text-gray-500 py-4">{t.noRecords}</div>
                        ) : (
                            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                {replays.map(r => (
                                    <button 
                                        key={r.id}
                                        onClick={() => onReplay?.(r)}
                                        className="w-full text-left p-3 bg-gray-900/50 hover:bg-gray-800 border border-gray-700 rounded transition-colors flex justify-between items-center"
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-300">
                                                {r.white_player} <span className="text-gray-600">{t.vs}</span> {r.black_player}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                {new Date(r.created_at!).toLocaleDateString()} • {r.mode.toUpperCase()} {r.time_control ? `• ${r.time_control}` : ''}
                                            </span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className={`text-xs font-bold px-2 py-1 rounded ${r.winner === 'white_wins' ? 'bg-blue-900 text-blue-300' : r.winner === 'black_wins' ? 'bg-red-900 text-red-300' : 'bg-gray-800 text-gray-400'}`}>
                                                {r.winner === 'white_wins' ? t.whiteWon : r.winner === 'black_wins' ? t.blackWon : t.draw}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Leaderboard ── */}
                <div className="flex items-center justify-center gap-2 my-2 opacity-50 mt-8">
                    <div className="h-px w-full bg-cyan-900" />
                    <span className="text-xs uppercase tracking-widest text-cyan-600 whitespace-nowrap">{t.globalRankings}</span>
                    <div className="h-px w-full bg-cyan-900" />
                </div>

                {!showLeaderboard ? (
                    <button 
                        onClick={() => {
                            setShowLeaderboard(true);
                            loadLeaderboard();
                        }}
                        className="group relative w-full p-4 bg-fuchsia-900/40 border border-fuchsia-500/50 hover:bg-fuchsia-800/50 transition-all rounded text-left overflow-hidden hover:shadow-[0_0_20px_rgba(217,70,239,0.3)]">
                        <div className="absolute inset-0 w-1 bg-fuchsia-500 group-hover:w-full transition-all duration-300 opacity-10" />
                        <div className="relative z-10 flex justify-between items-center">
                            <span className="text-xl font-bold text-fuchsia-300 tracking-wider">🏆 {t.top10Players}</span>
                        </div>
                    </button>
                ) : (
                    <div className="p-4 bg-black/60 border border-fuchsia-500/50 rounded flex flex-col gap-4">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-fuchsia-400 font-bold text-sm">🏆 {t.top10Players}</span>
                            <button onClick={() => setShowLeaderboard(false)} className="text-gray-500 hover:text-white">✕</button>
                        </div>

                        {/* Category Tabs */}
                        <div className="flex gap-1 p-1 bg-black/40 border border-fuchsia-900/50 rounded">
                            {[
                                { id: '10m', label: t.lb10m },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => handleCategoryChange(tab.id as TimeControl)}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${
                                        leaderboardCategory === tab.id
                                            ? 'bg-fuchsia-600 text-white shadow-[0_0_10px_rgba(217,70,239,0.5)]'
                                            : 'text-fuchsia-400/70 hover:text-fuchsia-200'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        
                        {loadingLeaderboard ? (
                            <div className="text-center text-gray-500 py-4 animate-pulse">{t.loading}</div>
                        ) : leaderboard.length === 0 ? (
                            <div className="text-center text-gray-500 py-4">{t.noRankedPlayers}</div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {leaderboard.map((p, index) => {
                                    const ratingVal = leaderboardCategory === '10s' ? (p.rating_10s ?? 2000)
                                                    : leaderboardCategory === '3m' ? (p.rating_3m ?? 2000)
                                                    : (p.rating_10m ?? 2000);
                                    return (
                                        <div 
                                            key={p.id}
                                            className="w-full flex justify-between items-center p-3 bg-fuchsia-950/30 border border-fuchsia-900/50 rounded"
                                        >
                                            <div className="flex items-center gap-4">
                                                <span className={`text-lg font-black ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-amber-600' : 'text-gray-600'}`}>
                                                    #{index + 1}
                                                </span>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-gray-200">{p.name}</span>
                                                    {(() => {
                                                        const title = getTitleFromRating(ratingVal);
                                                        return (
                                                            <span className={`text-[10px] ${title.color}`}>
                                                                {title.icon} {title.name}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                            <div className="text-fuchsia-400 font-mono font-bold tracking-widest">
                                                {ratingVal}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showFriends && (
                <FriendsMenu 
                    user={user} 
                    lang={lang} 
                    onlineUsers={onlineUsers} 
                    onClose={() => setShowFriends(false)} 
                    onChallenge={(friendId) => {
                        // Create a private room for challenge
                        const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
                        // You might want to send a real-time notification to the friend here via a separate channel or the global lobby.
                        // For now, it just acts as a host and the friend has to manually join.
                        setPendingAction({ type: 'host', roomId: newRoomId });
                        setShowFriends(false);
                    }}
                />
            )}

            {showLiveMatches && (
                <LiveMatchesMenu 
                    lang={lang} 
                    onClose={() => setShowLiveMatches(false)} 
                    onSpectate={(roomId) => {
                        // TODO: We need to tell the parent component to start a spectator match
                        // Can we just use onOnlineMatch with a 'spectator' role? Yes, we can add 'spectator' to role type!
                        // Actually, onOnlineMatch role is 'white' | 'black'. We will change it to 'white' | 'black' | 'spectator'.
                        // For now let's just cast it, or I will update the type!
                        onOnlineMatch?.(roomId, 'spectator', 'private', '10m');
                        setShowLiveMatches(false);
                    }}
                />
            )}
        </div>
    );
}
