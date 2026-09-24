'use client';
import { PUBLIC_SUPPORT_EMAIL } from '../config/publicContact';
import { dict, type Language } from '../locales/dict';
import {termsText} from '../locales/termsText';

/** Keep required policy/contact access without embedding the Web-only corner. */
export function AppSupportLinks({ lang }: { lang: Language }) {
    return <nav data-app-support className="flex flex-wrap justify-center gap-5 px-4 py-5 text-sm text-[#D4B872]">
        <a href="https://q-gambit.com/terms/" target="_blank" rel="noopener noreferrer">{termsText(lang)[0]}</a>
        <a href="https://q-gambit.com/privacy/" target="_blank" rel="noopener noreferrer">{dict[lang].privacyPolicy}</a>
        <a href={`mailto:${PUBLIC_SUPPORT_EMAIL}`}>{PUBLIC_SUPPORT_EMAIL}</a>
    </nav>;
}
