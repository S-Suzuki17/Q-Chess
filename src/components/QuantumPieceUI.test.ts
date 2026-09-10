import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QuantumPieceUI } from './QuantumPieceUI';
import type { PieceType } from '../config/gameConfig';

const probabilities = { King: 1, Queen: 1, Rook: 1, Bishop: 1, Knight: 1, Pawn: 1 };
const render = (candidates?: Set<PieceType>) => renderToStaticMarkup(createElement(QuantumPieceUI, {
    id: 'piece', player: 'white', probabilities, candidates, isSelected: false, onClick() {}, responsive: true,
}));
describe('remaining candidate presentation', () => {
    it('shows all six candidates, not a featured piece or question mark', () => {
        const html = render();
        for (const symbol of ['♔','♕','♖','♗','♘','♙']) expect(html).toContain(symbol);
        expect(html.match(/class="quantum-icon /g)).toHaveLength(6);
        expect(html).not.toContain('>?</span>');
    });
    it('shows only the candidates that remain, retaining their wobble', () => {
        const html = render(new Set(['Queen','Knight']));
        expect(html).toContain('♕'); expect(html).toContain('♘');
        for (const symbol of ['♔','♖','♗','♙']) expect(html).not.toContain(symbol);
        expect(html.match(/class="quantum-icon /g)).toHaveLength(2);
    });
    it('keeps a confirmed piece enlarged', () => {
        const html = render(new Set(['Knight']));
        expect(html).toContain('text-[94cqmin]');
        expect(html).toContain('♘');
        expect(html).not.toContain('class="quantum-icon ');
    });
});
