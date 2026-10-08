import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parse } from 'postcss';
import { CrownOpponentArtwork } from './CrownNavigation';
import { QuantumPieceUI } from './QuantumPieceUI';
import type { PieceType } from '../config/gameConfig';

const encounters: [number, PieceType][] = [
    [1, 'Pawn'], [21, 'Knight'], [41, 'Bishop'], [61, 'Rook'], [81, 'Queen'], [100, 'King'],
];

describe('castle enemy staging preserves adopted pieces', () => {
    it.each(encounters)('stage %i uses the exact existing %s renderer on either side', (stageId, type) => {
        for (const player of ['white', 'black'] as const) {
            const probabilities: Record<PieceType, number> = { Pawn:0, Knight:0, Bishop:0, Rook:0, Queen:0, King:0 };
            probabilities[type] = 1;
            const adopted = renderToStaticMarkup(React.createElement(QuantumPieceUI, {
                id:`crown-opponent-${type.toLowerCase()}`, player, probabilities,
                isSelected:false, onClick:()=>{}, responsive:true,
            }));
            const portrait = renderToStaticMarkup(React.createElement(CrownOpponentArtwork, {stageId, player}));
            expect(portrait).toContain(`data-current-piece="${type}"`);
            expect(portrait).toContain(adopted);
            expect(portrait).not.toMatch(/<canvas|<img|<svg/);
        }
    });

    it('only decorates wrappers with a static plinth, including the final king', () => {
        const css = parse(readFileSync(new URL('./crown-enemy-staging.css', import.meta.url), 'utf8'));
        css.walkRules(rule => {
            expect(rule.selector).toMatch(/\.(crown-enemy-silhouette|crown-adopted-piece|crown-opponent)(::after|>div|>div>strong)?$/);
            expect(rule.selector).not.toMatch(/crown-adopted-piece\s*>|canvas|svg/);
        });
        css.walkDecls(declaration => {
            expect(declaration.prop).not.toMatch(/animation|transition|filter|transform/);
            expect(declaration.value).not.toMatch(/url\(/);
        });
        expect(css.toString()).toContain("[data-circuit-stage='100']");
        const narrow = css.nodes.find(node => node.type === 'atrule' && node.params === '(max-width:380px)');
        expect(narrow?.toString()).toContain('position:static');
    });
});
