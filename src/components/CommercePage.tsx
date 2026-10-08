'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Capacitor } from '@capacitor/core';
import { useAppPlatform } from '../hooks/useAppPlatform';
import { LANGUAGES, dict, type Language } from '../locales/dict';
import { stripeMembershipText } from '../locales/stripeMembershipText';
import { CommerceDisclosureDocument } from './CommerceDisclosureDocument';

/** Android must not turn a commercial route into an external-purchase link. */
export function CommercePage() {
    const { webContent } = useAppPlatform();
    const [lang, setLang] = useState<Language>('ja');
    useEffect(() => {
        try { const saved = localStorage.getItem('qg_language'); if (LANGUAGES.some(item => item.code === saved)) setLang(saved as Language); } catch { /* Optional storage. */ }
    }, []);
    if (!webContent || Capacitor.isNativePlatform()) return null;
    return <main lang={lang} className="game-page">
        <div className="game-page-content space-y-6">
            <header className="game-page-header">
            <Link href="/" className="text-[#D4B872]">← Q-Gambit</Link>
            <select aria-label={dict[lang].language} className="max-w-full rounded border border-[#B39A62] bg-[#191714] p-2" value={lang} onChange={event => setLang(event.target.value as Language)}>
                {LANGUAGES.map(({code,label}) => <option key={code} value={code}>{label}</option>)}
            </select>
            </header>
            <CommerceDisclosureDocument lang={lang}/>
            <Link href="/terms/" className="mr-6 underline">{stripeMembershipText(lang).terms}</Link>
            <Link href="/privacy/" className="underline">{dict[lang].privacyPolicy}</Link>
        </div>
    </main>;
}
