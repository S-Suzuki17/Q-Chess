import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {SiteLinks, AboutArticle} from './SiteInformation';
import {LANGUAGES} from '../locales/dict';

describe('QUBE diary retirement', () => {
    it.each(LANGUAGES.map(l => l.code))('removes diary navigation and explanation in %s', lang => {
        const html = renderToStaticMarkup(createElement(SiteLinks, {lang})) + renderToStaticMarkup(createElement(AboutArticle, {lang}));
        expect(html).not.toMatch(/\/updates|QUBE|QUBIT4x/);
        expect(html).toContain('href="/rules"');
        expect(html).toContain('href="/contact"');
    });
    it('removes posts, generators and drafts and prevents runtime imports', () => {
        for (const file of ["src/data/devDiary.ts","src/components/DevDiaryTimeline.tsx","src/app/updates/page.tsx","src/app/updates/layout.tsx","scripts/add-tweet.mjs","scripts/export-qube-drafts.mjs","outputs/qube-drafts"]) expect(existsSync(file), file).toBe(false);
        function scan(dir: string) {
            for (const entry of readdirSync(dir, {withFileTypes: true})) {
                const file = join(dir, entry.name);
                if (entry.isDirectory()) scan(file);
                else if (/\.(?:tsx?|mjs)$/.test(file) && !file.includes('.test.')) expect(readFileSync(file, 'utf8'), file).not.toMatch(/DevDiaryTimeline|devDiaryTweets|QUBIT4x|\/updates/);
            }
        }
        scan('src');
        expect(readFileSync('public/sitemap.xml', 'utf8')).not.toContain('/updates/');
    });
    it('retains the existing move-hint action and search lifecycle', () => {
        expect(readFileSync('src/hooks/useMoveHint.ts', 'utf8')).toMatch(/useMoveHint/);
        expect(readFileSync('src/components/MatchLayout.tsx', 'utf8')).toMatch(/onHint/);
    });
    it('retains QUBE identity, image and thinking feedback in the development candidate', () => {
        expect(existsSync('public/qube_icon.jpg')).toBe(true);
        const layout = readFileSync('src/components/MatchLayout.tsx', 'utf8');
        expect(layout).toContain('QUBEに聞く');
        expect(layout).toContain('/qube_icon.jpg');
        expect(layout).toContain('QUBEが考え中…');
    });
});
