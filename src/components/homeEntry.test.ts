import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { dict, LANGUAGES } from '../locales/dict';
import { TitleScreen } from './TitleScreen';
import { learningEntryText } from '../locales/learningEntryText';

describe('home entry points', () => {
    it('offers the translated public guide alongside guest and account entry', () => {
        for (const { code: lang } of LANGUAGES) {
            const html = renderToStaticMarkup(createElement(TitleScreen, { lang, onLogin: () => {} }));
            expect(html).toContain('href="/rules"');
            expect(html).not.toContain('tutorial=1');
            expect(html).toContain(dict[lang].rulesButton);
            expect(html).toContain('title-practice-direct');
            expect(html).toContain('title-play');
            expect(html).toContain('title-auth-actions');
            expect(html).toContain('data-open-tutorial');
            expect(html).toContain('aria-haspopup="dialog"');
            expect(html).toContain(learningEntryText[lang].title);
            expect(html.indexOf('class="title-login-primary"')).toBeLessThan(html.indexOf('class="title-play"'));
            expect(html.indexOf('class="title-play"')).toBeLessThan(html.indexOf('data-open-tutorial'));
        }
    });

    it('offers direct CPU practice button with translated labels across all 12 supported languages', () => {
        for (const { code: lang } of LANGUAGES) {
            const html = renderToStaticMarkup(createElement(TitleScreen, {
                lang,
                onLogin: () => {},
                onQuickPractice: () => {}
            }));
            expect(html).toContain('title-practice-direct');
            expect(html).toContain(dict[lang].practiceVsCpu);
        }
    });

});
