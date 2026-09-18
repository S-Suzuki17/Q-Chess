import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import ReplayBoard from '../components/ReplayBoard';
import type { GameRecord } from './gameRecordService';
import { LANGUAGES } from '../locales/dict';
import { replayText } from '../locales/replayText';
const empty: GameRecord = { white_player: 'A', black_player: 'B', winner: 'draw', mode: 'cpu', moves: [], total_moves: 0 };
it('shows all initial squares and responsive pieces for a zero-move result', () => {
    const html = renderToStaticMarkup(React.createElement(ReplayBoard, { lang: 'ja', record: empty, onHome: () => {} }));
    expect((html.match(/data-square=/g) ?? [])).toHaveLength(64);
    expect((html.match(/data-token=/g) ?? [])).toHaveLength(32);
    expect(html).toContain('container-type:size');
    expect(html).not.toContain('w-12 h-12');
    expect(html).toContain('aria-label="最初の局面"');
});
it('shows an honest error rather than an untouched board when old moves are missing', () => {
    const html = renderToStaticMarkup(React.createElement(ReplayBoard, { lang: 'ja', record: { ...empty, total_moves: 30 }, onHome: () => {} }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('棋譜を復元できません');
    expect(html).not.toContain('data-square');
});
it('all supported languages have accessible replay errors and save failure actions', () => {
    for (const { code } of LANGUAGES) {
        const text = replayText(code);
        expect(Object.values(text)).toHaveLength(10);
        expect(Object.values(text).every(value => value.length > 0)).toBe(true);
    }
});
