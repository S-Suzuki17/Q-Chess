'use client';
import { SocketProvider } from '../lib/SocketContext';

import React, { useState, useEffect } from 'react';
import GameBoard from '../components/GameBoard';
import AdBanner from '../components/AdBanner';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { SystemStatusBanner } from '../components/SystemStatusBanner';
import { supabase } from '../lib/supabaseClient';
import { TitleScreen } from '../components/TitleScreen';
import { LevelSelect } from '../components/LevelSelect';
import ReplayBoard from '../components/ReplayBoard';
import { Language, LANGUAGES, dict } from '../locales/dict';
import { User, GameState, TimeControl } from '../types/game';
import { GameRecord } from '../lib/gameRecordService';
import { soundManager } from '../lib/SoundService';

export default function Home() {
    const [lang, setLang] = useState<Language>('en');
    const [gameState, setGameState] = useState<GameState>('title');
    const [user, setUser] = useState<User | null>(null);
    const [cpuLevel, setCpuLevel] = useState<number>(5);
    const [timeControl, setTimeControl] = useState<TimeControl>('10m');
    const [onlineInfo, setOnlineInfo] = useState<{ roomId: string, role: 'white' | 'black' | 'spectator', matchMode: 'random' | 'private' | 'ranked', opponentId?: string } | null>(null);
    const [replayRecord, setReplayRecord] = useState<GameRecord | null>(null);
    const [soundConfig, setSoundConfig] = useState(() => soundManager.getConfig());
    const [showSettings, setShowSettings] = useState(false);

    
    useEffect(() => {
        const fetchProfileAndSetUser = async (session: any) => {
            try {
                const { data: profile } = await supabase.from('profiles').select('name').eq('id', session.user.id).single();
                const u = {
                    id: session.user.id,
                    name: profile?.name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Player',
                    type: 'registered' as const
                };
                setUser(u);
                localStorage.setItem('qg_last_user', JSON.stringify(u));
                setGameState('level_select');
            } catch (e) {
                console.error('Failed to fetch profile', e);
                const u = {
                    id: session.user.id,
                    name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Player',
                    type: 'registered' as const
                };
                setUser(u);
                localStorage.setItem('qg_last_user', JSON.stringify(u));
                setGameState('level_select');
            }
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session && event === 'SIGNED_IN') {
                await fetchProfileAndSetUser(session);
            } else if (event === 'SIGNED_OUT') {
                setUser(null);
                localStorage.removeItem('qg_last_user');
                setGameState('title');
            }
        });
        
        // Check initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                fetchProfileAndSetUser(session);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedLang = localStorage.getItem('qg_language') as Language;
            if (savedLang) {
                setLang(savedLang);
            } else {
                const browserLang = navigator.language.split('-')[0];
                if (['en', 'ja', 'zh', 'ru', 'fr', 'de', 'es'].includes(browserLang)) {
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

    useEffect(() => {
        const unsubscribe = soundManager.subscribe(setSoundConfig);
        return () => { unsubscribe(); };
    }, []);

    useEffect(() => {
        if (gameState === 'title') {
            soundManager.playBGM('/audio/bgm_title.mp3');
        } else if (gameState === 'playing') {
            soundManager.playBGM('/audio/bgm_playing.mp3');
        } else if (gameState === 'replay') {
            soundManager.playBGM('/audio/bgm_replay.mp3');
        } else {
            soundManager.stopBGM();
        }
    }, [gameState]);

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

    const handleLogin = (u: User) => {
        setUser(u);
        localStorage.setItem('qg_last_user', JSON.stringify(u));
        setGameState('level_select');
    };

    const handleSelectLevel = (level: number, tc: TimeControl) => {
        setCpuLevel(level);
        setTimeControl(tc);
        setOnlineInfo(null);
        if (typeof window !== 'undefined') {
            localStorage.removeItem('qg_active_online_match');
        }
        setGameState('playing');
    };

    const handleOnlineMatch = (roomId: string, role: 'white' | 'black' | 'spectator', matchMode: 'random' | 'private' | 'ranked', tc: TimeControl, opponentId?: string) => {
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
        await supabase.auth.signOut();
        setUser(null);
        localStorage.removeItem('qg_last_user');
        setGameState('title');
    };

    return (
        <SocketProvider userId={user?.id}>
            <SystemStatusBanner lang={lang} />
            <SpeedInsights />
        <main className="flex min-h-screen flex-col items-center justify-between p-4 bg-[#1E1C19] text-[#E8E5DF] font-serif relative overflow-hidden">
            <div className="z-10 w-full max-w-5xl flex items-center justify-between text-sm mb-4">
                {/* 右上のコントロール群 */}
                <div className="fixed right-4 top-4 z-50 flex gap-2 items-center">
                    <button 
                        onClick={() => setShowSettings(true)}
                        className="px-3 py-2 bg-[#2A2621] border border-[#4A4238] text-[#D4B872] rounded hover:bg-[#3B342C] transition-colors font-sans font-bold tracking-widest flex items-center justify-center text-xs"
                    >
                        ⚙️ {dict[lang]?.settings || 'SETTINGS'}
                    </button>
                </div>
            </div>

            {showSettings && (
                <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#2A2621] border border-[#4A4238] rounded-xl p-8 w-full max-w-md shadow-2xl font-sans">
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-2xl font-serif text-[#D4B872]">⚙️ {dict[lang]?.settings || 'SETTINGS'}</h2>
                            <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
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

                        </div>
                    </div>
                </div>
            )}

            <div className="flex-grow w-full flex flex-col items-center justify-center">
                {gameState === 'title' && (
                    <TitleScreen lang={lang} onLogin={handleLogin} />
                )}

                {gameState === 'level_select' && user && (
                    <LevelSelect 
                        lang={lang} 
                        user={user} 
                        onSelect={handleSelectLevel} 
                        onOnlineMatch={handleOnlineMatch}
                        onReplay={(record) => {
                            setReplayRecord(record);
                            setGameState('replay');
                        }}
                        onBack={handleLogout} 
                    />
                )}

                {gameState === 'playing' && user && (
                    <GameBoard 
                        lang={lang} 
                        user={user} 
                        cpuLevel={onlineInfo ? undefined : cpuLevel} 
                        roomId={onlineInfo?.roomId}
                        onlineRole={onlineInfo?.role}
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

            {/* 広告 */}
            <div className="w-full max-w-4xl mt-8">
                <AdBanner 
                    adClient={process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "ca-pub-1116866075179199"} 
                    adSlot={process.env.NEXT_PUBLIC_ADSENSE_SLOT || "XXXXXXXXXX"} 
                />
            </div>

            {/* Footer */}
            <footer className="w-full max-w-4xl mt-4 mb-4 text-center text-gray-500 text-xs font-sans">
                <a href="/privacy" className="hover:text-[#D4B872] transition-colors">Privacy Policy</a>
                <span className="mx-2">|</span>
                <span>&copy; 2026 Q-GAMBIT</span>
            </footer>
        </main></SocketProvider>
    );
}
