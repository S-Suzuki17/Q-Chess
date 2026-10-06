'use client';
import { SocketProvider } from '../lib/SocketContext';
import { matchText } from '../locales/matchText';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import GameBoard from '../components/GameBoard';
import {NativeRewardSettings} from '../components/NativeRewardSettings';
import {FoundersSettings} from '../components/FoundersSettings';
import {useFoundersRewards} from '../hooks/useFoundersRewards';
import {foundersText} from '../locales/foundersText';
import { SiteIntroduction, SiteLinks } from '../components/SiteInformation';
import { AppSupportLinks } from '../components/AppSupportLinks';
import { useAppPlatform } from '../hooks/useAppPlatform';
import { useNativeAuthLinks } from '../hooks/useNativeAuthLinks';
import { SystemStatusBanner } from '../components/SystemStatusBanner';
import { supabase, oauthCallbackAtStartup } from '../lib/supabaseClient';
import { TitleScreen } from '../components/TitleScreen';
import { LevelSelect } from '../components/LevelSelect';
import { SettingsDialog } from '../components/SettingsDialog';
import { CampaignMode } from '../components/CampaignMode';
import { DevDiaryTimeline } from '../components/DevDiaryTimeline';
import { OptionalMetricsSettings } from '../components/OptionalMetricsSettings';
import { recordVisit } from '../lib/engagementMetrics';
import { circuitAccess, isSameCircuitIdentity } from '../lib/circuitAccess';
import type { Session } from '@supabase/supabase-js';
import ReplayBoard from '../components/ReplayBoard';
import { Language, LANGUAGES, dict } from '../locales/dict';
import { User, GameState, TimeControl } from '../types/game';
import { GameRecord } from '../lib/gameRecordService';

import { RankedMatchmakingManager } from '../components/RankedMatchmakingManager';
import { clearRankedSession, readRankedSessionCandidate, RANKED_SESSION_STORAGE_KEY } from '../lib/rankedSession';
import { restoredLegacyUser, restoredOnlineMatch } from '../lib/legacySessionRestoration';
import { useLegacySessionRestoration } from '../hooks/useLegacySessionRestoration';
import { clearOAuthLoginIntent, hasOAuthLoginIntent, completedOAuthCallback } from '../lib/oauthLoginIntent';


import { useCampaignProgress } from '../hooks/useCampaignProgress';
import {TermsGate} from '../components/TermsGate';
import {DailyLoginClaimController} from '../components/DailyLoginClaimController';
import {DAILY_LOGIN_REWARDS_ENABLED} from '../lib/dailyLoginRewards';
import { rewardsHubEnabled } from '../config/rewardsHub';
import { rewardsHubText } from '../locales/rewardsHubText';
import { MemberTicketClaimController } from '../components/MemberTicketsPanel';
import { MEMBER_TICKET_USAGE_ENABLED } from '../lib/stripeMembership';
import { battleMusicUrl } from '../config/circuitMusic';
import { soundManager } from '../lib/SoundService';
import { CosmeticsSettings } from '../components/CosmeticsSettings';
import {CampaignCloudPanel} from '../components/CampaignCloudPanel';
import {useCampaignCloud} from '../hooks/useCampaignCloud';
import { cosmeticsLocked } from '../lib/cosmeticOptions';

export default function Home() {
    const { android, webContent } = useAppPlatform();
    useEffect(() => { if (webContent) recordVisit(); }, [webContent]);
    const nativeAuth = useNativeAuthLinks();
    const {progress:campaignProgress, update:updateCampaign, loaded:cosmeticsLoaded}=useCampaignProgress();
    const playingMusic=React.useRef<string|null>(null);
    useEffect(()=>{
        const resume=()=>soundManager.resumeBGM();
        window.addEventListener('pointerdown',resume);
        window.addEventListener('keydown',resume);
        document.addEventListener('visibilitychange',resume);
        return ()=>{
            window.removeEventListener('pointerdown',resume);
            window.removeEventListener('keydown',resume);
            document.removeEventListener('visibilitychange',resume);
        };
    },[]);
    const [lang, setLang] = useState<Language>('en');
    const [gameState, setGameState] = useState<GameState>('title');
    const [circuitPlaying, setCircuitPlaying] = useState(false);
    const matchDesignLocked = cosmeticsLocked(gameState, circuitPlaying);
    const [user, setUser] = useState<User | null>(null);
    const foundersRewards=useFoundersRewards(user,matchDesignLocked);
    // A fresh login must recheck consent even when it is the same account.
    const termsIdentity=`${user?.type??'none'}:${user?.id??''}:${circuitAccess.getSnapshot().revision}`;
    const [termsReadyIdentity,setTermsReadyIdentity]=useState<string|null>(null);
    const cloud=useCampaignCloud(!!user&&termsReadyIdentity===termsIdentity);
    const [loginMode,setLoginMode]=useState<'select'|'login'>('select');
    const circuitLoginRequested=React.useRef(false);
    const [cpuLevel, setCpuLevel] = useState<number>(5);
    const [practiceSide, setPracticeSide] = useState<'white' | 'black'>('white');
    const [timeControl, setTimeControl] = useState<TimeControl>('10m');
    const [hideSettingsGlobal, setHideSettingsGlobal] = useState(false);
    useEffect(() => {
        const handleHide = (e: any) => setHideSettingsGlobal(e.detail);
        window.addEventListener('hide-settings', handleHide);
        return () => window.removeEventListener('hide-settings', handleHide);
    }, []);

    const [onlineInfo, setOnlineInfo] = useState<{ roomId: string, role: 'white' | 'black' | 'spectator', matchMode: 'random' | 'private' | 'ranked', opponentId?: string } | null>(null);
    const [replayRecord, setReplayRecord] = useState<GameRecord | null>(null);
    const [soundConfig, setSoundConfig] = useState(() => soundManager.getConfig());
    const [showSettings, setShowSettings] = useState(false);
    const [settingsPanel,setSettingsPanel]=useState<'friends'|'account'|'rewards'|null>(null);
    const rewardsOrigin=React.useRef<'settings'|'account'|'lobby'>('lobby');
    const openRewards = (fromSettings: boolean) => {
        rewardsOrigin.current=fromSettings?'settings':settingsPanel==='account'?'account':'lobby';
        setShowSettings(false); setSettingsPanel('rewards');
    };
    useEffect(() => {
        const openSettings = () => setShowSettings(true);
        window.addEventListener('qg-open-settings', openSettings);
        return () => window.removeEventListener('qg-open-settings', openSettings);
    }, []);
    const [isSearchingGlobally, setIsSearchingGlobally] = useState(false);
    const [timeControlTarget, setTimeControlTarget] = useState(600);
    const [queueMode, setQueueMode] = useState<'ranked' | 'random'>('random');


    const authOwner = React.useRef<'legacy'|'oauth'|'guest'|null>(null);
    const oauthIntent = React.useRef<number|null>(null);
    const [oauthCallbackExpected] = useState(hasOAuthLoginIntent);
    const showRestoredUser = (u: User) => {
        let match: ReturnType<typeof restoredOnlineMatch>=null;
        try { match=restoredOnlineMatch(u.id,JSON.parse(localStorage.getItem('qg_last_user')||'null'),JSON.parse(localStorage.getItem('qg_active_online_match')||'null')); }
        catch { /* Display/match cache is optional. */ }
        setUser(u);
        try { localStorage.setItem('qg_last_user',JSON.stringify(u)); } catch { /* Verified identity remains in memory. */ }
        if(match&&!circuitLoginRequested.current){
            setOnlineInfo(match);setTimeControl(match.tc);
            setGameState(current=>current==='title'||current==='level_select'?'playing':current);
        } else setGameState(current=>current==='title'?(circuitLoginRequested.current?'campaign':'level_select'):current);
        circuitLoginRequested.current=false;
    };
    const legacyRestore = useLegacySessionRestoration(userId => {
        authOwner.current='legacy';clearOAuthLoginIntent();oauthIntent.current=null;
        let cached:unknown=null;
        try { cached=JSON.parse(localStorage.getItem('qg_last_user')||'null'); } catch { /* Appearance is optional. */ }
        showRestoredUser(restoredLegacyUser(userId,cached));
    }, !oauthCallbackExpected);
    const cancelOAuth = () => {
        clearOAuthLoginIntent();
        if(oauthIntent.current!==null&&circuitAccess.getSnapshot().revision===oauthIntent.current)circuitAccess.revoke();
        oauthIntent.current=null;
        if(authOwner.current==='oauth'&&!circuitAccess.getSnapshot().userId)authOwner.current=null;
    };
    useEffect(()=>{if(nativeAuth.failed)cancelOAuth();},[nativeAuth.failed]);

    useEffect(() => {
        let active=true;
        let restoring:number|null=null;
        const initialRevision=circuitAccess.getSnapshot().revision;
        const legacyAtStart=!!readRankedSessionCandidate();
        let callbackReady=!oauthCallbackExpected;
        if(oauthCallbackExpected)oauthIntent.current=initialRevision;
        const restoreSession=(session:Session)=>{
            const snapshot=circuitAccess.getSnapshot();
            const expected=oauthIntent.current??initialRevision;
            // A background event cannot replace legacy restoration, a newer
            // explicit login or a match. Explicit OAuth owns a separate revision.
            if((!callbackReady&&(oauthIntent.current===null||oauthIntent.current===initialRevision))||
                restoring===snapshot.revision||snapshot.userId===session.user.id||snapshot.revision!==expected||
                (oauthIntent.current===null&&(legacyAtStart||authOwner.current!==null)))return;
            const attempt=circuitAccess.beginAuthentication();
            authOwner.current='oauth';
            if(oauthIntent.current!==null)oauthIntent.current=attempt;
            restoring=attempt;
            const restore=async()=>{
                try {
                    const {data,error}=await supabase.auth.getUser();
                    const verified=data.user;
                    if(error||!verified||verified.is_anonymous||verified.id!==session.user.id)return;
                    let profile:{name?:string;avatar_url?:string}|null=null;
                    try { const result=await supabase.from('profiles').select('name, avatar_url').eq('id',verified.id).single();profile=result.data; } catch { /* Appearance is optional. */ }
                    const u:User={id:verified.id,name:profile?.name||verified.user_metadata?.full_name||verified.user_metadata?.name||'Player',avatar_url:profile?.avatar_url,type:'registered'};
                    if(!active||!circuitAccess.grant(u,attempt))return;
                    if(oauthIntent.current===attempt)clearRankedSession();
                    authOwner.current='oauth';clearOAuthLoginIntent();oauthIntent.current=null;showRestoredUser(u);
                } catch { /* A cached identity never grants access. */ }
                finally {
                    if(restoring===attempt)restoring=null;
                    if(active&&oauthIntent.current===attempt){clearOAuthLoginIntent();oauthIntent.current=null;}
                }
            };
            // Never await another Supabase call inside its auth-lock callback.
            setTimeout(()=>{if(active&&circuitAccess.getSnapshot().revision===attempt)void restore();else if(restoring===attempt)restoring=null;},0);
        };
        const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
            if(event==='SIGNED_IN'&&session)restoreSession(session);
            else if(event==='SIGNED_OUT'&&authOwner.current==='oauth'){
                circuitAccess.revoke();authOwner.current=null;clearOAuthLoginIntent();oauthIntent.current=null;
                setUser(null);setGameState('title');setLoginMode('select');
                try { localStorage.removeItem('qg_last_user'); } catch { /* Access is already revoked. */ }
            }
        });
        void (async()=>{
            if(oauthCallbackExpected){
                const result=await supabase.auth.initialize();
                if(!active||circuitAccess.getSnapshot().revision!==initialRevision)return;
                if(!completedOAuthCallback(oauthCallbackAtStartup,result.error)){
                    clearOAuthLoginIntent();oauthIntent.current=null;return;
                }
                callbackReady=true;
            }
            const {data:{session},error}=await supabase.auth.getSession();
            if(!active)return;
            if(!error&&session)restoreSession(session);
            else if(oauthCallbackExpected&&circuitAccess.getSnapshot().revision===initialRevision){clearOAuthLoginIntent();oauthIntent.current=null;}
        })().catch(()=>{
            if(active&&oauthCallbackExpected&&circuitAccess.getSnapshot().revision===initialRevision){clearOAuthLoginIntent();oauthIntent.current=null;}
        });
        const identityChanged=(event:StorageEvent)=>{
            if(event.key===null||event.key===RANKED_SESSION_STORAGE_KEY||
                (event.key==='qg_last_user'&&!isSameCircuitIdentity(event.oldValue,event.newValue))){
                circuitAccess.revoke();authOwner.current=null;clearOAuthLoginIntent();oauthIntent.current=null;
                setUser(null);setGameState('title');setLoginMode('select');
            }
        };
        window.addEventListener('storage',identityChanged);
        return()=>{active=false;subscription.unsubscribe();window.removeEventListener('storage',identityChanged);circuitAccess.revoke();};
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedLang = localStorage.getItem('qg_language') as Language;
            if (savedLang && LANGUAGES.some(l => l.code === savedLang)) {
                setLang(savedLang);
            } else {
                const browserLang = navigator.language.split('-')[0];
                if (LANGUAGES.some(language => language.code === browserLang)) {
                    setLang(browserLang as Language);
                }
            }
        }
    }, []);

    const handleLanguageChange = (newLang: Language) => {
        setLang(newLang);
        if (typeof window !== 'undefined') {
            localStorage.setItem('qg_language', newLang);
        }
    };

    useEffect(() => { document.documentElement.lang = lang; }, [lang]);

    useEffect(() => {
        const unsubscribe = soundManager.subscribe(setSoundConfig);
        return () => { unsubscribe(); };
    }, []);

    useEffect(() => {
        if (gameState !== 'playing') playingMusic.current=null;
        if (gameState === 'playing') {
            playingMusic.current ??= battleMusicUrl(campaignProgress.music);
            soundManager.playBGM(playingMusic.current);
        } else if (gameState!=='campaign' && gameState!=='level_select') {
            soundManager.stopBGM();
        }
    }, [gameState,campaignProgress.music]);

    useEffect(() => {
        // A registered cache is appearance only. A guest can resume local play.
        if(readRankedSessionCandidate()||oauthCallbackExpected)return;
        try {
            const cached=JSON.parse(localStorage.getItem('qg_last_user')||'null');
            if(cached?.type==='guest'&&typeof cached.id==='string'&&cached.id.startsWith('GUEST-')&&typeof cached.name==='string'){
                authOwner.current='guest';showRestoredUser(cached);
            }
        } catch { /* Unreadable cache is not authentication. */ }
    }, []);

    const handleLogin = (u: User,attempt?:number) => {
        if(u.type==='registered'){
            if(attempt===undefined||!circuitAccess.grant(u,attempt))return;
        } else circuitAccess.revoke();
        authOwner.current=u.type==='registered'?'legacy':'guest';clearOAuthLoginIntent();oauthIntent.current=null;
        setUser(u);
        try { localStorage.setItem('qg_last_user', JSON.stringify(u)); } catch { /* Keep verified login in memory. */ }
        setGameState(u.type==='registered'&&circuitLoginRequested.current?'campaign':'level_select');
        circuitLoginRequested.current=false;
    };

    const handleProfileUpdated = (profile:{id:string;avatar_url?:string;name?:string}) => {
        if(!user||user.id!==profile.id)return;
        const changes={...(profile.avatar_url!==undefined?{avatar_url:profile.avatar_url}:{}),...(profile.name!==undefined?{name:profile.name}:{})};
        const next={...user,...changes};
        setUser(current=>current?.id===profile.id?{...current,...changes}:current);
        try { localStorage.setItem('qg_last_user',JSON.stringify(next)); } catch { /* Keep the saved server profile in memory. */ }
    };

    const handleSelectLevel = (tc: TimeControl, level: number, side: 'white' | 'black') => {
        setPracticeSide(side);
        setCpuLevel(level);
        setTimeControl(tc);
        setOnlineInfo(null);
        if (typeof window !== 'undefined') {
            localStorage.removeItem('qg_active_online_match');
        }
        setGameState('playing');
    };

    const handleOnlineMatch = (roomId: string, role: 'white' | 'black' | 'spectator', matchMode: 'random' | 'private' | 'ranked', tc: TimeControl, opponentId?: string) => {
        setIsSearchingGlobally(false);
        setOnlineInfo({ roomId, role, matchMode, opponentId });
        setTimeControl(tc);
        if (typeof window !== 'undefined' && role !== 'spectator') {
            localStorage.setItem('qg_active_online_match', JSON.stringify({
                userId:user?.id,
                roomId,
                role,
                matchMode,
                tc,
                opponentId,
                timestamp: Date.now()
            }));
        }
        setGameState('playing');
    };

    const handleLogout = async () => {
        authOwner.current=null;clearOAuthLoginIntent();oauthIntent.current=null;
        clearRankedSession();
        circuitAccess.revoke();
        setUser(null);
        setSettingsPanel(null);setShowSettings(false);setLoginMode('select');
        circuitLoginRequested.current=false;
        try { localStorage.removeItem('qg_last_user'); } catch { /* Access is already revoked. */ }
        setGameState('title');
        await supabase.auth.signOut({scope:'local'});
    };

    const requestCircuitLogin=()=>{
        circuitAccess.revoke();authOwner.current=null;clearOAuthLoginIntent();oauthIntent.current=null;circuitLoginRequested.current=true;
        setUser(null);setSettingsPanel(null);setShowSettings(false);setLoginMode('login');setGameState('title');
        try { localStorage.removeItem('qg_last_user'); } catch { /* Do not delete campaign progress. */ }
    };


    return (
        <TermsGate key={termsIdentity} user={user} lang={lang} playing={matchDesignLocked} onExit={()=>void handleLogout()} onReady={()=>setTermsReadyIdentity(termsIdentity)}>
        <SocketProvider userId={user?.id}>
            {DAILY_LOGIN_REWARDS_ENABLED && <DailyLoginClaimController user={user} termsReady={termsReadyIdentity===termsIdentity}/>}
            {MEMBER_TICKET_USAGE_ENABLED && <MemberTicketClaimController user={user} termsReady={termsReadyIdentity===termsIdentity}/>}
            <SystemStatusBanner lang={lang} playing={gameState==='playing'||circuitPlaying} />
            {legacyRestore.hasCandidate&&(legacyRestore.state==='checking'||legacyRestore.state==='unavailable')&&
                <div role="status" className="fixed bottom-4 left-4 right-4 z-[100] rounded border border-[#D4B872] bg-[#1E1C19] p-4 text-[#E8E2D7]">
                    {legacyRestore.state==='checking'?matchText(lang,'ログイン状態を確認しています…','Checking your saved sign-in…'):matchText(lang,'ログイン状態を確認できません。保存したログインは保持されています。','Could not check your sign-in. Your saved login has been kept.')}
                    {legacyRestore.state==='unavailable'&&<button type="button" className="ml-4 p-2" onClick={legacyRestore.retry}>{matchText(lang,'再試行','Retry')}</button>}
                </div>}
            {nativeAuth.failed && <div role="alert" className="fixed bottom-4 left-4 right-4 z-[100] rounded border border-[#D4B872] bg-[#1E1C19] p-4 text-[#E8E2D7]">
                {matchText(lang,'ログインできませんでした。もう一度お試しください。','Sign-in failed. Please try again.')}
                <button type="button" onClick={nativeAuth.dismiss} className="ml-4 p-2" aria-label={matchText(lang,'閉じる','Close')}>×</button>
            </div>}
            {android&&foundersRewards.available&&!matchDesignLocked&&!showSettings&&!isSearchingGlobally&&
                <aside className="founders-notice" role="status"><strong>{foundersText(lang,'title')}</strong><button type="button" onClick={()=>setShowSettings(true)}>{foundersText(lang,'claim')}</button></aside>}
            {isSearchingGlobally&&<RankedMatchmakingManager lang={lang}
                user={user}
                mode={queueMode}
                onRequestLogin={()=>{setIsSearchingGlobally(false);setLoginMode('login');setGameState('title');}}
                cancelSearchGlobally={() => setIsSearchingGlobally(false)}
                timeControlTarget={timeControlTarget}
                onMatchFound={(room) => {
                    handleOnlineMatch(room.id, room.myColor, room.mode, (room.timeControl === 10 ? '10s' : room.timeControl === 180 ? '3m' : '10m') as TimeControl, room.myColor==='white'?room.joinerId:room.hostId);
                }}
            />}
        <main data-screen={gameState} className={`fixed inset-0 flex flex-col items-center justify-between bg-[#11100E] text-[#E8E2D7] font-sans overflow-x-hidden ${gameState === 'title' ? 'overflow-y-auto' : 'overflow-hidden'}`}>
            <div className="relative z-40 w-full max-w-5xl flex items-center justify-between text-sm mb-4 shrink-0">
                {/* 右上のコントロール群 */}
                <div className={`fixed right-4 top-4 z-40 flex gap-2 items-center ${showSettings || hideSettingsGlobal || gameState === 'playing' || gameState === 'campaign' ? 'hidden' : ''}`}>
                    <button
                        onClick={() => setShowSettings(true)}
                        className="px-3 py-2 bg-[#2A2621] border border-[#4A4238] text-[#D4B872] rounded hover:bg-[#3B342C] transition-colors font-sans font-bold tracking-widest flex items-center justify-center text-xs"
                    >
                        ⚙️ {dict[lang]?.settings || 'SETTINGS'}
                    </button>
                </div>
            </div>

            {showSettings && (
                <SettingsDialog label={dict[lang].settings} onClose={()=>setShowSettings(false)}>
                    <div className="bg-[#2A2621] border border-[#4A4238] rounded-xl p-8 w-full max-w-md shadow-2xl font-sans max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-2xl font-serif text-[#D4B872]">⚙️ {dict[lang]?.settings || 'SETTINGS'}</h2>
                            <button aria-label={matchText(lang,'閉じる','Close')} onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white text-xl min-w-11 min-h-11">✕</button>
                        </div>

                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col gap-2">
                                <label className="flex justify-between text-[#E8E5DF] font-bold">
                                    <span>{dict[lang]?.bgmVolume || 'BGM Volume'}</span>
                                    <span>{Math.round(soundConfig.bgmVolume * 100)}%</span>
                                </label>
                                <input
                                    type="range"
                                    min="0" max="1" step="0.05"
                                    value={soundConfig.bgmVolume}
                                    onChange={(e) => soundManager.updateConfig({ bgmVolume: parseFloat(e.target.value) })}
                                    className="w-full accent-[#D4B872]"
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="flex justify-between text-[#E8E5DF] font-bold">
                                    <span>{dict[lang]?.seVolume || 'SE Volume'}</span>
                                    <span>{Math.round(soundConfig.seVolume * 100)}%</span>
                                </label>
                                <input
                                    type="range"
                                    min="0" max="1" step="0.05"
                                    value={soundConfig.seVolume}
                                    onChange={(e) => {
                                        soundManager.updateConfig({ seVolume: parseFloat(e.target.value) });
                                        if (!soundConfig.masterMute) {
                                            const se = new Audio('/audio/move.mp3');
                                            se.volume = parseFloat(e.target.value);
                                            se.play().catch(()=>{});
                                        }
                                    }}
                                    className="w-full accent-[#D4B872]"
                                />
                            </div>

                            <div className="flex items-center gap-4 mt-2">
                                <span className="text-[#E8E5DF] font-bold flex-1">{dict[lang]?.masterMute || 'Sound ON/OFF'}</span>
                                <button
                                    onClick={() => soundManager.updateConfig({ masterMute: !soundConfig.masterMute })}
                                    className={`px-6 py-2 rounded font-bold tracking-widest transition-all ${soundConfig.masterMute ? 'bg-red-900/50 text-red-400 border border-red-500' : 'bg-[#3B342C] text-[#D4B872] border border-[#D4B872]'}`}
                                >
                                    {soundConfig.masterMute ? `🔇 ${dict[lang]?.muted || 'MUTED'}` : `🔊 ${dict[lang]?.on || 'ON'}`}
                                </button>
                            </div>

                            <div className="flex items-center gap-4 mt-4 pt-6 border-t border-[#4A4238]">
                                <span className="text-[#E8E5DF] font-bold flex-1">{dict[lang]?.language || 'Language'}</span>
                                <div className="relative font-sans w-1/2">
                                    <select
                                        aria-label={dict[lang].language}
                                        value={lang}
                                        onChange={(e) => handleLanguageChange(e.target.value as Language)}
                                        className="w-full px-3 py-2 bg-[#1E1C19] border border-[#4A4238] text-[#D4B872] rounded hover:bg-[#3B342C] transition-colors font-bold tracking-wider cursor-pointer text-xs focus:outline-none appearance-none pr-7 pl-2"
                                    >
                                        {LANGUAGES.map(l => (
                                            <option key={l.code} value={l.code} className="bg-[#2A2621] text-[#D4B872]">
                                                {l.flag} {l.label}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[#D4B872] text-xs">
                                        ▼
                                    </div>
                                </div>
                            </div>

                            {user?.type==='registered' && gameState==='level_select' && rewardsHubEnabled() && <button type="button"
                                data-settings-panel="rewards" onClick={()=>openRewards(true)} className="reward-entry">
                                <span>{rewardsHubText(lang).title}<small>{rewardsHubText(lang).description}</small></span><span aria-hidden="true">→</span>
                            </button>}
                            {webContent && <OptionalMetricsSettings lang={lang}/>}

                            <CosmeticsSettings lang={lang} progress={campaignProgress} update={updateCampaign} loaded={cosmeticsLoaded} locked={matchDesignLocked}/>
                            <CampaignCloudPanel key={cloud.userId??'guest'} lang={lang} cloud={cloud} locked={matchDesignLocked}/>
                            {android && <FoundersSettings lang={lang} accountName={user?.name} progress={campaignProgress} rewards={foundersRewards} locked={matchDesignLocked}/>}
                            {android && user && <NativeRewardSettings key={user.id} userId={user.id} lang={lang} locked={matchDesignLocked}/>}
                            {android && <AppSupportLinks lang={lang}/>}
                            {webContent && <SiteLinks lang={lang} newTab/>}

                            {user && gameState==='level_select' && (
                                <div className="flex flex-col gap-3 mt-4 pt-6 border-t border-[#4A4238]">
                                    <button data-settings-panel="account" onClick={() => { setShowSettings(false);setSettingsPanel('account'); }} className="w-full py-3 bg-[#1E1C19] border border-[#4A4238] text-[#D4B872] rounded hover:bg-[#3B342C] transition-colors font-bold tracking-widest text-xs uppercase text-center">
                                        {dict[lang]?.account || 'ACCOUNT'}
                                    </button>
                                    <button data-settings-panel="friends" onClick={() => { setShowSettings(false);setSettingsPanel('friends'); }} className="w-full py-3 bg-[#1E1C19] border border-[#4A4238] text-[#D4B872] rounded hover:bg-[#3B342C] transition-colors font-bold tracking-widest text-xs uppercase text-center">
                                        {dict[lang]?.friends || 'FRIENDS'}
                                    </button>
                                </div>
                            )}

                        </div>
                    </div>
                </SettingsDialog>
            )}


            {(gameState === 'title' || gameState === 'level_select') && (
                <div className="absolute inset-0 z-0 flex items-center justify-center opacity-[0.045] pointer-events-none scale-[2] rotate-12 blur-[0.5px]">
                    <div className="grid grid-cols-8 grid-rows-8 border-4 border-[#B39A62] w-[800px] h-[800px]">
                        {Array.from({ length: 64 }).map((_, i) => {
                            const isBlack = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
                            return (
                                <div key={i} className={`w-full h-full ${isBlack ? 'bg-[#B39A62]' : 'bg-transparent'}`} />
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="flex-grow w-full flex flex-col items-center justify-center relative z-10 shrink-0 mt-8">
                {gameState === 'title' && (
                    <TitleScreen lang={lang} onLogin={handleLogin} initialMode={loginMode} onOAuthStart={()=>{authOwner.current='oauth';oauthIntent.current=circuitAccess.beginAuthentication();}} onOAuthCancel={cancelOAuth}/>
                )}

                {gameState === 'level_select' && user && (
                    <LevelSelect
                        settingsPanel={settingsPanel}
                        onOpenRewards={()=>openRewards(false)}
                        onCloseSettingsPanel={()=>{
                            const returnToAccount=settingsPanel==='rewards'&&rewardsOrigin.current==='account';
                            setSettingsPanel(returnToAccount?'account':null);
                            setShowSettings(settingsPanel!=='rewards'||rewardsOrigin.current==='settings');
                        }}
                        lang={lang}
                        user={user}
                        onSelect={handleSelectLevel}
                        onProfileUpdated={handleProfileUpdated}
                        onCampaign={()=>setGameState('campaign')}
                        onOnlineMatch={handleOnlineMatch}
                        onStartGlobalMatch={(tcSeconds, mode) => { setQueueMode(mode); setTimeControlTarget(tcSeconds); setIsSearchingGlobally(true); }}
                        onReplay={(record) => {
                            setReplayRecord(record);
                            setGameState('replay');
                        }}
                        onBack={handleLogout}
                    />
                )}

                {gameState === 'campaign' && user && <CampaignMode lang={lang} user={user} onBack={()=>setGameState('level_select')} onLogin={requestCircuitLogin} onPlayingChange={setCircuitPlaying}/>}
                {gameState === 'playing' && user && (
                    <GameBoard
                        lang={lang}
                        user={user}
                        cpuLevel={onlineInfo ? undefined : cpuLevel}
                        roomId={onlineInfo?.roomId}
                        onlineRole={onlineInfo?.role ?? practiceSide}
                        matchMode={onlineInfo?.matchMode}
                        opponentId={onlineInfo?.opponentId}
                        timeControl={timeControl}
                        onHome={() => {
                            if (typeof window !== 'undefined') {
                                localStorage.removeItem('qg_active_online_match');
                            }
                            setOnlineInfo(null);
                            setGameState('level_select');
                        }}
                    />
                )}

                {gameState === 'replay' && replayRecord && (
                    <ReplayBoard
                        lang={lang}
                        record={replayRecord}
                        onHome={() => {
                            setReplayRecord(null);
                            setGameState('level_select');
                        }}
                    />
                )}
            </div>

            {gameState === 'title' && webContent && (
                <>
                    <SiteIntroduction lang={lang}/>


                    <DevDiaryTimeline view="home" lang={lang}/>

                    {/* Footer */}
                    <footer className="w-full max-w-4xl mt-12 mb-8 text-center text-gray-500 text-xs font-sans relative z-40">
                        <SiteLinks lang={lang}/>
                        <div>&copy; 2026 Q-GAMBIT - Quantum Superposition Chess. All rights reserved.</div>
                    </footer>
                </>
            )}

            {gameState === 'title' && android && <footer className="relative z-10 mt-6"><AppSupportLinks lang={lang}/></footer>}

        </main></SocketProvider></TermsGate>
    );
}
