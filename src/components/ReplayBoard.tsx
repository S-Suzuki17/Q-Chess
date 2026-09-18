'use client';

import React, { useState, useMemo } from 'react';
import { QuantumPieceUI } from './QuantumPieceUI';
import type { GameRecord } from '../lib/gameRecordService';
import { buildReplayTimeline } from '../lib/replayHistory';
import { Language, dict } from '../locales/dict';
import { replayText } from '../locales/replayText';

interface ReplayBoardProps { lang: Language; record: GameRecord; onHome: () => void }

export default function ReplayBoard(props: ReplayBoardProps) {
    return <ReplayViewer key={props.record.id ?? props.record.created_at ?? `${props.record.white_player}:${props.record.black_player}`} {...props} />;
}

function ReplayViewer({ lang, record, onHome }: ReplayBoardProps) {
    const t = { ...dict.en, ...(dict[lang] || {}) };
    const copy = replayText(lang);
    const timeline = useMemo(() => buildReplayTimeline(record), [record]);
    const [selectedMove, setSelectedMove] = useState(0);
    const currentMoveIndex = Math.min(selectedMove, timeline.moves.length);
    const position = timeline.positions[currentMoveIndex];
    const lastMove = timeline.moves[currentMoveIndex - 1];
    const grid = useMemo(() => new Map(position?.tokens.filter(token => !token.isCaptured).map(token => [token.row * 8 + token.col, token]) ?? []), [position]);

    if (timeline.error || !position) return (
        <section className="w-full max-w-lg m-auto rounded-xl border border-[#B39A62]/30 bg-[#191714] p-6 text-[#E8E2D7]">
            <h2 className="text-lg font-semibold">{t.replay}</h2>
            <p role="alert" className="my-4 text-sm leading-relaxed text-[#A89C86]">{timeline.error === 'missing' ? copy.missing : copy.invalid}</p>
            <button onClick={onHome} className="min-h-11 rounded border border-[#B39A62]/60 px-5 focus-visible:outline-2">{t.home}</button>
        </section>
    );

    return (
        <section aria-label={t.replay} className="flex flex-col items-center justify-center w-full h-full max-h-[100dvh] max-w-lg mx-auto relative select-none overflow-hidden p-2 pt-16 pb-4">
            <header className="w-full flex justify-between items-end gap-2 mb-2">
                <span className="text-sm font-semibold text-[#E8E2D7] truncate">{record.black_player}</span>
                <span aria-live="polite" className="shrink-0 text-xs font-mono text-[#A89C86]">{t.turn}: {currentMoveIndex} / {timeline.moves.length}</span>
            </header>
            <div className="w-full flex-1 min-h-0 flex items-center justify-center">
                <div className="w-full max-w-[min(100%,_calc(100dvh-260px))] aspect-square grid grid-cols-8 grid-rows-8 border-2 border-[#B39A62]/50 bg-[#191714] rounded overflow-hidden">
                    {Array.from({ length: 64 }, (_, index) => {
                        const row = Math.floor(index / 8), col = index % 8;
                        const token = grid.get(index);
                        const target = lastMove?.to[0] === row && lastMove.to[1] === col;
                        const origin = lastMove?.from[0] === row && lastMove.from[1] === col;
                        return (
                            <div key={index} data-square={`${'abcdefgh'[col]}${8 - row}`} data-token={token?.id}
                                className={`relative flex min-w-0 min-h-0 items-center justify-center ${(row + col) % 2 ? 'bg-[#64533e]' : 'bg-[#b6a286]'} ${target || origin ? 'shadow-[inset_0_0_0_3px_#e6bf5c]' : ''}`}>
                                {token && <div className="w-[90%] h-[90%] pointer-events-none">
                                    <QuantumPieceUI id={token.id} player={token.player} probabilities={token.probabilities}
                                        candidates={position.pool.piecePossibilities.get(token.id)} isSelected={false} onClick={() => {}}
                                        promotedTo={token.promotedTo} responsive />
                                </div>}
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="w-full mt-2 text-sm font-semibold text-[#E8E2D7] truncate">{record.white_player}</div>
            <footer className="mt-3 flex flex-col gap-3 bg-[#191714] p-3 rounded-lg border border-[#A89C86]/20 w-full">
                <div className="flex justify-between items-center gap-2 text-xs text-[#A89C86]">
                    <span>{record.winner === 'white_wins' ? t.whiteWon : record.winner === 'black_wins' ? t.blackWon : t.draw}</span>
                    <button onClick={onHome} className="min-h-11 px-4 border border-[#A89C86]/30 text-[#E8E2D7] rounded focus-visible:outline-2">{t.home}</button>
                </div>
                <div className="flex justify-center gap-2">
                    <button aria-label={copy.first} onClick={() => setSelectedMove(0)} disabled={currentMoveIndex === 0} className="min-w-11 min-h-11 rounded border border-[#A89C86]/30 disabled:opacity-30">⏮</button>
                    <button onClick={() => setSelectedMove(Math.max(0, currentMoveIndex - 1))} disabled={currentMoveIndex === 0} className="flex-1 min-h-11 rounded border border-[#A89C86]/30 disabled:opacity-30 text-sm">◀ {t.prev}</button>
                    <button onClick={() => setSelectedMove(Math.min(timeline.moves.length, currentMoveIndex + 1))} disabled={currentMoveIndex === timeline.moves.length} className="flex-1 min-h-11 rounded border border-[#A89C86]/30 disabled:opacity-30 text-sm">{t.next} ▶</button>
                    <button aria-label={copy.last} onClick={() => setSelectedMove(timeline.moves.length)} disabled={currentMoveIndex === timeline.moves.length} className="min-w-11 min-h-11 rounded border border-[#A89C86]/30 disabled:opacity-30">⏭</button>
                </div>
            </footer>
        </section>
    );
}
