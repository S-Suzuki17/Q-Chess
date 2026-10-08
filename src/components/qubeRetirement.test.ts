import {createElement, type ComponentProps} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {SiteLinks, AboutArticle} from './SiteInformation';
import {LANGUAGES} from '../locales/dict';
import {MatchLayout} from './MatchLayout';

describe('QUBE diary retirement', () => {
    it.each(LANGUAGES.map(l => l.code))('removes diary navigation and explanation in %s', lang => {
        const html = renderToStaticMarkup(createElement(SiteLinks, {lang})) + renderToStaticMarkup(createElement(AboutArticle, {lang}));
        expect(html).not.toMatch(/\/updates|QUBIT4x|devDiaryTweets|DevDiaryTimeline/);
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
        const noop = () => {};
        const props: ComponentProps<typeof MatchLayout> = {
            lang:'ja',mode:'CPU',white:{name:'Guest',clock:'10:00'},black:{name:'CPU',clock:'10:00'},
            bottomSide:'white',currentTurn:'white',finished:false,tokens:[],selectedTokenId:null,
            validMoveCount:0,onClearSelection:noop,is2D:true,onViewChange:noop,onResetView:noop,
            onHome:noop,onRules:noop,onResign:noop,showMoveHints:true,onHintsChange:noop,board:null,onHint:noop,
        };
        const ready = renderToStaticMarkup(createElement(MatchLayout, props));
        const pending = renderToStaticMarkup(createElement(MatchLayout, {...props,hintPending:true}));
        for (const html of [ready,pending]) { expect(html).toContain('QUBE'); expect(html).toContain('/qube_icon.jpg'); }
        expect(pending).toContain('考え中');
        expect(pending).toContain('aria-busy="true"');
    });
});
