'use client';
import { useMatchmaking } from '../hooks/useMatchmaking';
import { matchText } from '../locales/matchText';
import { useSocket } from '../lib/SocketContext';
import { AccountAvatar } from './AccountAvatar';
import { AccountIconEditor } from './AccountIconEditor';
import { rewardClearCount } from '../config/campaign';
import { iconEditorText } from '../locales/iconEditorText';
import { useCampaignProgress } from '../hooks/useCampaignProgress';
import { AdBanner } from './AdBanner';

import React from 'react';
import dynamic from 'next/dynamic';
import { dict, Language } from '../locales/dict';
import { User, TimeControl } from '../types/game';
import { supabase } from '../lib/supabaseClient';
import { GameRecord, getGameRecords, Profile, getTopProfiles, UserStats, PUBLIC_PROFILE_COLUMNS } from '../lib/gameRecordService';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { HistoryError } from '../lib/privateHistory';
import { RankedLoginDialog } from './RankedLoginDialog';
import { replayText } from '../locales/replayText';
import { soundManager } from '../lib/SoundService';
import { MATCHMAKING_MUSIC_URL } from '../config/musicTracks';
import { FriendsMenu } from './FriendsMenu';
import { SettingsDialog } from './SettingsDialog';
import { formatFriendRating } from '../lib/friendDirectory';
import { LiveMatchesMenu } from './LiveMatchesMenu';
import { CPU_LEVELS, cpuDifficulty, type CPULevel } from '../config/cpuDifficulty';
import { InteractiveTutorial } from './InteractiveTutorial';
import { ArrowUpRight } from 'lucide-react';
import './lobby-studio.css';
import { campaignText } from '../locales/campaignText';
import { useCircuitAccess } from '../hooks/useCircuitAccess';
import { circuitAccessText } from '../locales/circuitAccessText';

const ProfileCosmetics=dynamic(()=>import('./ProfileCosmetics').then(module=>module.ProfileCosmetics),{ssr:false});

interface LevelSelectProps {
    settingsPanel?:'friends'|'account'|null;
    onCloseSettingsPanel?:()=>void;
    lang: Language;
    user: User;
    onSelect: (tc: TimeControl, level: CPULevel, side: 'white' | 'black') => void;
    onOnlineMatch?: (roomId: string, role: 'white' | 'black' | 'spectator', matchMode: 'random' | 'private' | 'ranked', tc: TimeControl, opponentId?: string) => void;
    onStartGlobalMatch?: (tcSeconds: number, mode: 'ranked' | 'random') => void;
    onReplay?: (record: GameRecord) => void;
    onBack: () => void;
    onCampaign?:()=>void;
    onProfileUpdated?:(profile:{id:string;avatar_url:string})=>void;
}

export function LevelSelect({ lang, user, onSelect, onOnlineMatch, onStartGlobalMatch, onReplay, onBack, onCampaign,settingsPanel,onCloseSettingsPanel,onProfileUpdated }: LevelSelectProps) {
    const t = { ...dict['en'], ...(dict[lang] || {}) } as any;
    const historyCopy = replayText(lang);
    const {progress:cosmetics}=useCampaignProgress();
    const {allowed:circuitAllowed}=useCircuitAccess(user);
    const [practiceLevel, setPracticeLevel] = React.useState<CPULevel>(3);
    const [practiceSide, setPracticeSide] = React.useState<'white' | 'black'>('white');
    const [showAdModal, setShowAdModal] = React.useState(false);
    const [adProgress, setAdProgress] = React.useState(0);
    const [showOnlineMenu, setShowOnlineMenu] = React.useState(false);
    const [joinRoomId, setJoinRoomId] = React.useState('');
    const [isSearching, setIsSearching] = React.useState(false);
    const [matchFound, setMatchFound] = React.useState(false);
    
    const { queueStats, isAuthenticated } = useSocket();
    const [showReplays, setShowReplays] = React.useState(false);
    const [replays, setReplays] = React.useState<GameRecord[]>([]);
    const [loadingReplays, setLoadingReplays] = React.useState(false);
    const [historyError, setHistoryError] = React.useState<'AUTH_REQUIRED' | 'UNAVAILABLE' | null>(null);
    const [verifyHistory, setVerifyHistory] = React.useState(false);
    const historyIdentity = React.useRef(user.id);
    historyIdentity.current = user.id;
    const historyRequest = React.useRef(0);
    const [showLeaderboard, setShowLeaderboard] = React.useState(false);
    const [leaderboard, setLeaderboard] = React.useState<Profile[]>([]);
    const [loadingLeaderboard, setLoadingLeaderboard] = React.useState(false);
    const [leaderboardCategory, setLeaderboardCategory] = React.useState<TimeControl>('10m');
    const [pendingAction, setPendingAction] = React.useState<{ type: 'cpu' | 'ranked' | 'random' | 'host' | 'join'; roomId?: string } | null>(null);
    const [userProfile, setUserProfile] = React.useState<Profile | null>(null);
    const [userStats, setUserStats] = React.useState<UserStats | null>(null);
    const showAccount=settingsPanel==='account';
    const [updateEmail, setUpdateEmail] = React.useState('');
    const [updatePassword, setUpdatePassword] = React.useState('');
    const [emailMsg, setEmailMsg] = React.useState('');
    const [emailLoading, setEmailLoading] = React.useState(false);
    const [isEditingName, setIsEditingName] = React.useState(false);
    const [newName, setNewName] = React.useState('');
    const [nameLoading, setNameLoading] = React.useState(false);
    const [showIconEditor,setShowIconEditor]=React.useState(false);
    const [avatarOverride,setAvatarOverride]=React.useState<{userId:string;url:string}|null>(null);
    const displayAvatarUrl=avatarOverride?.userId===user.id?avatarOverride.url:(userProfile?.id===user.id?userProfile.avatar_url:undefined)||user.avatar_url;
    const canEditIcon=!!user.id&&!/^(?:guest(?:[-_]|$)|anon(?:ymous)?(?:[-_]|$)|cpu(?:[-_]|$)|ai(?::|$)|supabase-)/i.test(user.id);
    React.useEffect(()=>{setShowIconEditor(false);},[user.id,showAccount]);
    const acceptAvatar=(url:string)=>{
        if(historyIdentity.current!==user.id)return;
        setAvatarOverride({userId:user.id,url});
        setUserProfile(profile=>profile?.id===user.id?{...profile,avatar_url:url}:profile);
        onProfileUpdated?.({id:user.id,avatar_url:url});
    };

    const handleUpdateName = async () => {
        if (!newName.trim() || newName.trim().length > 15) {
            alert(matchText(lang, '名前は1〜15文字で入力してください。', 'Name must be between 1 and 15 characters.'));
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
            setEmailMsg(matchText(lang,'メールとパスワードを入力してください','Email and password required.'));
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
            setEmailMsg(matchText(lang,'更新できませんでした。パスワードを確認してください','Update failed. Incorrect password?'));
        } else {
            setEmailMsg(matchText(lang,'メールを更新しました','Email updated successfully!'));
            setUpdatePassword('');
        }
    };
    const showFriends=settingsPanel==='friends';
    const [showTutorial, setShowTutorial] = React.useState(false);
    const [showLiveMatches, setShowLiveMatches] = React.useState(false);
    const [showPlayMenu, setShowPlayMenu] = React.useState(false);
    const [recentGames, setRecentGames] = React.useState<GameRecord[]>([]);
    React.useEffect(() => {
        historyRequest.current++;
        setRecentGames([]); setReplays([]); setUserStats(null); setHistoryError(null);
        return () => { historyRequest.current++; };
    }, [user.id]);
    const anyModalOpen = showPlayMenu || showReplays || showLeaderboard || showFriends || showAccount || showTutorial || showAdModal || !!pendingAction || showLiveMatches;
    
    
    React.useEffect(() => {
        window.dispatchEvent(new CustomEvent('hide-settings', { detail: anyModalOpen }));
        return () => { window.dispatchEvent(new CustomEvent('hide-settings', { detail: false })); };
    }, [anyModalOpen]);

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
        const { data, error } = await supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).eq('id', user.id).maybeSingle();
        if (error) return;
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
                getUserStats(user.id).then(stats => { if (historyIdentity.current === user.id) setUserStats(stats); })
                    .catch(() => { if (historyIdentity.current === user.id) setUserStats(null); });
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
            void loadReplays();
        }
    }, [showReplays, user.id, isAuthenticated]);

    React.useEffect(() => {
        if (isSearching) {
            soundManager.playBGM(MATCHMAKING_MUSIC_URL);
        } else {
            soundManager.stopBGM();
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

    const loadReplays = async () => {
        const request = ++historyRequest.current;
        setLoadingReplays(true);
        try {
            const data = await getGameRecords(10, user.id);
            if (request !== historyRequest.current || historyIdentity.current !== user.id) return;
            setReplays(data); setRecentGames(data.slice(0, 3)); setHistoryError(null);
        } catch (error) {
            if (request !== historyRequest.current || historyIdentity.current !== user.id) return;
            setReplays([]); setRecentGames([]);
            setHistoryError(error instanceof HistoryError ? error.code : 'UNAVAILABLE');
        } finally {
            if (request === historyRequest.current) setLoadingReplays(false);
        }
    };

    useRealtimeRefresh(['profiles'], async () => {
        await Promise.all([
            refreshUserProfile(),
            showLeaderboard ? loadLeaderboard(leaderboardCategory) : Promise.resolve()
        ]);
    });
    // Private history cannot subscribe to the former public table. Refresh the
    // authenticated endpoint on focus/online/interval, without a WS subscription.
    useRealtimeRefresh([], async () => {
        await Promise.all([
            loadReplays(),
            showAccount ? import('../lib/gameRecordService').then(({ getUserStats }) => getUserStats(user.id))
                .then(stats => { if (historyIdentity.current === user.id) setUserStats(stats); })
                .catch(() => { if (historyIdentity.current === user.id) setUserStats(null); }) : Promise.resolve()
        ]);
    }, user.type === 'registered');

    const handleVsCpuClick = () => {
        setPendingAction({ type: 'cpu' });
    };

    
    

    const cancelSearch = React.useCallback(() => {
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }
        setIsSearching(false);
        }, []);

    const startRandomMatch = React.useCallback((mode: 'random' | 'ranked', tc: TimeControl) => {
        const tcSeconds = tc === '3m' ? 180 : tc === '10m' ? 600 : 10;
        onStartGlobalMatch?.(tcSeconds, mode);
    }, [onStartGlobalMatch]);

    const handleTimeControlConfirm = (tc: TimeControl) => {
        if (!pendingAction) return;
        const action = pendingAction;
        setPendingAction(null);

        if (action.type === 'cpu') {
            onSelect(tc, practiceLevel, practiceSide);
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
        <div className="lobby-studio w-full h-full flex flex-col bg-transparent text-[#E8E2D7] font-sans px-6 py-6 md:px-8 md:py-8 overflow-hidden relative">
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
                                setPendingAction({type:'host',roomId:Math.random().toString(36).substring(2,8).toUpperCase()});
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
                        {pendingAction.type === 'cpu' && (
                            <fieldset className="mb-6">
                                <legend className="text-sm text-[#E8E2D7] mb-3">{matchText(lang, 'CPUの強さ', 'CPU difficulty')}</legend>
                                <div className="flex gap-2">
                                    {CPU_LEVELS.map(level => (
                                        <button key={level} type="button" aria-pressed={practiceLevel === level}
                                            onClick={() => setPracticeLevel(level)}
                                            className={`flex-1 py-3 border transition-colors ${practiceLevel === level ? 'border-[#B39A62] bg-[#B39A62]/20 text-[#E8E2D7]' : 'border-[#A89C86]/40 text-[#A89C86]'}`}>
                                            {matchText(lang,cpuDifficulty(level).ja,cpuDifficulty(level).en)}
                                        </button>
                                    ))}
                                </div>
                            </fieldset>
                        )}
                        {pendingAction.type === 'cpu' && <fieldset className="mb-6">
                            <legend className="text-sm text-[#E8E2D7] mb-3">{({en:'Your side',ja:'あなたの手番',zh:'选择执棋方',ru:'Ваша сторона',fr:'Votre camp',de:'Deine Seite',es:'Tu bando',tr:'Tarafınız',pl:'Twoja strona',hi:'आपका पक्ष',pt:'Seu lado',ta:'உங்கள் தரப்பு'})[lang]}</legend>
                            <div className="flex gap-2">{(['white','black'] as const).map(side => <button key={side} type="button" aria-pressed={practiceSide === side} onClick={() => setPracticeSide(side)} className={`flex-1 py-3 border ${practiceSide === side ? 'border-[#B39A62] bg-[#B39A62]/20 text-[#E8E2D7]' : 'border-[#A89C86]/40 text-[#A89C86]'}`}>
                                {side === 'white' ? ({en:'White · First',ja:'白・先手',zh:'白棋・先手',ru:'Белые · Первый ход',fr:'Blancs · Premier',de:'Weiß · Zuerst',es:'Blancas · Primero',tr:'Beyaz · İlk',pl:'Białe · Pierwsze',hi:'सफ़ेद · पहले',pt:'Brancas · Primeiro',ta:'வெள்ளை · முதலில்'})[lang] : ({en:'Black · Second',ja:'黒・後手',zh:'黑棋・后手',ru:'Чёрные · Второй ход',fr:'Noirs · Second',de:'Schwarz · Danach',es:'Negras · Segundo',tr:'Siyah · İkinci',pl:'Czarne · Drugie',hi:'काले · दूसरे',pt:'Pretas · Segundo',ta:'கருப்பு · அடுத்து'})[lang]}
                            </button>)}</div>
                        </fieldset>}
                        <h3 className="text-xl tracking-[0.2em] text-[#E8E2D7] mb-2">{t.selectTimeLimit}</h3>
                        <p className="text-[#A89C86] text-xs tracking-widest mb-8">{t.timeLimit}</p>
                        <div className="flex flex-col gap-4">
                            {(['10s', '3m', '10m'] as TimeControl[]).map(tc => (
                                <button
                                    key={tc} data-time-control={tc}
                                    onClick={() => handleTimeControlConfirm(tc)}
                                    className="w-full py-4 bg-[#161513] border border-[#A89C86]/40 hover:border-[#B39A62] transition-colors text-[#E8E2D7] tracking-widest text-sm flex justify-between px-6 items-center group"
                                >
                                    <span className="group-hover:text-[#B39A62]">{tc === '10s' ? t.tc10s : tc === '3m' ? t.tc3m : t.tc10m}</span>
                                    
                                    {pendingAction.type === 'ranked' && userProfile && (
                                        <span className="text-xs text-[#B39A62] font-mono mx-auto">
                                            {(t as any).ratingLabel}: {Math.floor(tc === '10s' ? userProfile.rating_10s : tc === '3m' ? userProfile.rating_3m : userProfile.rating_10m)}
                                        </span>
                                    )}
                                    {pendingAction.type !== 'cpu' && <span className="text-[#A89C86] text-[10px] tracking-widest ml-auto group-hover:text-[#D4B872] transition-colors">
                                        {matchText(lang,'待機中のプレイヤー','Players waiting')}: {queueStats?.[tc === '10s' ? 10 : tc === '3m' ? 180 : 600] || 0}
                                    </span>}

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

            
            

            {showAccount&&showIconEditor&&canEditIcon&&<AccountIconEditor key={user.id} lang={lang} userId={user.id} currentUrl={displayAvatarUrl} clears={rewardClearCount(cosmetics)} onClose={()=>setShowIconEditor(false)} onSaved={acceptAvatar}/>}
            {showAccount && (
                <SettingsDialog label={t.account} onClose={()=>onCloseSettingsPanel?.()}>
                    <div className="bg-[#161513] border border-[#A89C86]/40 p-6 md:p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#A89C86]/20">
                            <h3 className="text-lg tracking-[0.2em] text-[#E8E2D7] font-serif">{(t as any).account}</h3>
                            <button aria-label={t.settings} onClick={onCloseSettingsPanel} className="text-[#A89C86] hover:text-[#E8E2D7] text-xl min-w-11 min-h-11">←</button>
                        </div>
                        
                        <div className="flex flex-col gap-6 text-left">
                            <div className="flex items-center gap-6">
                                <div className="flex flex-col items-center gap-3">
                                    <AccountAvatar name={userProfile?.name||user.name} url={displayAvatarUrl} frame={cosmetics.avatar} size={80}/>
                                    <button type="button" className="account-icon-change" disabled={!canEditIcon} onClick={()=>setShowIconEditor(true)}>{iconEditorText(lang,'change')}</button>
                                </div>
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
                                        <span className="text-[10px] text-[#A89C86] mb-1 tracking-widest">{t.tc10m}</span>
                                        <span className="font-mono text-[#B39A62] text-sm">{formatFriendRating(userProfile?.rating_10m)}</span>
                                    </div>
                                    <div className="flex flex-col items-center p-4 border-r border-[#A89C86]/20 flex-1">
                                        <span className="text-[10px] text-[#A89C86] mb-1 tracking-widest">{t.tc3m}</span>
                                        <span className="font-mono text-[#B39A62] text-sm">{formatFriendRating(userProfile?.rating_3m)}</span>
                                    </div>
                                    <div className="flex flex-col items-center p-4 flex-1">
                                        <span className="text-[10px] text-[#A89C86] mb-1 tracking-widest">{t.tc10s}</span>
                                        <span className="font-mono text-[#B39A62] text-sm">{formatFriendRating(userProfile?.rating_10s)}</span>
                                    </div>
                                </div>
                            </div>

                            <ProfileCosmetics lang={lang} name={userProfile?.name||user.name} url={displayAvatarUrl} frame={cosmetics.avatar} ratings={user.type==='registered'&&userProfile?.id===user.id?userProfile:undefined}/>

                            <button onClick={onBack} className="w-full mt-4 py-4 border border-[#A89C86]/40 hover:border-[#E8E2D7] text-[#A89C86] hover:text-[#E8E2D7] text-xs tracking-widest transition-colors">
                                {t.logout}
                            </button>
                        </div>
                    </div>
                </SettingsDialog>
            )}

            {showReplays && (
                <div className="fixed inset-0 bg-[#161513]/95 z-50 flex flex-col p-4 md:p-8 backdrop-blur-md">
                    <div className="w-full max-w-2xl mx-auto h-full flex flex-col">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#A89C86]/20 shrink-0">
                            <h3 className="text-xl tracking-[0.2em] text-[#E8E2D7] font-serif">{t.mine} · {t.watchReplays}</h3>
                            <button onClick={() => setShowReplays(false)} className="text-[#A89C86] hover:text-[#E8E2D7] text-2xl">✕</button>
                        </div>
                        
                        <p className="mb-6 text-sm text-[#A89C86]">{historyCopy.historyOnly}</p>

                        {historyError || user.type === 'guest' ? (
                            <div role="status" className="flex-grow flex flex-col items-center justify-center gap-4 text-[#A89C86] text-sm">
                                <p>{historyError === 'UNAVAILABLE' ? historyCopy.historyUnavailable : historyCopy.historyVerify}</p>
                                <button className="min-h-11 border border-[#B39A62] px-6 py-3 text-[#E8E2D7]" onClick={() => {
                                    if (historyError === 'UNAVAILABLE') void loadReplays();
                                    else if (user.type === 'guest' || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(user.id)) onBack();
                                    else setVerifyHistory(true);
                                }}>{historyError === 'UNAVAILABLE' ? historyCopy.historyRetry : t.login}</button>
                            </div>
                        ) : loadingReplays ? (
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

            {verifyHistory && <RankedLoginDialog lang={lang} userId={user.id} title={`${t.mine} · ${t.watchReplays}`}
                onCancel={() => setVerifyHistory(false)} onVerified={() => { setVerifyHistory(false); void loadReplays(); }} />}

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
                <FriendsMenu user={user} lang={lang} onlineUsers={onlineUsers} onClose={()=>onCloseSettingsPanel?.()}/>
            )}

            {showLiveMatches && (
                <div className="fixed inset-0 z-50 bg-[#161513]">
                    <LiveMatchesMenu lang={lang} onClose={() => setShowLiveMatches(false)} onSpectate={(roomId) => {
                        onOnlineMatch?.(roomId, 'spectator', 'private', '10m');
                        setShowLiveMatches(false);
                    }} />
                </div>
            )}

            {/* --- HOME SCREEN MAIN UI --- */}
            
            <div className="lobby-heading flex justify-between items-center w-full max-w-lg mx-auto shrink-0 z-10 pt-4">
                <span className="text-xl md:text-2xl tracking-[0.2em] font-serif text-[#E8E2D7]">Q-GAMBIT</span>
                <div className="flex items-center gap-4">
                    {queueStats && queueStats[-1] !== undefined && (
                        <div className="flex items-center gap-1.5 opacity-80" title={matchText(lang,'オンライン','Online')}>
                            <span className="w-1.5 h-1.5 rounded-full bg-[#A89C86] animate-pulse"></span>
                            <span className="text-[10px] tracking-widest text-[#A89C86] font-mono">{queueStats[-1]} {matchText(lang,'オンライン','Online')}</span>
                        </div>
                    )}
                    <span className="font-mono text-[#B39A62] text-sm">{userProfile?.rating_10m ? Math.floor(userProfile.rating_10m) : '---'}</span>
                </div>
            </div>

            <div className="lobby-content flex-grow flex flex-col justify-center w-full max-w-lg mx-auto z-10 gap-12 mt-8">
                
                <div className="lobby-play-panel flex flex-col gap-6 w-full">
                    {onCampaign && <button className="lobby-campaign-action" onClick={onCampaign}><span aria-hidden="true">{circuitAllowed?'♛':'♙'}</span><span>{campaignText(lang,'title')}{!circuitAllowed&&<small style={{display:'block',fontSize:11,letterSpacing:0}}>{circuitAccessText(lang,'action')}</small>}</span><ArrowUpRight size={20}/></button>}
                    <div className="flex flex-col items-center w-full">
                        <h2 className="text-[10px] tracking-[0.3em] text-[#A89C86] uppercase mb-4">{(t as any).yourNextGame}</h2>
                        <button onClick={() => setShowPlayMenu(true)} className="lobby-play-action w-full group relative">
                            <span>{(t as any).play}</span><ArrowUpRight size={28} aria-hidden="true"/>
                        </button>
                    </div>

                    
                    <div className="lobby-shortcuts flex gap-2">
                        <button onClick={handleVsCpuClick} className="flex-1 py-4 bg-transparent border border-[#A89C86]/20 hover:bg-[#24211D] text-xs tracking-[0.2em] transition-colors text-[#A89C86] hover:text-[#E8E2D7] uppercase">
                            {(t as any).practice}
                        </button>
                        <button onClick={() => setShowTutorial(true)} className="flex-1 py-4 bg-[#B39A62]/10 border border-[#B39A62]/30 hover:bg-[#B39A62]/30 text-xs tracking-[0.2em] transition-colors text-[#D4B872] hover:text-[#E8E2D7] uppercase font-bold">
                            {(t as any).rulesButton || "HOW TO PLAY"}
                        </button>
                    </div>

                </div>

                <div className="lobby-recent flex flex-col w-full">
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

            <div className="lobby-navigation shrink-0 w-full max-w-lg mx-auto flex flex-wrap justify-center sm:justify-between items-center border-t border-[#A89C86]/20 pt-6 pb-2 text-[10px] tracking-[0.2em] text-[#A89C86] gap-y-4 z-10">
                <div className="flex gap-6 justify-center w-full sm:w-auto">
                    <button onClick={() => setShowReplays(true)} className="hover:text-[#E8E2D7] transition-colors uppercase">{t.gameReplays}</button>
                    <button onClick={() => { setShowLeaderboard(true); loadLeaderboard(); }} className="hover:text-[#E8E2D7] transition-colors uppercase">{t.globalRankings}</button>
                </div>
            </div>
        </div>
    );
}
