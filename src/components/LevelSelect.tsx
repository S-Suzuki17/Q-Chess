'use client';
import { useMatchmaking } from '../hooks/useMatchmaking';
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
        <div className="w-full min-h-[100dvh] flex flex-col items-center bg-[#11100E] text-[#E8E2D7] font-sans">
            
            {/* --- Modals --- */}
            {pendingAction && (
                <div className="fixed inset-0 bg-[#11100E]/90 z-50 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#191714] border border-[#A89C86]/30 p-8 w-full max-w-sm text-center shadow-2xl">
                        <h3 className="text-xl tracking-[0.2em] text-[#E8E2D7] mb-2">{t.selectTimeLimit}</h3>
                        <p className="text-[#A89C86] text-xs tracking-widest mb-8">{t.timeLimit}</p>
                        <div className="flex flex-col gap-4">
                            {(['10s', '3m', '10m'] as TimeControl[]).map(tc => (
                                <button
                                    key={tc}
                                    onClick={() => handleTimeControlConfirm(tc)}
                                    className="w-full py-4 bg-[#11100E] border border-[#A89C86]/30 hover:border-[#B39A62] transition-colors text-[#E8E2D7] tracking-widest text-sm flex justify-between px-6 items-center group"
                                >
                                    <span className="group-hover:text-[#B39A62]">{tc === '10s' ? t.tc10s : tc === '3m' ? t.tc3m : t.tc10m}</span>
                                    <span className="text-xs text-[#A89C86]">→</span>
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setPendingAction(null)}
                            className="mt-8 text-xs text-[#A89C86] hover:text-[#E8E2D7] tracking-widest"
                        >
                            CANCEL
                        </button>
                    </div>
                </div>
            )}

            {showAccount && (
                <div className="fixed inset-0 bg-[#11100E]/90 z-50 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#191714] border border-[#A89C86]/30 p-6 md:p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#A89C86]/20">
                            <h3 className="text-lg tracking-[0.2em] text-[#E8E2D7]">ACCOUNT</h3>
                            <button onClick={() => setShowAccount(false)} className="text-[#A89C86] hover:text-[#E8E2D7]">✕</button>
                        </div>
                        
                        <div className="flex flex-col gap-6 text-left">
                            <div className="flex items-center gap-6">
                                <label className="cursor-pointer group relative">
                                    <div className="w-20 h-20 rounded-full border border-[#A89C86]/50 overflow-hidden bg-[#11100E] flex items-center justify-center transition-all group-hover:border-[#B39A62]">
                                        {userProfile?.avatar_url ? (
                                            <img src={userProfile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-[#A89C86] text-xl">?</span>
                                        )}
                                        {uploadingAvatar && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                <span className="text-xs text-white animate-pulse">...</span>
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
                                                className="bg-[#11100E] border border-[#A89C86]/50 p-1 text-sm text-[#E8E2D7] w-32" 
                                            />
                                        ) : (
                                            <span className="text-xl font-bold tracking-wider">{userProfile?.name || user.name}</span>
                                        )}
                                        <button onClick={() => {
                                            if (isEditingName) { handleUpdateName(); } 
                                            else { setIsEditingName(true); setNewName(userProfile?.name || user.name); }
                                        }} className="text-[10px] text-[#A89C86] hover:text-[#B39A62] ml-2">
                                            {isEditingName ? 'SAVE' : 'EDIT'}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-[#A89C86] font-mono mt-1">ID: {user.id}</p>
                                </div>
                            </div>

                            <div>
                                <p className="text-[10px] tracking-[0.2em] text-[#A89C86] mb-2 uppercase">Ratings</p>
                                <div className="bg-[#11100E] border border-[#A89C86]/20 p-4 flex justify-between">
                                    <div className="flex flex-col items-center">
                                        <span className="text-[10px] text-[#A89C86] mb-1">10 MIN</span>
                                        <span className="font-mono text-[#B39A62] font-bold">{userProfile ? Math.floor(userProfile.rating_10m) : '---'}</span>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <span className="text-[10px] text-[#A89C86] mb-1">3 MIN</span>
                                        <span className="font-mono text-[#B39A62] font-bold">{userProfile ? Math.floor(userProfile.rating_3m) : '---'}</span>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <span className="text-[10px] text-[#A89C86] mb-1">10 SEC</span>
                                        <span className="font-mono text-[#B39A62] font-bold">{userProfile ? Math.floor(userProfile.rating_10s) : '---'}</span>
                                    </div>
                                </div>
                            </div>

                            {userStats && (
                                <div>
                                    <p className="text-[10px] tracking-[0.2em] text-[#A89C86] mb-2 uppercase">Stats</p>
                                    <div className="bg-[#11100E] border border-[#A89C86]/20 p-4 flex justify-between text-sm">
                                        <div className="flex flex-col items-center"><span className="text-[#A89C86] text-[10px]">WINS</span><span className="text-[#E8E2D7] font-mono">{userStats.wins}</span></div>
                                        <div className="flex flex-col items-center"><span className="text-[#A89C86] text-[10px]">LOSSES</span><span className="text-[#E8E2D7] font-mono">{userStats.losses}</span></div>
                                        <div className="flex flex-col items-center"><span className="text-[#A89C86] text-[10px]">DRAWS</span><span className="text-[#E8E2D7] font-mono">{userStats.draws}</span></div>
                                    </div>
                                </div>
                            )}

                            {user.type === 'registered' && (
                                <div className="mt-4 border-t border-[#A89C86]/20 pt-6">
                                    <p className="text-[10px] tracking-[0.2em] text-[#A89C86] mb-4 uppercase">{(t as any).emailUpdate || 'Update Email'}</p>
                                    <form onSubmit={handleUpdateEmail} className="flex flex-col gap-3">
                                        <input type="email" placeholder={(t as any).email || 'Email'} value={updateEmail} onChange={e => setUpdateEmail(e.target.value)} className="bg-[#11100E] border border-[#A89C86]/30 p-2 text-sm text-[#E8E2D7] focus:border-[#B39A62] outline-none" />
                                        <input type="password" placeholder={(t as any).password || 'Password'} value={updatePassword} onChange={e => setUpdatePassword(e.target.value)} className="bg-[#11100E] border border-[#A89C86]/30 p-2 text-sm text-[#E8E2D7] focus:border-[#B39A62] outline-none" />
                                        <button type="submit" disabled={emailLoading} className="py-2 bg-[#A89C86]/10 border border-[#A89C86]/30 hover:bg-[#A89C86]/20 text-xs tracking-widest transition-colors mt-2">
                                            {emailLoading ? '...' : 'UPDATE EMAIL'}
                                        </button>
                                        {emailMsg && <p className="text-[10px] text-[#B39A62] text-center mt-1">{emailMsg}</p>}
                                    </form>
                                </div>
                            )}

                            <button onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} className="w-full mt-4 py-3 border border-red-900/50 hover:bg-red-900/20 text-red-400 text-xs tracking-widest transition-colors">
                                SIGN OUT
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showReplays && (
                <div className="fixed inset-0 bg-[#11100E]/95 z-50 flex flex-col p-4 md:p-8 backdrop-blur-md">
                    <div className="w-full max-w-4xl mx-auto h-full flex flex-col">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#A89C86]/20 shrink-0">
                            <h3 className="text-xl tracking-[0.2em] text-[#E8E2D7]">{t.watchReplays}</h3>
                            <button onClick={() => setShowReplays(false)} className="text-[#A89C86] hover:text-[#E8E2D7] text-2xl">✕</button>
                        </div>
                        
                        <div className="flex gap-2 mb-6 shrink-0">
                            <button onClick={() => handleReplayCategoryChange('global')} className={`flex-1 py-3 text-xs tracking-widest transition-colors border ${replayCategory === 'global' ? 'border-[#B39A62] bg-[#B39A62]/10 text-[#B39A62]' : 'border-[#A89C86]/30 text-[#A89C86] hover:border-[#E8E2D7]'}`}>
                                GLOBAL
                            </button>
                            <button onClick={() => handleReplayCategoryChange('mine')} className={`flex-1 py-3 text-xs tracking-widest transition-colors border ${replayCategory === 'mine' ? 'border-[#B39A62] bg-[#B39A62]/10 text-[#B39A62]' : 'border-[#A89C86]/30 text-[#A89C86] hover:border-[#E8E2D7]'}`}>
                                MY GAMES
                            </button>
                        </div>

                        {loadingReplays ? (
                            <div className="flex-grow flex items-center justify-center text-[#A89C86] animate-pulse">{t.loading}</div>
                        ) : replays.length === 0 ? (
                            <div className="flex-grow flex items-center justify-center text-[#A89C86]">{t.noRecords}</div>
                        ) : (
                            <div className="flex-grow overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-2">
                                {replays.map(r => (
                                    <button key={r.id} onClick={() => onReplay?.(r)} className="w-full text-left p-4 bg-[#191714] border border-[#A89C86]/20 hover:border-[#B39A62] transition-colors flex justify-between items-center group">
                                        <div className="flex flex-col">
                                            <span className="text-sm tracking-wider text-[#E8E2D7]">
                                                {r.white_player} <span className="text-[#A89C86] mx-2">{t.vs}</span> {r.black_player}
                                            </span>
                                            <span className="text-[10px] text-[#A89C86] mt-2 font-mono">
                                                {new Date(r.created_at!).toLocaleDateString()} / {r.mode.toUpperCase()} {r.time_control ? `/ ${r.time_control}` : ''}
                                            </span>
                                        </div>
                                        <span className={`text-[10px] tracking-widest px-2 py-1 border ${r.winner === 'white_wins' ? 'border-[#E8E2D7]/50 text-[#E8E2D7]' : r.winner === 'black_wins' ? 'border-red-900/50 text-red-400' : 'border-[#A89C86]/50 text-[#A89C86]'}`}>
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
                <div className="fixed inset-0 bg-[#11100E]/95 z-50 flex flex-col p-4 md:p-8 backdrop-blur-md">
                    <div className="w-full max-w-4xl mx-auto h-full flex flex-col">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#A89C86]/20 shrink-0">
                            <h3 className="text-xl tracking-[0.2em] text-[#E8E2D7]">{t.globalRankings}</h3>
                            <button onClick={() => setShowLeaderboard(false)} className="text-[#A89C86] hover:text-[#E8E2D7] text-2xl">✕</button>
                        </div>
                        
                        <div className="flex gap-2 mb-6 shrink-0">
                            {[ { id: '10m', label: t.lb10m } ].map(tab => (
                                <button key={tab.id} onClick={() => handleCategoryChange(tab.id as TimeControl)} className={`flex-1 py-3 text-xs tracking-widest transition-colors border ${leaderboardCategory === tab.id ? 'border-[#B39A62] bg-[#B39A62]/10 text-[#B39A62]' : 'border-[#A89C86]/30 text-[#A89C86] hover:border-[#E8E2D7]'}`}>
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {loadingLeaderboard ? (
                            <div className="flex-grow flex items-center justify-center text-[#A89C86] animate-pulse">{t.loading}</div>
                        ) : leaderboard.length === 0 ? (
                            <div className="flex-grow flex items-center justify-center text-[#A89C86]">{t.noRankedPlayers}</div>
                        ) : (
                            <div className="flex-grow overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-2">
                                {leaderboard.map((p, index) => {
                                    const ratingVal = leaderboardCategory === '10s' ? (p.rating_10s ?? 2000)
                                                    : leaderboardCategory === '3m' ? (p.rating_3m ?? 2000)
                                                    : (p.rating_10m ?? 2000);
                                    return (
                                        <div key={p.id} className="w-full flex justify-between items-center p-4 bg-[#191714] border border-[#A89C86]/20">
                                            <div className="flex items-center gap-6">
                                                <span className={`text-lg font-serif ${index === 0 ? 'text-[#B39A62]' : index === 1 ? 'text-[#E8E2D7]' : index === 2 ? 'text-[#A89C86]' : 'text-[#A89C86]/50'}`}>
                                                    #{index + 1}
                                                </span>
                                                <span className="tracking-widest text-[#E8E2D7]">{p.name}</span>
                                            </div>
                                            <div className="text-[#B39A62] font-mono">{Math.floor(ratingVal)}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showFriends && (
                <div className="fixed inset-0 z-50">
                    <FriendsMenu user={user} lang={lang} onlineUsers={onlineUsers} onClose={() => setShowFriends(false)} onChallenge={(friendId) => {
                        const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
                        setPendingAction({ type: 'host', roomId: newRoomId });
                        setShowFriends(false);
                    }} />
                </div>
            )}

            {showLiveMatches && (
                <div className="fixed inset-0 z-50">
                    <LiveMatchesMenu lang={lang} onClose={() => setShowLiveMatches(false)} onSpectate={(roomId) => {
                        onOnlineMatch?.(roomId, 'spectator', 'private', '10m');
                        setShowLiveMatches(false);
                    }} />
                </div>
            )}


            {/* --- Main Dashboard Container --- */}
            <div className="w-full max-w-5xl h-full flex flex-col pt-4 pb-8 px-4 relative z-10 flex-grow">
                
                {/* Header / Profile Bar */}
                <div className="flex justify-between items-center w-full py-4 border-b border-[#A89C86]/30 shrink-0 mb-8 md:mb-12">
                    <div className="flex items-center gap-4">
                        <span className="text-2xl md:text-3xl tracking-[0.2em] font-serif text-[#E8E2D7]">Q-GAMBIT</span>
                        <span className="text-[10px] md:text-xs text-[#A89C86] hidden sm:inline tracking-[0.2em] uppercase">A game of hidden identity</span>
                    </div>
                    <button onClick={() => setShowAccount(true)} className="flex items-center gap-4 hover:text-[#B39A62] transition-colors group">
                        <span className="text-sm tracking-widest text-[#E8E2D7] group-hover:text-[#B39A62]">{userProfile?.name || user.name}</span>
                        <div className="w-10 h-10 rounded border border-[#A89C86]/50 bg-[#191714] flex items-center justify-center overflow-hidden">
                            {userProfile?.avatar_url ? (
                                <img src={userProfile.avatar_url} className="w-full h-full object-cover" alt="avatar" />
                            ) : (
                                <span className="text-sm text-[#A89C86]">?</span>
                            )}
                        </div>
                    </button>
                </div>

                {/* Dashboard Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full flex-grow content-start">
                    
                    {/* ONLINE MATCH */}
                    <div className="flex flex-col border border-[#A89C86]/20 bg-[#191714]/80 p-6">
                        <h3 className="text-[10px] tracking-[0.3em] text-[#B39A62] mb-6 border-b border-[#A89C86]/20 pb-2 uppercase">{t.onlineMultiplayer}</h3>
                        <div className="flex flex-col gap-3">
                            <button onClick={() => {
                                if (user.type === 'guest') {
                                    alert(lang === 'ja' ? 'ランクマッチプレイにはアカウント登録が必要です。' : 'Please register an account to play Ranked Matches.');
                                } else {
                                    setPendingAction({ type: 'ranked' });
                                }
                            }} className="w-full py-4 bg-[#11100E] border border-[#A89C86]/30 hover:border-[#B39A62] text-sm tracking-widest transition-colors text-left px-4 group flex justify-between">
                                <span className="group-hover:text-[#B39A62] text-[#E8E2D7]">{t.rankedMatch}</span>
                                <span className="text-[#A89C86]">→</span>
                            </button>
                            <button onClick={() => setPendingAction({ type: 'random' })} className="w-full py-4 bg-[#11100E] border border-[#A89C86]/30 hover:border-[#B39A62] text-sm tracking-widest transition-colors text-left px-4 group flex justify-between">
                                <span className="group-hover:text-[#B39A62] text-[#E8E2D7]">{t.randomMatch}</span>
                                <span className="text-[#A89C86]">→</span>
                            </button>
                            
                            <div className="grid grid-cols-2 gap-3 mt-3">
                                <button onClick={() => {
                                    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
                                    setPendingAction({ type: 'host', roomId: newRoomId });
                                }} className="py-3 bg-transparent border border-[#A89C86]/30 hover:bg-[#A89C86]/10 text-xs text-[#E8E2D7] tracking-widest transition-colors text-center">
                                    {t.hostMatch}
                                </button>
                                <button onClick={() => {
                                    const room = prompt(lang === 'ja' ? 'ルームIDを入力' : 'Enter Room ID');
                                    if (room) setPendingAction({ type: 'join', roomId: room.toUpperCase() });
                                }} className="py-3 bg-transparent border border-[#A89C86]/30 hover:bg-[#A89C86]/10 text-xs text-[#E8E2D7] tracking-widest transition-colors text-center">
                                    {t.joinMatch}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* PRACTICE */}
                    <div className="flex flex-col border border-[#A89C86]/20 bg-[#191714]/80 p-6">
                        <h3 className="text-[10px] tracking-[0.3em] text-[#B39A62] mb-6 border-b border-[#A89C86]/20 pb-2 uppercase">PRACTICE</h3>
                        <div className="flex flex-col gap-3 h-full justify-start">
                            <button onClick={handleVsCpuClick} className="w-full py-8 bg-[#11100E] border border-[#A89C86]/30 hover:border-[#B39A62] text-center transition-colors group flex flex-col items-center justify-center gap-3">
                                <span className="text-xl tracking-[0.2em] text-[#E8E2D7] group-hover:text-[#B39A62]">{t.vsCpu}</span>
                                <span className="text-[10px] text-[#A89C86] tracking-widest">{t.vsCpuDesc}</span>
                            </button>
                        </div>
                    </div>

                    {/* SOCIAL & COMMUNITY */}
                    <div className="flex flex-col gap-6 sm:col-span-2 lg:col-span-1">
                        
                        <div className="flex flex-col border border-[#A89C86]/20 bg-[#191714]/80 p-6">
                            <h3 className="text-[10px] tracking-[0.3em] text-[#B39A62] mb-4 border-b border-[#A89C86]/20 pb-2 uppercase">SOCIAL & LIVE</h3>
                            <div className="flex flex-col gap-3">
                                <button onClick={() => setShowFriends(true)} className="w-full py-3 bg-[#11100E] border border-[#A89C86]/30 hover:border-[#B39A62] text-[#E8E2D7] text-xs tracking-widest transition-colors text-center group">
                                    <span className="group-hover:text-[#B39A62]">{(t as any).friends || 'FRIENDS'}</span>
                                </button>
                                <button onClick={() => setShowLiveMatches(true)} className="w-full py-3 bg-[#11100E] border border-[#A89C86]/30 hover:border-[#B39A62] text-[#E8E2D7] text-xs tracking-widest transition-colors text-center group">
                                    <span className="group-hover:text-[#B39A62]">{(t as any).liveMatch || 'LIVE MATCHES'}</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col border border-[#A89C86]/20 bg-[#191714]/80 p-6">
                            <h3 className="text-[10px] tracking-[0.3em] text-[#B39A62] mb-4 border-b border-[#A89C86]/20 pb-2 uppercase">COMMUNITY</h3>
                            <div className="flex flex-col gap-3">
                                <button onClick={() => { setShowReplays(true); loadReplays(replayCategory); }} className="w-full py-3 bg-[#11100E] border border-[#A89C86]/30 hover:border-[#B39A62] text-[#E8E2D7] text-xs tracking-widest transition-colors text-center group">
                                    <span className="group-hover:text-[#B39A62]">{t.gameReplays}</span>
                                </button>
                                <button onClick={() => { setShowLeaderboard(true); loadLeaderboard(); }} className="w-full py-3 bg-[#11100E] border border-[#A89C86]/30 hover:border-[#B39A62] text-[#E8E2D7] text-xs tracking-widest transition-colors text-center group">
                                    <span className="group-hover:text-[#B39A62]">{t.globalRankings}</span>
                                </button>
                            </div>
                        </div>

                    </div>
                </div>

                <div className="w-full flex justify-between items-center mt-auto pt-8">
                    <span className="text-[10px] tracking-[0.2em] text-[#A89C86]/50 uppercase">Online: {onlineCount}</span>
                    <button onClick={onBack} className="text-[10px] tracking-[0.2em] text-[#A89C86] hover:text-[#E8E2D7] uppercase transition-colors">
                        LOGOUT
                    </button>
                </div>
            </div>
            
            {showAdModal && (
                <div className="fixed inset-0 bg-[#11100E]/90 z-[100] flex flex-col items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#191714] border border-[#A89C86]/30 p-8 rounded-lg max-w-sm w-full text-center shadow-2xl flex flex-col items-center">
                        <h3 className="text-xl font-serif text-[#E8E2D7] mb-2">{(t as any).adCloudTitle || 'Preparing Match'}</h3>
                        <p className="text-[#A89C86] text-xs mb-8">{(t as any).adCloudDesc || 'Watch a short ad to start the practice match!'}</p>
                        
                        <div className="w-full h-2 bg-[#11100E] rounded-full overflow-hidden mb-6 border border-[#A89C86]/20">
                            <div 
                                className="h-full bg-[#B39A62] transition-all duration-[1000ms] ease-linear"
                                style={{ width: `${adProgress}%` }}
                            />
                        </div>
                        
                        <div className="w-32 h-32 mb-4 bg-transparent">
                            <AdBanner />
                        </div>
                        
                        {adProgress >= 100 ? (
                            <button
                                onClick={handleAdFinish}
                                className="w-full py-4 bg-[#B39A62] text-[#11100E] font-bold tracking-widest text-sm transition-colors mt-4"
                            >
                                START MATCH
                            </button>
                        ) : (
                            <div className="w-full py-4 bg-[#11100E] text-[#A89C86] tracking-widest text-sm mt-4 border border-[#A89C86]/20">
                                LOADING...
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
