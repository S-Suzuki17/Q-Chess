'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { rulesDict, Language } from '@/locales/rulesDict';
import { AdBanner } from '../../components/AdBanner';
import { InteractiveTutorial } from '../../components/InteractiveTutorial';

export default function RulesPage() {
  const [lang, setLang] = useState<Language>('en');
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('qg_language');
      const preferred = savedLang || navigator.language.split('-')[0];
      if (preferred in rulesDict) setLang(preferred as Language);
    }
  }, []);

    const c = rulesDict[lang as keyof typeof rulesDict] || rulesDict['en'];

  return (
    <div className="h-[100dvh] w-full bg-[#050505] text-gray-300 font-mono p-6 md:p-12 overflow-y-auto">
      <div className="max-w-4xl mx-auto pb-16">
        <div className="flex flex-wrap gap-4 justify-between items-center mb-8">
            <Link href="/" className="text-[#D4B872] hover:text-white transition-colors text-sm inline-block tracking-widest font-bold">
            {c.back}
            </Link>
            <div className="flex flex-wrap gap-4 items-center">
                <button 
                    onClick={() => setShowTutorial(true)}
                    className="px-4 py-2 bg-[#B39A62]/20 border border-[#B39A62] text-[#D4B872] text-sm font-bold tracking-widest rounded hover:bg-[#B39A62] hover:text-[#11100E] transition-colors"
                >
                    {c.playTutorial}
                </button>
                <select
                    aria-label="Language"
                    value={lang}
                    onChange={e => { const value = e.target.value as Language; setLang(value); localStorage.setItem('qg_language', value); }}
                    className="bg-[#191714] text-[#D4B872] border border-[#B39A62] rounded px-2 py-2"
                >
                    {Object.keys(rulesDict).map(code => <option key={code} value={code}>{({ en: 'English', ja: '日本語', zh: '中文', ru: 'Русский', fr: 'Français', de: 'Deutsch', es: 'Español' } as Record<string, string>)[code]}</option>)}
                </select>
            </div>
        </div>

        <h1 className="text-4xl md:text-5xl font-extrabold text-[#D4B872] mb-6 tracking-wider">
          {c.title}
        </h1>
        
        <p className="text-gray-400 text-lg mb-12 leading-relaxed">
          {c.intro}
        </p>

        <div className="mb-12">
           <AdBanner adClient="ca-pub-1116866075179199" adSlot="8798363654" />
        </div>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">{c.sec1Title}</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p>{c.sec1p1}</p>
            <p>{c.sec1p2}</p>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">{c.sec2Title}</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p>{c.sec2p1}</p>
            <ul className="list-disc list-inside space-y-2 ml-4 text-gray-400">
              <li><strong>{c.sec2li1.split(': ')[0]}: </strong>{c.sec2li1.split(': ')[1]}</li>
              <li><strong>{c.sec2li2.split(': ')[0]}: </strong>{c.sec2li2.split(': ')[1]}</li>
              <li><strong>{c.sec2li3.split(': ')[0]}: </strong>{c.sec2li3.split(': ')[1]}</li>
            </ul>
            <p className="mt-4">
              <strong>{c.sec2rule.split(': ')[0]}: </strong>{c.sec2rule.split(': ')[1]}
            </p>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">{c.sec3Title}</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p>{c.sec3p1}</p>
            <div className="bg-[#1A1814] p-6 rounded-lg border border-[#3A3224] mt-6">
              <h3 className="text-xl font-bold text-[#D4B872] mb-3">{c.sec3BoxTitle}</h3>
              <p className="mb-4">{c.sec3Boxp1}</p>
              <ul className="list-disc list-inside space-y-2 text-gray-400">
                <li><strong>{c.sec3Boxli1.split(': ')[0]}: </strong>{c.sec3Boxli1.split(': ')[1]}</li>
                <li><strong>{c.sec3Boxli2.split(': ')[0]}: </strong>{c.sec3Boxli2.split(': ')[1]}</li>
                <li><strong>{c.sec3Boxli3.split(': ')[0]}: </strong>{c.sec3Boxli3.split(': ')[1]}</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">{c.sec4Title}</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p><strong>{c.sec4p1.split(': ')[0]}: </strong>{c.sec4p1.split(': ')[1]}</p>
            <p><strong>{c.sec4p2.split(': ')[0]}: </strong>{c.sec4p2.split(': ')[1]}</p>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">{c.sec5Title}</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p>{c.sec5p1}</p>
            <p>{c.sec5p2}</p>
          </div>
        </section>

        <div className="mt-16 pt-8 border-t border-[#3A3224] text-center text-sm text-gray-500">
          <p className="mb-4">{c.footer}</p>
          <a href="https://github.com/S-Suzuki17/Q-Chess" target="_blank" rel="noopener noreferrer" className="text-[#D4B872] hover:text-white transition-colors">
            github.com/S-Suzuki17/Q-Chess
          </a>
        </div>

      </div>
      {showTutorial && <InteractiveTutorial lang={lang} onClose={() => setShowTutorial(false)} />}
    </div>

  );
}
