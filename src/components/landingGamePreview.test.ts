import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { LANGUAGES } from '../locales/dict';
import { LandingGamePreview } from './LandingGamePreview';
import { TitleScreen } from './TitleScreen';

const read = (path: string) => readFileSync(path, 'utf8');

describe('landing board preview', () => {
    it('preserves the verified actual-UI screenshot without fabricating or cropping the game', () => {
        const image = readFileSync('public/previews/game-screen-sample.png');
        expect(createHash('sha256').update(image).digest('hex')).toBe('5fbeb3311a17a7329ae4d257e7ca9b3c7f7cdac40814a8a15adb38f9d935744f');
        expect(image.readUInt32BE(16)).toBe(1600);
        expect(image.readUInt32BE(20)).toBe(1000);
        expect(image.byteLength).toBeLessThan(300_000);
    });

    it('shows one accessible static image without mounting a game renderer or simulation', () => {
        const html = renderToStaticMarkup(createElement(LandingGamePreview, { lang: 'en' }));
        expect((html.match(/<img /g) ?? []).length).toBe(1);
        expect(html).toContain('src="/previews/game-screen-sample.png"');
        expect(html).toContain('width="1600" height="1000"');
        expect(html).toContain('loading="eager"');
        expect(html).toContain('An illustrative sample position.');
        expect(html).toContain('Sample position · Read-only game screen');
        expect(html).not.toMatch(/<canvas|<video|<audio|data-square=|tabindex|role="button"/);
        expect(read('src/components/LandingGamePreview.tsx')).not.toMatch(/Board2D|Board3D|setInterval|setTimeout|requestAnimationFrame|useEffect/);
    });

    it.each(LANGUAGES.map(({ code }) => code))('labels the static preview before Play in %s', lang => {
        const html = renderToStaticMarkup(createElement(TitleScreen, { lang, onLogin: () => {} }));
        expect(html).toContain('data-game-preview="sample-screenshot"');
        expect(html).toMatch(/<figcaption><span>[^<]+<\/span>/);
        expect(html).toContain('href="/previews/game-screen-sample.png" target="_blank" rel="noopener noreferrer"');
        expect(html.indexOf('data-game-preview')).toBeLessThan(html.indexOf('class="title-play"'));
        expect(html.indexOf('class="title-play"')).toBeLessThan(html.indexOf('class="title-tutorial"'));
        expect(html).not.toMatch(/title-identities|captured gameplay|live match/i);
    });

    it('does not crowd the sign-in form with a board preview', () => {
        const html = renderToStaticMarkup(createElement(TitleScreen, { lang: 'en', onLogin: () => {}, initialMode: 'login' }));
        expect(html).not.toContain('data-game-preview');
        expect(html).toContain('autoComplete="username"');
    });
});

describe('landing scrolling and accessibility contracts', () => {
    it('keeps a visible themed scrollbar, native forced-colors, and fixed-control clearance', () => {
        const css = read('src/app/globals.css');
        expect(css).toContain('scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track)');
        expect(css).toContain('::-webkit-scrollbar { width:12px; height:12px; }');
        expect(css).toContain('scrollbar-gutter:stable');
        expect(css).toContain('right:calc(max(16px, env(safe-area-inset-right)) + 16px)');
        expect(css).toContain('@media(forced-colors:active)');
        expect(css).toContain('scrollbar-color:auto!important');
        expect(css).toContain('main[data-screen="title"] { overflow-y:auto;');
        expect(css).not.toMatch(/scrollbar-width\s*:\s*none|::-webkit-scrollbar[^}]*display\s*:\s*none|data-screen="campaign"/);
        expect(read('src/app/page.tsx')).toContain('app-corner-controls fixed right-4 top-4');
    });

    it('keeps the full static screenshot and compact layouts in normal document flow', () => {
        const css = read('src/components/title-screen.css');
        expect(css).toContain('width:100%; height:auto; aspect-ratio:8/5');
        expect(css).not.toContain('object-fit:cover');
        expect(css).toContain('@media(max-width:767px) and (max-height:640px)');
        expect(css).not.toMatch(/overflow\s*:\s*hidden|position\s*:\s*absolute/);
        expect(css).toContain('min-height:52px');
    });
});
