'use client';
import {useAndroidBackHandler} from '../hooks/useAndroidBack';

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
import { AccountProfileError, renameOwnProfile } from '../lib/accountProfile';
import { accountProfileText } from '../locales/accountProfileText';
import { SettingsDialog } from './SettingsDialog';
import { formatFriendRating } from '../lib/friendDirectory';
import { LiveMatchesMenu } from './LiveMatchesMenu';
import { CPU_LEVELS, cpuDifficulty, type CPULevel } from '../config/cpuDifficulty';
import { QubeTeacher } from './QubeTeacher';
import { LatestMatchHintRecovery } from './CrownHintRecovery';
import { hintScopeText } from '../locales/hintScopeText';
import {learningText} from '../locales/learningText';
import { ArrowUpRight, Swords, Dices, UsersRound, LogIn, Crown, Settings2, House, History, Trophy, Gift } from 'lucide-react';
import { LobbyShowcase } from './LobbyShowcase';
import { LobbyBrandMark, LobbyChessArtwork } from './LobbyChessArtwork';
import type { VisualReward } from './RewardPreview';
import './lobby-studio.css';
import './lobby-reference.css';
import {LobbyTicketSummary} from './LobbyTicketSummary';
import {NaturalText} from './NaturalText';
import { campaignText } from '../locales/campaignText';
import { useCircuitAccess } from '../hooks/useCircuitAccess';
import { circuitAccessText } from '../locales/circuitAccessText';
import { AccountDeletionPanel } from './AccountDeletionPanel';
import { AccountSecurityPanel } from './AccountSecurityPanel';
import { AccountRecoveryPanel } from './AccountRecoveryPanel';
import { rewardsHubEnabled } from '../config/rewardsHub';
import { rewardsHubText } from '../locales/rewardsHubText';
import './rewards-hub.css';
import './weekly-problems.css';

const ProfileCosmetics=dynamic(()=>import('./ProfileCosmetics').then(module=>module.ProfileCosmetics),{ssr:false});
const RewardsDialog=dynamic(()=>import('./RewardsDialog').then(module=>module.RewardsDialog),{ssr:false});
const WeeklyProblems=dynamic(()=>import('./WeeklyProblems').then(module=>module.WeeklyProblems),{ssr:false});
const InteractiveTutorial=dynamic(()=>import('./InteractiveTutorial').then(module=>module.InteractiveTutorial),{ssr:false});
const RewardPreview=dynamic(()=>import('./RewardPreview').then(module=>module.RewardPreview),{ssr:false});

interface LevelSelectProps {
    settingsPanel?:'friends'|'account'|'rewards'|null;
    onOpenRewards?:()=>void;
    onCloseSettingsPanel?:()=>void;
    lang: Language;
    user: User;
    onSelect: (tc: TimeControl, level: CPULevel, side: 'white' | 'black') => void;
    onOnlineMatch?: (roomId: string, role: 'white' | 'black' | 'spectator', matchMode: 'random' | 'private' | 'ranked', tc: TimeControl, opponentId?: string) => void;
    onStartGlobalMatch?: (tcSeconds: number, mode: 'ranked' | 'random') => void;
    onReplay?: (record: GameRecord) => void;
    onBack: () => void;
    onCampaign?:()=>void;
    onProfileUpdated?:(profile:{id:string;avatar_url?:string;name?:string})=>void;
}

export function LevelSelect({ lang, user, onSelect, onOnlineMatch, onStartGlobalMatch, onReplay, onBack, onCampaign,settingsPanel,onCloseSettingsPanel,onProfileUpdated,onOpenRewards }: LevelSelectProps) {
    const t = { ...dict['en'], ...(dict[lang] || {}) } as any;
    const historyCopy = replayText(lang);
    const {progress:cosmetics}=useCampaignProgress();
    const {allowed:circuitAllowed}=useCircuitAccess(user);
    const library=React.useRef<HTMLDetailsElement>(null);
    const [practiceLevel, setPracticeLevel] = React.useState<CPULevel>(3);
    const [practiceSide, setPracticeSide] = React.useState<'white' | 'black'>('white');
    const [showAdModal, setShowAdModal] = React.useState(false);
    const [showWeekly,setShowWeekly]=React.useState(false);
    const [adProgress, setAdProgress] = React.useState(0);
    const [showOnlineMenu, setShowOnlineMenu] = React.useState(false);
    const [joinRoomId, setJoinRoomId] = React.useState('');
    const [isSearching, setIsSearching] = React.useState(false);
    const [matchFound, setMatchFound] = React.useState(false);

    const { isAuthenticated } = useSocket();
    const [showReplays, setShowReplays] = React.useState(false);
    const [replays, setReplays] = React.useState<GameRecord[]>([]);
    const [loadingReplays, setLoadingReplays] = React.useState(false);
    const [historyError, setHistoryError] = React.useState<'AUTH_REQUIRED' | 'UNAVAILABLE' | null>(null);
    const [verifyHistory, setVerifyHistory] = React.useState(false);
    const historyIdentity = React.useRef<string | null>(user.id);
    React.useLayoutEffect(() => {
        historyIdentity.current = user.id;
        return () => { historyIdentity.current = null; };
    }, [user.id]);
    const historyRequest = React.useRef(0);
    const [showLeaderboard, setShowLeaderboard] = React.useState(false);
    const [leaderboard, setLeaderboard] = React.useState<Profile[]>([]);
    const [loadingLeaderboard, setLoadingLeaderboard] = React.useState(false);
    const [leaderboardCategory, setLeaderboardCategory] = React.useState<TimeControl>('10m');
    const [pendingAction, setPendingAction] = React.useState<{ type: 'cpu' | 'ranked' | 'random' | 'host' | 'join'; roomId?: string } | null>(null);
    const [userProfile, setUserProfile] = React.useState<Profile | null>(null);
    const [userStats, setUserStats] = React.useState<UserStats | null>(null);
    const showAccount=settingsPanel==='account';
    const rewardsAvailable=user.type==='registered' && rewardsHubEnabled();
    const showRewards=settingsPanel==='rewards' && rewardsAvailable;
    const rewardCopy=rewardsHubText(lang);
    const [isEditingName, setIsEditingName] = React.useState(false);
    const [newName, setNewName] = React.useState('');
    const [nameLoading, setNameLoading] = React.useState(false);
    const [nameError, setNameError] = React.useState<string|null>(null);
    const nameRequest = React.useRef(false);
    React.useEffect(()=>{setNameError(null);setIsEditingName(false);},[user.id]);
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
        if (nameRequest.current) return;
        if (!newName.trim() || newName.trim().length > 15) {
            setNameError(accountProfileText(lang,'name'));
            return;
        }
        nameRequest.current = true;
        setNameError(null);
        setNameLoading(true);
        try {
            const profile = await renameOwnProfile(user.id, newName.trim());
            if (historyIdentity.current !== user.id) return;
            setUserProfile(profile);
            onProfileUpdated?.({id:user.id,name:profile.name});
            setIsEditingName(false);
        } catch (e) {
            if (historyIdentity.current === user.id) setNameError(accountProfileText(lang,e instanceof AccountProfileError&&e.code==='AUTH_REQUIRED'?'auth':e instanceof AccountProfileError&&e.code==='INVALID_REQUEST'?'name':'failed'));
        } finally {
            nameRequest.current = false;
            setNameLoading(false);
        }
    };

    const showFriends=settingsPanel==='friends';
    const [showTutorial, setShowTutorial] = React.useState(false);
    const [showLiveMatches, setShowLiveMatches] = React.useState(false);
    const [showPlayMenu, setShowPlayMenu] = React.useState(false);
    const [lobbyPreview, setLobbyPreview] = React.useState<VisualReward | null>(null);
    const [recentGames, setRecentGames] = React.useState<GameRecord[]>([]);
    React.useEffect(() => {
        historyRequest.current++;
        setRecentGames([]); setReplays([]); setUserStats(null); setHistoryError(null);
        return () => { historyRequest.current++; };
    }, [user.id]);
    useAndroidBackHandler(()=>{
        if(showIconEditor)setShowIconEditor(false);
        else if(verifyHistory)setVerifyHistory(false);
        else if(lobbyPreview)setLobbyPreview(null);
        else if(showTutorial)setShowTutorial(false);
        else if(showWeekly)setShowWeekly(false);
        else if(pendingAction)setPendingAction(null);
        else if(showPlayMenu)setShowPlayMenu(false);
        else if(showLiveMatches)setShowLiveMatches(false);
        else if(showReplays)setShowReplays(false);
        else if(showLeaderboard)setShowLeaderboard(false);
        else if(showFriends||showAccount||showRewards)onCloseSettingsPanel?.();
        else if(showOnlineMenu)setShowOnlineMenu(false);
        else return showAdModal; // The provider owns dismissal of an active ad.
        return true;
    },10);
    const anyModalOpen = showPlayMenu || showReplays || showLeaderboard || showFriends || showAccount || showRewards || showTutorial || showWeekly || showAdModal || !!pendingAction || showLiveMatches || !!lobbyPreview;


    React.useEffect(() => {
        window.dispatchEvent(new CustomEvent('hide-settings', { detail: anyModalOpen }));
        return () => { window.dispatchEvent(new CustomEvent('hide-settings', { detail: false })); };
    }, [anyModalOpen]);

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
        if (error || historyIdentity.current !== user.id) return;
        if (data) {
            setUserProfile(data as Profile);
        } else {
            const { ensureProfile } = await import('../lib/gameRecordService');
            const p = await ensureProfile(user.id, user.name);
            if (p && historyIdentity.current === user.id) setUserProfile(p);
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
            setReplays(data); setRecentGames(data); setHistoryError(null);
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
    }, user.type === 'registered' || showLeaderboard);
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
        <div className="lobby-studio lobby-reference w-full h-full flex flex-col bg-transparent text-[#E8E2D7] font-sans px-6 py-6 md:px-8 md:py-8 overflow-hidden relative">
            {lobbyPreview && <RewardPreview lang={lang} reward={lobbyPreview} progress={cosmetics} onClose={() => setLobbyPreview(null)}/>}
            {showTutorial && <InteractiveTutorial key={user.id} lang={lang} userId={user.type==='registered'?user.id:undefined} onClose={() => setShowTutorial(false)} />}
            {showWeekly&&<WeeklyProblems key={user.id} lang={lang} userId={user.type==='registered'?user.id:undefined} onClose={()=>setShowWeekly(false)}/>}


            {/* Play Menu Modal */}
            {showPlayMenu && (
                <SettingsDialog label={t.chooseGame} onClose={()=>setShowPlayMenu(false)}>
                    <div className="lobby-dialog-card w-full max-w-md mx-auto bg-[#161513] border border-[#A89C86]/40 p-6 flex flex-col shadow-2xl">
                        <div className="flex justify-between items-center border-b border-[#A89C86]/20 pb-4 mb-4 shrink-0">
                            <span className="text-sm tracking-[0.2em] text-[#E8E2D7] font-serif uppercase">{(t as any).chooseGame}</span>
                            <button aria-label={t.cancel} onClick={() => setShowPlayMenu(false)} className="lobby-dialog-close text-[#A89C86] hover:text-[#E8E2D7] text-xl transition-colors">✕</button>
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
                                setPendingAction({type:'join'});
                                setJoinRoomId('');
                                setShowPlayMenu(false);
                            }} className="w-full text-left py-6 hover:bg-[#24211D] group transition-colors flex flex-col gap-2 px-4">
                                <span className="text-lg tracking-[0.15em] text-[#E8E2D7] group-hover:text-[#B39A62]">{(t as any).joinRoom}</span>
                                <span className="text-[10px] tracking-widest text-[#A89C86] leading-relaxed">{(t as any).joinRoomDesc}</span>
                            </button>
                        </div>
                    </div>
                </SettingsDialog>
            )}

            {/* Existing Overlays (Time Control, Account, Replays, Leaderboard, Friends, Live, Ad) */}
            {pendingAction?.type==='join' && <SettingsDialog label={t.joinRoom} onClose={()=>setPendingAction(null)}>
                <form className="lobby-dialog-card lobby-room-form" onSubmit={event=>{
                    event.preventDefault();
                    const room=joinRoomId.trim().toUpperCase();
                    if(!room)return;
                    setPendingAction(null);
                    onOnlineMatch?.(room,'black','private','10m');
                }}>
                    <header><h3>{t.joinRoom}</h3><button type="button" className="lobby-dialog-close" aria-label={t.cancel} onClick={()=>setPendingAction(null)}>✕</button></header>
                    <label htmlFor="lobby-room-code">{t.enterRoomId}</label>
                    <input id="lobby-room-code" value={joinRoomId} onChange={event=>setJoinRoomId(event.target.value)} required maxLength={128} autoComplete="off" autoCapitalize="characters" spellCheck={false}/>
                    <button className="lobby-room-submit" type="submit" disabled={!joinRoomId.trim()}>{t.joinRoom}<ArrowUpRight size={18} aria-hidden="true"/></button>
                    <button type="button" onClick={()=>setPendingAction(null)}>{t.cancel}</button>
                </form>
            </SettingsDialog>}
            {pendingAction && pendingAction.type!=='join' && (
                <SettingsDialog label={t.selectTimeLimit} onClose={()=>setPendingAction(null)}>
                    <div className="lobby-dialog-card bg-[#161513] border border-[#A89C86]/40 p-6 w-full text-center shadow-2xl">
                        <div className="lobby-dialog-heading"><span>{pendingAction.type==='cpu'?t.practice:t.chooseGame}</span><button type="button" aria-label={t.cancel} className="lobby-dialog-close" onClick={()=>setPendingAction(null)}>✕</button></div>
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
                        <QubeTeacher lang={lang} variant="compact"><p className="text-[#A89C86] text-xs tracking-widest mb-8">{t.timeLimit}</p>{pendingAction.type==='cpu'&&<p>{hintScopeText(lang)}</p>}</QubeTeacher>
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

                                    <span className="text-xs text-[#A89C86]">→</span>
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setPendingAction(null)} className="lobby-dialog-cancel mt-4 text-xs text-[#A89C86] hover:text-[#E8E2D7] tracking-widest">
                            {t.cancel}
                        </button>
                    </div>
                </SettingsDialog>
            )}




            {showAccount&&showIconEditor&&canEditIcon&&<AccountIconEditor key={user.id} lang={lang} userId={user.id} currentUrl={displayAvatarUrl} clears={rewardClearCount(cosmetics)} onClose={()=>setShowIconEditor(false)} onSaved={acceptAvatar}/>}
            {showRewards && <RewardsDialog key={user.id} user={user} lang={lang} onClose={()=>onCloseSettingsPanel?.()}/>}
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
                                                maxLength={15}
                                                aria-label={t.enterName}
                                                disabled={nameLoading}
                                                value={newName}
                                                onChange={e => setNewName(e.target.value)}
                                                className="bg-[#24211D] border border-[#A89C86]/50 p-1 text-sm text-[#E8E2D7] w-32 outline-none focus:border-[#B39A62]"
                                            />
                                        ) : (
                                            <span className="text-xl font-serif tracking-wider">{userProfile?.name || user.name}</span>
                                        )}
                                        <button disabled={nameLoading||user.type!=='registered'} onClick={() => {
                                            if (isEditingName) { void handleUpdateName(); }
                                            else { setNameError(null);setIsEditingName(true); setNewName(userProfile?.name || user.name); }
                                        }} className="text-[10px] text-[#A89C86] hover:text-[#B39A62] ml-2 tracking-widest">
                                            {isEditingName ? (t as any).save : (t as any).edit}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-[#A89C86] font-mono mt-1">ID: {user.id}</p>
                                    {nameError&&<p role="alert" className="text-sm text-red-300 mt-2">{nameError}</p>}
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
                            {rewardsAvailable && <button type="button" onClick={onOpenRewards} className="reward-entry">
                                <span>{rewardCopy.title}<small>{rewardCopy.description}</small></span><span aria-hidden="true">→</span>
                            </button>}
                            {user.type==='registered'&&!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(user.id)&&<AccountRecoveryPanel key={`recovery-${user.id}`} userId={user.id} lang={lang}/>}

                            <button onClick={onBack} className="w-full mt-4 py-4 border border-[#A89C86]/40 hover:border-[#E8E2D7] text-[#A89C86] hover:text-[#E8E2D7] text-xs tracking-widest transition-colors">
                                {t.logout}
                            </button>
                            {user.type==='registered'&&<AccountSecurityPanel key={`security-${user.id}`} userId={user.id} lang={lang} onSignedOut={onBack}/>}
                            {user.type==='registered'&&<AccountDeletionPanel key={`deletion-${user.id}`} userId={user.id} lang={lang} onDeleted={onBack}/>}
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

                        <QubeTeacher lang={lang} variant="compact"><p className="mb-6 text-sm text-[#A89C86]">{historyCopy.historyOnly}</p></QubeTeacher>

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
                <FriendsMenu key={user.id} user={user} lang={lang} onlineUsers={onlineUsers} onClose={()=>onCloseSettingsPanel?.()}/>
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

            <div className="lobby-home-tools"><button type="button" onClick={()=>window.dispatchEvent(new Event('qg-open-settings'))}><Settings2 size={16} aria-hidden="true"/>{t.settings}</button></div>

            <div className="lobby-heading flex justify-between items-center w-full max-w-lg mx-auto shrink-0 z-10 pt-4">
                <div className="lobby-brand"><span className="lobby-brand-mark"><LobbyBrandMark/></span><span>Q-GAMBIT</span></div>
                <div className="flex items-center gap-4">
                    <div className="lobby-player-panel"><div className="lobby-rating" title={t.ratingLabel}><AccountAvatar name={user.name} url={displayAvatarUrl} frame={cosmetics.avatar} size={38} lang={lang}/><span><small>{userProfile?.id===user.id?userProfile.name:user.name}</small><strong><Crown size={18} aria-hidden="true"/>{userProfile?.id===user.id&&userProfile.rating_10m !== undefined ? Math.floor(userProfile.rating_10m) : '—'}</strong></span></div><LobbyTicketSummary user={user} lang={lang} allowed={circuitAllowed}/></div>
                </div>
            </div>

            <div className="lobby-content flex-grow flex flex-col justify-center w-full max-w-lg mx-auto z-10 gap-12 mt-8">

                <div className="lobby-play-panel flex flex-col gap-6 w-full">
                    <div className="flex flex-col items-center w-full">
                        <h2 className="text-[10px] tracking-[0.3em] text-[#A89C86] uppercase mb-4">{(t as any).yourNextGame}</h2>
                        <button onClick={() => setShowPlayMenu(true)} className="lobby-play-action w-full group relative">
                            <span>{(t as any).play}</span><span className="lobby-play-piece"><LobbyChessArtwork/></span><ArrowUpRight size={24} aria-hidden="true"/>
                        </button>
                    </div>



                    <div className="lobby-mode-grid">
                        <button type="button" onClick={() => user.type === 'guest' ? alert(t.needAccount) : setPendingAction({type:'ranked'})}><Swords aria-hidden="true"/><span><strong>{t.ranked}</strong><small>{t.rankedDesc}</small></span></button>
                        <button type="button" onClick={() => setPendingAction({type:'random'})}><Dices aria-hidden="true"/><span><strong>{t.randomMatch2}</strong><small>{t.randomMatchDesc}</small></span></button>
                        <button type="button" onClick={() => setPendingAction({type:'host',roomId:Math.random().toString(36).substring(2,8).toUpperCase()})}><UsersRound aria-hidden="true"/><span><strong>{t.friendMatch}</strong><small>{t.friendMatchDesc}</small></span></button>
                        <button type="button" onClick={() => {setJoinRoomId('');setPendingAction({type:'join'});}}><LogIn aria-hidden="true"/><span><strong>{t.joinRoom}</strong><small>{t.joinRoomDesc}</small></span></button>
                    </div>

                    <div className="lobby-shortcuts flex gap-2">
                        <button onClick={handleVsCpuClick} className="flex-1 py-4 bg-transparent border border-[#A89C86]/20 hover:bg-[#24211D] text-xs tracking-[0.2em] transition-colors text-[#A89C86] hover:text-[#E8E2D7] uppercase">
                            {lang==='ja'?'CPUで練習':`${(t as any).practice} · CPU`}
                        </button>
                        <button data-open-tutorial onClick={() => setShowTutorial(true)} className="flex-1 py-4 bg-[#B39A62]/10 border border-[#B39A62]/30 hover:bg-[#B39A62]/30 text-xs tracking-[0.2em] transition-colors text-[#D4B872] hover:text-[#E8E2D7] uppercase font-bold">
                            {learningText(lang).title}
                        </button>
                    </div>

                    <button type="button" data-open-weekly className="lobby-weekly-action" aria-haspopup="dialog" onClick={()=>setShowWeekly(true)}>
                        <Trophy size={24} aria-hidden="true"/><span><strong>{learningText(lang).weekly}</strong><small>{learningText(lang).weeklyDescription}</small></span><ArrowUpRight size={20} aria-hidden="true"/>
                    </button>
                    {onCampaign && <button type="button" className="lobby-campaign-action" onClick={onCampaign}>
                        <Crown size={24} aria-hidden="true"/><span>{campaignText(lang, 'title')}<small>{!circuitAllowed && circuitAccessText(lang, 'action')}</small></span><ArrowUpRight size={20} aria-hidden="true"/>
                    </button>}
                    <div className="lobby-hint-recovery">{user.type==='registered'&&<LatestMatchHintRecovery key={user.id} userId={user.id} lang={lang}/>}</div>
                </div>

                <div className="lobby-recent flex flex-col w-full">
                    <div className="border-b border-[#A89C86]/20 pb-2 mb-2 flex justify-between items-end">
                        <span className="text-[10px] tracking-[0.2em] text-[#A89C86] uppercase">{(t as any).recentGames}</span>
                    </div>
                    {historyError ? <div className="lobby-history-status" role="status">
                        <p>{historyError === 'AUTH_REQUIRED' ? historyCopy.historyVerify : historyCopy.historyUnavailable}</p>
                        <button type="button" onClick={() => historyError === 'AUTH_REQUIRED' ? setVerifyHistory(true) : void loadReplays()}>{historyCopy.historyRetry}</button>
                    </div> : recentGames.length === 0 ? (
                        <div className="py-2 text-[10px] text-[#A89C86]/50 tracking-widest">{(t as any).noRecentGames}</div>
                    ) : (
                        <div className="lobby-recent-list game-scroll">
                            {recentGames.map(r => {
                                const isWhite = r.white_id === user.id;
                                const opponent = isWhite ? r.black_player : r.white_player;
                                const iWon = (isWhite && r.winner === 'white_wins') || (!isWhite && r.winner === 'black_wins');
                                const isDraw = r.winner === 'draw';
                                return (
                                    <button type="button" key={r.id} className="lobby-recent-row" onClick={() => onReplay?.(r)} disabled={!onReplay}>
                                        <span className="lobby-opponent-icon" aria-hidden="true">{r.mode === 'cpu' || r.mode === 'ranked_cpu' ? '♟' : '♙'}</span>
                                        <span className="lobby-opponent-name">{opponent}<small>{r.time_control}</small></span>
                                        <span className={`lobby-result ${iWon ? 'won' : isDraw ? 'draw' : 'lost'}`}>
                                            {iWon ? (t as any).win : isDraw ? (t as any).draw : (t as any).loss}
                                        </span>
                                        <ArrowUpRight size={18} aria-hidden="true"/>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <details ref={library} className="lobby-library"><summary><Gift size={17} aria-hidden="true"/>{campaignText(lang,'rewards')}<ArrowUpRight size={16} aria-hidden="true"/></summary><LobbyShowcase user={user} lang={lang} progress={cosmetics} onPreview={setLobbyPreview}
                onRewards={rewardsAvailable ? onOpenRewards : undefined}
                onSettings={() => window.dispatchEvent(new Event('qg-open-settings'))}/></details>

            <nav className="lobby-navigation lobby-bottom-navigation" aria-label={lang==='ja'?'ホームのメニュー':'Home navigation'}>
                <button type="button" aria-current="page" onClick={()=>{if(library.current)library.current.open=false;document.querySelector('.lobby-studio')?.scrollTo({top:0});}}><House aria-hidden="true"/><span><NaturalText text={t.home} lang={lang}/></span></button>
                <button type="button" aria-label={t.gameReplays} onClick={()=>setShowReplays(true)}><History aria-hidden="true"/><span><NaturalText text={t.replay} lang={lang}/></span></button>
                <button type="button" onClick={()=>{setShowLeaderboard(true);loadLeaderboard();}}><Trophy aria-hidden="true"/><span><NaturalText text={t.globalRankings} lang={lang}/></span></button>
                <button type="button" onClick={()=>{if(rewardsAvailable&&onOpenRewards)onOpenRewards();else if(library.current){library.current.open=true;library.current.scrollIntoView({block:'start'});}}}><Gift aria-hidden="true"/><span><NaturalText text={campaignText(lang,'rewards')} lang={lang}/></span></button>
            </nav>
        </div>
    );
}
