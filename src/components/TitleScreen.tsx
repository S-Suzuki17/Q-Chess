'use client';
import React, { useState } from 'react';
import { User } from '../types/game';
import { dict, Language } from '../locales/dict';
import { AdBanner } from './AdBanner';
import { supabase } from '../lib/supabaseClient';
import Link from 'next/link';

import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

interface TitleScreenProps {
    lang: Language;
    onLogin: (u: User) => void;
}

export function TitleScreen({ lang, onLogin }: TitleScreenProps) {
    const t = { ...dict['en'], ...(dict[lang] || {}) } as any;
    const [mode, setMode] = useState<'select' | 'register' | 'login' | 'rules'>('select');
    const [inputId, setInputId] = useState('');
    const [inputPassword, setInputPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    React.useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            CapApp.addListener('appUrlOpen', async (data) => {
                if (data.url.includes('qgambit://login-callback')) {
                    await Browser.close().catch(() => {});
                    const url = new URL(data.url);
                    const code = url.searchParams.get('code');
                    if (code) {
                        await supabase.auth.exchangeCodeForSession(code);
                    }
                    const hash = url.hash;
                    if (hash) {
                        const params = new URLSearchParams(hash.substring(1));
                        const accessToken = params.get('access_token');
                        const refreshToken = params.get('refresh_token');
                        if (accessToken && refreshToken) {
                            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
                        }
                    }
                }
            });
        }
    }, []);

    const handleOAuthLogin = async (provider: 'google' | 'discord') => {
        if (Capacitor.isNativePlatform()) {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: 'qgambit://login-callback',
                    skipBrowserRedirect: true,
                },
            });
            if (data?.url) {
                await Browser.open({ url: data.url });
            }
        } else {
            await supabase.auth.signInWithOAuth({
                provider,
                options: { redirectTo: window.location.origin },
            });
        }
    };

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
        <div className="flex flex-col items-center justify-center w-full h-full bg-transparent text-[#E8E2D7] p-4 font-sans selection:bg-[#B39A62]/30 overflow-hidden">
            {/* Minimal Board Pattern Background */}
            <div className="relative z-10 text-center mb-16">
                <h1 className="text-5xl md:text-7xl font-serif text-[#E8E2D7] tracking-[0.2em] mb-4">
                    Q-GAMBIT
                </h1>
                <p className="text-xs md:text-sm tracking-[0.4em] text-[#A89C86] font-light uppercase">{(t as any)?.subtitle2 || "A game of hidden identity"}</p>
                
                
            </div>

            <div className="relative z-10 w-full max-w-sm flex flex-col gap-6">
                {mode === 'select' && (
                    <div className="flex flex-col gap-4">
                        <button onClick={handleGuest} className="w-full py-4 bg-[#191714] border border-[#B39A62]/50 hover:bg-[#B39A62] hover:text-[#11100E] transition-colors text-lg tracking-[0.2em] text-[#B39A62]">{(t as any)?.guestLogin || "PLAY AS GUEST"}</button>
                        
                        <div className="flex flex-col gap-3 mt-4">
                            <button onClick={() => { setMode('login'); setError(''); }} className="w-full py-3 bg-[#191714]/80 border border-[#A89C86]/30 hover:bg-[#A89C86]/20 transition-colors text-sm tracking-widest text-[#E8E2D7]">{(t as any)?.login || "SIGN IN"}</button>
                            <button onClick={() => { setMode('register'); setError(''); }} className="w-full py-3 bg-transparent border border-[#A89C86]/30 hover:bg-[#A89C86]/10 transition-colors text-sm tracking-widest text-[#E8E2D7]">{(t as any)?.createAccount || "CREATE ACCOUNT"}</button>
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
                            {loading ? "..." : (mode === "register" ? ((t as any)?.submit || "SUBMIT") : ((t as any)?.login || "SIGN IN"))}
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
                                    await handleOAuthLogin('google');
                                }} 
                                className="w-full py-3 bg-white/5 hover:bg-white/10 border border-[#A89C86]/30 text-[#E8E2D7] text-xs tracking-widest transition-colors flex items-center justify-center gap-3"
                            >
                                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-4 h-4" />
                                GOOGLE
                            </button>
                            <button 
                                type="button" 
                                onClick={async () => {
                                    await handleOAuthLogin('discord');
                                }} 
                                className="w-full py-3 bg-[#5865F2]/10 hover:bg-[#5865F2]/20 border border-[#A89C86]/30 text-[#E8E2D7] text-xs tracking-widest transition-colors flex items-center justify-center gap-3"
                            >
                                <img src="https://www.svgrepo.com/show/353655/discord-icon.svg" alt="Discord" className="w-4 h-4" />
                                DISCORD
                            </button>
                        </div>
                        
                        <button type="button" onClick={() => setMode('select')} disabled={loading} className="text-[#A89C86] hover:text-[#E8E2D7] text-xs tracking-widest mt-2">{(t as any)?.cancel || "CANCEL"}</button>
                    </form>
                )}
            </div>
            
            {/* SEO & User Content Section for AdSense Quality */}
            <div className="absolute bottom-16 w-full z-[100] flex flex-col items-center max-w-2xl px-6 text-center pointer-events-auto">
                <p className="text-gray-400 text-xs md:text-sm mb-2 font-sans pointer-events-none">
                    Q-GAMBIT is a revolutionary Quantum Chess experience where pieces exist in a state of superposition. Master the art of information warfare and quantum collapse.
                </p>
                <div className="flex gap-4">
                    <Link href="/rules" className="text-[#D4B872] hover:text-white transition-colors text-sm font-bold tracking-widest underline underline-offset-4 decoration-[#D4B872]/50 hover:decoration-white relative z-[200] cursor-pointer">
                        READ RULES & STRATEGY GUIDE
                    </Link>
                </div>
            </div>

            <div className="absolute bottom-2 w-full z-20 flex flex-col items-center pointer-events-none">
                <div className="mb-2 opacity-20 hover:opacity-100 grayscale hover:grayscale-0 transition-all duration-300 pointer-events-auto">
                    <a href="https://pixelpicked.com/game/7TmlOxj21Ub/q-gambit/" target="_blank" rel="noopener noreferrer">
                        <img src="https://api.pixelpicked.com/api/badges/7TmlOxj21Ub/live.png?theme=dark"
                            width="100" alt="Approved on PixelPicked" className="h-auto" />
                    </a>
                </div>
            </div>
        </div>
    );
}
