import { describe, expect, it } from 'vitest';
import { buildReplayTimeline, recordReplayMove, type ReplayPosition } from '../../../src/lib/replayHistory';
import { createLocalPosition, applyLocalMove } from '../../../src/lib/localGame';
import type { GameRecord, MoveRecord } from '../../../src/lib/gameRecordService';
import type { PieceType } from '../../../src/config/gameConfig';
import { GameEngine } from './GameEngine';
import { createInitialBoard } from './quantumChess';
import { recordReplayChanges, replayPieceNumber } from './replayHistory';
import { TYPE_TO_BIT } from '../../../src/quantum-engine/adapter';

const record = (moves: MoveRecord[], mode: GameRecord['mode'] = 'cpu'): GameRecord => ({
    mode, moves, total_moves: moves.length, white_player: 'White', black_player: 'Black', winner: 'white_wins'
});
const square = (s: string): [number, number] => [8 - Number(s[1]), 'abcdefgh'.indexOf(s[0])];
const identity = (id: string) => Number(id.split('_')[1]);
const compact = (position: ReplayPosition) => position.tokens.map(token => [identity(token.id), token.row, token.col,
    !!token.isCaptured, !!token.hasMoved, token.promotedTo ?? null,
    [...position.pool.piecePossibilities.get(token.id)!].sort()]).sort((a, b) => Number(a[0]) - Number(b[0]));
type TestMove = [string, string, PieceType[], PieceType?];
function playLocal(turns: TestMove[]) {
    let position = createLocalPosition();
    const moves: MoveRecord[] = [], positions: ReplayPosition[] = [position];
    for (const [from, to, possibleTypes, promotedTo] of turns) {
        const [row, col] = square(from), [targetRow, targetCol] = square(to);
        const token = position.tokens.find(t => !t.isCaptured && t.row === row && t.col === col)!;
        expect(token, from).toBeDefined();
        const player = moves.length % 2 ? 'black' : 'white';
        const after = applyLocalMove(position.tokens, position.pool, { tokenId: token.id, targetRow, targetCol, possibleTypes, promotedTo }, player, moves);
        moves.push(recordReplayMove({ turn: moves.length + 1, player, tokenId: token.id, from: [row, col], to: [targetRow, targetCol], possibleTypes, promotedTo, capturedTokenId: after.capturedId }, position, after));
        position = after; positions.push(position);
    }
    return { moves, positions };
}
const forward: PieceType[] = ['Pawn', 'Rook', 'Queen'];
const examples: Record<string, TestMove[]> = {
    'candidate collapse and capture': [
        ['c2', 'e4', ['Bishop', 'Queen']], ['b7', 'd5', ['Bishop', 'Queen']],
        ['e4', 'e5', ['Queen']], ['d5', 'd4', ['Queen']],
        ['e5', 'd4', ['Queen']], ['g8', 'f6', ['Knight']]
    ],
    castling: [
        ['f1', 'g3', ['Knight']], ['a7', 'a6', forward], ['g1', 'h3', ['Knight']],
        ['a6', 'a5', forward], ['e1', 'g1', ['King']]
    ],
    'en passant': [
        ['e2', 'e4', forward], ['a7', 'a6', forward], ['e4', 'e5', forward],
        ['d7', 'd5', forward], ['e5', 'd6', ['Pawn']]
    ],
    'underpromotion and promoted moves': [
        ['a2', 'a4', forward], ['b7', 'b5', forward], ['a4', 'b5', ['Pawn']], ['a7', 'a6', forward],
        ['b5', 'b6', ['Pawn']], ['c7', 'c5', forward], ['b6', 'b7', ['Pawn']], ['a6', 'a5', forward],
        ['b7', 'a8', ['Pawn'], 'Knight'], ['e7', 'e6', forward], ['a8', 'c7', ['Knight']]
    ]
};

describe('accurate local replay', () => {
    it('supports current w_N/b_N IDs and legacy token_N IDs', () => {
        for (const tokenId of ['w_17', 'token_17']) {
            const timeline = buildReplayTimeline(record([{ turn: 1, player: 'white', tokenId, from: [6, 0], to: [5, 0], possibleTypes: forward }]));
            expect(timeline.error).toBeNull();
            expect(timeline.positions[1].tokens.find(t => t.id === 'token_17')).toMatchObject({ row: 5, col: 0 });
        }
    });
    for (const [name, turns] of Object.entries(examples)) it(`matches every live frame for ${name}, in new and legacy format`, () => {
        const played = playLocal(turns);
        for (const keepDelta of [true, false]) {
            const moves = keepDelta ? played.moves : played.moves.map(move => {
                const { replayVersion: _version, changes: _changes, ...legacy } = move as MoveRecord & { replayVersion: number; changes: unknown };
                return legacy;
            });
            const timeline = buildReplayTimeline(record(JSON.parse(JSON.stringify(moves))));
            expect(timeline.error, `${name}; delta=${keepDelta}`).toBeNull();
            expect(timeline.positions.map(compact)).toEqual(played.positions.map(compact));
            // Access order cannot mutate previous/future frames while scrubbing.
            expect(compact(timeline.positions[0])).toEqual(compact(played.positions[0]));
            expect(compact(timeline.positions.at(-1)!)).toEqual(compact(played.positions.at(-1)!));
        }
    });
    it('records non-moving tokens whose global candidates changed', () => {
        const played = playLocal(examples['candidate collapse and capture']);
        expect((played.moves[2] as { changes?: unknown[] }).changes!.length).toBeGreaterThan(1);
    });
});

describe('authoritative online replay', () => {
    for (const name of ['candidate collapse and capture', 'castling', 'underpromotion and promoted moves']) it(`reproduces server ${name} without substituting the local subset solver`, () => {
        const engine = new GameEngine('match', 'white', 'black', createInitialBoard());
        const snapshots = [engine.getPublicState('white')];
        for (const [from, to, types, promotedTo] of examples[name]) {
            const state = engine.getPublicState('white'), [row, col] = square(from), [targetRow, targetCol] = square(to);
            const piece = state.pieces.find(p => !p.captured && p.x === col && p.y === 7 - row)!;
            expect(engine.processAction({ actionId: String(state.version), playerId: state.turn ? 'black' : 'white', version: state.version,
                action: { type: 'MOVE', payload: { pieceId: piece.id, toX: targetCol, toY: 7 - targetRow,
                    intention: types.length === 1 && types[0] === 'King' ? 'castle' : undefined,
                    promotedTo: promotedTo ? ({ Queen: 'Q', Rook: 'R', Bishop: 'B', Knight: 'N', King: 'K', Pawn: 'P' })[promotedTo] : undefined
                } } }).success, `${from}-${to}`).toBe(true);
            snapshots.push(engine.getPublicState('white'));
        }
        for (const keepDelta of [true, false]) {
            const moves = engine.getHistory().map(entry => {
                if (keepDelta) return entry;
                const { replayVersion: _version, changes: _changes, ...legacy } = entry;
                return legacy;
            });
            const timeline = buildReplayTimeline(record(moves as unknown as MoveRecord[], 'ranked'));
            expect(timeline.error).toBeNull();
            for (let i = 0; i < snapshots.length; i++) {
                const expected = snapshots[i].pieces.map(p => [replayPieceNumber(p.id), p.captured ? -1 : 7 - p.y, p.captured ? -1 : p.x,
                    p.captured, !!p.hasMoved, p.promoted ? ['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King'][['P', 'N', 'B', 'R', 'Q', 'K'].indexOf(p.possibilities[0])] : null,
                    (p.promoted ? ['Pawn'] : p.possibilities.map(type => ({ P: 'Pawn', N: 'Knight', B: 'Bishop', R: 'Rook', Q: 'Queen', K: 'King' })[type])).sort()
                ]).sort((a, b) => Number(a[0]) - Number(b[0]));
                expect(compact(timeline.positions[i])).toEqual(expected);
            }
        }
    });
    it('serializes canonical coordinates, captured pieces, promotion and castling companions compactly', () => {
        const before = createInitialBoard().pieces;
        const after = before.map(p => p.id === 8 ? { ...p, x: 6, possibilities: ['K'], hasMoved: true }
            : p.id === 14 ? { ...p, x: 5, possibilities: ['R'], hasMoved: true }
            : p.id === 1 ? { ...p, promoted: true, possibilities: ['N'], x: 0, y: 7, hasMoved: true }
            : p.id === 17 ? { ...p, captured: true } : p);
        expect(recordReplayChanges(before, after)).toEqual(expect.arrayContaining([
            [29, 62, TYPE_TO_BIT.King, 1, 0], [32, 61, TYPE_TO_BIT.Rook, 1, 0],
            [17, 0, TYPE_TO_BIT.Pawn, 1, TYPE_TO_BIT.Knight], [1, -1, 63, 0, 0]
        ]));
    });
});

describe('corrupt or missing replay data', () => {
    const valid = () => playLocal([['a2', 'a3', forward]]).moves;
    it('distinguishes a missing old history from a real zero-move resignation', () => {
        expect(buildReplayTimeline({ ...record([]), total_moves: 20 }).error).toBe('missing');
        expect(buildReplayTimeline(record([])).positions).toHaveLength(1);
    });
    for (const [name, change] of Object.entries({
        'invalid source': (m: any) => { m.from = [3, 0]; },
        'invalid target': (m: any) => { m.to = [8, 0]; },
        'unknown identity': (m: any) => { m.tokenId = 'w_99'; },
        'wrong player': (m: any) => { m.player = 'black'; },
        'invalid type': (m: any) => { m.possibleTypes = ['Dragon']; },
        'unknown version': (m: any) => { m.replayVersion = 7; },
        'missing delta': (m: any) => { delete m.changes; },
        'duplicate delta': (m: any) => { m.changes.push(m.changes[0]); },
        'invalid square': (m: any) => { m.changes[0][1] = 99; },
        'overlap': (m: any) => { m.changes.push([18, 40, 63, 1, 0]); },
        'action envelope': (m: any) => { delete m.possibleTypes; m.action = { type: 'MOVE' }; }
    })) it(`rejects ${name} without throwing or rendering a plausible false board`, () => {
        const moves = valid(); change(moves[0]);
        expect(buildReplayTimeline(record(moves))).toEqual({ positions: [], moves: [], error: 'invalid' });
    });
    it('rejects missing trailing moves and absurd lengths', () => {
        expect(buildReplayTimeline({ ...record(valid()), total_moves: 2 }).error).toBe('invalid');
        expect(buildReplayTimeline(record(new Array(5001).fill(null)))).toMatchObject({ error: 'invalid' });
    });
});
