import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Board2D } from './Board2D';
import { nextBoardFocus } from './boardKeyboard';
import type { Token } from '../lib/GameEngine';
import type { PieceType } from '../config/gameConfig';

describe('2D board keyboard navigation', () => {
    it('moves in the displayed direction from both sides without wrapping an edge', () => {
        expect(nextBoardFocus(56, 'ArrowRight', false)).toBe(57);
        expect(nextBoardFocus(56, 'ArrowUp', false)).toBe(48);
        expect(nextBoardFocus(56, 'ArrowLeft', false)).toBe(56);
        expect(nextBoardFocus(56, 'ArrowDown', false)).toBe(56);
        expect(nextBoardFocus(7, 'ArrowRight', true)).toBe(6);
        expect(nextBoardFocus(7, 'ArrowUp', true)).toBe(15);
        expect(nextBoardFocus(7, 'ArrowLeft', true)).toBe(7);
        expect(nextBoardFocus(7, 'ArrowDown', true)).toBe(7);
    });
    it('supports row and board boundaries in either orientation', () => {
        for (const flipped of [false, true]) {
            expect(nextBoardFocus(35, 'Home', flipped)).toBe(flipped ? 39 : 32);
            expect(nextBoardFocus(35, 'End', flipped)).toBe(flipped ? 32 : 39);
            expect(nextBoardFocus(35, 'Home', flipped, true)).toBe(flipped ? 63 : 0);
            expect(nextBoardFocus(35, 'End', flipped, true)).toBe(flipped ? 0 : 63);
        }
    });
    it('leaves activation and leaving the board to normal key handling', () => {
        for (const key of ['Tab', 'Enter', ' ', 'Escape']) expect(nextBoardFocus(35, key, false)).toBeNull();
    });
    it('has one Tab stop and announces authoritative candidates, colors and legal destinations', () => {
        const token: Token = {id:'sample',player:'white',row:6,col:4,
            probabilities:{King:1,Queen:1,Rook:1,Bishop:1,Knight:1,Pawn:1}};
        const html = renderToStaticMarkup(createElement(Board2D, {
            lang:'ja', tokens:[token], selectedTokenId:token.id,
            validMoves:[{r:4,c:4}], moveHistory:[], onSquareClick:()=>{}, showMoveHints:true,
            candidatesMap:new Map([[token.id,new Set<PieceType>(['Pawn','Queen'])]]),
        }));
        expect(html.match(/tabindex="0"/g)).toHaveLength(1);
        expect(html.match(/tabindex="-1"/g)).toHaveLength(63);
        expect(html).toContain('aria-label="e2 · 白 · クイーン / ポーン"');
        expect(html).toContain('aria-label="e4 · 移動先"');
        expect(html).not.toContain('e2 · 白 · キング');
    });
});
