'use client';
import { SocketProvider } from '../lib/SocketContext';
import { matchText } from '../locales/matchText';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import GameBoard from '../components/GameBoard';
import AdBanner from '../components/AdBanner';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { SystemStatusBanner } from '../components/SystemStatusBanner';
import { supabase } from '../lib/supabaseClient';
import { TitleScreen } from '../components/TitleScreen';
import { LevelSelect } from '../components/LevelSelect';
import { SettingsDialog } from '../components/SettingsDialog';
import { CampaignMode } from '../components/CampaignMode';
import { circuitAccess, isSameCircuitIdentity } from '../lib/circuitAccess';
import type { Session } from '@supabase/supabase-js';
import ReplayBoard from '../components/ReplayBoard';
import { Language, LANGUAGES, dict } from '../locales/dict';
import { User, GameState, TimeControl } from '../types/game';
import { GameRecord } from '../lib/gameRecordService';

import { RankedMatchmakingManager } from '../components/RankedMatchmakingManager';
import { clearRankedSession } from '../lib/rankedSession';


import { useCampaignProgress } from '../hooks/useCampaignProgress';
import { battleMusicUrl } from '../config/circuitMusic';
import { soundManager } from '../lib/SoundService';
import { CosmeticsSettings } from '../components/CosmeticsSettings';
import { cosmeticsLocked } from '../lib/cosmeticOptions';

export default function Home() {
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
    const [settingsPanel,setSettingsPanel]=useState<'friends'|'account'|null>(null);
    useEffect(() => {
        const openSettings = () => setShowSettings(true);
        window.addEventListener('qg-open-settings', openSettings);
        return () => window.removeEventListener('qg-open-settings', openSettings);
    }, []);
    const [isSearchingGlobally, setIsSearchingGlobally] = useState(false);
    const [timeControlTarget, setTimeControlTarget] = useState(600);
    const [queueMode, setQueueMode] = useState<'ranked' | 'random'>('random');

    
    useEffect(() => {
        let active=true;
        const initialRevision=circuitAccess.getSnapshot().revision;
        const restoreSession=(session:Session)=>{
            // SIGNED_IN can repeat on tab focus; never restart an existing match.
            if(circuitAccess.getSnapshot().userId===session.user.id)return;
            const attempt=circuitAccess.beginAuthentication();
            const restore=async()=>{
                try {
                    const {data,error}=await supabase.auth.getUser();
                    const verified=data.user;
                    if(error||!verified||verified.is_anonymous||verified.id!==session.user.id)return;
                    let profile:{name?:string;avatar_url?:string}|null=null;
                    try { const result=await supabase.from('profiles').select('name, avatar_url').eq('id',verified.id).single();profile=result.data; } catch { /* Auth is valid even if public appearance is unavailable. */ }
                    const u:User={id:verified.id,name:profile?.name||verified.user_metadata?.full_name||verified.user_metadata?.name||'Player',avatar_url:profile?.avatar_url,type:'registered'};
                    if(!active||!circuitAccess.grant(u,attempt))return;
                    setUser(u);
                    try { localStorage.setItem('qg_last_user',JSON.stringify(u)); } catch { /* Keep the verified session in memory. */ }
                    setGameState(circuitLoginRequested.current?'campaign':'level_select');
                    circuitLoginRequested.current=false;
                } catch { /* Fail closed for Circuit; cached identity is not a login. */ }
            };
            // Do not await another Supabase call inside its auth lock callback.
            setTimeout(()=>{if(active&&circuitAccess.getSnapshot().revision===attempt)void restore();},0);
        };
        const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
            if(event==='SIGNED_IN'&&session)restoreSession(session);
            else if(event==='SIGNED_OUT'){
                circuitAccess.revoke();setUser(null);setGameState('title');setLoginMode('select');
                try { localStorage.removeItem('qg_last_user'); } catch { /* Access is already revoked. */ }
            }
        });
        void supabase.auth.getSession().then(({data:{session}})=>{
            if(active&&session&&circuitAccess.getSnapshot().revision===initialRevision)restoreSession(session);
        }).catch(()=>{});
        // A logout/account replacement in another tab must cancel a local run.
        const identityChanged=(event:StorageEvent)=>{
            if(event.key===null||(event.key==='qg_last_user'&&!isSameCircuitIdentity(event.oldValue,event.newValue)))circuitAccess.revoke();
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
        if (typeof window !== 'undefined') {
            const lastUser = localStorage.getItem('qg_last_user');
            if (lastUser) {
                try {
                    const u = JSON.parse(lastUser);
                    setUser(u);
                    
                    // Check if there is an active online match from within the last 15 minutes
                    const activeMatchStr = localStorage.getItem('qg_active_online_match');
                    if (activeMatchStr) {
                        try {
                            const match = JSON.parse(activeMatchStr);
                            if (match.roomId && match.role && Date.now() - (match.timestamp || 0) < 15 * 60 * 1000) {
                                setOnlineInfo({
                                    roomId: match.roomId,
                                    role: match.role,
                                    matchMode: match.matchMode,
                                    opponentId: match.opponentId
                                });
                                setTimeControl(match.tc || '10m');
                                setGameState('playing');
                                return;
                            } else {
                                localStorage.removeItem('qg_active_online_match');
                            }
                        } catch (e) {
                            localStorage.removeItem('qg_active_online_match');
                        }
                    }
                    
                    setGameState('level_select');
                } catch (e) {
                    localStorage.removeItem('qg_last_user');
                }
            }
        }
    }, []);

    const handleLogin = (u: User,attempt?:number) => {
        if(u.type==='registered'){
            if(attempt===undefined||!circuitAccess.grant(u,attempt))return;
        } else circuitAccess.revoke();
        setUser(u);
        localStorage.setItem('qg_last_user', JSON.stringify(u));
        setGameState(u.type==='registered'&&circuitLoginRequested.current?'campaign':'level_select');
        circuitLoginRequested.current=false;
    };

    const handleProfileUpdated = (profile:{id:string;avatar_url:string}) => {
        if(!user||user.id!==profile.id)return;
        const next={...user,avatar_url:profile.avatar_url};
        setUser(current=>current?.id===profile.id?{...current,avatar_url:profile.avatar_url}:current);
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
        clearRankedSession();
        circuitAccess.revoke();
        setUser(null);
        setSettingsPanel(null);setShowSettings(false);setLoginMode('select');
        circuitLoginRequested.current=false;
        try { localStorage.removeItem('qg_last_user'); } catch { /* Access is already revoked. */ }
        setGameState('title');
        await supabase.auth.signOut();
    };

    const requestCircuitLogin=()=>{
        circuitAccess.revoke();circuitLoginRequested.current=true;
        setUser(null);setSettingsPanel(null);setShowSettings(false);setLoginMode('login');setGameState('title');
        try { localStorage.removeItem('qg_last_user'); } catch { /* Do not delete campaign progress. */ }
    };


    return (
        <SocketProvider userId={user?.id}>
            <SystemStatusBanner lang={lang} />
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
            <SpeedInsights />
        <main data-screen={gameState} className="fixed inset-0 flex flex-col items-center justify-between bg-[#11100E] text-[#E8E2D7] font-sans overflow-hidden">
            <div className="relative z-40 w-full max-w-5xl flex items-center justify-between text-sm mb-4">
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

                            <CosmeticsSettings lang={lang} progress={campaignProgress} update={updateCampaign} loaded={cosmeticsLoaded} locked={matchDesignLocked}/>

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

            <div className="flex-grow w-full flex flex-col items-center justify-center relative z-10">
                {gameState === 'title' && (
                    <TitleScreen lang={lang} onLogin={handleLogin} initialMode={loginMode}/>
                )}

                {gameState === 'level_select' && user && (
                    <LevelSelect 
                        settingsPanel={settingsPanel}
                        onCloseSettingsPanel={()=>{setSettingsPanel(null);setShowSettings(true);}}
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

            {gameState === 'title' && (
                <>
                    <div className="w-full max-w-4xl mx-auto mt-16 mb-8 p-8 bg-black/60 border border-[#3B342C] rounded-lg text-[#A89C86] font-sans leading-relaxed relative z-40 text-left">
                        <h2 className="text-2xl text-[#D4B872] font-serif mb-4">About Q-Gambit</h2>
                        <p className="mb-4">Q-Gambit is a revolutionary variant of chess that introduces quantum mechanics principles such as superposition, entanglement, and collapse into the classic game of strategy. Instead of a single piece occupying a single square, pieces can exist in multiple states and positions simultaneously until they are observed.</p>
                        
                        <div className="my-8 flex flex-col items-center justify-center min-h-[100px]">
                            <span className="text-[10px] tracking-widest text-[#8C7A5E] mb-2 uppercase">Advertisement</span>
                            <AdBanner adClient="ca-pub-1116866075179199" adSlot="8798363654" adFormat="horizontal" />
                        </div>

                        <h3 className="text-xl text-[#D4B872] font-serif mb-3 mt-6">How to Play Quantum Chess</h3>
                        <p className="mb-4">Unlike traditional chess, your pieces in Q-Gambit have quantum probability waves. When you observe a piece (such as when an attack occurs or a capture is attempted), the wave function collapses, resolving its true position and state.</p>
                        <p className="mb-4">Use quantum superposition to protect your king from unexpected threats and create multi-layered attacks that your opponent cannot simply block without measuring the board state. If you love traditional chess but want a completely new strategic challenge, Q-Gambit is the perfect mind-bending experience.</p>

                        <div className="my-8 flex flex-col items-center justify-center min-h-[100px]">
                            <span className="text-[10px] tracking-widest text-[#8C7A5E] mb-2 uppercase">Advertisement</span>
                            <AdBanner adClient="ca-pub-1116866075179199" adSlot="8798363654" adFormat="auto" />
                        </div>

                        <h3 className="text-xl text-[#D4B872] font-serif mb-3 mt-6">Key Features</h3>
                        <ul className="list-disc pl-6 mb-4 space-y-2">
                            <li><strong>Online Multiplayer:</strong> Challenge players around the world in real-time quantum combat.</li>
                            <li><strong>Ranked Matchmaking:</strong> Climb the competitive Elo ladder and prove your mastery over quantum probabilities.</li>
                            <li><strong>Local AI Practice:</strong> Play against our advanced quantum chess engine with adjustable difficulty levels.</li>
                            <li><strong>Campaign Mode:</strong> Play through historical chess scenarios adapted for quantum mechanics and unlock exclusive cosmetic rewards.</li>
                        </ul>
                    </div>

                    {/* Footer */}
                    <footer className="w-full max-w-4xl mt-12 mb-8 text-center text-gray-500 text-xs font-sans relative z-40">
                        <div className="flex flex-wrap justify-center gap-4 mb-4">
                            <Link href="/about" className="hover:text-[#D4B872] transition-colors cursor-pointer pointer-events-auto">About Developer</Link>
                            <span>|</span>
                            <Link href="/updates" className="hover:text-[#D4B872] transition-colors cursor-pointer pointer-events-auto">Development Diary & Updates</Link>
                            <span>|</span>
                            <Link href="/privacy" className="hover:text-[#D4B872] transition-colors cursor-pointer pointer-events-auto">{dict[lang]?.privacyPolicy || 'Privacy Policy'}</Link>
                            <span>|</span>
                            <Link href="/contact" className="hover:text-[#D4B872] transition-colors cursor-pointer pointer-events-auto">Contact Us</Link>
                        </div>
                        <div>&copy; 2026 Q-GAMBIT - Quantum Superposition Chess. All rights reserved.</div>
                    </footer>
                </>
            )}

        </main></SocketProvider>
    );
}
