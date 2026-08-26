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
        <div className="flex flex-col items-center justify-center min-h-[80vh] w-full text-[#E8E5DF] font-sans">
            {/* Title Section */}
            <div className="text-center mb-16">
                <h1 className="text-6xl md:text-8xl font-serif text-[#D4B872] drop-shadow-lg">
                    {t.title}
                </h1>
                <p className="mt-4 text-xl tracking-widest text-[#E8E5DF]/80 font-serif">{t.subtitle}</p>
            </div>

            {/* Menu Section */}
            <div className="w-full max-w-md p-8 bg-[#2A2621] border border-[#4A4238] rounded-xl shadow-2xl">
                
                {mode === 'select' && (
                    <div className="flex flex-col gap-4">
                        <button onClick={handleGuest} className="w-full py-3 px-6 bg-[#3B342C] border border-[#4A4238] hover:bg-[#4A4238] transition-all text-[#D4B872] font-bold tracking-widest uppercase">
                            {t.guestLogin}
                        </button>
                        {!hasRegisteredAccount && (
                            <button onClick={() => setMode('register')} className="w-full py-3 px-6 bg-[#3B342C] border border-[#4A4238] hover:bg-[#4A4238] transition-all text-[#D4B872] font-bold tracking-widest uppercase">
                                {t.createAccount}
                            </button>
                        )}
                        <button onClick={() => setMode('login')} className="w-full py-3 px-6 bg-[#3B342C] border border-[#4A4238] hover:bg-[#4A4238] transition-all text-[#D4B872] font-bold tracking-widest uppercase">
                            {t.login}
                        </button>
                        <button onClick={() => setMode('rules')} className="w-full mt-4 py-2 px-6 border-t border-[#4A4238] text-[#D4B872] hover:text-[#E8E5DF] transition-all font-bold tracking-widest uppercase">
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
                            className="w-full bg-[#1E1C19] border border-[#4A4238] p-3 text-[#E8E5DF] focus:outline-none focus:border-[#D4B872] text-center text-xl font-serif"
                            autoFocus
                        />
                        <button type="submit" className="w-full py-3 bg-[#4A4238] hover:bg-[#5C5346] text-[#E8E5DF] font-bold tracking-widest transition-all">
                            {t.submit}
                        </button>
                        <button type="button" onClick={() => setMode('select')} className="text-[#D4B872]/80 hover:text-[#D4B872] text-sm mt-2">
                            {t.back}
                        </button>
                    </form>
                )}

                {mode === 'show_id' && (
                    <div className="flex flex-col items-center gap-6 text-center">
                        <div className="text-green-500 font-bold text-xl">{t.accountCreated}</div>
                        <div>
                            <p className="text-[#D4B872] mb-2 font-serif">{t.yourIdIs}</p>
                            <div className="text-4xl font-mono text-[#E8E5DF] bg-[#1E1C19] px-6 py-3 border border-[#4A4238] rounded">
                                {generatedId}
                            </div>
                        </div>
                        <p className="text-sm text-[#E8E5DF]/60 max-w-xs">{t.rememberId}</p>
                        <button 
                            onClick={() => onLogin({ id: generatedId, name: inputName, type: 'registered' })} 
                            className="w-full py-3 mt-4 bg-[#4A4238] hover:bg-[#5C5346] text-[#E8E5DF] font-bold tracking-widest transition-all">
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
                                className="w-full bg-[#1E1C19] border border-[#4A4238] p-3 text-[#E8E5DF] focus:outline-none focus:border-[#D4B872] text-center text-xl font-mono uppercase"
                                autoFocus
                            />
                            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                            <button type="submit" className="w-full py-3 bg-[#4A4238] hover:bg-[#5C5346] text-[#E8E5DF] font-bold tracking-widest transition-all">
                                {t.login}
                            </button>
                        </form>
                        
                        {(() => {
                            const savedStr = typeof window !== 'undefined' ? localStorage.getItem('qg_accounts') : null;
                            const savedAccounts: User[] = savedStr ? JSON.parse(savedStr) : [];
                            if (savedAccounts.length > 0) {
                                return (
                                    <div className="mt-4 pt-4 border-t border-[#4A4238]">
                                        <p className="text-[#D4B872]/80 text-xs text-center mb-2 font-bold tracking-widest">SAVED ACCOUNTS</p>
                                        <div className="flex flex-col gap-2">
                                            {savedAccounts.map(account => (
                                                <button 
                                                    key={account.id}
                                                    onClick={() => onLogin(account)}
                                                    className="w-full py-2 px-4 bg-[#3B342C] hover:bg-[#4A4238] border border-[#4A4238] rounded transition-colors text-left flex justify-between items-center"
                                                >
                                                    <span className="text-[#E8E5DF] font-bold">{account.name}</span>
                                                    <span className="text-[#D4B872] font-mono text-sm">{account.id}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        <button type="button" onClick={() => setMode('select')} className="text-[#D4B872]/80 hover:text-[#D4B872] text-sm mt-4">
                            {t.back}
                        </button>
                    </div>
                )}

                {mode === 'rules' && (
                    <div className="flex flex-col gap-4 text-left">
                        <h2 className="text-2xl font-serif text-center text-[#D4B872] mb-2">{t.rulesTitle}</h2>
                        <ul className="text-[#E8E5DF] text-sm flex flex-col gap-3">
                            <li>{t.rule1}</li>
                            <li>{t.rule2}</li>
                            <li>{t.rule3}</li>
                            <li>{t.rule4}</li>
                        </ul>
                        <button type="button" onClick={() => setMode('select')} className="text-[#D4B872]/80 hover:text-[#D4B872] text-sm mt-4">
                            {t.back}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
