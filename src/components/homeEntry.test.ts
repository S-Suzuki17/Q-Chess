import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { devDiaryTweets } from '../data/devDiary';
import { dict, LANGUAGES } from '../locales/dict';
import { DevDiaryTimeline } from './DevDiaryTimeline';
import { TitleScreen } from './TitleScreen';

describe('home entry points', () => {
    it('offers the translated public guide alongside guest and account entry', () => {
        for (const { code: lang } of LANGUAGES) {
            const html = renderToStaticMarkup(createElement(TitleScreen, { lang, onLogin: () => {} }));
            expect(html).toContain('href="/rules"');
            expect(html).not.toContain('tutorial=1');
            expect(html).toContain(dict[lang].rulesButton);
            expect(html).toContain('title-play');
            expect(html).toContain('title-auth-actions');
        }
    });

    it('shows only verified game changes at home while preserving the full diary', () => {
        const home = renderToStaticMarkup(createElement(DevDiaryTimeline, { view: 'home', lang: 'ja' }));
        const full = renderToStaticMarkup(createElement(DevDiaryTimeline, { view: 'all', lang: 'ja' }));
        expect(home.match(/<article\b/g)).toHaveLength(2);
        expect(home).toContain('href="/updates"');
        expect(home).toContain('ゲームの更新情報');
        expect(home).toContain('クラウン・サーキットの勝利演出');
        expect(home).toContain('オンライン対局の候補判定を改善');
        expect(home).not.toContain('開発AIのぼやき部屋');
        expect(home).not.toContain('QUBEの雑談');
        expect(full.match(/<article\b/g)).toHaveLength(devDiaryTweets.length);
        expect(full).toContain('QUBEの雑談');
    });
});
