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
    it('lists every captured piece with authoritative translated identities', () => {
        const tokens = Array.from({length:7},(_,i)=>({...piece,id:`captured_${i}`,player:'black' as const,isCaptured:true}));
        const candidatesMap = new Map(tokens.map(token=>[token.id,new Set(['Knight' as const])]));
        const html=render({tokens,candidatesMap});
        expect(html.match(/data-captured-token=/g)).toHaveLength(7);
        expect(html).toContain('data-captured-by="white"');
        expect(html.match(/data-captured-candidate="Knight"/g)).toHaveLength(7);
        expect(html).toContain('aria-hidden="true">♞</span>');
        expect(html).not.toContain('<strong>ナイト</strong>');
        expect(html).not.toContain('<details');
        expect(html).not.toContain('<summary');
        expect(html).toContain('class="captured-inline"');
    });
    it('keeps unresolved capture candidates and respects promotions', () => {
        const html=render({tokens:[{...piece,id:'uncertain',isCaptured:true},{...piece,id:'promoted',isCaptured:true,promotedTo:'Queen'}],candidatesMap:new Map([['uncertain',new Set(['Bishop','Knight'])]])});
        expect(html).toContain('data-captured-candidate="Bishop"');
        expect(html).toContain('data-captured-candidate="Knight"');
        expect(html).toContain('data-captured-candidate="Queen"');
        expect(html).toContain('aria-label="ビショップ / ナイト · 候補"');
        expect(html).not.toContain('<strong>ビショップ / ナイト</strong>');
    });
    it('shows the cinematic only with a checkmate flag, not merely a finished game', () => {
        expect(render({finished:true})).not.toContain('checkmate-celebration');
        expect(render({finished:true,checkmate:true})).toContain('data-testid="checkmate-celebration"');
    });
    it('does not offer a camera reset or tell players to zoom', () => {
        expect(render({is2D:false})).not.toContain('視点を戻す');
        expect(render({is2D:false})).not.toContain('スクロールで拡大');
    });
    it('announces both the hinted source and destination without making a move', () => {
        const html=render({hintMove:{fromRow:6,fromCol:4,toRow:4,toCol:4}});
        expect(html).toContain('動かす駒'); expect(html).toContain('移動先');
        expect(html).toContain('data-testid="hint-source">e2');
        expect(html).toContain('data-testid="hint-destination">e4');
        expect(html).toContain('aria-live="polite"');
    });
    it('hides advice after the turn changes or the match ends', () => {
        const hintMove={fromRow:6,fromCol:4,toRow:4,toCol:4};
        expect(render({hintMove,currentTurn:'black'})).not.toContain('data-testid="move-advice"');
        expect(render({hintMove,finished:true})).not.toContain('data-testid="move-advice"');
    });
    it('provides pending and failure feedback', () => {
        expect(render({hintPending:true})).toContain('移動元と移動先を検討しています');
        expect(render({hintFailed:true})).toContain('ヒントを取得できませんでした');
    });
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
