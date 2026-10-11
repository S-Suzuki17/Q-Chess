import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PixelCastleBackdrop } from './PixelCastleBackdrop';

it('draws original static castle geometry directly, without external imagery or animation',()=>{
 const svg=renderToStaticMarkup(React.createElement(PixelCastleBackdrop,{stageId:1}));
 expect(svg).toContain('viewBox="0 0 320 180"');
 expect(svg).toContain('shape-rendering="crispEdges"');
 expect(svg).toContain('data-pixel-castle-room="1"');
 expect(svg.match(/<rect /g)?.length).toBeGreaterThan(500);
 expect(svg).not.toMatch(/<(image|filter|animate|linearGradient|radialGradient)\b|https?:\/\/(?!www\.w3\.org)|\.webp|\.png/);
 expect(svg).toContain('aria-hidden="true"');
});
it('only adds the final throne to the real final room',()=>{
 expect(renderToStaticMarkup(React.createElement(PixelCastleBackdrop,{stageId:99}))).not.toContain('data-pixel-throne');
 expect(renderToStaticMarkup(React.createElement(PixelCastleBackdrop,{stageId:100}))).toContain('data-pixel-throne="true"');
});
it('has deterministic integer geometry and safe scene selection',()=>{
 const first=renderToStaticMarkup(React.createElement(PixelCastleBackdrop,{stageId:43}));
 expect(first).toBe(renderToStaticMarkup(React.createElement(PixelCastleBackdrop,{stageId:43})));
 expect(first).not.toMatch(/(?:x|y|width|height)="-?\d+\.\d+/);
 expect(renderToStaticMarkup(React.createElement(PixelCastleBackdrop,{stageId:NaN}))).toContain('data-pixel-castle-room="1"');
});
