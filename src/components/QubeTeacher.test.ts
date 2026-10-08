import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {QubeTeacher} from './QubeTeacher';
import {LANGUAGES, type Language} from '../locales/dict';
import {qubeTeaching} from '../locales/qubeTeaching';
import {LearningArticle} from './LearningPage';
import {AboutArticle, SiteIntroduction} from './SiteInformation';
import {learningCopy} from '../locales/siteContent';

describe('QUBE teaching presentation', () => {
    it('falls back to English for an unsupported runtime language', () => {
        const html = renderToStaticMarkup(createElement(QubeTeacher, {lang: 'xx' as Language, children: 'Keep the instruction'}));
        expect(html).toContain('lang="en"');
        expect(html).toContain(qubeTeaching.en.caption);
        expect(html).toContain('Keep the instruction');
    });
    it.each(LANGUAGES.map(item => item.code))('preserves instructional content and a localized speaker in %s', lang => {
        const html = renderToStaticMarkup(createElement(QubeTeacher, {lang, variant: 'compact', children: createElement('p', {role: 'status'}, 'Keep the actual instruction')}));
        expect(html).toContain('data-qube-teacher');
        expect(html).toMatch(/data-qube-speaker="[^"]*">QUBE/);
        expect(html).toContain(qubeTeaching[lang].caption);
        expect(html).toContain('alt=""');
        expect(html).not.toContain('alt="QUBE"');
        expect(html).toContain('role="status"');
        expect(html).toContain('Keep the actual instruction');
        for (const Component of [AboutArticle, SiteIntroduction]) {
            const article = renderToStaticMarkup(createElement(Component, {lang}));
            expect(article).toContain('data-qube-explanation');
            expect(article).toContain(qubeTeaching[lang].welcome);
            expect(article).not.toContain('undefined');
        }
    });
    it.each(['ja', 'en'] as const)('keeps hints and native answers within QUBE explanations in %s', lang => {
        const guide = renderToStaticMarkup(createElement(LearningArticle, {kind: 'guide', lang}));
        const faq = renderToStaticMarkup(createElement(LearningArticle, {kind: 'faq', lang}));
        expect(guide).toContain(learningCopy[lang].hintHelp);
        for (const section of ['start', 'candidates', 'decisions', 'outcomes', 'practice', 'chain']) {
            const body = guide.split(`id="${section}"`)[1]?.split('</section>')[0];
            expect(body, section).toContain('data-qube-teacher');
        }
        for (const item of learningCopy[lang].faqs) {
            const body = faq.split(`id="${item.id}"`)[1]?.split('</details>')[0];
            expect(body, item.id).toContain('data-qube-teacher');
            expect(body).toContain(item.answer);
        }
    });
});
