'use client';
import {useState} from 'react';
import {CURRENT_TERMS_VERSION,CURRENT_TERMS_EFFECTIVE_DATE,CURRENT_TERMS_SECTIONS,CURRENT_TERMS_ENGLISH,currentTermsEffective} from '../config/currentTerms';
import {TERMS_VERSION,TERMS_EFFECTIVE_DATE,TERMS_SECTIONS,TERMS_ENGLISH} from '../config/terms';
export function TermsDocument({initialLanguage='ja',legacy=false}:{initialLanguage?:string;legacy?:boolean}){
    const [language,setLanguage]=useState(initialLanguage==='ja'?'ja':'en');
    const sections=legacy?(language==='ja'?TERMS_SECTIONS:TERMS_ENGLISH):(language==='ja'?CURRENT_TERMS_SECTIONS:CURRENT_TERMS_ENGLISH);
    const date=legacy?TERMS_EFFECTIVE_DATE:CURRENT_TERMS_EFFECTIVE_DATE,version=legacy?TERMS_VERSION:CURRENT_TERMS_VERSION;
    return <article className="space-y-5 leading-relaxed" lang={language} data-terms-document>
        <label className="block">日本語 / English <select aria-label="Document language" value={language} onChange={e=>setLanguage(e.target.value)} className="ml-3 rounded border border-[#A89C86]/50 bg-[#191714] p-2"><option value="ja">日本語</option><option value="en">English</option></select></label>
        <p className="text-sm">{language==='ja'?'発効日':'Effective'}: {date ?? (language==='ja'?'公開日確定後に発効':'Pending actual publication date')} · {version}</p>
        {!legacy&&!currentTermsEffective()&&<p role="status">{language==='ja'?'承認済み改定規約（未発効）。新規購入の受付開始を示すものではありません。':'Approved revised terms (not yet effective). This does not announce the opening of new purchases.'}</p>}
        {sections.map(([title,body],i)=><section key={i}><h2 className="mb-2 font-semibold text-[#D4B872]">{i+1}. {title}</h2><p className="whitespace-pre-line">{body}</p></section>)}
    </article>;
}
