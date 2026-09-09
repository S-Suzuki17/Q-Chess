import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { BoardAtmosphere, ENVIRONMENT_ART } from './BoardAtmosphere';

it.each(['classic','marble','neon'] as const)('%s ships real art as a decorative layer, not a replacement board',theme=>{
    const file=readFileSync(`public${ENVIRONMENT_ART[theme]}`);
    expect(file.subarray(1,4).toString()).toBe('PNG');
    expect(file.readUInt32BE(16)).toBe(1536); expect(file.readUInt32BE(20)).toBe(1024);
    const html=renderToStaticMarkup(createElement(BoardAtmosphere,{theme}));
    expect(html).toContain('aria-hidden="true"'); expect(html).toContain(ENVIRONMENT_ART[theme]);
    expect(html).not.toContain('<button'); expect(html).not.toContain('<canvas');
});
