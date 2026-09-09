import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MatchLayout } from './MatchLayout';
import type { Token } from '../lib/GameEngine';

const piece: Token = { id:'white_1', player:'white', row:6, col:4,
    probabilities:{King:1, Queen:1, Rook:1, Bishop:1, Knight:1, Pawn:1} };
const noop = () => {};
const base: ComponentProps<typeof MatchLayout> = {
    lang:'ja', mode:'CPU', white:{name:'Guest',clock:'10:00'}, black:{name:'CPU',clock:'10:00'},
    bottomSide:'white',currentTurn:'white',finished:false,tokens:[piece],selectedTokenId:null,history:[],
    validMoveCount:16,onClearSelection:noop,is2D:true,onViewChange:noop,onThemeChange:noop,onResetView:noop,
    onHome:noop,onRules:noop,onResign:noop,showMoveHints:true,onHintsChange:noop,board:null,onHint:noop,
};
const render = (overrides: Partial<typeof base> = {}) => renderToStaticMarkup(createElement(MatchLayout, {...base,...overrides}));

describe('Match decision feedback', () => {
    it('distinguishes no selection from an unresolved piece', () => {
        const html = render();
        expect(html).toContain('未選択');
        expect(html).toContain('あなたの手番 · 自分の駒を選択');
        expect(html.match(/data-possible="true"/g) ?? []).toHaveLength(0);
    });
    it('shows all six possibilities for a selected starting piece', () => {
        const html = render({selectedTokenId:piece.id});
        expect(html.match(/data-possible="true"/g)).toHaveLength(6);
        expect(html).toContain('移動先を選択 · 16マス');
        expect(html).toContain('駒の選択を解除');
    });
    it('uses authoritative candidate sets instead of stale probabilities', () => {
        const html = render({selectedTokenId:piece.id,candidatesMap:new Map([[piece.id,new Set(['Knight'])]])});
        expect(html.match(/data-possible="true"/g)).toHaveLength(1);
        expect(html).toContain('白 · 確定');
        expect(html).toContain('キング: 候補から除外');
    });
    it('keeps last-move feedback distinct from current selection', () => {
        const html = render({history:[{turn:1,player:'white',tokenId:piece.id,from:[6,4],to:[4,4],possibleTypes:['Pawn','Rook','Queen']}],tokens:[{...piece,row:4}]});
        expect(html).toContain('直前に動いた駒');
        expect(html).toContain('>e4</strong>');
        expect(html).not.toContain('aria-label="駒の選択を解除"');
    });
    it('does not offer moving an opponent piece or a piece with no moves', () => {
        expect(render({tokens:[{...piece,player:'black'}],selectedTokenId:piece.id})).toContain('相手の駒を確認中');
        expect(render({selectedTokenId:piece.id,validMoveCount:0})).toContain('移動先がありません');
    });
    it('disables hints on the opponent turn and warns on low time', () => {
        const html = render({currentTurn:'black',white:{name:'Guest',clock:'0:30'}});
        expect(html).toContain('相手の手番');
        expect(html).toContain('match-hint-action" disabled');
        expect(html).toContain('urgent');
        expect(html).toContain('残り時間 0:30');
    });
    it('does not show resign or a player turn instruction to spectators', () => {
        const html = render({spectator:true});
        expect(html).toContain('観戦中');
        expect(html).not.toContain('match-resign');
        expect(html).not.toContain('あなたの手番');
    });
    it('shows a promotion as its new identity', () => {
        const html = render({tokens:[{...piece,promotedTo:'Queen'}],selectedTokenId:piece.id});
        expect(html.match(/data-possible="true"/g)).toHaveLength(1);
        expect(html).toContain('クイーン: 候補');
    });
});
