import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { HintArrow2D } from './HintArrow2D';

it.each([false,true])('keeps the two endpoints above pieces without intercepting clicks (flipped=%s)', flipped => {
    const html=renderToStaticMarkup(createElement(HintArrow2D,{move:{fromRow:6,fromCol:4,toRow:4,toCol:4},flipped}));
    expect(html).toContain('aria-label="e2 → e4"');
    expect(html).toContain('data-hint-endpoint="from"'); expect(html).toContain('data-hint-endpoint="to"');
    expect(html).toContain('pointer-events:none'); expect(html).toContain('z-index:55');
    expect(html).toContain(flipped?'rotate(180)':'rotate(0)');
});
