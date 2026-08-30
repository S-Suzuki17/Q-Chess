'use client';
import React, { useState } from 'react';
import { User } from '../types/game';
import { dict, Language } from '../locales/dict';
import { AdBanner } from './AdBanner';
import { supabase } from '../lib/supabaseClient';

interface TitleScreenProps {
    lang: Language;
    onLogin: (u: User) => void;
}

export function TitleScreen({ lang, onLogin }: TitleScreenProps) {
    const t = dict[lang];
    const [mode, setMode] = useState<'select' | 'register' | 'login' | 'rules'>('select');
    const [inputId, setInputId] = useState('');
    const [inputPassword, setInputPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleGuest = () => {
        const guestId = `GUEST-${Math.floor(Math.random() * 10000)}`;
        onLogin({ id: guestId, name: 'Guest', type: 'guest' });
    };

    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!inputId.trim() || !inputPassword.trim()) {
            setError(lang === 'ja' ? 'IDとパスワードを入力してください。' : 'Please enter ID and Password.');
            return;
        }
        if (!/^[a-zA-Z0-9]+$/.test(inputId)) {
            setError(lang === 'ja' ? 'アカウント名は半角英数のみ使用できます。' : 'ID must be alphanumeric.');
            return;
        }

        setLoading(true);
        try {
            const { data, error: rpcError } = await supabase.rpc('register_user', {
                p_id: inputId,
                p_password: inputPassword
            });
            if (rpcError || !data) {
                setError(lang === 'ja' ? 'このアカウント名は既に使用されています。' : 'ID already exists.');
                setLoading(false);
                return;
            }
            onLogin({ id: inputId, name: inputId, type: 'registered' });
        } catch (err) {
            console.error(err);
            setError('Registration failed.');
            setLoading(false);
        }
    };

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!inputId.trim() || !inputPassword.trim()) {
            setError(lang === 'ja' ? 'IDとパスワードを入力してください。' : 'Please enter ID and Password.');
            return;
        }

        setLoading(true);
        try {
            const { data, error: rpcError } = await supabase.rpc('login_user', {
                p_id: inputId,
                p_password: inputPassword
            });
            if (rpcError || !data) {
                setError(lang === 'ja' ? 'アカウント名またはパスワードが間違っています。' : 'Invalid ID or Password.');
                setLoading(false);
                return;
            }
            onLogin({ id: inputId, name: inputId, type: 'registered' });
        } catch (err) {
            console.error(err);
            setError('Login failed.');
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#11100E] text-[#E8E2D7] p-4 font-sans selection:bg-[#B39A62]/30">
            {/* Minimal Board Pattern Background */}
            <div className="absolute inset-0 z-0 flex items-center justify-center opacity-[0.03] pointer-events-none scale-[2] rotate-12 blur-[1px]">
                <div className="grid grid-cols-8 grid-rows-8 border-4 border-[#E8E2D7] w-[800px] h-[800px]">
                    {Array.from({ length: 64 }).map((_, i) => {
                        const isBlack = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
                        return (
                            <div key={i} className={`w-full h-full ${isBlack ? 'bg-[#E8E2D7]' : 'bg-transparent'}`} />
                        );
                    })}
                </div>
            </div>

            <div className="relative z-10 text-center mb-16">
                <h1 className="text-5xl md:text-7xl font-serif text-[#E8E2D7] tracking-[0.2em] mb-4">
                    Q-GAMBIT
                </h1>
                <p className="text-xs md:text-sm tracking-[0.4em] text-[#A89C86] font-light uppercase">
                    A game of hidden identity
                </p>
            </div>

            <div className="relative z-10 w-full max-w-sm flex flex-col gap-8">
                {mode === 'select' && (
                    <div className="flex flex-col items-center gap-6">
                        <button onClick={handleGuest} className="text-xl tracking-[0.2em] hover:text-[#B39A62] transition-colors pb-1 border-b border-transparent hover:border-[#B39A62]">
                            PLAY AS GUEST
                        </button>
                        
                        <div className="flex flex-col items-center gap-4 mt-8 w-full border-t border-[#A89C86]/30 pt-8">
                            <span className="text-xs tracking-widest text-[#A89C86]">ACCOUNT ACCESS</span>
                            <button onClick={() => { setMode('login'); setError(''); }} className="text-sm tracking-widest hover:text-[#E8E2D7] text-[#A89C86]">
                                SIGN IN
                            </button>
                            <button onClick={() => { setMode('register'); setError(''); }} className="text-sm tracking-widest hover:text-[#E8E2D7] text-[#A89C86]">
                                CREATE ACCOUNT
                            </button>
                        </div>
                    </div>
                )}

                {(mode === 'register' || mode === 'login') && (
                    <form onSubmit={mode === 'register' ? handleRegisterSubmit : handleLoginSubmit} className="flex flex-col gap-6 w-full max-w-xs mx-auto">
                        <div className="flex flex-col gap-4">
                            <input 
                                type="text" 
                                placeholder={(t as any).enterName || "USERNAME"}
                                value={inputId}
                                onChange={e => setInputId(e.target.value)}
                                className="w-full bg-transparent border-b border-[#A89C86]/50 p-2 text-[#E8E2D7] focus:outline-none focus:border-[#E8E2D7] text-center text-sm tracking-widest placeholder:text-[#A89C86]/30"
                                autoFocus
                                disabled={loading}
                            />
                            <input 
                                type="password" 
                                placeholder={(t as any).password || "PASSWORD"}
                                value={inputPassword}
                                onChange={e => setInputPassword(e.target.value)}
                                className="w-full bg-transparent border-b border-[#A89C86]/50 p-2 text-[#E8E2D7] focus:outline-none focus:border-[#E8E2D7] text-center text-sm tracking-widest placeholder:text-[#A89C86]/30"
                                disabled={loading}
                            />
                        </div>
                        {error && <p className="text-red-900 text-sm text-center">{error}</p>}
                        
                        <button type="submit" disabled={loading} className="w-full py-2 border-b border-[#A89C86] hover:border-[#E8E2D7] text-[#E8E2D7] tracking-widest transition-all">
                            {loading ? "..." : (mode === 'register' ? 'SUBMIT' : 'SIGN IN')}
                        </button>
                        
                        <div className="flex items-center justify-center gap-4 my-2 opacity-30">
                            <div className="h-px w-full bg-[#A89C86]" />
                            <span className="text-[10px] uppercase tracking-widest text-[#A89C86]">OR</span>
                            <div className="h-px w-full bg-[#A89C86]" />
                        </div>
                        
                        <div className="flex flex-col gap-3">
                            <button 
                                type="button" 
                                onClick={async () => {
                                    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
                                }} 
                                className="w-full py-2 border border-[#A89C86]/30 hover:border-[#E8E2D7] text-[#E8E2D7] text-xs tracking-widest transition-all flex items-center justify-center gap-3"
                            >
                                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-3 h-3 grayscale opacity-70" />
                                GOOGLE
                            </button>
                            <button 
                                type="button" 
                                onClick={async () => {
                                    await supabase.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: window.location.origin } });
                                }} 
                                className="w-full py-2 border border-[#A89C86]/30 hover:border-[#E8E2D7] text-[#E8E2D7] text-xs tracking-widest transition-all flex items-center justify-center gap-3"
                            >
                                <img src="https://www.svgrepo.com/show/353655/discord-icon.svg" alt="Discord" className="w-3 h-3 grayscale opacity-70" />
                                DISCORD
                            </button>
                        </div>
                        
                        <button type="button" onClick={() => setMode('select')} disabled={loading} className="text-[#A89C86] hover:text-[#E8E2D7] text-xs tracking-widest mt-4">
                            CANCEL
                        </button>
                    </form>
                )}
            </div>
            
            <div className="absolute bottom-0 w-full z-20">
                <AdBanner />
            </div>
        </div>
    );
}
