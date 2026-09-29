import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import { AboutArticle, SiteIntroduction, SiteLinks } from './SiteInformation';
import { aboutContent } from '../locales/aboutContent';
import { LANGUAGES } from '../locales/dict';
import { informationMetadata, informationViewport } from '../config/siteMetadata';

describe('publisher site quality and navigation', () => {
    it.each(LANGUAGES.map(l => l.code))('provides a distinct complete About article in %s', lang => {
        const article = renderToStaticMarkup(createElement(AboutArticle, {lang}));
        const intro = renderToStaticMarkup(createElement(SiteIntroduction, {lang}));
        expect(aboutContent[lang]).toHaveLength(4);
        for (const paragraph of aboutContent[lang]) {
            expect(paragraph.trim().length).toBeGreaterThan(40);
            expect(intro).not.toContain(paragraph);
        }
        expect(article).toContain('data-about-article');
        expect(article).not.toContain('undefined');
        expect(article.match(/<h2\b/g)).toHaveLength(3);
        expect(article).toContain('href="/rules"');
    });
    it.each(LANGUAGES.map(l => l.code))('keeps help links independent of sign-in in %s', lang => {
        const html = renderToStaticMarkup(createElement(SiteLinks, {lang, newTab:true}));
        for (const path of ['rules','about','contact','updates','privacy','terms']) expect(html).toContain(`href="/${path}"`);
        expect(html.match(/target="_blank"/g)).toHaveLength(6);
        expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(6);
        expect(renderToStaticMarkup(createElement(SiteLinks, {lang}))).not.toContain('target="_blank"');
    });
    it('makes settings links available without leaving the live game or affecting Android support', () => {
        const source=readFileSync('src/app/page.tsx','utf8');
        expect(source).toContain('{webContent && <SiteLinks lang={lang} newTab/>}');
        expect(source).toContain('{android && <AppSupportLinks lang={lang}/>}');
    });
    it('preserves recording source outside the public route tree', () => {
        for (const path of ['teaser','teaser2']) {
            expect(existsSync(`src/app/${path}/page.tsx`)).toBe(false);
            expect(existsSync(`src/app/_${path}/page.tsx`)).toBe(true);
        }
        const robots=readFileSync('public/robots.txt','utf8');
        expect(robots).toContain('Allow: /');
        expect(robots).not.toContain('Disallow: /teaser');
    });
    it('includes terms in discovery and allows text enlargement only on information pages', () => {
        expect(readFileSync('public/sitemap.xml','utf8')).toContain('https://q-gambit.com/terms/');
        expect(informationMetadata('Terms','/terms/').alternates?.canonical).toBe('/terms/');
        expect(informationViewport.userScalable).toBe(true);
        expect(informationViewport.maximumScale).toBeGreaterThanOrEqual(2);
        expect(readFileSync('src/app/layout.tsx','utf8')).toContain('userScalable: false');
    });
});
