'use client';
import { useMatchmaking } from '../hooks/useMatchmaking';
import { useSocket } from '../lib/SocketContext';
import { AdBanner } from './AdBanner';

import React from 'react';
import { dict, Language } from '../locales/dict';
import { User, TimeControl } from '../types/game';
import { supabase } from '../lib/supabaseClient';
import { GameRecord, getGameRecords, Profile, getTopProfiles, UserStats } from '../lib/gameRecordService';
import { soundManager } from '../lib/SoundService';
import { getTitleFromRating } from '../lib/rankSystem';
import { FriendsMenu } from './FriendsMenu';
import { LiveMatchesMenu } from './LiveMatchesMenu';
import { InteractiveTutorial } from './InteractiveTutorial';

interface LevelSelectProps {
    lang: Language;
    user: User;
    onSelect: (level: number, tc: TimeControl) => void;
    onOnlineMatch?: (roomId: string, role: 'white' | 'black' | 'spectator', matchMode: 'random' | 'private' | 'ranked', tc: TimeControl, opponentId?: string) => void;
    onReplay?: (record: GameRecord) => void;
    onBack: () => void;
}

export function LevelSelect({ lang, user, onSelect, onOnlineMatch, onReplay, onBack }: LevelSelectProps) {
    const t = { ...dict['en'], ...(dict[lang] || {}) } as any;
    const [showAdModal, setShowAdModal] = React.useState(false);
    const [adProgress, setAdProgress] = React.useState(0);
    const [showOnlineMenu, setShowOnlineMenu] = React.useState(false);
    const [joinRoomId, setJoinRoomId] = React.useState('');
    const [isSearching, setIsSearching] = React.useState(false);
    const [matchFound, setMatchFound] = React.useState(false);
    const { isSearching: hookSearching, matchedRoom, startMatchmaking, cancelMatchmaking: hookCancel } = useMatchmaking(user);
    const { queueStats } = useSocket();
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
    const [updateEmail, setUpdateEmail] = React.useState('');
    const [updatePassword, setUpdatePassword] = React.useState('');
    const [emailMsg, setEmailMsg] = React.useState('');
    const [emailLoading, setEmailLoading] = React.useState(false);
    const [isEditingName, setIsEditingName] = React.useState(false);
    const [newName, setNewName] = React.useState('');
    const [nameLoading, setNameLoading] = React.useState(false);
    const [uploadingAvatar, setUploadingAvatar] = React.useState(false);

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        try {
            setUploadingAvatar(true);
            if (!e.target.files || e.target.files.length === 0) return;
            const file = e.target.files[0];
            const fileExt = file.name.split('.').pop();
            const filePath = `${user.id}/avatar.${fileExt}`;

            // Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: publicUrlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            // Update profiles table
            const { error: updateError } = await supabase.from('profiles')
                .update({ avatar_url: publicUrlData.publicUrl })
                .eq('id', user.id);

            if (updateError) throw updateError;
            
            // Reload to show new avatar
            window.location.reload();
        } catch (error) {
            alert('Error uploading avatar!');
            console.error(error);
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleUpdateName = async () => {
        if (!newName.trim() || newName.trim().length > 15) {
            alert(lang === 'ja' ? '名前は1〜15文字で入力してください。' : 'Name must be between 1 and 15 characters.');
            return;
        }
        setNameLoading(true);
        try {
            const { error } = await supabase.from('profiles').update({ name: newName.trim() }).eq('id', user.id);
            if (error) throw error;
            window.location.reload();
        } catch (e) {
            alert('Error updating name');
        } finally {
            setNameLoading(false);
        }
    };

    const handleUpdateEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setEmailMsg('');
        if (!updateEmail || !updatePassword) {
            setEmailMsg('Email and password required.');
            return;
        }
        setEmailLoading(true);
        const { data, error } = await supabase.rpc('update_user_email', {
            p_id: user.id,
            p_password: updatePassword,
            p_email: updateEmail
        });
        setEmailLoading(false);
        if (error || !data) {
            setEmailMsg('Update failed. Incorrect password?');
        } else {
            setEmailMsg('Email updated successfully!');
            setUpdatePassword('');
        }
    };
    const [showFriends, setShowFriends] = React.useState(false);
    const [showTutorial, setShowTutorial] = React.useState(false);
    const [showLiveMatches, setShowLiveMatches] = React.useState(false);
    const [showPlayMenu, setShowPlayMenu] = React.useState(false);
    const [recentGames, setRecentGames] = React.useState<any[]>([]);
    React.useEffect(() => { getGameRecords(3, user.id).then(setRecentGames); }, [user.id]);
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

    const refreshUserProfile = React.useCallback(async () => {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (data) {
            setUserProfile(data as Profile);
        } else {
            const { ensureProfile } = await import('../lib/gameRecordService');
            const p = await ensureProfile(user.id, user.name);
            if (p) setUserProfile(p);
        }
    }, [user.id, user.name]);

    React.useEffect(() => {
        refreshUserProfile();
    }, [refreshUserProfile]);

    React.useEffect(() => {
        if (showAccount) {
            refreshUserProfile();
            import('../lib/gameRecordService').then(({ getUserStats }) => {
                getUserStats(user.id).then(stats => setUserStats(stats));
            });
        }
    }, [showAccount, user.id, refreshUserProfile]);

    React.useEffect(() => {
        if (showLeaderboard) {
            loadLeaderboard(leaderboardCategory);
        }
    }, [showLeaderboard, leaderboardCategory]);

    React.useEffect(() => {
        if (showReplays) {
            loadReplays(replayCategory);
        }
    }, [showReplays, replayCategory]);

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
                const tcStr = matchedRoom.timeControl === 180 ? '3m' : matchedRoom.timeControl === 600 ? '10m' : '10s';
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
        const tcSeconds = tc === '3m' ? 180 : tc === '10m' ? 600 : 10;
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
        <div className="w-full h-full flex flex-col bg-transparent text-[#E8E2D7] font-sans px-6 py-6 md:px-8 md:py-8 overflow-hidden relative">
            {showTutorial && <InteractiveTutorial lang={lang} onClose={() => setShowTutorial(false)} />}

            
            {/* Play Menu Modal */}
            {showPlayMenu && (
                <div className="fixed inset-0 bg-[#161513]/95 z-[60] flex flex-col justify-end md:justify-center p-4 md:p-0 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-md mx-auto bg-[#161513] border border-[#A89C86]/40 p-6 flex flex-col shadow-2xl">
                        <div className="flex justify-between items-center border-b border-[#A89C86]/20 pb-4 mb-4 shrink-0">
                            <span className="text-sm tracking-[0.2em] text-[#E8E2D7] font-serif uppercase">{(t as any).chooseGame}</span>
                            <button onClick={() => setShowPlayMenu(false)} className="text-[#A89C86] hover:text-[#E8E2D7] text-xl transition-colors">✕</button>
                        </div>
                        
                        <div className="flex flex-col gap-0 overflow-y-auto">
                            {/* RANKED */}
                            <button onClick={() => {
                                if (user.type === 'guest') {
                                    alert((t as any).needAccount);
                                } else {
                                    setPendingAction({ type: 'ranked' });
                                    setShowPlayMenu(false);
                                }
                            }} className="w-full text-left py-6 border-b border-[#A89C86]/10 hover:bg-[#24211D] group transition-colors flex flex-col gap-2 px-4">
                                <span className="text-lg tracking-[0.15em] text-[#E8E2D7] group-hover:text-[#B39A62]">{(t as any).ranked}</span>
                                <span className="text-[10px] tracking-widest text-[#A89C86] leading-relaxed" dangerouslySetInnerHTML={{ __html: (t as any).rankedDesc.replace(/\n/g, '<br/>') }}></span>
                            </button>
                            
                            {/* RANDOM MATCH */}
                            <button onClick={() => {
                                setPendingAction({ type: 'random' });
                                setShowPlayMenu(false);
                            }} className="w-full text-left py-6 border-b border-[#A89C86]/10 hover:bg-[#24211D] group transition-colors flex flex-col gap-2 px-4">
                                <span className="text-lg tracking-[0.15em] text-[#E8E2D7] group-hover:text-[#B39A62]">{(t as any).randomMatch2}</span>
                                <span className="text-[10px] tracking-widest text-[#A89C86] leading-relaxed" dangerouslySetInnerHTML={{ __html: (t as any).randomMatchDesc.replace(/\n/g, '<br/>') }}></span>
                            </button>

                            {/* FRIEND MATCH */}
                            <button onClick={() => {
                                setShowFriends(true);
                                setShowPlayMenu(false);
                            }} className="w-full text-left py-6 border-b border-[#A89C86]/10 hover:bg-[#24211D] group transition-colors flex flex-col gap-2 px-4">
                                <span className="text-lg tracking-[0.15em] text-[#E8E2D7] group-hover:text-[#B39A62]">{(t as any).friendMatch}</span>
                                <span className="text-[10px] tracking-widest text-[#A89C86] leading-relaxed">{(t as any).friendMatchDesc}</span>
                            </button>
                            
                            {/* JOIN ROOM */}
                            <button onClick={() => {
                                const room = prompt((t as any).enterRoomId);
                                if (room) {
                                    onOnlineMatch?.(room.toUpperCase(), 'black', 'private', '10m');
                                    setShowPlayMenu(false);
                                }
                            }} className="w-full text-left py-6 hover:bg-[#24211D] group transition-colors flex flex-col gap-2 px-4">
                                <span className="text-lg tracking-[0.15em] text-[#E8E2D7] group-hover:text-[#B39A62]">{(t as any).joinRoom}</span>
                                <span className="text-[10px] tracking-widest text-[#A89C86] leading-relaxed">{(t as any).joinRoomDesc}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Existing Overlays (Time Control, Account, Replays, Leaderboard, Friends, Live, Ad) */}
            {pendingAction && (
                <div className="fixed inset-0 bg-[#161513]/95 z-50 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#161513] border border-[#A89C86]/40 p-8 w-full max-w-sm text-center shadow-2xl">
                        <h3 className="text-xl tracking-[0.2em] text-[#E8E2D7] mb-2">{t.selectTimeLimit}</h3>
                        <p className="text-[#A89C86] text-xs tracking-widest mb-8">{t.timeLimit}</p>
                        <div className="flex flex-col gap-4">
                            {(['10s', '3m', '10m'] as TimeControl[]).map(tc => (
                                <button
                                    key={tc}
                                    onClick={() => handleTimeControlConfirm(tc)}
                                    className="w-full py-4 bg-[#161513] border border-[#A89C86]/40 hover:border-[#B39A62] transition-colors text-[#E8E2D7] tracking-widest text-sm flex justify-between px-6 items-center group"
                                >
                                    <span className="group-hover:text-[#B39A62]">{tc === '10s' ? t.tc10s : tc === '3m' ? t.tc3m : t.tc10m}</span>
                                    
                                    {pendingAction.type === 'ranked' && userProfile && (
                                        <span className="text-xs text-[#B39A62] font-mono mx-auto">
                                            {(t as any).ratingLabel}: {Math.floor(tc === '10s' ? userProfile.rating_10s : tc === '3m' ? userProfile.rating_3m : userProfile.rating_10m)}
                                        </span>
                                    )}
                                    <span className="text-[#A89C86] text-[10px] tracking-widest ml-auto group-hover:text-[#D4B872] transition-colors">
                                        {queueStats?.[tc === '10s' ? 10 : tc === '3m' ? 180 : 600] || 0} waiting
                                    </span>

                                    <span className="text-xs text-[#A89C86]">→</span>
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setPendingAction(null)} className="mt-8 text-xs text-[#A89C86] hover:text-[#E8E2D7] tracking-widest">
                            {t.cancel}
                        </button>
                    </div>
                </div>
            )}

            
            {/* Matchmaking Overlay */}
            {isSearching && (
                <div className="fixed inset-0 bg-[#161513]/95 z-[100] flex flex-col items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#161513] border border-[#A89C86]/40 p-8 w-full max-w-sm text-center shadow-2xl">
                        {matchFound ? (
                            <>
                                <h3 className="text-xl tracking-[0.2em] text-[#B39A62] mb-4 animate-pulse font-serif">
                                    MATCH FOUND
                                </h3>
                                <p className="text-[#A89C86] text-[10px] tracking-widest">
                                    PREPARING...
                                </p>
                            </>
                        ) : (
                            <>
                                <h3 className="text-xl tracking-[0.2em] text-[#E8E2D7] mb-4 font-serif uppercase">
                                    {t.searchingOpponent}
                                </h3>
                                <div className="flex justify-center mb-8 gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#B39A62] animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#B39A62] animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#B39A62] animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                                <button onClick={cancelSearch} className="text-[10px] tracking-widest text-[#A89C86] hover:text-[#E8E2D7] transition-colors uppercase">
                                    {t.cancel}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {showAccount && (
                <div className="fixed inset-0 bg-[#161513]/95 z-50 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#161513] border border-[#A89C86]/40 p-6 md:p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#A89C86]/20">
                            <h3 className="text-lg tracking-[0.2em] text-[#E8E2D7] font-serif">{(t as any).account}</h3>
                            <button onClick={() => setShowAccount(false)} className="text-[#A89C86] hover:text-[#E8E2D7] text-xl">✕</button>
                        </div>
                        
                        <div className="flex flex-col gap-6 text-left">
                            <div className="flex items-center gap-6">
                                <label className="cursor-pointer group relative">
                                    <div className="w-20 h-20 rounded-full border border-[#A89C86]/50 overflow-hidden bg-[#161513] flex items-center justify-center transition-all group-hover:border-[#B39A62]">
                                        {userProfile?.avatar_url ? (
                                            <img src={userProfile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-[#A89C86] text-xl">?</span>
                                        )}
                                        {uploadingAvatar && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                <span className="text-[10px] tracking-widest text-white animate-pulse">{(t as any).uploading}</span>
                                            </div>
                                        )}
                                    </div>
                                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" disabled={uploadingAvatar} />
                                </label>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        {isEditingName ? (
                                            <input 
                                                type="text" 
                                                value={newName} 
                                                onChange={e => setNewName(e.target.value)} 
                                                className="bg-[#24211D] border border-[#A89C86]/50 p-1 text-sm text-[#E8E2D7] w-32 outline-none focus:border-[#B39A62]" 
                                            />
                                        ) : (
                                            <span className="text-xl font-serif tracking-wider">{userProfile?.name || user.name}</span>
                                        )}
                                        <button onClick={() => {
                                            if (isEditingName) { handleUpdateName(); setIsEditingName(false); } 
                                            else { setIsEditingName(true); setNewName(userProfile?.name || user.name); }
                                        }} className="text-[10px] text-[#A89C86] hover:text-[#B39A62] ml-2 tracking-widest">
                                            {isEditingName ? (t as any).save : (t as any).edit}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-[#A89C86] font-mono mt-1">ID: {user.id}</p>
                                </div>
                            </div>

                            <div>
                                <p className="text-[10px] tracking-[0.2em] text-[#A89C86] mb-2 uppercase">{(t as any).ratings}</p>
                                <div className="border border-[#A89C86]/20 flex justify-between">
                                    <div className="flex flex-col items-center p-4 border-r border-[#A89C86]/20 flex-1">
                                        <span className="text-[10px] text-[#A89C86] mb-1 tracking-widest">10 MIN</span>
                                        <span className="font-mono text-[#B39A62] text-sm">{userProfile ? Math.floor(userProfile.rating_10m) : '---'}</span>
                                    </div>
                                    <div className="flex flex-col items-center p-4 border-r border-[#A89C86]/20 flex-1">
                                        <span className="text-[10px] text-[#A89C86] mb-1 tracking-widest">3 MIN</span>
                                        <span className="font-mono text-[#B39A62] text-sm">{userProfile ? Math.floor(userProfile.rating_3m) : '---'}</span>
                                    </div>
                                    <div className="flex flex-col items-center p-4 flex-1">
                                        <span className="text-[10px] text-[#A89C86] mb-1 tracking-widest">10 SEC</span>
                                        <span className="font-mono text-[#B39A62] text-sm">{userProfile ? Math.floor(userProfile.rating_10s) : '---'}</span>
                                    </div>
                                </div>
                            </div>

                            <button onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} className="w-full mt-4 py-4 border border-[#A89C86]/40 hover:border-[#E8E2D7] text-[#A89C86] hover:text-[#E8E2D7] text-xs tracking-widest transition-colors">
                                {t.logout}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showReplays && (
                <div className="fixed inset-0 bg-[#161513]/95 z-50 flex flex-col p-4 md:p-8 backdrop-blur-md">
                    <div className="w-full max-w-2xl mx-auto h-full flex flex-col">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#A89C86]/20 shrink-0">
                            <h3 className="text-xl tracking-[0.2em] text-[#E8E2D7] font-serif">{t.watchReplays}</h3>
                            <button onClick={() => setShowReplays(false)} className="text-[#A89C86] hover:text-[#E8E2D7] text-2xl">✕</button>
                        </div>
                        
                        <div className="flex gap-2 mb-6 shrink-0">
                            <button onClick={() => handleReplayCategoryChange('global')} className={`flex-1 py-3 text-[10px] tracking-[0.2em] transition-colors border ${replayCategory === 'global' ? 'border-[#B39A62] bg-[#B39A62]/10 text-[#B39A62]' : 'border-[#A89C86]/40 text-[#A89C86] hover:border-[#E8E2D7]'}`}>{(t as any).global}</button>
                            <button onClick={() => handleReplayCategoryChange('mine')} className={`flex-1 py-3 text-[10px] tracking-[0.2em] transition-colors border ${replayCategory === 'mine' ? 'border-[#B39A62] bg-[#B39A62]/10 text-[#B39A62]' : 'border-[#A89C86]/40 text-[#A89C86] hover:border-[#E8E2D7]'}`}>{(t as any).mine}</button>
                        </div>

                        {loadingReplays ? (
                            <div className="flex-grow flex items-center justify-center text-[#A89C86] animate-pulse text-xs tracking-widest">{t.loading}</div>
                        ) : replays.length === 0 ? (
                            <div className="flex-grow flex items-center justify-center text-[#A89C86] text-xs tracking-widest">{t.noRecords}</div>
                        ) : (
                            <div className="flex-grow overflow-y-auto custom-scrollbar flex flex-col pr-2">
                                {replays.map(r => (
                                    <button key={r.id} onClick={() => onReplay?.(r)} className="w-full text-left py-4 border-b border-[#A89C86]/20 hover:border-[#B39A62] transition-colors flex justify-between items-center group">
                                        <div className="flex flex-col">
                                            <span className="text-sm tracking-widest text-[#E8E2D7]">
                                                {r.white_player} <span className="text-[#A89C86] mx-2 text-[10px]">{t.vs}</span> {r.black_player}
                                            </span>
                                            <span className="text-[10px] text-[#A89C86] mt-1 font-mono tracking-widest">
                                                {new Date(r.created_at!).toLocaleDateString()} / {r.mode.toUpperCase()} {r.time_control ? `/ ${r.time_control}` : ''}
                                            </span>
                                        </div>
                                        <span className={`text-[10px] tracking-widest ${r.winner === 'white_wins' ? 'text-[#E8E2D7]' : r.winner === 'black_wins' ? 'text-red-400' : 'text-[#A89C86]'}`}>
                                            {r.winner === 'white_wins' ? t.whiteWon : r.winner === 'black_wins' ? t.blackWon : t.draw}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showLeaderboard && (
                <div className="fixed inset-0 bg-[#161513]/95 z-50 flex flex-col p-4 md:p-8 backdrop-blur-md">
                    <div className="w-full max-w-2xl mx-auto h-full flex flex-col">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#A89C86]/20 shrink-0">
                            <h3 className="text-xl tracking-[0.2em] text-[#E8E2D7] font-serif">{t.globalRankings}</h3>
                            <button onClick={() => setShowLeaderboard(false)} className="text-[#A89C86] hover:text-[#E8E2D7] text-2xl">✕</button>
                        </div>
                        <div className="flex gap-2 mb-6 shrink-0">
                            {[ { id: '10s', label: t.lb10s }, { id: '3m', label: t.lb3m }, { id: '10m', label: t.lb10m } ].map(tab => (
                                <button key={tab.id} onClick={() => handleCategoryChange(tab.id as TimeControl)} className={`flex-1 py-3 text-[10px] tracking-[0.2em] transition-colors border ${leaderboardCategory === tab.id ? 'border-[#B39A62] bg-[#B39A62]/10 text-[#B39A62]' : 'border-[#A89C86]/40 text-[#A89C86] hover:border-[#E8E2D7]'}`}>{tab.label}</button>
                            ))}
                        </div>
                        {loadingLeaderboard ? (
                            <div className="flex-grow flex items-center justify-center text-[#A89C86] animate-pulse text-xs tracking-widest">{t.loading}</div>
                        ) : leaderboard.length === 0 ? (
                            <div className="flex-grow flex items-center justify-center text-[#A89C86] text-xs tracking-widest">{t.noRankedPlayers}</div>
                        ) : (
                            <div className="flex-grow overflow-y-auto custom-scrollbar flex flex-col pr-2">
                                {leaderboard.map((p, index) => {
                                    const ratingVal = leaderboardCategory === '10s' ? (p.rating_10s ?? 2000)
                                                    : leaderboardCategory === '3m' ? (p.rating_3m ?? 2000)
                                                    : (p.rating_10m ?? 2000);
                                    return (
                                        <div key={p.id} className="w-full flex justify-between items-center py-4 border-b border-[#A89C86]/20">
                                            <div className="flex items-center gap-6">
                                                <span className={`text-sm font-mono tracking-widest ${index === 0 ? 'text-[#B39A62]' : index === 1 ? 'text-[#E8E2D7]' : index === 2 ? 'text-[#A89C86]' : 'text-[#A89C86]/50'}`}>#{index + 1}</span>
                                                <span className="tracking-widest text-[#E8E2D7] text-sm">{p.name}</span>
                                            </div>
                                            <div className="text-[#B39A62] font-mono text-sm tracking-widest">{Math.floor(ratingVal)}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showFriends && (
                <div className="fixed inset-0 z-50 bg-[#161513]">
                    <FriendsMenu user={user} lang={lang} onlineUsers={onlineUsers} onClose={() => setShowFriends(false)} onChallenge={(friendId) => {
                        const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
                        setPendingAction({ type: 'host', roomId: newRoomId });
                        setShowFriends(false);
                    }} />
                </div>
            )}

            {showLiveMatches && (
                <div className="fixed inset-0 z-50 bg-[#161513]">
                    <LiveMatchesMenu lang={lang} onClose={() => setShowLiveMatches(false)} onSpectate={(roomId) => {
                        onOnlineMatch?.(roomId, 'spectator', 'private', '10m');
                        setShowLiveMatches(false);
                    }} />
                </div>
            )}

            {showAdModal && (
                <div className="fixed inset-0 bg-[#161513]/95 z-[100] flex flex-col items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#24211D] border border-[#A89C86]/40 p-8 w-full max-w-sm text-center shadow-2xl flex flex-col items-center">
                        <h3 className="text-xl font-serif text-[#E8E2D7] mb-2">{(t as any).adCloudTitle || 'Preparing Match'}</h3>
                        <p className="text-[#A89C86] text-[10px] tracking-widest mb-8">{(t as any).adCloudDesc || 'Watch a short ad to start the practice match!'}</p>
                        <div className="w-full h-1 bg-[#161513] mb-6 overflow-hidden">
                            <div className="h-full bg-[#B39A62] transition-all duration-[1000ms] ease-linear" style={{ width: `${adProgress}%` }} />
                        </div>
                        <div className="w-32 h-32 mb-4 bg-transparent border border-[#A89C86]/10 flex items-center justify-center">
                            <AdBanner />
                        </div>
                        {adProgress >= 100 ? (
                            <button onClick={handleAdFinish} className="w-full py-4 bg-[#E8E2D7] text-[#161513] font-bold tracking-[0.2em] text-xs transition-colors mt-4 hover:bg-[#B39A62]">START MATCH</button>
                        ) : (
                            <div className="w-full py-4 bg-transparent text-[#A89C86] tracking-[0.2em] text-xs mt-4 border border-[#A89C86]/20">LOADING...</div>
                        )}
                    </div>
                </div>
            )}


            {/* --- HOME SCREEN MAIN UI --- */}
            
            <div className="flex justify-between items-center w-full max-w-lg mx-auto shrink-0 z-10 pt-4">
                <span className="text-xl md:text-2xl tracking-[0.2em] font-serif text-[#E8E2D7]">Q-GAMBIT</span>
                <div className="flex items-center gap-2">
                    <span className="font-mono text-[#B39A62] text-sm">{userProfile?.rating_10m ? Math.floor(userProfile.rating_10m) : '---'}</span>
                </div>
            </div>

            <div className="flex-grow flex flex-col justify-center w-full max-w-lg mx-auto z-10 gap-12 mt-8">
                
                <div className="flex flex-col gap-6 w-full">
                    <div className="flex flex-col items-center w-full">
                        <h2 className="text-[10px] tracking-[0.3em] text-[#A89C86] uppercase mb-4">{(t as any).yourNextGame}</h2>
                        <button onClick={() => setShowPlayMenu(true)} className="w-full py-8 bg-transparent border border-[#A89C86]/50 hover:bg-[#E8E2D7] hover:text-[#161513] text-[#E8E2D7] transition-all group relative overflow-hidden">
                            <span className="relative z-10 text-2xl tracking-[0.3em] font-serif transition-colors">{(t as any).play}</span>
                        </button>
                    </div>

                    
                    <div className="flex gap-2">
                        <button onClick={handleVsCpuClick} className="flex-1 py-4 bg-transparent border border-[#A89C86]/20 hover:bg-[#24211D] text-xs tracking-[0.2em] transition-colors text-[#A89C86] hover:text-[#E8E2D7] uppercase">
                            {(t as any).practice}
                        </button>
                        <button onClick={() => setShowTutorial(true)} className="flex-1 py-4 bg-[#B39A62]/10 border border-[#B39A62]/30 hover:bg-[#B39A62]/30 text-xs tracking-[0.2em] transition-colors text-[#D4B872] hover:text-[#E8E2D7] uppercase font-bold">
                            {(t as any).rulesButton || "HOW TO PLAY"}
                        </button>
                    </div>

                </div>

                <div className="flex flex-col w-full">
                    <div className="border-b border-[#A89C86]/20 pb-2 mb-2 flex justify-between items-end">
                        <span className="text-[10px] tracking-[0.2em] text-[#A89C86] uppercase">{(t as any).recentGames}</span>
                    </div>
                    {recentGames.length === 0 ? (
                        <div className="py-2 text-[10px] text-[#A89C86]/50 tracking-widest">{(t as any).noRecentGames}</div>
                    ) : (
                        <div className="flex flex-col gap-0">
                            {recentGames.slice(0, 3).map(r => {
                                const isWhite = r.white_id === user.id;
                                const opponent = isWhite ? r.black_player : r.white_player;
                                const iWon = (isWhite && r.winner === 'white_wins') || (!isWhite && r.winner === 'black_wins');
                                const isDraw = r.winner === 'draw';
                                return (
                                    <div key={r.id} className="flex justify-between items-center py-3 border-b border-[#A89C86]/10 text-xs tracking-widest">
                                        <span className="text-[#E8E2D7] truncate max-w-[150px]">{opponent}</span>
                                        <span className={`text-[10px] ${iWon ? 'text-[#B39A62]' : isDraw ? 'text-[#A89C86]' : 'text-[#A89C86]/50'}`}>
                                            {iWon ? (t as any).win : isDraw ? (t as any).draw : (t as any).loss}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="shrink-0 w-full max-w-lg mx-auto flex flex-wrap justify-center sm:justify-between items-center border-t border-[#A89C86]/20 pt-6 pb-2 text-[10px] tracking-[0.2em] text-[#A89C86] gap-y-4 z-10">
                <div className="flex gap-6 justify-center w-full sm:w-auto">
                    <button onClick={() => { setShowReplays(true); loadReplays(replayCategory); }} className="hover:text-[#E8E2D7] transition-colors uppercase">{t.gameReplays}</button>
                    <button onClick={() => { setShowLeaderboard(true); loadLeaderboard(); }} className="hover:text-[#E8E2D7] transition-colors uppercase">{t.globalRankings}</button>
                    <button onClick={() => setShowFriends(true)} className="hover:text-[#E8E2D7] transition-colors uppercase">{(t as any).friends}</button>
                </div>
                <button onClick={() => setShowAccount(true)} className="hover:text-[#E8E2D7] transition-colors uppercase w-full sm:w-auto text-center">{(t as any).account}</button>
            </div>
        </div>
    );
}
