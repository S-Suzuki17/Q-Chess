'use client';
import { SocketProvider } from '../lib/SocketContext';
import { matchText } from '../locales/matchText';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import GameBoard from '../components/GameBoard';
import {NativeRewardSettings} from '../components/NativeRewardSettings';
import {NativeAdPrivacySettings} from '../components/NativeAdPrivacySettings';
import {NativeAdAudienceGate,NativeAdAudienceSettings} from '../components/NativeAdAudienceGate';
import {FoundersSettings} from '../components/FoundersSettings';
import {useFoundersRewards} from '../hooks/useFoundersRewards';
import {foundersText} from '../locales/foundersText';
import { SiteIntroduction, SiteLinks } from '../components/SiteInformation';
import { AppSupportLinks } from '../components/AppSupportLinks';
import { useAppPlatform } from '../hooks/useAppPlatform';
import { useNativeAuthLinks } from '../hooks/useNativeAuthLinks';
import {useNativeCommerceRecovery} from '../hooks/useNativeCommerceRecovery';
import {useAndroidBackNavigation} from '../hooks/useAndroidBack';
import { SystemStatusBanner } from '../components/SystemStatusBanner';
import { supabase } from '../lib/supabaseClient';
import { TitleScreen } from '../components/TitleScreen';
import { LevelSelect } from '../components/LevelSelect';
import { SettingsDialog } from '../components/SettingsDialog';
import { GameSettings } from '../components/GameSettings';
import { CampaignMode } from '../components/CampaignMode';
import { OptionalMetricsSettings } from '../components/OptionalMetricsSettings';
import { recordVisit } from '../lib/engagementMetrics';
import { circuitAccess } from '../lib/circuitAccess';
import ReplayBoard from '../components/ReplayBoard';
import { Language, LANGUAGES, dict } from '../locales/dict';
import { User, GameState, TimeControl } from '../types/game';
import { GameRecord } from '../lib/gameRecordService';

import { RankedMatchmakingManager } from '../components/RankedMatchmakingManager';
import { clearRankedSession } from '../lib/rankedSession';
import { restoredOnlineMatch } from '../lib/legacySessionRestoration';
import { rememberActiveOnlineMatch, forgetActiveOnlineMatch } from '../lib/activeOnlineMatchCache';
import {useGoogleLoginSession} from '../hooks/useGoogleLoginSession';
import {GoogleAccountSetup} from '../components/GoogleAccountSetup';


import { useCampaignProgress } from '../hooks/useCampaignProgress';
import { usePlayGameStatsProgress } from '../hooks/usePlayGameStatsProgress';
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
    useAndroidBackNavigation();
    const {progress:campaignProgress, update:updateCampaign, loaded:cosmeticsLoaded}=useCampaignProgress();
    usePlayGameStatsProgress();
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
    useNativeCommerceRecovery(user);
    const foundersRewards=useFoundersRewards(user,matchDesignLocked);
    // A fresh login must recheck consent even when it is the same account.
    // While signing in, keep the form mounted so its cleanup does not abort it.
    const termsIdentity=user?`${user.type}:${user.id}:${circuitAccess.getSnapshot().revision}`:'none';
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

    const [onlineInfo, setOnlineInfo] = useState<{ roomId: string, role: 'white' | 'black' | 'spectator', matchMode: 'random' | 'private' | 'ranked', opponentId?: string, privateRoomIntent?: 'create' | 'join' | 'reconnect' } | null>(null);
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


    const showRestoredUser = (u: User) => {
        let match: ReturnType<typeof restoredOnlineMatch>=null;
        try { match=restoredOnlineMatch(u.id,JSON.parse(localStorage.getItem('qg_last_user')||'null'),JSON.parse(localStorage.getItem('qg_active_online_match')||'null')); }
        catch { /* Display/match cache is optional. */ }
        setUser(u);
        try { localStorage.setItem('qg_last_user',JSON.stringify(u)); } catch { /* Verified identity remains in memory. */ }
        if(match&&!circuitLoginRequested.current){
            setOnlineInfo({...match,privateRoomIntent:'reconnect'});setTimeControl(match.tc);
            setGameState(current=>current==='title'||current==='level_select'?'playing':current);
        } else setGameState(current=>current==='title'?(circuitLoginRequested.current?'campaign':'level_select'):current);
        circuitLoginRequested.current=false;
    };
    const googleLogin=useGoogleLoginSession(showRestoredUser,()=>{
        setUser(null);setGameState('title');setLoginMode('select');setSettingsPanel(null);setShowSettings(false);
        try{localStorage.removeItem('qg_last_user');}catch{/* Access is already revoked. */}
    });
    useEffect(()=>{if(nativeAuth.failed)googleLogin.cancel();},[nativeAuth.failed]);

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

    const handleLogin = (u: User) => {
        if(u.type!=='guest')return;
        googleLogin.cancel();setUser(u);
        try { localStorage.setItem('qg_last_user',JSON.stringify(u)); } catch { /* Local display cache is optional. */ }
        setGameState('level_select');circuitLoginRequested.current=false;
    };

    const handleProfileUpdated = (profile:{id:string;avatar_url?:string;name?:string}) => {
        if(!user||user.id!==profile.id)return;
        const changes={...(profile.avatar_url!==undefined?{avatar_url:profile.avatar_url}:{}),...(profile.name!==undefined?{name:profile.name}:{})};
        const next={...user,...changes};
        setUser(current=>current?.id===profile.id?{...current,...changes}:current);
        try { localStorage.setItem('qg_last_user',JSON.stringify(next)); } catch { /* Keep the saved server profile in memory. */ }
    };

    const handleQuickPractice = () => {
        googleLogin.cancel();
        if (!user) {
            circuitAccess.revoke();
            const guestId = `GUEST-${crypto.randomUUID()}`;
            const guestUser: User = { id: guestId, name: 'Guest', type: 'guest' };
            setUser(guestUser);
            try { localStorage.setItem('qg_last_user', JSON.stringify(guestUser)); } catch { /* Keep verified login in memory. */ }
        }
        handleSelectLevel('10m', 5, 'white');
    };

    const handleSelectLevel = (tc: TimeControl, level: number, side: 'white' | 'black') => {
        setPracticeSide(side);
        setCpuLevel(level);
        setTimeControl(tc);
        setOnlineInfo(null);
        if (typeof window !== 'undefined') {
            forgetActiveOnlineMatch();
        }
        setGameState('playing');
    };

    const handleOnlineMatch = (roomId: string, role: 'white' | 'black' | 'spectator', matchMode: 'random' | 'private' | 'ranked', tc: TimeControl, opponentId?: string) => {
        setIsSearchingGlobally(false);
        setOnlineInfo({ roomId, role, matchMode, opponentId, privateRoomIntent: matchMode==='private'&&role!=='spectator' ? (role==='white'?'create':'join') : undefined });
        setTimeControl(tc);
        if (typeof window !== 'undefined' && role !== 'spectator') {
            rememberActiveOnlineMatch({
                userId:user?.id,
                roomId,
                role,
                matchMode,
                tc,
                opponentId,
                timestamp: Date.now()
            });
        }
        setGameState('playing');
    };

    const handleLogout = async () => {
        googleLogin.cancel();
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
        googleLogin.cancel();circuitLoginRequested.current=true;
        setUser(null);setSettingsPanel(null);setShowSettings(false);setLoginMode('login');setGameState('title');
        try { localStorage.removeItem('qg_last_user'); } catch { /* Do not delete campaign progress. */ }
    };


    if((googleLogin.state.status==='setup'||googleLogin.state.status==='reset')&&googleLogin.state.authId){
        return <GoogleAccountSetup key={googleLogin.state.authId+googleLogin.state.status} lang={lang} authId={googleLogin.state.authId}
            reset={googleLogin.state.status==='reset'} onComplete={googleLogin.finish} onCancel={()=>void handleLogout()}/>;
    }
    if(googleLogin.state.status==='checking'||googleLogin.state.status==='error'){
        return <><main data-google-session={googleLogin.state.status} className="min-h-[100dvh] flex flex-col items-center justify-center gap-5 bg-[#11100E] px-6 text-[#E8E2D7]">
            <h1 className="font-serif text-3xl">Q-GAMBIT</h1>
            <p role="status">{googleLogin.state.status==='checking'?matchText(lang,'ログイン状態を確認しています…','Checking your saved sign-in…')
                :matchText(lang,'ログイン状態を確認できません。接続を確認して再試行してください。','Could not check your sign-in. Check your connection and retry.')}</p>
            {googleLogin.state.status==='error'&&<button type="button" className="min-h-11 border p-3" onClick={googleLogin.retry}>{matchText(lang,'再試行','Retry')}</button>}
            <button type="button" className="min-h-11 p-3 underline" onClick={()=>{googleLogin.cancel();setUser(null);setGameState('title');}}>{dict[lang].cancel}</button>
        </main>
        {webContent && <><SiteIntroduction lang={lang}/><SiteLinks lang={lang}/></>}
        </>;
    }

    return (
        <TermsGate key={termsIdentity} user={user} lang={lang} playing={matchDesignLocked} onExit={()=>void handleLogout()} onReady={()=>setTermsReadyIdentity(termsIdentity)}>
        <SocketProvider userId={user?.id}>
            {DAILY_LOGIN_REWARDS_ENABLED && <DailyLoginClaimController user={user} termsReady={termsReadyIdentity===termsIdentity}/>}
            {MEMBER_TICKET_USAGE_ENABLED && <MemberTicketClaimController user={user} termsReady={termsReadyIdentity===termsIdentity}/>}
            <SystemStatusBanner lang={lang} playing={gameState==='playing'||circuitPlaying} />
            {nativeAuth.failed && <div role="alert" className="fixed bottom-4 left-4 right-4 z-[100] rounded border border-[#D4B872] bg-[#1E1C19] p-4 text-[#E8E2D7]">
                {matchText(lang,'ログインできませんでした。もう一度お試しください。','Sign-in failed. Please try again.')}
                <button type="button" onClick={nativeAuth.dismiss} className="ml-4 p-2" aria-label={matchText(lang,'閉じる','Close')}>×</button>
            </div>}
            {android&&foundersRewards.available&&!matchDesignLocked&&!showSettings&&!isSearchingGlobally&&
                <aside className="founders-notice" role="status"><strong>{foundersText(lang,'title')}</strong><button type="button" onClick={()=>setShowSettings(true)}>{foundersText(lang,'claim')}</button></aside>}
            {isSearchingGlobally&&<RankedMatchmakingManager lang={lang}
                user={user}
                mode={queueMode}
                onRequestLogin={()=>{googleLogin.cancel();setUser(null);setIsSearchingGlobally(false);setLoginMode('login');setGameState('title');}}
                cancelSearchGlobally={() => setIsSearchingGlobally(false)}
                timeControlTarget={timeControlTarget}
                onMatchFound={(room) => {
                    handleOnlineMatch(room.id, room.myColor, room.mode, (room.timeControl === 10 ? '10s' : room.timeControl === 180 ? '3m' : '10m') as TimeControl, room.myColor==='white'?room.joinerId:room.hostId);
                }}
            />}
        <main data-screen={gameState} className={`fixed inset-0 flex flex-col items-center justify-between bg-[#11100E] text-[#E8E2D7] font-sans overflow-x-hidden ${gameState === 'title' ? 'overflow-y-auto' : 'overflow-hidden'}`}>
            <div className="relative z-40 w-full max-w-5xl flex items-center justify-between text-sm mb-4 shrink-0">
                {/* 右上のコントロール群 */}
                <div className={`app-corner-controls fixed right-4 top-4 z-40 flex gap-2 items-center ${showSettings || hideSettingsGlobal || gameState === 'level_select' || gameState === 'playing' || gameState === 'campaign' ? 'hidden' : ''}`}>
                    <button
                        onClick={() => setShowSettings(true)}
                        className="px-3 py-2 bg-[#2A2621] border border-[#4A4238] text-[#D4B872] rounded hover:bg-[#3B342C] transition-colors font-sans font-bold tracking-widest flex items-center justify-center text-xs"
                    >
                        ⚙️ {dict[lang]?.settings || 'SETTINGS'}
                    </button>
                </div>
            </div>

            {showSettings && (
                <SettingsDialog wide label={dict[lang].settings} onClose={()=>setShowSettings(false)}>
                    <GameSettings lang={lang} soundConfig={soundConfig} onLanguageChange={handleLanguageChange} onClose={()=>setShowSettings(false)}
                        appearance={<CosmeticsSettings compact lang={lang} progress={campaignProgress} update={updateCampaign} loaded={cosmeticsLoaded} locked={matchDesignLocked}/>}
                        appearanceExtra={android&&!matchDesignLocked?<FoundersSettings lang={lang} accountName={user?.name} progress={campaignProgress} rewards={foundersRewards} locked={matchDesignLocked}/>:undefined}
                        account={user?<>
                            {user.type==='registered' && gameState==='level_select' && rewardsHubEnabled() && <button type="button" data-settings-panel="rewards" onClick={()=>openRewards(true)} className="reward-entry">
                                <span>{rewardsHubText(lang).title}<small>{rewardsHubText(lang).description}</small></span><span aria-hidden="true">→</span>
                            </button>}
                            {gameState==='level_select' && <div className="settings-account-actions">
                                <button type="button" data-settings-panel="account" onClick={()=>{setShowSettings(false);setSettingsPanel('account');}}>{dict[lang].account}</button>
                                <button type="button" data-settings-panel="friends" onClick={()=>{setShowSettings(false);setSettingsPanel('friends');}}>{dict[lang].friends}</button>
                            </div>}
                            <CampaignCloudPanel key={cloud.userId??'guest'} lang={lang} cloud={cloud} locked={matchDesignLocked}/>
                        </>:null}
                        accountExtra={android&&user&&!matchDesignLocked?<NativeRewardSettings key={user.id} userId={user.id} lang={lang} locked={matchDesignLocked}/>:undefined}
                        privacy={<>
                            {webContent && <OptionalMetricsSettings lang={lang}/>}
                            {android && <NativeAdPrivacySettings lang={lang} locked={matchDesignLocked}/>}
                            {android && <NativeAdAudienceSettings lang={lang} locked={matchDesignLocked}/>}
                            <a className="settings-policy-link" href={android?'https://q-gambit.com/privacy/':'/privacy/'} target="_blank" rel="noopener noreferrer">{dict[lang].privacyPolicy} ↗</a>
                        </>}
                        support={<>
                            {android && <AppSupportLinks lang={lang}/>}
                            {webContent && <SiteLinks compact lang={lang} newTab/>}
                        </>}/>
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

            <div className={`w-full flex flex-col items-center justify-center relative z-10 ${gameState==='level_select'?'flex-1 min-h-0':'flex-grow shrink-0 mt-8'}`}>
                {gameState === 'title' && (
                    <TitleScreen lang={lang} onLogin={handleLogin} onQuickPractice={handleQuickPractice} initialMode={loginMode}
                        onOAuthStart={()=>{nativeAuth.dismiss();googleLogin.start();}} onOAuthCancel={googleLogin.cancel} onOAuthError={googleLogin.fail}/>
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
                        privateRoomIntent={onlineInfo?.privateRoomIntent}
                        opponentId={onlineInfo?.opponentId}
                        timeControl={timeControl}
                        onHome={() => {
                            if (typeof window !== 'undefined') {
                                forgetActiveOnlineMatch();
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
                    {/* Footer */}
                    <footer className="w-full max-w-4xl mt-12 mb-8 text-center text-gray-500 text-xs font-sans relative z-40">
                        <SiteLinks lang={lang}/>
                        <div>&copy; 2026 Q-GAMBIT - Quantum Superposition Chess. All rights reserved.</div>
                    </footer>
                </>
            )}

            {gameState === 'title' && android && <footer className="relative z-10 mt-6"><AppSupportLinks lang={lang}/></footer>}

            {android && <NativeAdAudienceGate lang={lang}/>}
        </main></SocketProvider></TermsGate>
    );
}
