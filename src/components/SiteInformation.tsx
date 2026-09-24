'use client';
import { PUBLIC_SUPPORT_EMAIL } from '../config/publicContact';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {LANGUAGES,dict,type Language} from '../locales/dict';
import {rulesDict} from '../locales/rulesDict';
import {stageText} from '../locales/stageText';
import {siteCopy} from '../locales/siteContent';
import { AccountDataGuide } from './AccountDataGuide';

export function SiteLinks({lang}:{lang:Language}) {
 const {labels:t}=siteCopy(lang);
 return <nav aria-label={t[5]} className="flex flex-wrap justify-center gap-5 py-5 text-sm">
  {([['/rules',t[3]],['/about',t[0]],['/contact',t[1]],['/updates',t[2]],['/privacy',dict[lang].privacyPolicy]] as const).map(([href,title])=><Link className="text-[#D4B872] underline-offset-4 hover:underline" href={href} key={href}>{title}</Link>)}
 </nav>;
}
export function SiteIntroduction({lang}:{lang:Language}) {
 const {labels:t,paragraphs:p}=siteCopy(lang);
 return <article lang={lang} className="mx-auto w-full max-w-4xl px-6 py-12 leading-relaxed text-[#BEB6A8]" data-site-introduction>
  <h2 className="mb-5 text-2xl font-semibold text-[#E8E2D7]">{t[0]}</h2>
  <p>{rulesDict[lang].sec5p1}</p><p className="mt-3">{p[0]}</p>
  <div className="mt-8 grid gap-8 md:grid-cols-2">
   <section><h3 className="mb-3 text-xl text-[#D4B872]">{t[3]}</h3><p>{p[2]}</p><Link href="/rules" className="mt-4 inline-block text-[#E8E2D7] underline">{rulesDict[lang].title} →</Link></section>
   <section className="border-l-2 border-[#B39A62] pl-5"><h3 className="mb-3 text-xl text-[#D4B872]">{t[7]}</h3><p>{p[1]}</p><p aria-hidden="true" className="mt-4 text-3xl tracking-widest text-[#E8E2D7]">♝ ♜ ♛ → ♝ ♛</p></section>
  </div>
  <section className="mt-8 border-t border-[#3B342C] pt-6"><h3 className="mb-3 text-xl text-[#D4B872]">{t[4]}</h3><p>{stageText(lang,'intro')} {stageText(lang,'rules')}</p></section>
 </article>;
}
export function SiteInfoPage({kind}:{kind:'about'|'contact'}) {
 const [lang,setLang]=useState<Language>('ja');
 useEffect(()=>{try{const stored=localStorage.getItem('qg_language');const preferred=stored||navigator.language.split('-')[0];if(LANGUAGES.some(l=>l.code===preferred))setLang(preferred as Language);}catch{}},[]);
 const {labels:t,paragraphs:p}=siteCopy(lang);
 return <div lang={lang} className="min-h-screen bg-[#11100E] px-5 py-8 text-[#E8E2D7]">
  <div className="mx-auto max-w-4xl">
   <header className="flex flex-wrap items-center justify-between gap-4"><Link href="/" className="text-[#D4B872]">← {t[6]}</Link><select aria-label={dict[lang].language} value={lang} className="max-w-full rounded border border-[#6E614C] bg-[#191714] p-3" onChange={e=>{const value=e.target.value as Language;setLang(value);try{localStorage.setItem('qg_language',value);}catch{}}}>{LANGUAGES.map(l=><option value={l.code} key={l.code}>{l.label}</option>)}</select></header>
   <h1 className="mt-10 text-3xl font-semibold">{kind==='about'?t[0]:t[1]}</h1>
   {kind==='about'?<><SiteIntroduction lang={lang}/><p className="leading-relaxed">{t[8]}</p></>:<section className="my-8 max-w-2xl space-y-6 leading-relaxed"><h2 className="text-xl text-[#D4B872]">{t[5]}</h2><p>{p[3]}</p><a href={`mailto:${PUBLIC_SUPPORT_EMAIL}`} className="block break-all text-[#D4B872] underline">{PUBLIC_SUPPORT_EMAIL}</a></section>}
   {kind==='contact'&&<AccountDataGuide lang={lang}/>}
   <SiteLinks lang={lang}/>
  </div>
 </div>;
}
