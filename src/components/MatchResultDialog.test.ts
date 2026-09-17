import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe,it,expect } from 'vitest';
import { MatchResultDialog,matchResultTitle } from './MatchResultDialog';
import { dict } from '../locales/dict';
describe('single, chess-language match result',()=>{
 it('does not label spectators as losers or reverse black-side results',()=>{
  expect(matchResultTitle('ja','black_wins','black')).toBe(dict.ja.whiteWins);
  expect(matchResultTitle('ja','white_wins','black')).toBe(dict.ja.blackWins);
  expect(matchResultTitle('ja','white_wins','spectator')).toBe(dict.ja.whiteWon);
 });
 it('renders draw only once and uses chess terminology',()=>{
  const html=renderToStaticMarkup(createElement(MatchResultDialog,{lang:'ja',winner:'draw',side:'white',children:null}));
  expect(html.split(dict.ja.draw).length-1).toBe(1);
  expect(dict.ja.check).toBe('チェック！');expect(dict.ja.checkmate).toBe('チェックメイト！');
  expect(JSON.stringify(dict.ja)).not.toMatch(/王手|詰み/);
 });
});
