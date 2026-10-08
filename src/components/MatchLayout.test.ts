import { readFileSync } from 'node:fs';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MatchLayout } from './MatchLayout';
import type { Token } from '../lib/GameEngine';
import { LANGUAGES } from '../locales/dict';
import { matchText } from '../locales/matchText';
import { moveHintText } from '../locales/moveHintText';

const piece: Token = { id:'white_1', player:'white', row:6, col:4,
    probabilities:{King:1, Queen:1, Rook:1, Bishop:1, Knight:1, Pawn:1} };
const noop = () => {};
const base: ComponentProps<typeof MatchLayout> = {
    lang:'ja', mode:'CPU', white:{name:'Guest',clock:'10:00'}, black:{name:'CPU',clock:'10:00'},
    bottomSide:'white',currentTurn:'white',finished:false,tokens:[piece],selectedTokenId:null,history:[],
    validMoveCount:16,onClearSelection:noop,is2D:true,onViewChange:noop,onResetView:noop,
    onHome:noop,onRules:noop,onResign:noop,showMoveHints:true,onHintsChange:noop,board:null,onHint:noop,
};
const render = (overrides: Partial<typeof base> = {}) => renderToStaticMarkup(createElement(MatchLayout, {...base,...overrides}));

describe('Match decision feedback', () => {
    it.each(LANGUAGES.map(language=>language.code))('shows an explicit free or 1-ticket action and QUBE explanations in %s',lang=>{
        expect(render({lang,hintAccess:'free'})).toContain(moveHintText(lang).free);
        expect(render({lang,hintAccess:'ticket'})).toContain(moveHintText(lang).ticket);
        expect(render({lang,hintAccess:'ticket'})).toContain('data-qube-speaker');
        const historical=render({lang,finished:true,hintAccess:'ticket',onRecoverHint:noop,savedHint:{fromRow:6,fromCol:0,toRow:5,toCol:0}});
        expect(historical).toContain(moveHintText(lang).historical);expect(historical).toContain(moveHintText(lang).recover);
        expect(historical).not.toContain('data-testid="hint-source"');expect(historical).not.toContain('data-testid="hint-destination"');
    });
    it('uses the English teacher for an unsupported locale',()=>{expect(render({lang:'unknown'})).toContain('data-qube-speaker');});
    it('states every promotion and special choice needed to replay the hint', () => {
        const hintMove = { fromRow: 1, fromCol: 4, toRow: 0, toCol: 4 };
        for (const [promotionTarget, name] of [[16, 'クイーン'], [8, 'ルーク'], [4, 'ビショップ'], [2, 'ナイト']] as const) {
            const html = render({ hintMove: { ...hintMove, promotionTarget } });
            expect(html).toContain(`data-testid="hint-choice">プロモーション（昇格）: ${name}`);
        }
        expect(render({ hintMove: { ...hintMove, declinePromotion: true } })).toContain('キャンセル（ポーンではない）');
        for (const intention of ['castle', 'normal'] as const) {
            expect(render({ lang: 'en', hintMove: { ...hintMove, intention } })).toContain(intention === 'castle' ? 'Castling (King)' : 'Normal Move (Rook/Queen)');
        }
    });
    it('keeps view controls but never offers cosmetic changes during a match',()=>{
        const html=render();
        expect(html).not.toContain('match-theme');
        expect(html).not.toContain('盤面のデザインを変更');
        expect(html).toContain('>3D</button>');
        expect(html).toContain('>2D</button>');
    });
    it('shows a check once on the board and hides it after the finish',()=>{
        expect(render({checkNotice:'チェック！'}).match(/data-testid="check-warning"/g)).toHaveLength(1);
        expect(render({checkNotice:'チェック！',finished:true})).not.toContain('data-testid="check-warning"');
        expect(render({checkmate:true,finished:true,resultVisible:true})).not.toContain('data-testid="checkmate-celebration"');
        expect(render({checkmate:true,finished:true})).toContain('data-testid="checkmate-celebration"');
    });
    it.each(LANGUAGES.map(language => language.code))('keeps captured icons and both hint endpoints available in %s', lang => {
        const captured = {...piece, id:'captured', player:'black' as const, isCaptured:true};
        const html = render({lang, tokens:[piece,captured],
            candidatesMap:new Map([[captured.id,new Set(['Queen','Knight'])]]),
            hintMove:{fromRow:6,fromCol:4,toRow:4,toCol:4}});
        expect(html).toContain('data-captured-candidate="Queen"');
        expect(html).toContain('data-captured-candidate="Knight"');
        expect(html).toContain('data-testid="hint-source">e2');
        expect(html).toContain('data-testid="hint-destination">e4');
        expect(html).toContain(matchText(lang,'獲得した駒','Captured pieces'));
        expect(html).not.toContain('<details');
        expect(html).not.toContain('undefined');
    });
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
    it('keeps an empty polite live region ready before a hint is requested', () => {
        const html = render();
        expect(html).toContain('role="status" aria-live="polite" aria-atomic="true" data-hint-status="true"></section>');
        expect(html).not.toContain('data-testid="move-advice"');
        expect(html).toContain('match-hint-action" aria-busy="false"');
        expect(html).not.toContain('qube-icon thinking');
    });
    it.each(LANGUAGES.map(language => language.code))('exposes pending feedback and a disabled busy action without duplicate icon text in %s', lang => {
        const html = render({lang, hintPending:true});
        const button = html.match(/<button class="match-button match-hint-action"[^]*?<\/button>/)?.[0];
        const status = html.match(/<section class="match-advice"[^]*?<\/section>/)?.[0];
        expect(button).toContain('disabled="" aria-busy="true"');
        expect(button).toContain('src="/qube_icon.jpg" alt="" aria-hidden="true" class="qube-icon thinking"');
        expect(button).toContain(matchText(lang,'QUBEが考え中…','QUBE is thinking…'));
        expect(button).not.toContain('alt="QUBE"');
        expect(status).toContain(matchText(lang,'QUBEが考え中…','QUBE is thinking…'));
        expect(status).not.toContain('aria-busy="true"');
    });
    it('shows pending feedback ahead of a stale result, then makes a failed hint retryable', () => {
        const pending = render({hintPending:true, hintMove:{fromRow:6,fromCol:4,toRow:4,toCol:4}});
        expect(pending).toContain('QUBEが考え中…');
        expect(pending).not.toContain('data-testid="hint-source"');
        const failed = render({hintFailed:true});
        expect(failed).toContain('ヒントを取得できませんでした');
        expect(failed).toContain('match-hint-action" aria-busy="false"');
        expect(failed).not.toContain('qube-icon thinking');
    });
    it.each([{currentTurn:'black' as const},{finished:true},{spectator:true}])('clears stale loading feedback when advice is no longer available: %j', state => {
        const html = render({...state, hintPending:true, hintFailed:true});
        expect(html).toContain('match-hint-action" disabled="" aria-busy="false"');
        expect(html).not.toContain('QUBEが考え中…');
        expect(html).not.toContain('qube-icon thinking');
        expect(html).not.toContain('data-testid="move-advice"');
    });
    it('defines a lightweight icon pulse and explicitly stops it for reduced motion', () => {
        const css = readFileSync(new URL('./match-layout.css', import.meta.url), 'utf8');
        expect(css).toMatch(/\.qube-icon\.thinking\s*\{\s*animation:\s*qube-pulse 1\.5s infinite ease-in-out;/);
        expect(css).toContain('transform: scale(0.9); opacity: 0.7;');
        expect(css).toContain('transform: scale(1.1); opacity: 1;');
        expect(css).toMatch(/@media\(prefers-reduced-motion:reduce\)\s*\{\s*\.match-layout \.qube-icon\.thinking\s*\{\s*animation:none!important;/);
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
