import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { QubeCompanion } from './QubeCompanion';
import { QUBE_EXPRESSION, QUBE_PIVOTS, qubeMotionTracks, type QubeState } from './qubeMotion';

const states: QubeState[] = ['idle', 'anticipation', 'victory', 'encouragement'];
describe('QUBE 2D companion rendering', () => {
    it.each(states)('renders the %s expression with no canvas, image request or gameplay controls', state => {
        const html = renderToStaticMarkup(createElement(QubeCompanion, { state }));
        expect(html).toContain(`data-qube-state="${state}"`);
        expect(html).toContain(`data-qube-expression="${QUBE_EXPRESSION[state]}"`);
        expect(html).toContain('data-qube-sweat="hidden"');
        expect(html).toMatch(/data-qube-part="sweat"[^>]*opacity="0"/);
        expect(html).not.toMatch(/data-qube-part="(?:mouth|brows|cheeks)"/);
        expect(html).toContain('role="img"');
        expect(html).toContain('aria-label="QUBE"');
        expect(html).toContain('viewBox="0 0 300 310"');
        expect(html).not.toMatch(/<canvas|<img|<button|<a |<audio|<video|<iframe|<script|href=/);
        for (const part of ['pawn', 'sweat', 'teal-mark', 'head', 'body', 'eyes', 'lids', 'arm-left', 'arm-right', 'leg-left', 'leg-right']) {
            expect(html).toContain(`data-qube-part="${part}"`);
        }
    });
    it('renders every animated target and matches the artist-provided joint pivots', () => {
        const html = renderToStaticMarkup(createElement(QubeCompanion));
        for (const state of states) for (const { part } of qubeMotionTracks(state)) expect(html).toContain(`data-qube-part="${part}"`);
        const pivots = [...html.matchAll(/data-qube-part="([^"]+)" data-qube-pivot="([^"]+)"/g)];
        for (const [, name, pivot] of pivots) {
            if (name in QUBE_PIVOTS) expect(QUBE_PIVOTS[name as keyof typeof QUBE_PIVOTS].join(' ')).toBe(pivot);
        }
    });
    it('supports compact badge sizing and clamps invalid numeric sizes safely', () => {
        const compact = renderToStaticMarkup(createElement(QubeCompanion, { compact: true, size: 64, className: 'encounter-guide' }));
        expect(compact).toContain('data-qube-compact="true"');
        expect(compact).toContain('--qube-size:64px');
        expect(compact).toContain('qube-companion encounter-guide');
        expect(renderToStaticMarkup(createElement(QubeCompanion, { size: -100 }))).toContain('--qube-size:48px');
        expect(renderToStaticMarkup(createElement(QubeCompanion, { size: 999 }))).toContain('--qube-size:160px');
        expect(renderToStaticMarkup(createElement(QubeCompanion, { size: Number.NaN }))).not.toContain('NaN');
    });
    it('retains the exact expression with explicit reduced motion', () => {
        const html = renderToStaticMarkup(createElement(QubeCompanion, { state: 'victory', reducedMotion: true }));
        expect(html).toContain('data-qube-expression="joy"');
        expect(html).toContain('data-qube-reduced-motion="true"');
    });
    it('avoids duplicate announcements when used next to QUBE dialogue', () => {
        const html = renderToStaticMarkup(createElement(QubeCompanion, { decorative: true }));
        expect(html).toContain('aria-hidden="true"');
        expect(html).not.toContain('role="img"');
        expect(html).not.toContain('aria-label=');
        expect(html).not.toContain('aria-live=');
    });
    it('does not rely on GPU libraries, network requests or recurring scheduling', () => {
        const runtime = readFileSync('src/components/QubeCompanion.tsx', 'utf8') + readFileSync('src/components/qubeMotion.ts', 'utf8');
        expect(runtime).not.toMatch(/from ['"](?:three|@react-three)|requestAnimationFrame\(|setInterval\(|setTimeout\(|fetch\(/);
        expect(readFileSync('src/components/qube-companion.css', 'utf8')).not.toContain('infinite');
    });
});
