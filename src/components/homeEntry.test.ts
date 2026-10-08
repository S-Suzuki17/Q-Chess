import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { dict, LANGUAGES } from '../locales/dict';
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

});
