'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useAppPlatform } from '../hooks/useAppPlatform';
import { LANGUAGES, dict, type Language } from '../locales/dict';
import { siteCopy } from '../locales/siteContent';

export function WebOnlyPage({ path, children }: { path: string; children: ReactNode }) {
    const { webContent } = useAppPlatform();
    const [lang, setLang] = useState<Language>('en');
    useEffect(() => {
        try { const value = localStorage.getItem('qg_language'); if (LANGUAGES.some(l => l.code === value)) setLang(value as Language); } catch { /* Storage is optional. */ }
    }, []);
    if (webContent) return children;
    const { labels } = siteCopy(lang);
    const title = path === '/privacy/' ? dict[lang].privacyPolicy :
        labels[path === '/rules/' ? 3 : path === '/about/' ? 0 : path === '/contact/' ? 1 : 2];
    return <section data-external-site-page className="min-h-screen bg-[#11100E] p-8 text-[#D4B872]">
        <Link href="/">← {labels[6]}</Link>
        <a className="mt-10 block underline" href={`https://q-gambit.com${path}`} target="_blank" rel="noopener noreferrer">{title} ↗</a>
    </section>;
}
