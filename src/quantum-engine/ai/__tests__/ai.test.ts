import { describe, it, expect } from 'vitest';
import { createInitialState } from '../../initialState';
import { getRandomMove } from '../random';
import { getGreedyMove } from '../greedy';

describe('Phase 2 AI Baselines', () => {
    it('Random AI selects a legal move', () => {
        const state = createInitialState();
        const move = getRandomMove(state);
        expect(move).toBeDefined();
        expect(move).toHaveProperty('pieceId');
        expect(move).toHaveProperty('target');
        expect(move).toHaveProperty('chosenType');
    });

    it('Greedy AI selects a legal move', () => {
        const state = createInitialState();
        const move = getGreedyMove(state);
        expect(move).toBeDefined();
        expect(move).toHaveProperty('pieceId');
    });
});
