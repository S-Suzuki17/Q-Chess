'use client';
import React, { useState } from 'react';
import { matchText } from '../locales/matchText';
import { User } from '../types/game';
import { dict, Language } from '../locales/dict';
import { clearOAuthLoginIntent } from '../lib/oauthLoginIntent';
import {startGoogleSignIn} from '../lib/googleAccount';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { learningEntryText } from '../locales/learningEntryText';
import { useAndroidBackHandler } from '../hooks/useAndroidBack';
import './title-screen.css';
import { ArrowUpRight, BookOpen, ChevronRight } from 'lucide-react';

import { CommunityFeed } from './CommunityFeed';
import { LandingGamePreview } from './LandingGamePreview';
import { useAppPlatform } from '../hooks/useAppPlatform';

const InteractiveTutorial = dynamic(() => import('./InteractiveTutorial').then(module => module.InteractiveTutorial), { ssr: false });

interface TitleScreenProps {
    lang: Language;
    onLogin: (u: User, attempt?:number) => void;
    onQuickPractice?: () => void;
    onOAuthStart?: () => void;
    onOAuthCancel?: () => void;
    onOAuthError?: () => void;
    initialMode?:'select'|'login';
}

export function TitleScreen({ lang, onLogin, initialMode='select', onQuickPractice, onOAuthStart, onOAuthCancel, onOAuthError }: TitleScreenProps) {
    const { android, webContent } = useAppPlatform();
    const t = { ...dict['en'], ...(dict[lang] || {}) } as any;
    const [mode, setMode] = useState<'select' | 'login'>(initialMode);
    const [showTutorial, setShowTutorial] = useState(false);
    useAndroidBackHandler(() => {
        if (!showTutorial) return false;
        setShowTutorial(false);
        return true;
    }, 50);
    const authDialog=React.useRef<HTMLDialogElement>(null);
    const authTrigger=React.useRef<HTMLElement|null>(null);
    const mounted=React.useRef(false);
    const [error,setError]=useState(''),[loading,setLoading]=useState(false);
    const formId=React.useId();
    React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
    React.useEffect(()=>{
        if(mode!=='login')return;
        const node=authDialog.current;if(!node)return;node.showModal();
        return()=>{node.close();authTrigger.current?.focus({preventScroll:true});};
    },[mode]);
    const changeMode=(next:typeof mode)=>{
        if(mode==='select')authTrigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
        setError('');setMode(next);
    };
    const cancelAuthentication=()=>{onOAuthCancel?.();changeMode('select');};
    const handleOAuthLogin=async()=>{
        if(loading)return;setLoading(true);setError('');onOAuthStart?.();
        try{await startGoogleSignIn();}
        catch{if(onOAuthError)onOAuthError();else onOAuthCancel?.();if(mounted.current)setError(matchText(lang,'ログインできませんでした。もう一度お試しください。','Sign-in failed. Please try again.'));}
        finally{if(mounted.current)setLoading(false);}
    };
    const handleGuest=()=>{
        clearOAuthLoginIntent();onLogin({id:'GUEST-'+crypto.randomUUID(),name:'Guest',type:'guest'});
    };
    const handleQuickPractice=()=>{clearOAuthLoginIntent();if(onQuickPractice)onQuickPractice();else handleGuest();};

    return (
        <div data-entry-mode={mode} className="title-screen flex flex-col items-center w-full bg-transparent text-[#E8E2D7] font-sans selection:bg-[#B39A62]/30">
            <div className="title-screen-heading relative z-10">
                <div className="title-edition"><span aria-hidden="true">◌</span>{t.subtitle}</div>
                <h1 className="font-serif text-[#E8E2D7] mb-4">
                    <span>Q</span>-GAMBIT
                </h1>
            </div>

            <div className="title-screen-actions relative z-10 w-full flex flex-col gap-6">
                {(
                    <div className="flex flex-col gap-4">
                        <div className="title-auth-actions">
                            <button type="button" onClick={()=>changeMode('login')} className="title-login-primary" aria-haspopup="dialog">
                                {lang==='ja'?'Googleでログイン・新規登録':'Sign in or join with Google'}<ArrowUpRight size={24} aria-hidden="true"/>
                            </button>
                        </div>
                        <button type="button" onClick={handleGuest} className="title-play">{(t as any)?.guestLogin || "PLAY AS GUEST"}<ArrowUpRight size={24} aria-hidden="true"/></button>
                        <button type="button" onClick={handleQuickPractice} className="title-practice-direct">
                            <span>{t.practiceVsCpu || (lang === 'ja' ? 'CPUで練習' : 'PRACTICE VS CPU')}</span>
                            <ArrowUpRight size={24} aria-hidden="true"/>
                        </button>
                        <button type="button" data-open-tutorial className="title-learn-direct"
                            aria-haspopup="dialog" onClick={() => setShowTutorial(true)}>
                            <BookOpen size={24} aria-hidden="true"/>
                            <span><strong>{learningEntryText[lang].title}</strong></span>
                            <ChevronRight size={20} aria-hidden="true"/>
                        </button>
                        {android ? (
                            <a href="https://q-gambit.com/rules/" target="_blank" rel="noopener noreferrer" className="title-tutorial">
                                {t.rulesButton}<ChevronRight size={24} aria-hidden="true"/>
                            </a>
                        ) : (
                            <Link href="/rules/" className="title-tutorial">
                                {t.rulesButton}<ChevronRight size={24} aria-hidden="true"/>
                            </Link>
                        )}
                    </div>
                )}

                {mode==='login'&&<dialog ref={authDialog} className="title-auth-dialog" aria-labelledby={formId+'-title'} onCancel={event=>{event.preventDefault();cancelAuthentication();}}>
                    <header><h2 id={formId+'-title'}>{t.login}</h2><button type="button" onClick={cancelAuthentication} aria-label={t.cancel}>×</button></header>
                    <div className="title-auth-scroll space-y-5 p-5">
                        <p>{lang==='ja'?'Googleで認証後、初回だけユーザー名・Q-Gambit用パスワードを設定し、利用規約に同意します。':'Sign in with Google, then choose your username and Q-Gambit password and agree to the terms on your first visit.'}</p>
                        <p>{lang==='ja'?'次回からはログイン状態を復元して直接入れます。以前のアカウントはGoogle認証後に引き継げます。':'Your saved Google session opens the game directly next time. You can link an existing account after Google sign-in.'}</p>
                        {error&&<p role="alert" className="text-red-200">{error}</p>}
                        <button type="button" disabled={loading} onClick={()=>void handleOAuthLogin()} className="min-h-11 w-full rounded border border-[#A89C86]/50 bg-white/10 p-3">
                            {loading?'…':lang==='ja'?'Googleで続ける':'Continue with Google'}</button>
                    </div>
                    <footer><button type="button" onClick={cancelAuthentication}>{t.cancel}</button></footer>
                </dialog>}
            </div>
            <LandingGamePreview lang={lang} />
            
            <div className="title-screen-description relative w-full z-10 flex flex-col items-center max-w-2xl text-center">
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
