import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, mocks) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true}}).outputText;
  const exports = {};
  vm.runInNewContext(js, {exports, require: id => {
    if (!(id in mocks)) throw new Error(`Unexpected import ${id}`);
    return mocks[id];
  }, console, setTimeout, clearTimeout, setInterval, clearInterval, crypto});
  return exports;
}
function hooks() {
  const slots = []; let cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({type, props: {...props, children}}),
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
    useRef: value => ({current: value}), useMemo: fn => fn(), useCallback: fn => fn, useEffect: () => {},
  };
  return {React, slots, reset: () => {cursor = 0;}};
}
function find(node, pred) {
  if (!node || typeof node !== 'object') return;
  if (pred(node)) return node;
  for (const child of [node.props?.children].flat(10)) { const result = find(child, pred); if (result) return result; }
}
test('matchmaking preserves authenticated and guest host identities', () => {
  for (const id of ['registered-user', 'GUEST-anonymous']) {
    for (const host of [id, 'opponent']) {
      const h = hooks(); const listeners = {};
      h.React.useEffect = fn => fn();
      const socket = {on: (event, cb) => listeners[event] = cb, emit() {}, off() {}};
      const {useMatchmaking} = load('src/hooks/useMatchmaking.ts', {react: h.React, '../lib/SocketContext': {useSocket: () => ({socket, isConnected: true})}});
      useMatchmaking({id}); listeners.match_found({hostId: host, joinerId: host === id ? 'opponent' : id, matchId: 'm', timeControl: 600});
      assert.equal(h.slots[1].myColor, host === id ? 'white' : 'black');
    }
  }
});
for (const [role, team, row, target] of [['white', 0, 1, 2], ['black', 1, 6, 5]]) {
  test(`${role}: stale role recovers, own piece emits move, opponent turn blocks`, () => {
    const h = hooks(); const sent = []; const Board = () => {};
    const socket = {emit: (...args) => sent.push(args)};
    const Component = load('src/components/OnlineGameBoard.tsx', {
      react: h.React, '../lib/SocketContext': {useSocket: () => ({socket, isConnected: true})},
      '../locales/dict': {dict: {en: {}, ja: {}}}, './QuantumPieceUI': {QuantumPieceUI: () => {}}, './Board3D': {Board3D: Board}, './AdBanner': {AdBanner: () => {}},
      uuid: {v4: () => 'test-action'}, '../lib/GameEngine': {deduceMoveTypes: () => []}, '../lib/supabaseClient': {supabase: {}},
    }).default;
    const state = {version: 3, turn: team, gameOver: null, players: {host: 'white-user', joiner: 'black-user'}, pieces: [{id: 8, team, x: 0, y: row, captured: false, possibilities: ['P']}], clock: {white: 600000, black: 600000}};
    h.slots[0] = state;
    const render = () => {h.reset(); return Component({lang: 'ja', user: {id: `${role}-user`}, onlineRole: role === 'white' ? 'black' : 'white'});};
    let board = find(render(), n => n.type === Board);
    assert.equal(board.props.onlineRole, role); assert.equal(board.props.isFlipped, role === 'white');
    board.props.onSquareClick(row, 0);
    find(render(), n => n.type === Board).props.onSquareClick(target, 0);
    assert.equal(sent.length, 1); assert.equal(sent[0][0], 'player_action');
    assert.deepEqual(JSON.parse(JSON.stringify(sent[0][1].action.payload)), {pieceId: 8, toX: 0, toY: target});
    state.turn = 1 - team;
    find(render(), n => n.type === Board).props.onSquareClick(row, 0);
    find(render(), n => n.type === Board).props.onSquareClick(target, 0);
    assert.equal(sent.length, 1);
    state.turn = team; state.pieces[0].possibilities = ['K', 'R', 'Q'];
    find(render(), n => n.type === Board).props.onSquareClick(row, 2);
    const dialog = find(render(), n => n.props?.role === 'dialog');
    assert.ok(dialog, 'ambiguous move must expose a choice');
    find(dialog, n => n.type === 'button' && n.props.key === 'normal').props.onClick();
    assert.equal(sent.length, 2); assert.equal(sent[1][1].action.payload.intention, 'normal');
  });
}
test('server accepts alternating white and black opening moves', () => {
  const rules = load('server/src/game/quantumChess.ts', {});
  const {GameEngine} = load('server/src/game/GameEngine.ts', {'./quantumChess': rules});
  const engine = new GameEngine('m', 'white-user', 'black-user', rules.createInitialBoard());
  for (const [playerId, row, toY] of [['white-user', 1, 2], ['black-user', 6, 5]]) {
    const before = engine.getPublicState(playerId);
    const piece = before.pieces.find(p => p.x === 0 && p.y === row);
    const result = engine.processAction({actionId: playerId, version: before.version, playerId, action: {type: 'MOVE', payload: {pieceId: piece.id, toX: 0, toY}}});
    assert.equal(result.success, true);
    assert.equal(engine.getPublicState(playerId).pieces.find(p => p.id === piece.id).y, toY);
  }
});
