'use client';

import React, { useState, useEffect } from 'react';
import { dict, Language } from '../locales/dict';
import { User } from '../types/game';
import { ensureProfile } from '../lib/gameRecordService';

interface TitleScreenProps {
    lang: Language;
    onLogin: (user: User) => void;
}

export function TitleScreen({ lang, onLogin }: TitleScreenProps) {
    const t = dict[lang];
    const [mode, setMode] = useState<'select' | 'register' | 'login' | 'show_id' | 'rules'>('select');
    const [inputName, setInputName] = useState('');
    const [inputId, setInputId] = useState('');
    const [generatedId, setGeneratedId] = useState('');
    const [error, setError] = useState('');
    const [hasRegisteredAccount, setHasRegisteredAccount] = useState(false);

    useEffect(() => {
        const saved = JSON.parse(localStorage.getItem('qg_accounts') || '[]');
        if (saved.some((u: User) => u.type === 'registered')) {
            setHasRegisteredAccount(true);
        }
    }, []);

    const handleGuest = () => {
        const guestId = `GUEST-${Math.floor(Math.random() * 10000)}`;
        onLogin({ id: guestId, name: 'Guest', type: 'guest' });
    };

    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputName.trim()) return;
        
        // ランダムなIDを生成 (例: QG-8X9A)
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let idStr = 'QG-';
        for(let i = 0; i < 6; i++) {
            idStr += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        // Save to Supabase to initialize rating
        await ensureProfile(idStr, inputName);

        const newUser: User = { id: idStr, name: inputName, type: 'registered' };
        
        // LocalStorageに保存
        const saved = JSON.parse(localStorage.getItem('qg_accounts') || '[]');
        saved.push(newUser);
        localStorage.setItem('qg_accounts', JSON.stringify(saved));

        setGeneratedId(idStr);
        setMode('show_id');
    };

    const handleLoginSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const saved = JSON.parse(localStorage.getItem('qg_accounts') || '[]');
        const user = saved.find((u: User) => u.id === inputId);
        if (user) {
            onLogin(user);
        } else {
            setError(t.loginFailed);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] w-full text-cyan-400">
            {/* Title Section */}
            <div className="text-center mb-16 animate-pulse">
                <h1 className="text-6xl md:text-8xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]">
                    {t.title}
                </h1>
                <p className="mt-4 text-xl tracking-widest text-cyan-200/80">{t.subtitle}</p>
            </div>

            {/* Menu Section */}
            <div className="w-full max-w-md p-8 bg-black/40 border border-cyan-500/30 rounded-xl backdrop-blur-sm shadow-[0_0_30px_rgba(34,211,238,0.1)]">
                
                {mode === 'select' && (
                    <div className="flex flex-col gap-4">
                        <button onClick={handleGuest} className="w-full py-3 px-6 bg-cyan-950/50 border border-cyan-500 hover:bg-cyan-900 transition-all text-cyan-300 font-bold tracking-widest uppercase hover:shadow-[0_0_15px_rgba(34,211,238,0.5)]">
                            {t.guestLogin}
                        </button>
                        {!hasRegisteredAccount && (
                            <button onClick={() => setMode('register')} className="w-full py-3 px-6 bg-cyan-950/50 border border-cyan-500 hover:bg-cyan-900 transition-all text-cyan-300 font-bold tracking-widest uppercase hover:shadow-[0_0_15px_rgba(34,211,238,0.5)]">
                                {t.createAccount}
                            </button>
                        )}
                        <button onClick={() => setMode('login')} className="w-full py-3 px-6 bg-cyan-950/50 border border-cyan-500 hover:bg-cyan-900 transition-all text-cyan-300 font-bold tracking-widest uppercase hover:shadow-[0_0_15px_rgba(34,211,238,0.5)]">
                            {t.login}
                        </button>
                        <button onClick={() => setMode('rules')} className="w-full mt-4 py-2 px-6 border-t border-cyan-900 text-cyan-500 hover:text-cyan-300 transition-all font-bold tracking-widest uppercase">
                            📖 {t.rulesButton}
                        </button>
                    </div>
                )}

                {mode === 'register' && (
                    <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-4">
                        <input 
                            type="text" 
                            placeholder={t.enterName}
                            value={inputName}
                            onChange={e => setInputName(e.target.value)}
                            className="w-full bg-black/50 border border-cyan-500/50 p-3 text-cyan-300 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(34,211,238,0.3)] text-center text-xl"
                            autoFocus
                        />
                        <button type="submit" className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-black font-bold tracking-widest transition-all">
                            {t.submit}
                        </button>
                        <button type="button" onClick={() => setMode('select')} className="text-cyan-600/80 hover:text-cyan-400 text-sm mt-2">
                            {t.back}
                        </button>
                    </form>
                )}

                {mode === 'show_id' && (
                    <div className="flex flex-col items-center gap-6 text-center">
                        <div className="text-green-400 font-bold text-xl">{t.accountCreated}</div>
                        <div>
                            <p className="text-cyan-500 mb-2">{t.yourIdIs}</p>
                            <div className="text-4xl font-mono text-white bg-cyan-950 px-6 py-3 border border-cyan-400 rounded shadow-[0_0_20px_rgba(34,211,238,0.4)]">
                                {generatedId}
                            </div>
                        </div>
                        <p className="text-sm text-cyan-200/60 max-w-xs">{t.rememberId}</p>
                        <button 
                            onClick={() => onLogin({ id: generatedId, name: inputName, type: 'registered' })} 
                            className="w-full py-3 mt-4 bg-cyan-600 hover:bg-cyan-500 text-black font-bold tracking-widest transition-all">
                            {t.continue}
                        </button>
                    </div>
                )}

                {mode === 'login' && (
                    <div className="flex flex-col gap-4">
                        <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
                            <input 
                                type="text" 
                                placeholder={t.enterId}
                                value={inputId}
                                onChange={e => setInputId(e.target.value.toUpperCase())}
                                className="w-full bg-black/50 border border-cyan-500/50 p-3 text-cyan-300 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(34,211,238,0.3)] text-center text-xl font-mono uppercase"
                                autoFocus
                            />
                            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                            <button type="submit" className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-black font-bold tracking-widest transition-all">
                                {t.login}
                            </button>
                        </form>
                        
                        {(() => {
                            const savedStr = typeof window !== 'undefined' ? localStorage.getItem('qg_accounts') : null;
                            const savedAccounts: User[] = savedStr ? JSON.parse(savedStr) : [];
                            if (savedAccounts.length > 0) {
                                return (
                                    <div className="mt-4 pt-4 border-t border-cyan-900/50">
                                        <p className="text-cyan-600/80 text-xs text-center mb-2">SAVED ACCOUNTS</p>
                                        <div className="flex flex-col gap-2">
                                            {savedAccounts.map(account => (
                                                <button 
                                                    key={account.id}
                                                    onClick={() => onLogin(account)}
                                                    className="w-full py-2 px-4 bg-cyan-950/30 hover:bg-cyan-900/50 border border-cyan-800 rounded transition-colors text-left flex justify-between items-center"
                                                >
                                                    <span className="text-cyan-300 font-bold">{account.name}</span>
                                                    <span className="text-cyan-600 font-mono text-sm">{account.id}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        <button type="button" onClick={() => setMode('select')} className="text-cyan-600/80 hover:text-cyan-400 text-sm mt-4">
                            {t.back}
                        </button>
                    </div>
                )}

                {mode === 'rules' && (
                    <div className="flex flex-col gap-4 text-left">
                        <h2 className="text-2xl font-bold text-center text-cyan-400 mb-2">{t.rulesTitle}</h2>
                        <ul className="text-cyan-100 text-sm flex flex-col gap-3">
                            <li>{t.rule1}</li>
                            <li>{t.rule2}</li>
                            <li>{t.rule3}</li>
                            <li>{t.rule4}</li>
                        </ul>
                        <button type="button" onClick={() => setMode('select')} className="text-cyan-600/80 hover:text-cyan-400 text-sm mt-4">
                            {t.back}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
