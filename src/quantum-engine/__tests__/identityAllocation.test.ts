import { describe, expect, it } from 'vitest';
import { feasibleIdentityMarginals, identityEntropy, identityMask, IDENTITY_TYPES } from '../../../server/src/quantum-engine/ai/identityAllocation';
import { EvalQoppelia } from '../ai/evalQoppelia';
import { createInitialState } from '../initialState';
import { PIECE_PAWN as P, PIECE_KNIGHT as N, PIECE_BISHOP as B, PIECE_ROOK as R, PIECE_QUEEN as Q, PIECE_KING as K } from '../constants';
import type { GameState, QuantumPiece } from '../types';

const limits = [8, 2, 2, 2, 1, 1];
function brute(masks: number[]) {
    let total = 0;
    const counts = masks.map(() => Array(6).fill(0)), used = Array(6).fill(0), choices: number[] = [];
    const visit = (index: number) => {
        if (index === masks.length) {
            total++;
            choices.forEach((type, piece) => counts[piece][type]++);
            return;
        }
        for (let type = 0; type < 6; type++) if ((masks[index] & IDENTITY_TYPES[type]) && used[type] < limits[type]) {
            used[type]++; choices.push(type); visit(index + 1); choices.pop(); used[type]--;
        }
    };
    visit(0);
    return { total, probabilities: counts.map(row => row.map(n => n / total)) };
}
const token = (id: string, owner: 'white' | 'black', state: number, row: number, col: number): QuantumPiece =>
    ({ id, owner, state, position: { row, col }, origin: { row, col }, alive: true, hasMoved: true, promoted: false });
const position = (pieces: QuantumPiece[]): GameState =>
    ({ pieces, sideToMove: 'white', ply: 0, hash: '', winner: null, captured: { white: 0, black: 0 } });
const material = () => new EvalQoppelia({ originValue: 0, mobility: 0, candidateAllocation: 0, kingCandidate: 0, safety: 0, center: 0 });

describe('quota-coupled candidate allocation', () => {
    it('agrees with exhaustive enumeration, including repeated masks and permutations', () => {
        let seed = 20261007;
        const random = () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0);
        const cases = [[Q | K, Q | K], [N | B, N | B, N | B, N | B, N | R], [P, P | Q, Q | K]];
        for (let i = 0; i < 48; i++) cases.push(Array.from({ length: 1 + i % 7 }, () => 1 + random() % 63));
        for (const masks of cases) {
            const expected = brute(masks);
            if (!expected.total) { expect(() => feasibleIdentityMarginals(masks)).toThrow('No feasible'); continue; }
            const actual = feasibleIdentityMarginals(masks), reversed = feasibleIdentityMarginals([...masks].reverse());
            masks.forEach((mask, piece) => {
                expect(actual.get(mask)!.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
                expected.probabilities[piece].forEach((p, type) => {
                    expect(actual.get(mask)![type]).toBeCloseTo(p, 12);
                    expect(reversed.get(mask)![type]).toBeCloseTo(p, 12);
                });
            });
        }
    });
    it('recovers all six exact quotas and material 39 on a full 16-token team', () => {
        const distribution = feasibleIdentityMarginals(Array(16).fill(63)).get(63)!;
        expect(distribution.map(p => Math.round(p * 16))).toEqual(limits);
        expect(distribution.reduce((sum, p, i) => sum + p * [1, 3, 3, 5, 9, 0][i], 0) * 16).toBeCloseTo(39, 12);
        const initial = createInitialState();
        expect(material().evaluate(initial, 'white')).toBeCloseTo(0, 12);
        expect(new EvalQoppelia().evaluate(initial, 'white')).toBeCloseTo(0, 12);
    });
    it('includes captured identities and treats promotion as an original Pawn with its effective value', () => {
        const captured = { ...token('captured-q', 'white', Q, -1, -1), alive: false };
        const state = position([token('wk', 'white', K, 7, 0), captured,
            token('wrq', 'white', R | Q, 5, 2), token('bk', 'black', K, 0, 7)]);
        expect(material().evaluate(state, 'white')).toBe(5);
        const promoted = { ...token('promotion', 'white', P, 0, 2), promoted: true, promotedType: Q };
        expect(identityMask(promoted)).toBe(P);
        expect(material().evaluate(position([...state.pieces, promoted]), 'white')).toBe(14);
        const all = [P, P, P, P, P, P, P, P, N, N, B, B, R, R, Q, K];
        const full = all.map((type, i) => token(`w${i}`, 'white', type, 6 + Math.floor(i / 8), i % 8));
        full[0] = { ...full[0], promoted: true, promotedType: Q, position: { row: 0, col: 1 } };
        expect(material().evaluate(position([...full, token('bk', 'black', K, 0, 7)]), 'white')).toBe(47);
    });
    it('accounts for global coupling before a mask is explicitly narrowed by the rules solver', () => {
        const masks = [N | B, N | B, N | B, N | B, N | R];
        expect(feasibleIdentityMarginals(masks).get(N | R)).toEqual([0, 0, 0, 1, 0, 0]);
        expect(identityEntropy(feasibleIdentityMarginals(masks).get(N | R)!)).toBe(0);
    });
    it('prices candidate retention, king dispersion and exposure independently of ordinary material', () => {
        const spread = position([token('w1', 'white', R | K, 7, 0), token('w2', 'white', R | K, 6, 7), token('bk', 'black', K, 0, 7)]);
        const focused = position([{ ...spread.pieces[0], state: K }, { ...spread.pieces[1], state: R }, spread.pieces[2]]);
        const only = { pieceValue: 0, originValue: 0, mobility: 0, safety: 0, center: 0, candidateAllocation: 0 };
        expect(new EvalQoppelia({ ...only, kingCandidate: 1 }).evaluate(spread, 'white')).toBeCloseTo(1);
        expect(new EvalQoppelia({ ...only, kingCandidate: 1 }).evaluate(focused, 'white')).toBe(0);
        expect(new EvalQoppelia({ ...only, kingCandidate: 0, candidateAllocation: 1 }).evaluate(spread, 'white')).toBeGreaterThan(0);
        const exposed = position([...spread.pieces, token('bn', 'black', N, 5, 1)]);
        const defended = position([...exposed.pieces, token('wb', 'white', B, 6, 1)]);
        const safe = new EvalQoppelia({ ...only, kingCandidate: 0, safety: 1 });
        expect(safe.evaluate(exposed, 'white')).toBeLessThan(safe.evaluate(spread, 'white'));
        expect(safe.evaluate(defended, 'white')).toBeGreaterThan(safe.evaluate(exposed, 'white'));
    });
    it('rejects invalid numeric masks, too many identities and infeasible quotas', () => {
        for (const invalid of [0, -1, 64, 1.5, NaN, Infinity, 2 ** 32 + 1]) {
            expect(() => feasibleIdentityMarginals([invalid])).toThrow('Invalid identity');
        }
        expect(() => feasibleIdentityMarginals(Array(17).fill(P))).toThrow('Invalid identity');
        for (const impossible of [Array(9).fill(P), [Q, Q], [K, K], [R, R, R], Array(5).fill(N | B)]) {
            expect(() => feasibleIdentityMarginals(impossible)).toThrow('No feasible');
        }
        expect(feasibleIdentityMarginals([]).size).toBe(0);
    });
});
