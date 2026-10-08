'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { rulesDict, Language } from '@/locales/rulesDict';
import { LANGUAGES, dict } from '@/locales/dict';
import { siteCopy } from '../../locales/siteContent';
import { PUBLIC_SUPPORT_EMAIL } from '../../config/publicContact';
import { rulesVisualDict } from '@/locales/rulesVisualDict';
import { MAX_PIECES } from '@/quantum-engine/constants';
import type { PieceType } from '@/config/gameConfig';
import { LearningEntry, SiteLinks } from '../../components/SiteInformation';

const pieceTypes: PieceType[] = ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'];
const pieceSymbols: Record<PieceType, string> = { King: '♔', Queen: '♕', Rook: '♖', Bishop: '♗', Knight: '♘', Pawn: '♙' };
const pieceLimits = [MAX_PIECES.KING, MAX_PIECES.QUEEN, MAX_PIECES.ROOK, MAX_PIECES.BISHOP, MAX_PIECES.KNIGHT, MAX_PIECES.PAWN];

function movementAt(type: PieceType, row: number, col: number): 'source' | 'move' | 'capture' | 'initial' | 'empty' {
  const dr = row - 2, dc = col - 2;
  if (dr === 0 && dc === 0) return 'source';
  const ar = Math.abs(dr), ac = Math.abs(dc);
  if (type === 'Pawn') {
    if (dr === -1 && ac === 1) return 'capture';
    if (dc === 0 && dr === -2) return 'initial';
    return dc === 0 && dr === -1 ? 'move' : 'empty';
  }
  if (type === 'Knight') return (ar === 2 && ac === 1) || (ar === 1 && ac === 2) ? 'move' : 'empty';
  if (type === 'King') return ar <= 1 && ac <= 1 ? 'move' : 'empty';
  if (type === 'Queen') return dr === 0 || dc === 0 || ar === ac ? 'move' : 'empty';
  if (type === 'Rook') return dr === 0 || dc === 0 ? 'move' : 'empty';
  return ar === ac ? 'move' : 'empty';
}

function MovementDiagram({type, name}: {type: PieceType; name: string}) {
  return <figure className="rounded-xl border border-[#3A3224] bg-[#141410] p-4">
    <figcaption className="mb-3 flex items-center justify-between text-lg font-bold text-[#D4B872]"><span>{name}</span><span aria-hidden="true">{pieceSymbols[type]}</span></figcaption>
    <div className="mx-auto grid w-full max-w-[180px] grid-cols-5 overflow-hidden rounded border border-[#685a3b]" role="img" aria-label={name}>
      {Array.from({length: 25}, (_, index) => {
        const row = Math.floor(index / 5), col = index % 5;
        const status = movementAt(type, row, col);
        return <div key={index} aria-hidden="true" className={`flex aspect-square items-center justify-center border border-[#302a20] text-base font-bold ${
          status === 'source' ? 'bg-[#d4b872] text-[#11100e]' : status === 'capture' ? 'bg-[#6e3636] text-white' : status === 'initial' ? 'bg-[#9c824a] text-white' : status === 'move' ? 'bg-[#5b4b2c] text-[#f5dfa9]' : (row + col) % 2 ? 'bg-[#22221d]' : 'bg-[#303029]'
        }`}>{status === 'source' ? pieceSymbols[type] : status === 'capture' ? '×' : status === 'initial' ? '2' : status === 'move' ? '•' : ''}</div>;
      })}
    </div>
  </figure>;
}

function ExampleBoard({kind, label}: {kind: 'deduction' | 'capture' | 'mate'; label: string}) {
  const files = kind === 'deduction' ? 'efgh' : 'abcd';
  const ranks = kind === 'deduction' ? [7, 6, 5, 4] : [8, 7, 6, 5];
  const pieces: Record<string, string> = kind === 'deduction'
    ? {e4: '?', h7: '①', h5: '②'}
    : kind === 'capture' ? {a8: '?', a7: '♖'} : {a8: '♚', a7: '♖', b7: '♖'};
  return <div className="mx-auto w-full max-w-[212px]" role="img" aria-label={label}>
    <div className="grid grid-cols-[16px_repeat(4,minmax(0,1fr))] gap-0 overflow-hidden rounded border border-[#685a3b]">
      {ranks.map((rank, row) => <React.Fragment key={rank}>
        <div aria-hidden="true" className="flex items-center justify-center bg-[#141410] text-[10px] text-[#a89c86]">{rank}</div>
        {[...files].map((file, col) => {
          const square = `${file}${rank}`, mark = pieces[square];
          const highlighted = kind === 'mate' && square === 'b8';
          return <div key={square} aria-hidden="true" className={`flex aspect-square items-center justify-center border border-[#302a20] text-xl ${mark === '♚' || (kind === 'capture' && square === 'a8') ? 'bg-[#764343] text-white' : mark === '♖' ? 'bg-[#9c824a] text-white' : mark ? 'bg-[#5b4b2c] text-[#f5dfa9]' : highlighted ? 'bg-[#5b4b2c]' : (row + col) % 2 ? 'bg-[#22221d]' : 'bg-[#303029]'}`}>{mark ?? ''}</div>;
        })}
      </React.Fragment>)}
      <div className="bg-[#141410]" aria-hidden="true"/>
      {[...files].map(file => <div key={file} aria-hidden="true" className="bg-[#141410] text-center text-[10px] text-[#a89c86]">{file}</div>)}
    </div>
  </div>;
}

function RuleLine({text}: {text: string}) {
  const separator = text.indexOf(': ');
  return separator === -1 ? <>{text}</> : <><strong>{text.slice(0, separator)}: </strong>{text.slice(separator + 2)}</>;
}

export default function RulesPage() {
  const [lang, setLang] = useState<Language>('en');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('qg_language');
      const preferred = savedLang || navigator.language.split('-')[0];
      if (preferred in rulesDict) setLang(preferred as Language);
    }
  }, []);

    const c = {...rulesDict[lang], sec1p2: siteCopy(lang).paragraphs[1], sec4p1: rulesVisualDict[lang].captureHelp};
    const v = rulesVisualDict[lang];

  return (
    <main className="game-page" lang={lang}>
      <div className="game-page-content">
        <header className="game-page-header">
            <Link href="/" className="text-[#D4B872] hover:text-white transition-colors text-sm inline-block tracking-widest font-bold">
            {c.back}
            </Link>
            <div className="flex flex-wrap gap-4 items-center">
                <select
                    aria-label={dict[lang].language}
                    value={lang}
                    onChange={e => { const value = e.target.value as Language; setLang(value); localStorage.setItem('qg_language', value); }}
                    className="bg-[#191714] text-[#D4B872] border border-[#B39A62] rounded px-2 py-2"
                >
                    {LANGUAGES.map(({code,label}) => <option key={code} value={code}>{label}</option>)}
                </select>
            </div>
        </header>

        <h1 className="text-4xl md:text-5xl font-extrabold text-[#D4B872] mb-6 tracking-wider">
          {c.title}
        </h1>
        
        <p className="text-gray-400 text-lg mb-12 leading-relaxed">
          {c.intro}
        </p>
        <LearningEntry lang={lang}/>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">{c.sec1Title}</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p>{c.sec1p1}</p>
            <p>{c.sec1p2}</p>
          </div>
        </section>

        <section className="mb-16" aria-labelledby="movement-guide">
          <h2 id="movement-guide" className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">{v.movementTitle}</h2>
          <p className="mb-6 leading-relaxed">{v.movementHelp}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pieceTypes.map((type, index) => <MovementDiagram key={type} type={type} name={v.names[index]}/>)}
          </div>
          <p className="mt-5 rounded-lg border border-[#3A3224] bg-[#1A1814] p-4 text-sm leading-relaxed">{v.pawnHelp}</p>
          <p className="mt-3 text-sm text-gray-400 leading-relaxed">{v.specialMoves}</p>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">{c.sec2Title}</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p>{c.sec2p1}</p>
            <ul className="list-disc list-inside space-y-2 ml-4 text-gray-400">
              <li><RuleLine text={c.sec2li1}/></li>
              <li><RuleLine text={c.sec2li2}/></li>
              <li><RuleLine text={c.sec2li3}/></li>
            </ul>
            <p className="mt-4"><RuleLine text={c.sec2rule}/></p>
          </div>
        </section>

        <section className="mb-16 grid gap-6 md:grid-cols-2" aria-labelledby="deduction-guide">
          <div className="rounded-xl border border-[#3A3224] bg-[#141410] p-5">
            <h2 id="deduction-guide" className="text-xl font-bold text-[#D4B872] mb-4">{v.deductionTitle}</h2>
            <ExampleBoard kind="deduction" label={v.deductionHelp}/>
            <p className="mt-5 leading-relaxed">{v.deductionHelp}</p>
          </div>
          <div className="rounded-xl border border-[#3A3224] bg-[#141410] p-5">
            <h2 className="text-xl font-bold text-[#D4B872] mb-4">{v.limitsTitle}</h2>
            <div className="grid grid-cols-3 gap-2">
              {pieceTypes.map((type, index) => <div key={type} className="rounded-lg border border-[#3A3224] bg-[#211e18] p-3 text-center">
                <span className="block text-2xl text-[#D4B872]" aria-hidden="true">{pieceSymbols[type]}</span>
                <span className="block text-xs text-gray-300">{v.names[index]}</span>
                <strong className="block text-lg text-white">× {pieceLimits[index]}</strong>
              </div>)}
            </div>
            <p className="mt-4 text-sm leading-relaxed">{v.limitsHelp}</p>
            <div className="mt-5 rounded-lg border border-[#685a3b] bg-[#29241b] p-3 text-sm leading-relaxed">
              <div className="mb-2 text-[#D4B872]">{v.names[1]}: 1 → 0</div>
              <div>{v.names[2]} / {v.names[1]} → {v.names[2]}</div>
              <p className="mt-2">{v.chainHelp}</p>
            </div>
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
                <li><RuleLine text={c.sec3Boxli2}/></li>
                <li><RuleLine text={c.sec3Boxli3}/></li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-16" aria-labelledby="outcome-guide">
          <h2 id="outcome-guide" className="text-2xl font-bold text-white mb-5 border-b border-gray-800 pb-2">{v.outcomeTitle}</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <figure className="rounded-xl border border-[#3A3224] bg-[#141410] p-5">
              <figcaption className="mb-4 font-bold text-[#D4B872]">{v.captureLabel}</figcaption>
              <ExampleBoard kind="capture" label={v.captureHelp}/>
              <p className="mt-5 leading-relaxed">{v.captureHelp}</p>
            </figure>
            <figure className="rounded-xl border border-[#3A3224] bg-[#141410] p-5">
              <figcaption className="mb-4 font-bold text-[#D4B872]">{v.mateLabel}</figcaption>
              <ExampleBoard kind="mate" label={v.mateHelp}/>
              <p className="mt-5 leading-relaxed">{v.mateHelp}</p>
            </figure>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">{c.sec4Title}</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p><RuleLine text={c.sec4p1}/></p>
            <p><RuleLine text={c.sec4p2}/></p>
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
          <p className="mb-4">{siteCopy(lang).labels[5]}</p>
          <a href={`mailto:${PUBLIC_SUPPORT_EMAIL}`} className="text-[#D4B872] hover:text-white transition-colors">
            {PUBLIC_SUPPORT_EMAIL}
          </a>
        </div>
        <SiteLinks lang={lang}/>

      </div>
    </main>

  );
}
