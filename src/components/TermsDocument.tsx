'use client';
import {useState} from 'react';
import {TERMS_VERSION,TERMS_EFFECTIVE_DATE,TERMS_SECTIONS,TERMS_ENGLISH} from '../config/terms';
export function TermsDocument({initialLanguage='ja'}:{initialLanguage?:string}){
    const [language,setLanguage]=useState(initialLanguage==='ja'?'ja':'en');
    const sections=language==='ja'?TERMS_SECTIONS:TERMS_ENGLISH;
    return <article className="space-y-5 leading-relaxed" lang={language} data-terms-document>
        <label className="block">日本語 / English <select aria-label="Document language" value={language} onChange={e=>setLanguage(e.target.value)} className="ml-3 rounded border border-[#A89C86]/50 bg-[#191714] p-2"><option value="ja">日本語</option><option value="en">English</option></select></label>
        <p className="text-sm">{language==='ja'?'発効日':'Effective'}: {TERMS_EFFECTIVE_DATE} · {TERMS_VERSION}</p>
        {sections.map(([title,body],i)=><section key={i}><h2 className="mb-2 font-semibold text-[#D4B872]">{i+1}. {title}</h2><p className="whitespace-pre-line">{body}</p></section>)}
    </article>;
}
