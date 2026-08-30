'use client';
import React, { useState } from 'react';
import { User } from '../types/game';
import { dict, Language } from '../locales/dict';
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
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#1E1C19] text-[#E8E5DF] p-4 font-sans">
            <div className="text-center mb-12">
                <h1 className="text-6xl md:text-8xl font-serif text-[#D4B872] drop-shadow-lg">
                    {t.title}
                </h1>
                <p className="mt-4 text-xl tracking-widest text-[#E8E5DF]/80 font-serif">{t.subtitle}</p>
            </div>

            <div className="w-full max-w-md p-8 bg-[#2A2621] border border-[#4A4238] rounded-xl shadow-2xl">
                {mode === 'select' && (
                    <div className="flex flex-col gap-4">
                        <button onClick={handleGuest} className="w-full py-3 px-6 bg-[#3B342C] border border-[#4A4238] hover:bg-[#4A4238] transition-all text-[#D4B872] font-bold tracking-widest uppercase">
                            {t.guestLogin}
                        </button>
                        <button onClick={() => { setMode('register'); setError(''); }} className="w-full py-3 px-6 bg-[#3B342C] border border-[#4A4238] hover:bg-[#4A4238] transition-all text-[#D4B872] font-bold tracking-widest uppercase">
                            {t.createAccount}
                        </button>
                        <button onClick={() => { setMode('login'); setError(''); }} className="w-full py-3 px-6 bg-[#3B342C] border border-[#4A4238] hover:bg-[#4A4238] transition-all text-[#D4B872] font-bold tracking-widest uppercase">
                            {t.login}
                        </button>
                    </div>
                )}

                {(mode === 'register' || mode === 'login') && (
                    <form onSubmit={mode === 'register' ? handleRegisterSubmit : handleLoginSubmit} className="flex flex-col gap-4">
                        <input 
                            type="text" 
                            placeholder={(t as any).enterName || "Account ID"}
                            value={inputId}
                            onChange={e => setInputId(e.target.value)}
                            className="w-full bg-[#1E1C19] border border-[#4A4238] p-3 text-[#E8E5DF] focus:outline-none focus:border-[#D4B872] text-center text-xl font-mono"
                            autoFocus
                            disabled={loading}
                        />
                        <input 
                            type="password" 
                            placeholder={(t as any).password || "Password"}
                            value={inputPassword}
                            onChange={e => setInputPassword(e.target.value)}
                            className="w-full bg-[#1E1C19] border border-[#4A4238] p-3 text-[#E8E5DF] focus:outline-none focus:border-[#D4B872] text-center text-xl font-mono"
                            disabled={loading}
                        />
                        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                        <button type="submit" disabled={loading} className="w-full py-3 bg-[#4A4238] hover:bg-[#5C5346] text-[#E8E5DF] font-bold tracking-widest transition-all">
                            {loading ? "..." : (mode === 'register' ? t.submit : t.login)}
                        </button>
                        <button type="button" onClick={() => setMode('select')} disabled={loading} className="text-[#D4B872]/80 hover:text-[#D4B872] text-sm mt-2">
                            {t.back}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
