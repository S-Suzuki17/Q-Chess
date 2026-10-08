import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { rulesDict } from '../../locales/rulesDict';
import { rulesVisualDict } from '../../locales/rulesVisualDict';
import RulesPage from './page';

it('keeps the public visual rules readable without offering an interactive tutorial', () => {
    const html = renderToStaticMarkup(createElement(RulesPage));
    expect(html).toContain(rulesVisualDict.en.movementTitle);
    expect(html).toContain(rulesVisualDict.en.captureLabel);
    expect(html).toContain(rulesVisualDict.en.mateLabel);
    expect(html).toContain(rulesDict.en.sec3p1);
    expect(html).toContain('href="/guide"');
    expect(html).toContain('href="/faq"');
    expect(html).not.toContain(rulesDict.en.sec4p1);
    expect(html).not.toContain(rulesDict.en.playTutorial);
    expect(html).not.toContain('role="dialog"');
});
