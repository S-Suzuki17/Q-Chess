'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { learningChain, learningCopy, learningLabels, learningMoves, learningPieceNames, siteCopy, type LearningLanguage } from '../locales/siteContent';
import { useAppPlatform } from '../hooks/useAppPlatform';
import { SiteLinks } from './SiteInformation';
import {NaturalText} from './NaturalText';
import { QubeTeacher } from './QubeTeacher';
import { qubeTeaching } from '../locales/qubeTeaching';

const linkStyle = 'inline-flex min-h-11 items-center rounded-lg border border-[#6E614C] px-4 py-2 text-[#D4B872] underline underline-offset-4';
const sectionStyle = { scrollMarginTop: '170px' };

export function LearningArticle({ kind, lang }: { kind: 'guide' | 'faq'; lang: LearningLanguage }) {
    const c = learningCopy[lang];
    return <article lang={lang} data-learning-article={kind} className="space-y-8">
        <h1>{kind === 'guide' ? c.title : c.faqTitle}</h1>
        <QubeTeacher lang={lang} variant="compact"><p className="mb-3"><NaturalText lang={lang} text={qubeTeaching[lang].welcome}/></p><p className="max-w-3xl"><NaturalText lang={lang} text={kind === 'guide' ? c.intro : c.faqIntro}/></p></QubeTeacher>
        {kind === 'guide' ? <>
            <nav aria-label={c.contents} className="rounded-xl border border-[#6E614C] bg-[#101610] p-5">
                <h2 className="mb-3 font-semibold">{c.contents}</h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                    {[{ id: 'start', title: c.startTitle }, ...c.sections, { id: 'practice', title: c.practiceTitle }, { id: 'chain', title: c.chainTitle }].map(s => <li key={s.id}><a href={`#${s.id}`} className="inline-flex min-h-11 items-center text-[#D4B872] underline underline-offset-4">{s.title}</a></li>)}
                </ul>
            </nav>
            <section id="start" style={sectionStyle} aria-labelledby="start-heading">
                <h2 id="start-heading" className="mb-5 text-2xl">{c.startTitle}</h2>
                <QubeTeacher lang={lang} variant="compact">
                <ol className="grid gap-4 md:grid-cols-2">
                    {c.steps.map((step, index) => <li key={step.title} className="rounded-xl border border-[#414a3b] bg-[#101610] p-5">
                        <h3 className="mb-3 font-semibold text-[#E8E2D7]">{index + 1}. {step.title}</h3><p><NaturalText lang={lang} text={step.text}/></p>
                    </li>)}
                </ol>
                <p className="mt-5"><NaturalText lang={lang} text={c.hintHelp}/></p>
                <Link href="/" className={`${linkStyle} mt-5`}>{siteCopy(lang).labels[5]} →</Link>
                </QubeTeacher>
            </section>
            {c.sections.map(s => <section key={s.id} id={s.id} style={sectionStyle} aria-labelledby={`${s.id}-heading`}>
                <h2 id={`${s.id}-heading`} className="mb-4 text-2xl">{s.title}</h2>
                <QubeTeacher lang={lang} variant="compact">
                <div className="space-y-4">{s.paragraphs.map(p => <p key={p}><NaturalText lang={lang} text={p}/></p>)}</div>
                {s.id === 'candidates' && <Link href="/rules/" className={`${linkStyle} mt-4`}>{siteCopy(lang).labels[2]} →</Link>}
                </QubeTeacher>
            </section>)}
            <section id="practice" style={sectionStyle} aria-labelledby="practice-heading">
                <h2 id="practice-heading" className="mb-4 text-2xl">{c.practiceTitle}</h2><QubeTeacher lang={lang} variant="compact"><p><NaturalText lang={lang} text={c.practiceIntro}/></p>
                <ol className="mt-5 space-y-5">
                    {c.exercises.map((exercise, index) => <li key={exercise.question} className="rounded-xl border border-[#6E614C] bg-[#101610] p-5" data-learning-exercise>
                        <p aria-hidden="true" className="mb-3 text-lg text-[#D4B872]">{learningMoves[index].from} → {learningMoves[index].to}</p>
                        <h3 className="font-semibold">{index + 1}. {exercise.question}</h3>
                        <details className="mt-3"><summary className="text-[#D4B872]">{c.answerLabel}</summary><p className="pt-3"><NaturalText lang={lang} text={exercise.answer}/></p></details>
                    </li>)}
                </ol></QubeTeacher>
            </section>
            <section id="chain" style={sectionStyle} aria-labelledby="chain-heading" className="space-y-4">
                <h2 id="chain-heading" className="text-2xl">{c.chainTitle}</h2>
                <QubeTeacher lang={lang} variant="compact">
                <p><NaturalText lang={lang} text={c.chainIntro}/></p><p><NaturalText lang={lang} text={c.chainFixed}/></p>
                <figure data-learning-chain className="rounded-xl border border-[#6E614C] bg-[#101610] p-5">
                    <figcaption className="mb-5 text-sm">{c.chainCaption}</figcaption>
                    <ol className="grid gap-4 md:grid-cols-3">
                        {learningChain.pieces.map(piece => <li key={piece.id} className="rounded-lg border border-[#414a3b] p-4">
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#D4B872] font-semibold text-[#D4B872]">{piece.id}</span>
                            <dl className="mt-3 space-y-3 text-sm">
                                <div><dt>{c.chainBefore}</dt><dd className="font-semibold text-[#E8E2D7]">{piece.before.map(type => learningPieceNames[lang][type]).join(' / ')}</dd></div>
                                <div><dt>{c.chainAfter}</dt><dd className="font-semibold text-[#D4B872]">{piece.after.map(type => learningPieceNames[lang][type]).join(' / ')}</dd></div>
                            </dl>
                        </li>)}
                    </ol>
                </figure>
                <ol className="list-decimal space-y-3 pl-6">{c.chainReasons.map(reason => <li key={reason}><NaturalText lang={lang} text={reason}/></li>)}</ol>
                <p><NaturalText lang={lang} text={c.chainTakeaway}/></p>
                </QubeTeacher>
            </section>
        </> : <div className="space-y-4">
            {c.faqs.map(faq => <details key={faq.id} id={faq.id} style={sectionStyle} className="rounded-xl border border-[#414a3b] bg-[#101610] p-5" data-learning-faq>
                <summary className="font-semibold text-[#D4B872]">{faq.question}</summary><QubeTeacher lang={lang} variant="compact" className="mt-4"><p><NaturalText lang={lang} text={faq.answer}/></p>
                <Link href={faq.href} className={`${linkStyle} mt-4`}>{faq.link} →</Link>
                </QubeTeacher>
            </details>)}
        </div>}
        <nav aria-label={siteCopy(lang).labels[4]} className="flex flex-wrap gap-3 border-t border-[#414a3b] pt-5">
            <Link href="/" className={linkStyle}>{siteCopy(lang).labels[5]} →</Link>
            <Link href={kind === 'guide' ? '/faq/' : '/guide/'} className={linkStyle}>{learningLabels[lang][kind === 'guide' ? 1 : 0]} →</Link>
            <Link href="/contact/" className={linkStyle}>{siteCopy(lang).labels[1]} →</Link>
        </nav>
    </article>;
}

export function LearningPage({ kind }: { kind: 'guide' | 'faq' }) {
    const [lang, setLang] = useState<LearningLanguage>('ja');
    const { webContent } = useAppPlatform();
    useEffect(() => {
        try { const preferred = localStorage.getItem('qg_language') || navigator.language.split('-')[0]; setLang(preferred === 'ja' ? 'ja' : 'en'); }
        catch { /* The initial Japanese article remains usable without storage. */ }
    }, []);
    if (!webContent) return <main lang={lang} className="game-page"><div className="game-page-content">
        <Link href="/" className={linkStyle}>← {siteCopy(lang).labels[5]}</Link>
        <a href={`https://q-gambit.com/${kind}/`} target="_blank" rel="noopener noreferrer" className={`${linkStyle} mt-8`}>{learningLabels[lang][kind === 'guide' ? 0 : 1]} ↗</a>
    </div></main>;
    return <main lang={lang} className="game-page" tabIndex={0} aria-label={kind==='guide'?learningCopy[lang].title:learningCopy[lang].faqTitle}><div className="game-page-content">
        <header className="game-page-header">
            <Link href="/">← {siteCopy(lang).labels[5]}</Link>
            <label className="game-page-language"><span className="sr-only">日本語 / English</span>
                <select aria-label="ガイドの言語 / Guide language" value={lang} onChange={e => {
                    const next = e.target.value as LearningLanguage; setLang(next);
                    try { localStorage.setItem('qg_language', next); } catch { /* Reading does not require storage. */ }
                }}><option value="ja">日本語</option><option value="en">English</option></select>
            </label>
        </header>
        {kind==='guide'&&<label className="reading-section-picker"><span>{learningCopy[lang].contents}</span><select aria-label={learningCopy[lang].contents} defaultValue="" onChange={event=>{if(event.target.value)window.location.hash=event.target.value;}}>
            <option value="">{learningCopy[lang].contents}</option>{[{id:'start',title:learningCopy[lang].startTitle},...learningCopy[lang].sections,{id:'practice',title:learningCopy[lang].practiceTitle},{id:'chain',title:learningCopy[lang].chainTitle}].map(section=><option key={section.id} value={section.id}>{section.title}</option>)}
        </select></label>}
        <LearningArticle kind={kind} lang={lang}/><SiteLinks lang={lang}/>
    </div></main>;
}
