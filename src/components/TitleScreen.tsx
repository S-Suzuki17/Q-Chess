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
            <div className="relative z-10 text-center mb-16">
                <h1 className="text-5xl md:text-7xl font-serif text-[#E8E2D7] tracking-[0.2em] mb-4">
                    Q-GAMBIT
                </h1>
                <p className="text-xs md:text-sm tracking-[0.4em] text-[#A89C86] font-light uppercase">
                    A game of hidden identity
                </p>
            </div>

            <div className="relative z-10 w-full max-w-sm flex flex-col gap-6">
                {mode === 'select' && (
                    <div className="flex flex-col gap-4">
                        <button onClick={handleGuest} className="w-full py-4 bg-[#191714] border border-[#B39A62]/50 hover:bg-[#B39A62] hover:text-[#11100E] transition-colors text-lg tracking-[0.2em] text-[#B39A62]">
                            PLAY AS GUEST
                        </button>
                        
                        <div className="flex flex-col gap-3 mt-4">
                            <button onClick={() => { setMode('login'); setError(''); }} className="w-full py-3 bg-[#191714]/80 border border-[#A89C86]/30 hover:bg-[#A89C86]/20 transition-colors text-sm tracking-widest text-[#E8E2D7]">
                                SIGN IN
                            </button>
                            <button onClick={() => { setMode('register'); setError(''); }} className="w-full py-3 bg-transparent border border-[#A89C86]/30 hover:bg-[#A89C86]/10 transition-colors text-sm tracking-widest text-[#E8E2D7]">
                                CREATE ACCOUNT
                            </button>
                        </div>
                    </div>
                )}

                {(mode === 'register' || mode === 'login') && (
                    <form onSubmit={mode === 'register' ? handleRegisterSubmit : handleLoginSubmit} className="flex flex-col gap-6 w-full mx-auto p-6 bg-[#191714] border border-[#A89C86]/30">
                        <div className="flex flex-col gap-4">
                            <input 
                                type="text" 
                                placeholder={(t as any).enterName || "USERNAME"}
                                value={inputId}
                                onChange={e => setInputId(e.target.value)}
                                className="w-full bg-[#11100E] border border-[#A89C86]/30 p-3 text-[#E8E2D7] focus:outline-none focus:border-[#B39A62] text-sm tracking-widest placeholder:text-[#A89C86]/30"
                                autoFocus
                                disabled={loading}
                            />
                            <input 
                                type="password" 
                                placeholder={(t as any).password || "PASSWORD"}
                                value={inputPassword}
                                onChange={e => setInputPassword(e.target.value)}
                                className="w-full bg-[#11100E] border border-[#A89C86]/30 p-3 text-[#E8E2D7] focus:outline-none focus:border-[#B39A62] text-sm tracking-widest placeholder:text-[#A89C86]/30"
                                disabled={loading}
                            />
                        </div>
                        {error && <p className="text-red-400 text-sm text-center bg-red-950/50 p-2 border border-red-900/50">{error}</p>}
                        
                        <button type="submit" disabled={loading} className="w-full py-3 bg-[#B39A62] hover:bg-[#D0C8B6] text-[#11100E] font-bold tracking-widest transition-colors mt-2">
                            {loading ? "..." : (mode === 'register' ? 'SUBMIT' : 'SIGN IN')}
                        </button>
                        
                        <div className="flex items-center justify-center gap-4 my-2 opacity-50">
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
                                className="w-full py-3 bg-white/5 hover:bg-white/10 border border-[#A89C86]/30 text-[#E8E2D7] text-xs tracking-widest transition-colors flex items-center justify-center gap-3"
                            >
                                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-4 h-4" />
                                GOOGLE
                            </button>
                            <button 
                                type="button" 
                                onClick={async () => {
                                    await supabase.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: window.location.origin } });
                                }} 
                                className="w-full py-3 bg-[#5865F2]/10 hover:bg-[#5865F2]/20 border border-[#A89C86]/30 text-[#E8E2D7] text-xs tracking-widest transition-colors flex items-center justify-center gap-3"
                            >
                                <img src="https://www.svgrepo.com/show/353655/discord-icon.svg" alt="Discord" className="w-4 h-4" />
                                DISCORD
                            </button>
                        </div>
                        
                        <button type="button" onClick={() => setMode('select')} disabled={loading} className="text-[#A89C86] hover:text-[#E8E2D7] text-xs tracking-widest mt-2">
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
