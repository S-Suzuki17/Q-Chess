'use client';
import React, { useState } from 'react';
import { matchText } from '../locales/matchText';
import { User } from '../types/game';
import { circuitAccess } from '../lib/circuitAccess';
import { dict, Language } from '../locales/dict';
import { supabase } from '../lib/supabaseClient';
import { requestRankedSession } from '../lib/rankedSession';
import { registerAccount } from '../lib/accountSecurity';
import { AccountProfileError } from '../lib/accountProfile';
import { accountSecurityText } from '../locales/accountSecurityText';
import { AccountRecoveryPanel } from './AccountRecoveryPanel';
import Link from 'next/link';
import './title-screen.css';
import { ArrowUpRight, ChevronRight } from 'lucide-react';

import { Capacitor } from '@capacitor/core';
import { useAppPlatform } from '../hooks/useAppPlatform';
import { Browser } from '@capacitor/browser';

interface TitleScreenProps {
    lang: Language;
    onLogin: (u: User, attempt?:number) => void;
    initialMode?:'select'|'login';
}

export function TitleScreen({ lang, onLogin, initialMode='select' }: TitleScreenProps) {
    const { android, webContent } = useAppPlatform();
    const t = { ...dict['en'], ...(dict[lang] || {}) } as any;
    const [mode, setMode] = useState<'select' | 'register' | 'login' | 'rules'>(initialMode);
    const mounted=React.useRef(false);
    const loginRequest=React.useRef<AbortController|null>(null);
    React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;loginRequest.current?.abort();};},[]);
    const [inputId, setInputId] = useState('');
    const [inputPassword, setInputPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleOAuthLogin = async (provider: 'google' | 'discord') => {
        if (loading) return;
        loginRequest.current?.abort();
        setLoading(true);setError('');
        try {
            const native = Capacitor.isNativePlatform();
            const { data, error: authError } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: native ? 'qgambit://login-callback' : window.location.origin,
                    skipBrowserRedirect: native,
                },
            });
            if (authError) throw authError;
            if (native && data?.url) {
                await Browser.open({ url: data.url });
            }
        } catch { if (mounted.current) setError(matchText(lang,'ログインできませんでした。もう一度お試しください。','Sign-in failed. Please try again.')); }
        finally { if (mounted.current) setLoading(false); }
    };

    const handleGuest = () => {
        const guestId = `GUEST-${crypto.randomUUID()}`;
        onLogin({ id: guestId, name: 'Guest', type: 'guest' });
    };

    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;
        setError('');
        if (!inputId.trim() || !inputPassword.trim()) {
            setError(matchText(lang, 'IDとパスワードを入力してください。', 'Please enter ID and Password.'));
            return;
        }
        if (!/^[a-zA-Z0-9]{3,15}$/.test(inputId)||[...inputPassword].length<12||new TextEncoder().encode(inputPassword).length>72) {
            setError(accountSecurityText(lang,'rules'));
            return;
        }

        setLoading(true);
        const attempt=circuitAccess.beginAuthentication();
        loginRequest.current?.abort();
        const request=new AbortController();loginRequest.current=request;
        try {
            await registerAccount(inputId,inputPassword,request.signal);
            if (!mounted.current || request.signal.aborted) return;
            try{await requestRankedSession(inputId, inputPassword, AbortSignal.any([request.signal,AbortSignal.timeout(15000)]));}
            catch{if(mounted.current&&!request.signal.aborted){setMode('login');setError(accountSecurityText(lang,'registered'));}return;}
            if(mounted.current && !request.signal.aborted)onLogin({ id: inputId, name: inputId, type: 'registered' },attempt);
        } catch (err) {
            if(mounted.current&&!request.signal.aborted)setError(accountSecurityText(lang,err instanceof AccountProfileError&&err.code==='INVALID_REQUEST'?'rules':'failed'));
        } finally {
            if(mounted.current)setLoading(false);
        }
    };

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;
        setError('');
        if (!inputId.trim() || !inputPassword.trim()) {
            setError(matchText(lang, 'IDとパスワードを入力してください。', 'Please enter ID and Password.'));
            return;
        }

        setLoading(true);
        const attempt=circuitAccess.beginAuthentication();
        loginRequest.current?.abort();
        const request=new AbortController();loginRequest.current=request;
        try {
            await requestRankedSession(inputId, inputPassword, AbortSignal.any([request.signal,AbortSignal.timeout(30000)]));
            if(mounted.current && !request.signal.aborted)onLogin({ id: inputId, name: inputId, type: 'registered' },attempt);
        } catch (err) {
            if(mounted.current&&!request.signal.aborted)setError(matchText(lang,'ログインに失敗しました','Login failed.'));
        } finally {
            if(mounted.current)setLoading(false);
        }
    };

    return (
        <div className="title-screen flex flex-col items-center w-full bg-transparent text-[#E8E2D7] font-sans selection:bg-[#B39A62]/30">
            {/* Minimal Board Pattern Background */}
            <div className="title-screen-heading relative z-10">
                <div className="title-edition"><span aria-hidden="true">◌</span>{t.subtitle}</div>
                <h1 className="font-serif text-[#E8E2D7] mb-4">
                    <span>Q</span>-GAMBIT
                </h1>
                <p className="text-xs md:text-sm tracking-[0.4em] text-[#A89C86] font-light uppercase">{(t as any)?.subtitle2 || "A game of hidden identity"}</p>
                <div className="title-identities" aria-hidden="true">{['♔','♕','♖','♗','♘','♙'].map(symbol=><span key={symbol}>{symbol}</span>)}</div>
            </div>

            <div className="title-screen-actions relative z-10 w-full flex flex-col gap-6">
                {mode === 'select' && (
                    <div className="flex flex-col gap-4">
                        <button onClick={handleGuest} className="title-play">{(t as any)?.guestLogin || "PLAY AS GUEST"}<ArrowUpRight size={24} aria-hidden="true"/></button>
                        
                        <div className="title-auth-actions flex flex-col gap-3 mt-4">
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
                                maxLength={mode==='register'?15:128}
                                autoComplete="username"
                                aria-label={t.enterName||'ID'}
                                onChange={e => setInputId(e.target.value)}
                                className="w-full bg-[#11100E] border border-[#A89C86]/30 p-3 text-[#E8E2D7] focus:outline-none focus:border-[#B39A62] text-sm tracking-widest placeholder:text-[#A89C86]/30"
                                autoFocus
                                disabled={loading}
                            />
                            <input 
                                type="password" 
                                placeholder={(t as any).password || "PASSWORD"}
                                value={inputPassword}
                                autoComplete={mode==='register'?'new-password':'current-password'}
                                aria-label={t.password||'Password'}
                                onChange={e => setInputPassword(e.target.value)}
                                className="w-full bg-[#11100E] border border-[#A89C86]/30 p-3 text-[#E8E2D7] focus:outline-none focus:border-[#B39A62] text-sm tracking-widest placeholder:text-[#A89C86]/30"
                                disabled={loading}
                            />
                        </div>
                        {mode==='register'&&<p className="text-sm text-[#A89C86]">{accountSecurityText(lang,'rules')}</p>}
                        {error && <p role="alert" className="text-red-400 text-sm text-center bg-red-950/50 p-2 border border-red-900/50">{error}</p>}
                        
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
                {mode==='login'&&<AccountRecoveryPanel lang={lang}/>}
            </div>
            
            {/* SEO & User Content Section for AdSense Quality */}
            <div className="title-screen-description relative w-full z-10 flex flex-col items-center max-w-2xl text-center">
                <p className="text-gray-400 text-xs md:text-sm mb-2 font-sans pointer-events-none">
                    {(t as any)?.seoDesc || 'Q-GAMBIT is a revolutionary Quantum Chess experience where pieces exist in a state of superposition. Master the art of information warfare and quantum collapse.'}
                </p>
                <div className="flex gap-4">
                    {android ? <a href="https://q-gambit.com/rules/" target="_blank" rel="noopener noreferrer" className="title-rules">
                        {t.rulesGuide || 'READ RULES & STRATEGY GUIDE'}
                        <ChevronRight size={17} aria-hidden="true"/>
                    </a> : <Link href="/rules" className="title-rules">
                        {(t as any)?.rulesGuide || 'READ RULES & STRATEGY GUIDE'}
                        <ChevronRight size={17} aria-hidden="true"/>
                    </Link>}
                </div>
            </div>

            {webContent && <div className="title-badge relative w-full z-10 flex flex-col items-center pointer-events-none">
                <div className="mb-2 opacity-20 hover:opacity-100 grayscale hover:grayscale-0 transition-all duration-300 pointer-events-auto">
                    <a href="https://pixelpicked.com/game/7TmlOxj21Ub/q-gambit/" target="_blank" rel="noopener noreferrer">
                        <img src="https://api.pixelpicked.com/api/badges/7TmlOxj21Ub/live.png?theme=dark"
                            width="100" alt="Approved on PixelPicked" className="h-auto" onError={event => { event.currentTarget.hidden = true; }} />
                    </a>
                </div>
            </div>}
        </div>
    );
}
