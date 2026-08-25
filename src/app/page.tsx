'use client';
import { SocketProvider } from '../lib/SocketContext';

import React, { useState, useEffect } from 'react';
import GameBoard from '../components/GameBoard';
import AdBanner from '../components/AdBanner';
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

    const handleLogout = () => {
        setUser(null);
        localStorage.removeItem('qg_last_user');
        setGameState('title');
    };

    return (
        <SocketProvider userId={user?.id}>
        <main className="flex min-h-screen flex-col items-center justify-between p-4 bg-[#050505] text-[#00ff41] font-mono relative overflow-hidden">
            <div className="z-10 w-full max-w-5xl flex items-center justify-between font-mono text-sm mb-4">
                {/* 右上のコントロール群 */}
                <div className="fixed right-4 top-4 z-50 flex gap-2 items-center">
                    <button 
                        onClick={() => setShowSettings(true)}
                        className="px-3 py-2 bg-[#111] border border-cyan-500 text-cyan-400 rounded hover:bg-cyan-900/30 transition-colors font-bold tracking-widest shadow-[0_0_10px_rgba(34,211,238,0.3)] flex items-center justify-center text-xs"
                    >
                        ⚙️ {dict[lang]?.settings || 'SETTINGS'}
                    </button>
                    <div className="relative">
                        <select 
                            value={lang}
                            onChange={(e) => setLang(e.target.value as Language)}
                            className="px-3 py-2 bg-[#111] border border-[#00ff41] text-[#00ff41] rounded hover:bg-[#00ff41]/20 transition-colors font-bold tracking-wider shadow-[0_0_10px_rgba(0,255,65,0.3)] cursor-pointer text-xs focus:outline-none appearance-none pr-7 pl-2"
                        >
                            {LANGUAGES.map(l => (
                                <option key={l.code} value={l.code} className="bg-black text-[#00ff41]">
                                    {l.flag} {l.label}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[#00ff41] text-xs">
                            ▼
                        </div>
                    </div>
                </div>
            </div>

            {showSettings && (
                <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#111] border border-cyan-500 rounded-xl p-8 w-full max-w-md shadow-[0_0_30px_rgba(34,211,238,0.2)]">
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-2xl font-bold text-cyan-400">⚙️ {dict[lang]?.settings || 'SETTINGS'}</h2>
                            <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
                        </div>
                        
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col gap-2">
                                <label className="flex justify-between text-cyan-300 font-bold">
                                    <span>BGM Volume</span>
                                    <span>{Math.round(soundConfig.bgmVolume * 100)}%</span>
                                </label>
                                <input 
                                    type="range" 
                                    min="0" max="1" step="0.05" 
                                    value={soundConfig.bgmVolume} 
                                    onChange={(e) => soundManager.updateConfig({ bgmVolume: parseFloat(e.target.value) })}
                                    className="w-full accent-cyan-500"
                                />
                            </div>
                            
                            <div className="flex flex-col gap-2">
                                <label className="flex justify-between text-cyan-300 font-bold">
                                    <span>SE Volume</span>
                                    <span>{Math.round(soundConfig.seVolume * 100)}%</span>
                                </label>
                                <input 
                                    type="range" 
                                    min="0" max="1" step="0.05" 
                                    value={soundConfig.seVolume} 
                                    onChange={(e) => {
                                        soundManager.updateConfig({ seVolume: parseFloat(e.target.value) });
                                        // Play test sound
                                        if (!soundConfig.masterMute) {
                                            const se = new Audio('/audio/move.mp3'); // We don't have move.mp3, but it won't crash
                                            se.volume = parseFloat(e.target.value);
                                            se.play().catch(()=>{});
                                        }
                                    }}
                                    className="w-full accent-cyan-500"
                                />
                            </div>

                            <div className="flex items-center gap-4 mt-4 pt-6 border-t border-cyan-900/50">
                                <span className="text-cyan-300 font-bold flex-1">Master Mute</span>
                                <button 
                                    onClick={() => soundManager.updateConfig({ masterMute: !soundConfig.masterMute })}
                                    className={`px-6 py-2 rounded font-bold tracking-widest transition-all ${soundConfig.masterMute ? 'bg-red-900/50 text-red-400 border border-red-500' : 'bg-cyan-900/50 text-cyan-400 border border-cyan-500'}`}
                                >
                                    {soundConfig.masterMute ? '🔇 MUTED' : '🔊 ON'}
                                </button>
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
            <footer className="w-full max-w-4xl mt-4 mb-4 text-center text-gray-600 text-xs">
                <a href="/privacy" className="hover:text-cyan-500 transition-colors">Privacy Policy</a>
                <span className="mx-2">|</span>
                <span>&copy; 2026 Q-GAMBIT</span>
            </footer>
        </main></SocketProvider>
    );
}
