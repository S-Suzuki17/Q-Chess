'use client';
import React, { useState } from 'react';
import { matchText } from '../locales/matchText';
import { User } from '../types/game';
import { circuitAccess } from '../lib/circuitAccess';
import { dict, Language } from '../locales/dict';
import { supabase } from '../lib/supabaseClient';
import { beginOAuthLoginIntent, clearOAuthLoginIntent } from '../lib/oauthLoginIntent';
import { requestRankedSession, RankedLoginError } from '../lib/rankedSession';
import { registerAccount, AccountRegistrationError } from '../lib/accountSecurity';
import { accountSecurityText } from '../locales/accountSecurityText';
import { registrationFieldText, registrationFormText } from '../locales/registrationValidationText';
import { authFormText } from '../locales/authFormText';
import { registrationFormIssues, type RegistrationIssue, type RegistrationField } from '../../server/src/services/RegistrationValidation';
import { AccountRecoveryPanel } from './AccountRecoveryPanel';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { learningEntryText } from '../locales/learningEntryText';
import { useAndroidBackHandler } from '../hooks/useAndroidBack';
import './title-screen.css';
import { ArrowUpRight, BookOpen, ChevronRight } from 'lucide-react';

import { CommunityFeed } from './CommunityFeed';
import { LandingGamePreview } from './LandingGamePreview';
import { Capacitor } from '@capacitor/core';
import { useAppPlatform } from '../hooks/useAppPlatform';
import { Browser } from '@capacitor/browser';

const InteractiveTutorial = dynamic(() => import('./InteractiveTutorial').then(module => module.InteractiveTutorial), { ssr: false });

interface TitleScreenProps {
    lang: Language;
    onLogin: (u: User, attempt?:number) => void;
    onQuickPractice?: () => void;
    onOAuthStart?: () => void;
    onOAuthCancel?: () => void;
    initialMode?:'select'|'login';
}

export function TitleScreen({ lang, onLogin, initialMode='select', onQuickPractice, onOAuthStart, onOAuthCancel }: TitleScreenProps) {
    const { android, webContent } = useAppPlatform();
    const t = { ...dict['en'], ...(dict[lang] || {}) } as any;
    const [mode, setMode] = useState<'select' | 'register' | 'login' | 'rules'>(initialMode);
    const [showTutorial, setShowTutorial] = useState(false);
    useAndroidBackHandler(() => {
        if (!showTutorial) return false;
        setShowTutorial(false);
        return true;
    }, 50);
    const authDialog=React.useRef<HTMLDialogElement>(null);
    const authTrigger=React.useRef<HTMLElement|null>(null);
    const formText=(key:Parameters<typeof authFormText>[1])=>authFormText(lang,key);
    React.useEffect(()=>{
        if(mode!=='register'&&mode!=='login')return;
        const node=authDialog.current;
        if(!node)return;
        node.showModal();
        return()=>{node.close();authTrigger.current?.focus({preventScroll:true});};
    },[mode]);
    const mounted=React.useRef(false);
    const loginRequest=React.useRef<AbortController|null>(null);
    React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;loginRequest.current?.abort();};},[]);
    const [inputId, setInputId] = useState('');
    const [inputEmail, setInputEmail] = useState('');
    const [inputPassword, setInputPassword] = useState('');
    const [keepLoggedIn, setKeepLoggedIn] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [fieldIssues, setFieldIssues] = useState<RegistrationIssue[]>([]);
    const formId = React.useId();
    const registrationInputs = React.useRef<Partial<Record<RegistrationField, HTMLInputElement | null>>>({});
    const pendingFocus = React.useRef<RegistrationField | null>(null);
    React.useEffect(() => {
        if (!loading && pendingFocus.current) {
            registrationInputs.current[pendingFocus.current]?.focus();
            pendingFocus.current = null;
        }
    }, [fieldIssues, loading]);
    const showFieldIssues = (issues: RegistrationIssue[]) => {
        pendingFocus.current = issues[0]?.field ?? null;
        setFieldIssues(issues);
    };
    const clearFieldIssue = (field: RegistrationField) => setFieldIssues(issues => issues.filter(issue => issue.field !== field));
    const fieldIssue = (field: RegistrationField) => mode === 'register' ? fieldIssues.find(issue => issue.field === field) : undefined;
    const fieldDescription = (field: RegistrationField) => mode !== 'register' ? undefined
        : fieldIssue(field) ? `${formId}-${field}-error` : field === 'email' ? undefined : `${formId}-rules`;
    const fieldError = (field: RegistrationField) => {
        const issue = fieldIssue(field);
        return issue && <p id={`${formId}-${field}-error`} role="alert" className="mt-2 text-red-400 text-sm break-words">{registrationFieldText(lang, issue)}</p>;
    };

    const changeMode = (next: typeof mode) => { if(mode==='select')authTrigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null; clearOAuthLoginIntent(); onOAuthCancel?.(); pendingFocus.current=null; setFieldIssues([]); setError(''); setMode(next); };
    const cancelAuthentication=()=>{loginRequest.current?.abort();setLoading(false);changeMode('select');};

    const handleOAuthLogin = async (provider: 'google' | 'discord') => {
        if (loading) return;
        loginRequest.current?.abort();
        setLoading(true);setError('');
        try {
            beginOAuthLoginIntent();
            onOAuthStart?.();
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
        } catch { clearOAuthLoginIntent(); onOAuthCancel?.(); if (mounted.current) setError(matchText(lang,'ログインできませんでした。もう一度お試しください。','Sign-in failed. Please try again.')); }
        finally { if (mounted.current) setLoading(false); }
    };

    const handleGuest = () => {
        clearOAuthLoginIntent();
        const guestId = `GUEST-${crypto.randomUUID()}`;
        onLogin({ id: guestId, name: 'Guest', type: 'guest' });
    };

    const handleQuickPractice = () => {
        clearOAuthLoginIntent();
        if (onQuickPractice) {
            onQuickPractice();
        } else {
            handleGuest();
        }
    };

    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;
        setError('');
        setFieldIssues([]);
        const username=inputId.trim();
        const issues=registrationFormIssues(inputId,inputPassword,inputEmail,registrationInputs.current.email?.validity.typeMismatch);
        if (issues.length) {
            showFieldIssues(issues);
            return;
        }

        setLoading(true);
        clearOAuthLoginIntent();
        const attempt=circuitAccess.beginAuthentication();
        loginRequest.current?.abort();
        const request=new AbortController();loginRequest.current=request;
        try {
            await registerAccount(username,inputPassword,inputEmail.trim().toLowerCase(),request.signal);
            if (!mounted.current || request.signal.aborted) return;
            try{await requestRankedSession(username, inputPassword, keepLoggedIn, AbortSignal.any([request.signal,AbortSignal.timeout(15000)]));}
            catch{if(mounted.current&&!request.signal.aborted){setInputPassword('');setMode('login');setError(accountSecurityText(lang,'registered'));}return;}
            if(mounted.current && !request.signal.aborted)onLogin({ id: username, name: username, type: 'registered' },attempt);
        } catch (err) {
            if(mounted.current&&!request.signal.aborted){
                if(err instanceof AccountRegistrationError && err.issue) {
                    showFieldIssues([err.issue]);
                } else {
                    const code=err instanceof AccountRegistrationError?err.registrationCode:'UNAVAILABLE';
                    setError(registrationFormText(lang,code==='CONFLICT'?'conflict':code==='INVALID_REQUEST'?'invalid':code==='TRY_LATER'?'tryLater':'unavailable'));
                }
            }
        } finally {
            if(mounted.current)setLoading(false);
        }
    };

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;
        setError('');
        const username=inputId.trim();
        if (!inputId.trim() || !inputPassword.trim()) {
            setError(matchText(lang, 'IDとパスワードを入力してください。', 'Please enter ID and Password.'));
            return;
        }

        setLoading(true);
        clearOAuthLoginIntent();
        const attempt=circuitAccess.beginAuthentication();
        loginRequest.current?.abort();
        const request=new AbortController();loginRequest.current=request;
        try {
            await requestRankedSession(username, inputPassword, keepLoggedIn, AbortSignal.any([request.signal,AbortSignal.timeout(30000)]));
            if(mounted.current && !request.signal.aborted)onLogin({ id: username, name: username, type: 'registered' },attempt);
        } catch (err) {
            if(mounted.current&&!request.signal.aborted)setError(err instanceof RankedLoginError && err.status===401
                ? matchText(lang,'アカウント名またはパスワードが違います。','Incorrect account name or password.')
                : matchText(lang,'ログインサービスを利用できません。時間をおいて再度お試しください。','Sign-in is unavailable. Please try again shortly.'));
        } finally {
            if(mounted.current)setLoading(false);
        }
    };

    return (
        <div data-entry-mode={mode} className="title-screen flex flex-col items-center w-full bg-transparent text-[#E8E2D7] font-sans selection:bg-[#B39A62]/30">
            <div className="title-screen-heading relative z-10">
                <div className="title-edition"><span aria-hidden="true">◌</span>{t.subtitle}</div>
                <h1 className="font-serif text-[#E8E2D7] mb-4">
                    <span>Q</span>-GAMBIT
                </h1>
                <p className="text-xs md:text-sm tracking-[0.4em] text-[#A89C86] font-light uppercase">{(t as any)?.subtitle2 || "A game of hidden identity"}</p>
            </div>

            <LandingGamePreview lang={lang} />

            <div className="title-screen-actions relative z-10 w-full flex flex-col gap-6">
                {(
                    <div className="flex flex-col gap-4">
                        <button type="button" data-open-tutorial className="title-learn-direct"
                            aria-haspopup="dialog" onClick={() => setShowTutorial(true)}>
                            <BookOpen size={24} aria-hidden="true"/>
                            <span><strong>{learningEntryText[lang].title}</strong><small>{learningEntryText[lang].detail}</small></span>
                            <ChevronRight size={20} aria-hidden="true"/>
                        </button>
                        <button type="button" onClick={handleQuickPractice} className="title-practice-direct">
                            <div className="flex flex-col text-left">
                                <span className="font-semibold text-base md:text-lg tracking-wide">{t.practiceVsCpu || (lang === 'ja' ? 'CPUで練習' : 'PRACTICE VS CPU')}</span>
                                <span className="text-xs text-[#aeb2a4] font-normal tracking-normal">{t.practiceVsCpuDesc || (lang === 'ja' ? 'AIボットとすぐに対戦' : 'Instant match vs AI bot')}</span>
                            </div>
                            <ArrowUpRight size={24} aria-hidden="true"/>
                        </button>
                        <button type="button" onClick={handleGuest} className="title-play">{(t as any)?.guestLogin || "PLAY AS GUEST"}<ArrowUpRight size={24} aria-hidden="true"/></button>
                        {android ? (
                            <a href="https://q-gambit.com/rules/" target="_blank" rel="noopener noreferrer" className="title-tutorial">
                                {t.rulesButton}<ChevronRight size={24} aria-hidden="true"/>
                            </a>
                        ) : (
                            <Link href="/rules/" className="title-tutorial">
                                {t.rulesButton}<ChevronRight size={24} aria-hidden="true"/>
                            </Link>
                        )}
                        
                        <div className="title-auth-actions flex flex-col gap-3 mt-4">
                            <button onClick={() => { changeMode('login'); setError(''); }} className="w-full py-3 bg-[#191714]/80 border border-[#A89C86]/30 hover:bg-[#A89C86]/20 transition-colors text-sm tracking-widest text-[#E8E2D7]">{(t as any)?.login || "SIGN IN"}</button>
                            <button onClick={() => { changeMode('register'); setError(''); }} className="w-full py-3 bg-transparent border border-[#A89C86]/30 hover:bg-[#A89C86]/10 transition-colors text-sm tracking-widest text-[#E8E2D7]">{(t as any)?.createAccount || "CREATE ACCOUNT"}</button>
                        </div>
                    </div>
                )}

                {(mode === 'register' || mode === 'login') && (
                    <dialog ref={authDialog} className="title-auth-dialog" aria-labelledby={`${formId}-title`} onCancel={event=>{event.preventDefault();cancelAuthentication();}}>
                    <header><h2 id={`${formId}-title`}>{mode==='register'?t.createAccount:t.login}</h2><button type="button" onClick={cancelAuthentication} aria-label={t.cancel}>×</button></header>
                    <div className="title-auth-scroll">
                    <form id={`${formId}-auth`} noValidate={mode === 'register'} onSubmit={mode === 'register' ? handleRegisterSubmit : handleLoginSubmit} className="flex flex-col gap-4 w-full mx-auto">
                        <div className="flex flex-col gap-4">
                            {mode==='register'&&<div><input type="email" name="email" autoComplete="email" required maxLength={254}
                                ref={element=>{registrationInputs.current.email=element;}}
                                aria-invalid={!!fieldIssue('email')||undefined} aria-describedby={fieldDescription('email')}
                                aria-label={formText('email')} placeholder={formText('email')}
                                value={inputEmail} onChange={e=>{setInputEmail(e.target.value);clearFieldIssue('email');}} disabled={loading}
                                className="w-full bg-[#11100E] border border-[#A89C86]/30 p-3 text-[#E8E2D7] text-sm"/>{fieldError('email')}</div>}
                            <div>
                            <input 
                                type="text" 
                                placeholder={formText('account')}
                                value={inputId}
                                maxLength={128}
                                autoComplete="username"
                                ref={element=>{registrationInputs.current.username=element;}}
                                aria-invalid={!!fieldIssue('username')||undefined} aria-describedby={fieldDescription('username')}
                                name="username" required aria-label={formText('account')}
                                onChange={e => {setInputId(e.target.value);clearFieldIssue('username');}}
                                className="w-full bg-[#11100E] border border-[#A89C86]/30 p-3 text-[#E8E2D7] focus:outline-none focus:border-[#B39A62] text-sm tracking-widest placeholder:text-[#A89C86]/30"
                                autoFocus
                                disabled={loading}
                            />
                            {fieldError('username')}
                            </div>
                            <div>
                            <input 
                                type="password" name="password" required
                                placeholder={formText('password')}
                                value={inputPassword}
                                autoComplete={mode==='register'?'new-password':'current-password'}
                                ref={element=>{registrationInputs.current.password=element;}}
                                aria-invalid={!!fieldIssue('password')||undefined} aria-describedby={fieldDescription('password')}
                                aria-label={formText('password')}
                                onChange={e => {setInputPassword(e.target.value);clearFieldIssue('password');}}
                                className="w-full bg-[#11100E] border border-[#A89C86]/30 p-3 text-[#E8E2D7] focus:outline-none focus:border-[#B39A62] text-sm tracking-widest placeholder:text-[#A89C86]/30"
                                disabled={loading}
                            />
                            {fieldError('password')}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            <input 
                                type="checkbox" 
                                id="keepLoggedIn" 
                                checked={keepLoggedIn} 
                                onChange={e => setKeepLoggedIn(e.target.checked)} 
                                disabled={loading}
                                className="w-4 h-4 accent-[#B39A62]"
                            />
                            <label htmlFor="keepLoggedIn" className="text-sm text-[#A89C86] cursor-pointer">
                                {formText('keep')}
                            </label>
                        </div>
                        {mode==='register'&&<p id={`${formId}-rules`} className="text-sm text-[#A89C86] break-words">{accountSecurityText(lang,'rules')}</p>}
                        {error && <p role="alert" className="text-red-400 text-sm text-center bg-red-950/50 p-2 border border-red-900/50">{error}</p>}
                        
                        
                        <div className="flex items-center justify-center gap-4 my-2 opacity-50">
                            <div className="h-px w-full bg-[#A89C86]" />
                            <span className="text-xs text-[#A89C86]">{formText('or')}</span>
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
                        
                    </form>
                    {mode==='login'&&<AccountRecoveryPanel lang={lang}/>}
                    </div>
                    <footer>
                        <button type="button" onClick={cancelAuthentication}>{t.cancel}</button>
                        <button form={`${formId}-auth`} type="submit" disabled={loading} className="title-auth-submit">{loading?'…':mode==='register'?t.submit:t.login}</button>
                    </footer>
                    </dialog>
                )}
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

            <CommunityFeed lang={lang} />
            {showTutorial && <InteractiveTutorial lang={lang} onClose={() => setShowTutorial(false)}/>}

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
